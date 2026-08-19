'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'processed');
const INDEX_DIR = path.join(ROOT, 'data', 'indexes');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');

// NOW READING FROM THE ELO FILE!
const ELO_MASTER_FILE = path.join(DATA_DIR, 'master_with_elo.csv');
const TEAMS_INDEX_FILE = path.join(INDEX_DIR, 'teams-index.json');

function clean(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’‘`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value) { return clean(value).replace(/\s+/g, ''); }

function safeFilename(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim() || 'unknown';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 14: PUBLISH HISTORICAL MATCHES (WITH ELO)');
  console.log('============================================================\n');

  if (!fs.existsSync(ELO_MASTER_FILE)) {
    console.error(`❌ ELO Master file not found: ${ELO_MASTER_FILE}`);
    console.error('   Please run Python Step 32 (build-zokascore-elo.py) first!');
    process.exit(1);
  }

  ensureDir(HISTORY_DIR);
  
  // [1/3] Clear old competition files (but KEEP entities, events, and elo folders!)
  console.log('[1/3] Clearing old competition match files...');
  const protectedFolders = ['entities', 'events', 'elo'];
  if (fs.existsSync(HISTORY_DIR)) {
    const entries = fs.readdirSync(HISTORY_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !protectedFolders.includes(entry.name)) {
        fs.rmSync(path.join(HISTORY_DIR, entry.name), { recursive: true, force: true });
      }
    }
  }

  console.log('[2/3] Loading canonical team index...');
  const teamsIndex = JSON.parse(fs.readFileSync(TEAMS_INDEX_FILE, 'utf8'));
  
  const teamNameToIds = new Map();
  for (const [teamId, profile] of Object.entries(teamsIndex)) {
    const name = profile?.name;
    if (!name) continue;
    const normalized = compact(name);
    if (!teamNameToIds.has(normalized)) teamNameToIds.set(normalized, []);
    teamNameToIds.get(normalized).push(teamId);
  }
  
  const teamNameToIdMap = new Map();
  for (const [name, ids] of teamNameToIds.entries()) {
    if (ids.length === 1) teamNameToIdMap.set(name, ids[0]);
  }

  console.log('[3/3] Processing ELO Master CSV and writing historical matches...');
  
  const historyMap = new Map();
  let totalRows = 0;
  let processedMatches = 0;

  await new Promise((resolve, reject) => {
    fs.createReadStream(ELO_MASTER_FILE)
      .pipe(csv())
      .on('data', row => {
        totalRows++;
        
        const matchId = String(row.zokascore_match_id ?? '').trim();
        const date = String(row.date ?? '').trim();
        const homeName = String(row.home_team ?? '').trim();
        const awayName = String(row.away_team ?? '').trim();
        const homeScore = String(row.home_score ?? '').trim();
        const awayScore = String(row.away_score ?? '').trim();
        
        // FIX: Check multiple possible column names for competition
        const competition = String(row.competition ?? row.competition_name ?? row.league ?? row.leagueName ?? 'UNKNOWN_COMPETITION').trim() || 'UNKNOWN_COMPETITION';
        
        let season = String(row.season ?? '').trim();
        if (!season) {
          const yearMatch = date.match(/^(\d{4})/);
          season = yearMatch ? yearMatch[1] : 'UNKNOWN_SEASON';
        }

        if (!matchId || !date || !homeName || !awayName) return;

        const homeId = teamNameToIdMap.get(compact(homeName)) || null;
        const awayId = teamNameToIdMap.get(compact(awayName)) || null;

        const compSlug = safeFilename(competition.toLowerCase().replace(/ /g, '_'));
        const seasonSlug = safeFilename(season);
        
        const key = `${compSlug}/${seasonSlug}`;
        
        if (!historyMap.has(key)) {
          historyMap.set(key, {
            competition: competition,
            season: season,
            total_matches: 0,
            matches: []
          });
        }
        
        const history = historyMap.get(key);
        
        // INCLUDE ELO FIELDS DIRECTLY IN THE MATCH OBJECT
        history.matches.push({
          match_id: matchId,
          date: date,
          competition: competition,
          season: season,
          home_team: homeName,
          away_team: awayName,
          home_score: Number(homeScore),
          away_score: Number(awayScore),
          home_team_id: homeId,
          away_team_id: awayId,
          home_elo_pre: parseFloat(row.home_elo_pre || 1500),
          away_elo_pre: parseFloat(row.away_elo_pre || 1500),
          home_elo_post: parseFloat(row.home_elo_post || 1500),
          away_elo_post: parseFloat(row.away_elo_post || 1500),
          home_elo_delta: parseFloat(row.home_elo_delta || 0),
          away_elo_delta: parseFloat(row.away_elo_delta || 0)
        });
        
        history.total_matches++;
        processedMatches++;
      })
      .on('end', resolve)
      .on('error', reject);
  });

  let filesWritten = 0;
  for (const [key, data] of historyMap.entries()) {
    const [compSlug, seasonSlug] = key.split('/');
    const dir = path.join(HISTORY_DIR, compSlug);
    ensureDir(dir);
    
    const filePath = path.join(dir, `${seasonSlug}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    filesWritten++;
  }

  console.log(`   ↳ ELO Master rows scanned: ${totalRows.toLocaleString()}`);
  console.log(`   ↳ Matches processed: ${processedMatches.toLocaleString()}`);
  console.log(`   ↳ History files written: ${filesWritten.toLocaleString()}\n`);

  console.log('============================================================');
  console.log(' STEP 14 COMPLETE');
  console.log('============================================================');
  console.log('✅ Historical matches (with ELO) published to public_data.');
  console.log('🔒 Internal data/ folder remains protected.\n');
}

run().catch(err => {
  console.error('\n❌ STEP 14 FAILED');
  console.error(err);
  process.exit(1);
});