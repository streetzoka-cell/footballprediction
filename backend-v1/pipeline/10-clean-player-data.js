'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const V2_HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const PLAYERS_DIR = path.join(ROOT, 'public_data', 'stats', 'players');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walkDir(fullPath, callback);
    else if (file.endsWith('.json')) callback(fullPath);
  }
}

function normalizePlayerName(value) {
  if (!value) return '';
  let str = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  return str.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeHistoricalId(normalizedName) {
  return 'HIST_' + crypto.createHash('sha1').update(normalizedName, 'utf8').digest('hex').substring(0, 12);
}

function loadCsv(filename) {
  return new Promise((resolve) => {
    const results = [];
    const filePath = path.join(SOURCE_DIR, filename);
    if (!fs.existsSync(filePath)) return resolve([]);
    fs.createReadStream(filePath, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results));
  });
}

function safeNumber(val) {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

async function cleanPlayerData() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 10: PLAYER RECONCILIATION');
  console.log('============================================================\n');

  ensureDir(PLAYERS_DIR);

  // 1. LOAD MASTER PLAYERS
  console.log('🔍 Loading Master Player Data from players.csv...');
  const playersCsv = await loadCsv('players.csv');
  const playerRegistry = new Map(); // normName -> player_id
  const playerProfiles = new Map(); // player_id -> rich profile object

  for (const p of playersCsv) {
    const playerId = p.player_id;
    const name = p.name?.trim();
    if (!playerId || !name) continue;

    const normName = normalizePlayerName(name);
    if (!playerRegistry.has(normName)) {
      playerRegistry.set(normName, playerId);
    }
    
    playerProfiles.set(playerId, {
      identity: {
        player_id: playerId,
        name: name,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        player_key: normName,
        source_id: playerId
      },
      biography: {
        date_of_birth: p.date_of_birth || null,
        birth_place: p.city_of_birth || null,
        birth_country: p.country_of_birth || null,
        nationality: p.country_of_citizenship || null
      },
      football: {
        position: p.position || null,
        position_group: p.sub_position || null,
        preferred_foot: p.foot || null,
        height_cm: safeNumber(p.height_in_cm)
      },
      career: {
        current_club: p.current_club_name || null,
        current_club_id: p.current_club_id || null
      },
      media: {
        image_url: p.image_url || null,
        source_url: p.url || null
      },
      valuation: {
        market_value: safeNumber(p.market_value_in_eur),
        highest_market_value: safeNumber(p.highest_market_value_in_eur)
      },
      statistics: {
        total_goals: 0,
        penalties: 0,
        own_goals: 0,
        matches_scored_in: 0,
        goals_per_scoring_match: 0
      },
      provenance: {
        master_source: 'players.csv',
        statistics_source: null,
        last_reconciled: new Date().toISOString()
      }
    });
  }
  console.log(`   ↳ ${playersCsv.length.toLocaleString()} master records loaded.\n`);

  // 2. LOAD MATCHES & AGGREGATE GOALS
  console.log('🔍 Loading V2 match backbone...');
  const allMatches = [];
  walkDir(V2_HISTORY_DIR, (filePath) => {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data.matches)) allMatches.push(...data.matches);
    } catch (e) {}
  });
  console.log(`   ↳ ${allMatches.length.toLocaleString()} matches loaded.\n`);

  console.log('⚙️ Aggregating goals and matching to Canonical Players...');
  const unmatchedScorers = new Map();
  const tempStats = new Map(); // player_id -> { goals, penalties, own_goals, matches_scored_in (Set) }

  for (const match of allMatches) {
    if (!Array.isArray(match.goals)) continue;

    for (const goal of match.goals) {
      if (!goal.scorer) continue;
      const originalName = goal.scorer.trim();
      if (!originalName || originalName.toLowerCase() === 'na') continue;

      const normName = normalizePlayerName(originalName);
      let playerId = playerRegistry.get(normName);

      if (!playerId) {
        // Create Historical Profile
        playerId = makeHistoricalId(normName);
        playerRegistry.set(normName, playerId);
        
        playerProfiles.set(playerId, {
          identity: {
            player_id: playerId,
            name: originalName,
            first_name: null,
            last_name: null,
            player_key: normName,
            source_id: null
          },
          biography: { date_of_birth: null, birth_place: null, birth_country: null, nationality: null },
          football: { position: null, position_group: null, preferred_foot: null, height_cm: null },
          career: { current_club: null, current_club_id: null },
          media: { image_url: null, source_url: null },
          valuation: { market_value: null, highest_market_value: null },
          statistics: { total_goals: 0, penalties: 0, own_goals: 0, matches_scored_in: 0, goals_per_scoring_match: 0 },
          provenance: { master_source: 'historical_unmatched', statistics_source: null, last_reconciled: new Date().toISOString() }
        });

        if (!unmatchedScorers.has(normName)) unmatchedScorers.set(normName, { count: 0, variants: new Set() });
        unmatchedScorers.get(normName).variants.add(originalName);
      }

      if (!tempStats.has(playerId)) {
        tempStats.set(playerId, { goals: 0, penalties: 0, own_goals: 0, matches_scored_in: new Set() });
      }
      const stat = tempStats.get(playerId);

      if (goal.own_goal) {
        stat.own_goals++;
      } else {
        stat.goals++;
        if (goal.penalty) stat.penalties++;
      }
      stat.matches_scored_in.add(match.match_id);
      
      if (unmatchedScorers.has(normName)) unmatchedScorers.get(normName).count++;
    }
  }

  // 3. MERGE STATS & WRITE PROFILES
  console.log('\n📁 Writing Rich Player Profiles...');
  let playerCount = 0;
  const playerIndex = [];

  for (const [playerId, profile] of playerProfiles.entries()) {
    const stat = tempStats.get(playerId);
    
    if (stat) {
      profile.statistics.total_goals = stat.goals;
      profile.statistics.penalties = stat.penalties;
      profile.statistics.own_goals = stat.own_goals;
      profile.statistics.matches_scored_in = stat.matches_scored_in.size;
      profile.statistics.goals_per_scoring_match = stat.matches_scored_in.size > 0 ? Number((stat.goals / stat.matches_scored_in.size).toFixed(2)) : 0;
      profile.provenance.statistics_source = 'v2_match_backbone';
    } else {
      profile.provenance.statistics_source = 'none';
    }

    const filename = `player_${playerId}.json`;
    fs.writeFileSync(path.join(PLAYERS_DIR, filename), JSON.stringify(profile, null, 2), 'utf8');
    
    // Add ALL players to index (even 0-goal players)
    playerIndex.push({
      player_id: playerId,
      player_key: profile.identity.player_key,
      name: profile.identity.name,
      file: filename,
      total_goals: profile.statistics.total_goals
    });
    
    playerCount++;
  }

  // 4. WRITE INDEX & REPORT
  playerIndex.sort((a, b) => b.total_goals - a.total_goals);
  fs.writeFileSync(
    path.join(PLAYERS_DIR, 'players_index.json'),
    JSON.stringify({ total_players: playerIndex.length, players: playerIndex }, null, 2),
    'utf8'
  );

  const unmatchedArray = Array.from(unmatchedScorers.entries()).map(([name, data]) => ({
    normalized_name: name,
    count: data.count,
    variants: Array.from(data.variants)
  })).sort((a, b) => b.count - a.count);

  const reconciliationReport = {
    total_csv_players: playersCsv.length,
    total_profiles_written: playerCount,
    unmatched_scorers: unmatchedArray
  };

  fs.writeFileSync(path.join(AUDIT_DIR, 'player_reconciliation_report.json'), JSON.stringify(reconciliationReport, null, 2), 'utf8');

  console.log(`✅ Wrote ${playerCount} rich player profiles.`);
  console.log(`✅ Wrote player search index (includes zero-goal players).`);
  console.log(`⚠️  Unmatched scorer names (created as historical profiles): ${unmatchedArray.length}`);
  
  console.log('\n============================================================');
  console.log(' STEP 10 COMPLETE');
  console.log('============================================================');
}

cleanPlayerData().catch(err => {
  console.error('❌ Player Cleanup Failed:', err);
  process.exit(1);
});