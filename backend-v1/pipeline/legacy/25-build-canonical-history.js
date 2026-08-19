'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');

const CLUB_INDEX_FILE = path.join(INDEX_DIR, 'club_identity_index.json');

// Helper to create safe directory names
const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 50);

async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(0);
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try { onRow(JSON.parse(line)); } catch (e) {}
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 25');
  console.log(' CANONICAL HISTORY BUILDER');
  console.log('============================================================\n');

  if (!fs.existsSync(CLUB_INDEX_FILE)) {
    console.error('❌ Club identity index not found. Run Step 24 first.');
    process.exit(1);
  }

  console.log('> Loading Club Identity Index...');
  const clubIndex = JSON.parse(fs.readFileSync(CLUB_INDEX_FILE, 'utf8'));
  console.log(`   Loaded ${Object.keys(clubIndex).length} clubs.`);

  // Data structure: Map<competitionSlug, Map<season, Array<Match>>>
  const historyStore = new Map();
  let totalMatches = 0;

  // 1. Process International Results
  console.log('\n> Processing international results...');
  await processJSONL(path.join(SOURCE_DIR, 'results.jsonl'), (row) => {
    const date = row.date;
    if (!date) return;
    
    const season = date.substring(0, 4); // YYYY
    const competition = row.tournament || 'Friendly';
    const compSlug = slugify(competition);
    
    const match = {
      match_id: `INTL_${date}_${slugify(row.home_team)}_${slugify(row.away_team)}`,
      date: date,
      competition: competition,
      season: season,
      home_team: row.home_team,
      away_team: row.away_team,
      home_score: parseInt(row.home_score, 10),
      away_score: parseInt(row.away_score, 10),
      round: row.round || null,
      stadium: row.city || null,
      source: 'international_history'
    };
    
    if (!historyStore.has(compSlug)) historyStore.set(compSlug, new Map());
    const seasonMap = historyStore.get(compSlug);
    if (!seasonMap.has(season)) seasonMap.set(season, []);
    seasonMap.get(season).push(match);
    totalMatches++;
  });
  console.log(`   Processed international matches.`);

  // 2. Process Club Games
  console.log('> Processing club games...');
  await processJSONL(path.join(SOURCE_DIR, 'games.jsonl'), (row) => {
    const date = row.date;
    if (!date) return;
    
    // Use competition_id or a default. For V2 history, we group by the competition ID.
    const competition = row.competition_id ? `CLUB_${row.competition_id}` : 'CLUB_UNKNOWN';
    const compSlug = slugify(competition);
    
    // For club games, season is usually provided in the CSV. If not, extract from date.
    const season = row.season || date.substring(0, 4);
    
    // Resolve Club Names
    const homeClub = clubIndex[String(row.home_club_id)];
    const awayClub = clubIndex[String(row.away_club_id)];
    
    const match = {
      match_id: `CLUB_${row.game_id}`,
      date: date,
      competition: competition,
      season: season,
      home_team: homeClub ? homeClub.canonical_name : `Unknown Club (${row.home_club_id})`,
      home_team_id: String(row.home_club_id),
      away_team: awayClub ? awayClub.canonical_name : `Unknown Club (${row.away_club_id})`,
      away_team_id: String(row.away_club_id),
      home_score: parseInt(row.home_club_goals, 10),
      away_score: parseInt(row.away_club_goals, 10),
      round: row.round || null,
      stadium: row.stadium || null,
      source: 'club_history'
    };
    
    if (!historyStore.has(compSlug)) historyStore.set(compSlug, new Map());
    const seasonMap = historyStore.get(compSlug);
    if (!seasonMap.has(season)) seasonMap.set(season, []);
    seasonMap.get(season).push(match);
    totalMatches++;
  });
  console.log(`   Processed club matches.`);

  // 3. Write Partitioned History Files
  console.log('\n> Writing canonical history files...');
  let filesWritten = 0;
  
  for (const [compSlug, seasonMap] of historyStore.entries()) {
    const compDir = path.join(HISTORY_DIR, compSlug);
    fs.mkdirSync(compDir, { recursive: true });
    
    for (const [season, matches] of seasonMap.entries()) {
      // Sort matches by date chronologically within the season
      matches.sort((a, b) => a.date.localeCompare(b.date));
      
      const filePayload = {
        competition: matches[0].competition,
        season: season,
        total_matches: matches.length,
        matches: matches
      };
      
      const filePath = path.join(compDir, `${season}.json`);
      fs.writeFileSync(filePath, JSON.stringify(filePayload, null, 2), 'utf8');
      filesWritten++;
    }
  }

  console.log(`\n============================================================`);
  console.log(' STEP 25 COMPLETE');
  console.log('============================================================');
  console.log(`Total Matches Indexed : ${totalMatches.toLocaleString()}`);
  console.log(`History Files Written : ${filesWritten.toLocaleString()}`);
  console.log(`Location              : ${path.relative(ROOT, HISTORY_DIR)}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});