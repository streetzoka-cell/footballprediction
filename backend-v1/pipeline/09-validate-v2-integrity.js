'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V2_DIR = path.join(ROOT, 'public_data');
const HISTORY_DIR = path.join(V2_DIR, 'knowledge', 'football', 'history');
const ENTITY_DIR = path.join(ROOT, 'data_audit', 'entity_resolution');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const TEAM_STATS_DIR = path.join(V2_DIR, 'stats', 'teams');
const H2H_STATS_FILE = path.join(V2_DIR, 'stats', 'h2h', 'h2h_summaries.json');
const PLAYER_STATS_DIR = path.join(V2_DIR, 'stats', 'players');
const SEASONAL_DIR = path.join(V2_DIR, 'stats', 'seasonal');

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
function increment(map, key, amount = 1) { map.set(key, (map.get(key) || 0) + amount); }
function makeH2HKey(a, b) { return [String(a), String(b)].sort().join('_vs_'); }

// EXACT MATCH OF STEP 7 NORMALIZATION
function normalizePlayerName(value) {
  if (!value) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function runAudit() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 9: V2 INTEGRITY AUDIT');
  console.log('============================================================\n');
  ensureDir(AUDIT_DIR);

  // Tracking structures
  const integrityErrors = [];
  const dataGaps = [];
  const orphanTeamIds = new Set();
  
  const matchIds = new Set();
  const teamMatchCounts = new Map();
  const teamGoalStats = new Map();
  const h2hCounts = new Map();
  const h2hResults = new Map();
  const seasonalTeamCounts = new Map();
  const seasonalTeamResults = new Map();
  const playerGoalStats = new Map(); 

  const summary = {
    backbone_matches: 0,
    unique_match_ids: 0,
    player_profiles: 0,
    team_profiles: 0,
    invalid_json_files: 0,
    integrity_errors: 0,
    data_gaps: 0
  };

  // 1. ENTITY MAP & RESOLUTION DICTIONARY
  const aliasMap = loadJson(path.join(ENTITY_DIR, 'team_alias_map.json'));
  const canonicalTeams = loadJson(path.join(ENTITY_DIR, 'canonical_teams.json'));
  const canonicalTeamIds = new Set();
  const historicalToCanonicalMap = new Map();

  if (Array.isArray(canonicalTeams)) {
    for (const team of canonicalTeams) {
      if (team && team.canonical_id) {
        const cid = String(team.canonical_id);
        canonicalTeamIds.add(cid);
        historicalToCanonicalMap.set(cid, cid);
      }
    }
  }
  if (aliasMap && typeof aliasMap === 'object') {
    for (const [historicalId, canonicalId] of Object.entries(aliasMap)) {
      const cid = String(canonicalId);
      const hid = String(historicalId);
      canonicalTeamIds.add(cid);
      historicalToCanonicalMap.set(hid, cid);
    }
  }

  // 2. BACKBONE AUDIT
  walkDir(HISTORY_DIR, (filePath) => {
    const data = loadJson(filePath);
    if (!data) { integrityErrors.push(`Invalid JSON: ${filePath}`); summary.invalid_json_files++; return; }
    if (!Array.isArray(data.matches)) return;

    for (const match of data.matches) {
      summary.backbone_matches++;
      const matchId = match.match_id;
      if (!matchId) { integrityErrors.push('Match without match_id encountered.'); continue; }

      // MATCH STEP 7 DEDUPLICATION LOGIC
      if (matchIds.has(String(matchId))) {
        integrityErrors.push(`Duplicate match_id found: ${matchId}`);
        continue; // Skip aggregation for duplicates, exactly like Step 7
      }
      matchIds.add(String(matchId));

      const structurallyInvalid = !match.date || !match.home_team_id || !match.away_team_id;
      if (structurallyInvalid) {
        integrityErrors.push(`Structurally invalid match data (missing ID/Date) for ${matchId}`);
        continue;
      }

      const hs = Number(match.home_score);
      const as = Number(match.away_score);
      const hasScores = Number.isFinite(hs) && Number.isFinite(as);

      if (!hasScores) {
        dataGaps.push(`Match ${matchId} missing score data (skipped for stat aggregation)`);
        continue; 
      }

      const rawHomeId = String(match.home_team_id);
      const rawAwayId = String(match.away_team_id);

      // RESOLVE RAW/HISTORICAL IDs TO CANONICAL IDs (Must match Step 7/8 logic)
      const homeId = historicalToCanonicalMap.get(rawHomeId) || rawHomeId;
      const awayId = historicalToCanonicalMap.get(rawAwayId) || rawAwayId;

      // Track unresolved IDs as orphans, but DO NOT skip aggregation
      if (!historicalToCanonicalMap.has(rawHomeId)) {
        orphanTeamIds.add(rawHomeId);
      }
      if (!historicalToCanonicalMap.has(rawAwayId)) {
        orphanTeamIds.add(rawAwayId);
      }

      increment(teamMatchCounts, homeId);
      increment(teamMatchCounts, awayId);

      if (!teamGoalStats.has(homeId)) teamGoalStats.set(homeId, { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 });
      if (!teamGoalStats.has(awayId)) teamGoalStats.set(awayId, { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 });

      const homeStats = teamGoalStats.get(homeId);
      const awayStats = teamGoalStats.get(awayId);

      homeStats.matches++; homeStats.goals_for += hs; homeStats.goals_against += as;
      awayStats.matches++; awayStats.goals_for += as; awayStats.goals_against += hs;

      if (hs > as) { homeStats.wins++; awayStats.losses++; } 
      else if (hs < as) { awayStats.wins++; homeStats.losses++; } 
      else { homeStats.draws++; awayStats.draws++; }

      const h2hKey = makeH2HKey(homeId, awayId);
      increment(h2hCounts, h2hKey);

      if (!h2hResults.has(h2hKey)) {
        const sortedIds = [homeId, awayId].sort();
        h2hResults.set(h2hKey, {
          team_a_id: sortedIds[0], team_b_id: sortedIds[1],
          team_a_wins: 0, team_b_wins: 0, draws: 0, team_a_goals: 0, team_b_goals: 0
        });
      }
      const h2h = h2hResults.get(h2hKey);
      const teamAScore = homeId === h2h.team_a_id ? hs : as;
      const teamBScore = homeId === h2h.team_a_id ? as : hs;

      h2h.team_a_goals += teamAScore;
      h2h.team_b_goals += teamBScore;

      if (teamAScore > teamBScore) h2h.team_a_wins++;
      else if (teamBScore > teamAScore) h2h.team_b_wins++;
      else h2h.draws++;

      if (match.season !== undefined && match.season !== null) {
        const season = String(match.season);
        if (!seasonalTeamCounts.has(season)) seasonalTeamCounts.set(season, new Map());
        const seasonCounts = seasonalTeamCounts.get(season);
        increment(seasonCounts, homeId);
        increment(seasonCounts, awayId);

        if (!seasonalTeamResults.has(season)) seasonalTeamResults.set(season, new Map());
        const seasonResults = seasonalTeamResults.get(season);

        if (!seasonResults.has(homeId)) seasonResults.set(homeId, { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 });
        if (!seasonResults.has(awayId)) seasonResults.set(awayId, { matches: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0 });

        const homeSeason = seasonResults.get(homeId);
        const awaySeason = seasonResults.get(awayId);

        homeSeason.matches++; awaySeason.matches++;
        homeSeason.goals_for += hs; homeSeason.goals_against += as;
        awaySeason.goals_for += as; awaySeason.goals_against += hs;

        if (hs > as) { homeSeason.wins++; awaySeason.losses++; } 
        else if (hs < as) { awaySeason.wins++; homeSeason.losses++; } 
        else { homeSeason.draws++; awaySeason.draws++; }
      }

      if (Array.isArray(match.goals)) {
        for (const goal of match.goals) {
          if (!goal || !goal.scorer) continue;
          const playerKey = normalizePlayerName(goal.scorer);
          // Removed the 'na' check to perfectly match Step 7
          
          if (!playerGoalStats.has(playerKey)) playerGoalStats.set(playerKey, { total_goals: 0, penalties: 0, own_goals: 0 });
          
          const player = playerGoalStats.get(playerKey);
          if (goal.own_goal) player.own_goals++;
          else {
            player.total_goals++;
            if (goal.penalty) player.penalties++;
          }
        }
      }
    }
  });

  summary.unique_match_ids = matchIds.size;

  // 3. TEAM STATS VALIDATION
  const existingTeamProfiles = new Set();
  walkDir(TEAM_STATS_DIR, (filePath) => {
    const stat = loadJson(filePath);
    if (!stat || !stat.team_id) return;
    const teamId = String(stat.team_id);
    existingTeamProfiles.add(teamId);
    summary.team_profiles++;

    const expected = teamGoalStats.get(teamId);
    if (!expected) { dataGaps.push(`Team profile ${teamId} has no backbone matches.`); return; }

    if (stat.total_matches !== expected.matches) integrityErrors.push(`Team ${teamId} matches mismatch`);
    if (stat.wins !== expected.wins) integrityErrors.push(`Team ${teamId} wins mismatch`);
    if (stat.draws !== expected.draws) integrityErrors.push(`Team ${teamId} draws mismatch`);
    if (stat.losses !== expected.losses) integrityErrors.push(`Team ${teamId} losses mismatch`);
    if (stat.goals_for !== expected.goals_for) integrityErrors.push(`Team ${teamId} goals_for mismatch`);
    if (stat.goals_against !== expected.goals_against) integrityErrors.push(`Team ${teamId} goals_against mismatch`);
  });

  for (const teamId of teamGoalStats.keys()) {
    if (!existingTeamProfiles.has(teamId)) dataGaps.push(`Missing team profile for ${teamId}`);
  }

  // 4. H2H VALIDATION
  const h2hSummaries = loadJson(H2H_STATS_FILE);
  if (Array.isArray(h2hSummaries)) {
    for (const h2h of h2hSummaries) {
      const key = h2h.h2h_id;
      const expectedCount = h2hCounts.get(key) || 0;
      if (h2h.total_matches !== expectedCount) integrityErrors.push(`H2H ${key} count mismatch`);

      const expected = h2hResults.get(key);
      if (!expected) continue;

      if (h2h.team_a_wins !== expected.team_a_wins) integrityErrors.push(`H2H ${key} team A wins mismatch`);
      if (h2h.team_b_wins !== expected.team_b_wins) integrityErrors.push(`H2H ${key} team B wins mismatch`);
      if (h2h.draws !== expected.draws) integrityErrors.push(`H2H ${key} draws mismatch`);
    }
  }

  // 5. SEASONAL VALIDATION
  if (fs.existsSync(SEASONAL_DIR)) {
    const seasonalFiles = fs.readdirSync(SEASONAL_DIR).filter(f => f.endsWith('.json'));

    for (const file of seasonalFiles) {
      const seasonKey = file.replace(/\.json$/, '');
      const seasonData = loadJson(path.join(SEASONAL_DIR, file));
      if (!seasonData) { integrityErrors.push(`Invalid seasonal JSON: ${file}`); continue; }

      const expected = seasonalTeamResults.get(seasonKey);
      if (!expected) { dataGaps.push(`Season ${seasonKey} has no backbone data.`); continue; }

      for (const [teamId, stats] of Object.entries(seasonData)) {
        const backbone = expected.get(String(teamId));
        if (!backbone) { dataGaps.push(`Season ${seasonKey}: orphan team ${teamId}`); continue; }

        if (stats.matches !== backbone.matches) integrityErrors.push(`Season ${seasonKey} team ${teamId} matches mismatch`);
        if (stats.wins !== backbone.wins || stats.draws !== backbone.draws || stats.losses !== backbone.losses) integrityErrors.push(`Season ${seasonKey} team ${teamId} W/D/L mismatch`);
      }
    }
  }

  // 6. PLAYER VALIDATION (FIXED SCHEMA)
  const existingPlayers = new Set();
  let historicalProfilesCount = 0;

  walkDir(PLAYER_STATS_DIR, (filePath) => {
    if (path.basename(filePath) === 'players_index.json') return;
    const player = loadJson(filePath);
    if (!player || !player.player_key) return; // Match Step 7 flat schema

    const key = normalizePlayerName(player.player_key);
    existingPlayers.add(key);
    summary.player_profiles++;

    const expected = playerGoalStats.get(key);
    const profileGoals = player.total_goals || 0; // Match Step 7 flat schema

    if (profileGoals > 0 && !expected) {
      dataGaps.push(`Player ${key} has ${profileGoals} goals in profile but 0 in backbone`);
      return;
    }

    if (expected) {
      if (profileGoals !== expected.total_goals) { 
        dataGaps.push(`Player ${key} goal mismatch: Profile(${profileGoals}) vs Backbone(${expected.total_goals})`); 
      }
    }
  });

  for (const [key, expected] of playerGoalStats.entries()) {
    if (!existingPlayers.has(key) && expected.total_goals > 0) {
      dataGaps.push(`Missing player profile for scorer: ${key} (${expected.total_goals} goals)`);
    }
  }

  // FINALIZE REPORT
  summary.integrity_errors = integrityErrors.length;
  summary.data_gaps = dataGaps.length;

  const report = {
    summary,
    integrityErrors,
    dataGaps,
    informational_findings: {
      orphan_team_ids: Array.from(orphanTeamIds),
      total_player_profiles: existingPlayers.size,
      total_historical_profiles: historicalProfilesCount
    }
  };

  const reportPath = path.join(AUDIT_DIR, 'v2_integrity_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('============================================================');
  console.log(' STEP 9 COMPLETE');
  console.log('============================================================');
  console.log(`📊 Backbone Matches:       ${summary.backbone_matches.toLocaleString()}`);
  console.log(`📊 Unique Match IDs:       ${summary.unique_match_ids.toLocaleString()}`);
  console.log(`📊 Team Profiles:          ${summary.team_profiles.toLocaleString()}`);
  console.log(`📊 Player Profiles:        ${summary.player_profiles.toLocaleString()}`);
  console.log(`📊 Invalid JSON Files:     ${summary.invalid_json_files}`);
  
  console.log('\n🟢 Integrity Errors');
  console.log('------------------------');
  console.log(`Duplicate match IDs:      ${integrityErrors.filter(e => e.includes('Duplicate')).length}`);
  console.log(`Structurally invalid:     ${integrityErrors.filter(e => e.includes('Structurally')).length}`);
  console.log(`Team stat errors:         ${integrityErrors.filter(e => e.includes('mismatch') && e.startsWith('Team')).length}`);
  console.log(`H2H errors:               ${integrityErrors.filter(e => e.includes('H2H')).length}`);
  console.log(`Seasonal errors:          ${integrityErrors.filter(e => e.includes('Season')).length}`);

  console.log('\n🟡 Data Gaps');
  console.log('------------------------');
  console.log(`Orphan team IDs:          ${orphanTeamIds.size}`);
  console.log(`Missing team profiles:    ${dataGaps.filter(e => e.includes('Missing team')).length}`);
  console.log(`Player reconciliation:    ${dataGaps.filter(e => e.includes('Player')).length}`);

  console.log('\n🔵 Overall');
  console.log('------------------------');
  console.log(`🟢 CORE DATA INTEGRITY:   ${summary.integrity_errors === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`🟡 DATA COMPLETENESS:     IN PROGRESS`);
  
  console.log(`\n📁 Audit Report: ${reportPath}`);
}

runAudit().catch(error => {
  console.error('❌ Audit Failed:', error);
  process.exit(1);
});