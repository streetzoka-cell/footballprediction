'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V2_DIR = path.join(ROOT, 'public_data');
const HISTORY_DIR = path.join(V2_DIR, 'knowledge', 'football', 'history');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const PLAYERS_DIR = path.join(V2_DIR, 'stats', 'players');
const INDEX_DIR = path.join(V2_DIR, 'knowledge', 'football', 'indexes');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function loadJson(filePath) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; } }
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walkDir(fullPath, callback);
    else if (file.endsWith('.json')) callback(fullPath);
  }
}

function makeH2HKey(a, b) { return [String(a), String(b)].sort().join('_vs_'); }

async function buildIndexes() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 11: REBUILD KNOWLEDGE INDEXES');
  console.log('============================================================\n');

  ensureDir(INDEX_DIR);

  const teamMatchIndex = {};
  const h2hIndex = {};
  const matchIndex = {};
  const competitionIndex = {};
  const seasonIndex = {};

  console.log('🔍 Scanning final V2 match backbone...');
  walkDir(HISTORY_DIR, (filePath) => {
    const data = loadJson(filePath);
    if (!data || !Array.isArray(data.matches)) return;

    const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');

    for (const match of data.matches) {
      const matchId = match.match_id;
      const homeId = String(match.home_team_id);
      const awayId = String(match.away_team_id);

      if (!matchId || !homeId || !awayId) continue;

      // 1. MATCH INDEX
      matchIndex[matchId] = {
        date: match.date,
        home_team_id: homeId,
        away_team_id: awayId,
        home_score: match.home_score,
        away_score: match.away_score,
        competition: match.competition,
        season: match.season,
        file: relPath
      };

      // 2. TEAM MATCH INDEX
      if (!teamMatchIndex[homeId]) teamMatchIndex[homeId] = [];
      teamMatchIndex[homeId].push(matchId);

      if (!teamMatchIndex[awayId]) teamMatchIndex[awayId] = [];
      teamMatchIndex[awayId].push(matchId);

      // 3. H2H INDEX
      const h2hKey = makeH2HKey(homeId, awayId);
      if (!h2hIndex[h2hKey]) h2hIndex[h2hKey] = [];
      h2hIndex[h2hKey].push(matchId);

      // 4. COMPETITION INDEX
      const compKey = match.competition || 'Unknown';
      if (!competitionIndex[compKey]) competitionIndex[compKey] = [];
      competitionIndex[compKey].push(matchId);

      // 5. SEASON INDEX
      const seasonKey = match.season || 'Unknown';
      if (!seasonIndex[seasonKey]) seasonIndex[seasonKey] = [];
      seasonIndex[seasonKey].push(matchId);
    }
  });

  console.log('⚙️ Writing Core Indexes...');
  fs.writeFileSync(path.join(INDEX_DIR, 'match_index.json'), JSON.stringify(matchIndex), 'utf8');
  fs.writeFileSync(path.join(INDEX_DIR, 'team_match_index.json'), JSON.stringify(teamMatchIndex), 'utf8');
  fs.writeFileSync(path.join(INDEX_DIR, 'h2h_index.json'), JSON.stringify(h2hIndex), 'utf8');
  fs.writeFileSync(path.join(INDEX_DIR, 'competition_index.json'), JSON.stringify(competitionIndex), 'utf8');
  fs.writeFileSync(path.join(INDEX_DIR, 'season_index.json'), JSON.stringify(seasonIndex), 'utf8');
  console.log('✅ Core indexes written.');

  // Sync Player Index
  console.log('\n🔄 Syncing Player Index...');
  const playerIndex = { total_players: 0, players: [] };
  walkDir(PLAYERS_DIR, (filePath) => {
    if (path.basename(filePath) === 'players_index.json') return;
    const profile = loadJson(filePath);
    if (!profile || !profile.identity || !profile.identity.player_id) return;

    playerIndex.players.push({
      player_id: profile.identity.player_id,
      player_key: profile.identity.player_key,
      name: profile.identity.name,
      file: path.basename(filePath),
      total_goals: profile.statistics?.total_goals || 0
    });
    playerIndex.total_players++;
  });

  playerIndex.players.sort((a, b) => b.total_goals - a.total_goals);
  fs.writeFileSync(path.join(PLAYERS_DIR, 'players_index.json'), JSON.stringify(playerIndex, null, 2), 'utf8');
  console.log(`✅ Player index synced (${playerIndex.total_players} players).`);

  // Sync Team Alias Index
  console.log('\n🔄 Syncing Team Alias Index...');
  const canonicalTeams = loadJson(path.join(ENTITY_DIR, 'canonical_teams.json')) || [];
  const teamAliasIndex = {};
  for (const team of canonicalTeams) {
    if (team && team.canonical_id) {
      teamAliasIndex[team.canonical_id] = {
        name: team.primary_name,
        type: team.type,
        aliases: team.aliases || []
      };
    }
  }
  fs.writeFileSync(path.join(INDEX_DIR, 'team_alias_index.json'), JSON.stringify(teamAliasIndex, null, 2), 'utf8');
  console.log(`✅ Team alias index synced (${Object.keys(teamAliasIndex).length} teams).`);

  console.log('\n============================================================');
  console.log(' STEP 11 COMPLETE');
  console.log('============================================================');
  console.log(`📁 Index Directory: ${INDEX_DIR}`);
  console.log(`📊 Matches Indexed:     ${Object.keys(matchIndex).length.toLocaleString()}`);
  console.log(`📊 Teams Indexed:        ${Object.keys(teamMatchIndex).length.toLocaleString()}`);
  console.log(`📊 H2H Pairs Indexed:    ${Object.keys(h2hIndex).length.toLocaleString()}`);
  console.log(`📊 Competitions Indexed: ${Object.keys(competitionIndex).length.toLocaleString()}`);
  console.log(`📊 Seasons Indexed:      ${Object.keys(seasonIndex).length.toLocaleString()}`);
  console.log('\n🔒 V2 DATA WAS NOT MODIFIED.');
}

buildIndexes().catch(err => {
  console.error('❌ Indexing Failed:', err);
  process.exit(1);
});