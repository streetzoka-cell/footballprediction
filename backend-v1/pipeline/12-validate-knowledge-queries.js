'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V2_DIR = path.join(ROOT, 'public_data_v2');
const INDEX_DIR = path.join(V2_DIR, 'knowledge', 'football', 'indexes');
const STATS_DIR = path.join(V2_DIR, 'stats');

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

// Schema-tolerant getters for Player Profiles
function getPlayerId(profile) {
  return profile?.player_id ?? profile?.identity?.player_id;
}

function getPlayerName(profile) {
  return profile?.name ?? profile?.identity?.name;
}

function getPlayerGoals(profile) {
  return profile?.total_goals ?? profile?.statistics?.total_goals ?? 0;
}

function getPlayerSource(profile) {
  return profile?.source ?? profile?.provenance?.master_source;
}

async function runValidation() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 12: KNOWLEDGE QUERY VALIDATION');
  console.log('============================================================\n');

  let pass = 0;
  let warn = 0;
  let fail = 0;

  function assert(condition, testName, isWarning = false) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      pass++;
    } else if (isWarning) {
      console.log(`🟡 WARN: ${testName}`);
      warn++;
    } else {
      console.log(`❌ FAIL: ${testName}`);
      fail++;
    }
  }

  // 1. Load Indexes
  console.log('🔍 Loading V2 Knowledge Layer...');
  const matchIndex = loadJson(path.join(INDEX_DIR, 'match_index.json')) || {};
  const h2hIndex = loadJson(path.join(INDEX_DIR, 'h2h_index.json')) || {};
  const teamAliasIndex = loadJson(path.join(INDEX_DIR, 'team_alias_index.json')) || {};
  const playersIndex = loadJson(path.join(STATS_DIR, 'players', 'players_index.json')) || { players: [] };
  const h2hSummaries = loadJson(path.join(STATS_DIR, 'h2h', 'h2h_summaries.json')) || [];
  
  console.log(`   ↳ Match index:      ${Object.keys(matchIndex).length.toLocaleString()}`);
  console.log(`   ↳ H2H pairs:         ${Object.keys(h2hIndex).length.toLocaleString()}`);
  console.log(`   ↳ Teams:             ${Object.keys(teamAliasIndex).length.toLocaleString()}`);
  console.log(`   ↳ Players:           ${(playersIndex.players || []).length.toLocaleString()}\n`);

  // --- INDEX EXISTENCE ---
  console.log('--- INDEX EXISTENCE ---');
  assert(Object.keys(matchIndex).length > 0, 'Match index loaded');
  assert(Object.keys(h2hIndex).length > 0, 'H2H index loaded');
  assert(Object.keys(teamAliasIndex).length > 0, 'Team alias index loaded');
  assert((playersIndex.players || []).length > 0, 'Player index loaded');

  // --- MATCH KNOWLEDGE ---
  console.log('\n--- MATCH KNOWLEDGE ---');
  const matchIds = Object.keys(matchIndex);
  const sampleMatchId = matchIds[Math.floor(Math.random() * matchIds.length)];
  const sampleMatch = matchIndex[sampleMatchId];
  
  assert(sampleMatch && sampleMatch.date && sampleMatch.home_team_id, 'Match lookup & metadata retrieval');

  // --- H2H KNOWLEDGE ---
  console.log('\n--- H2H KNOWLEDGE ---');
  const h2hKeys = Object.keys(h2hIndex);
  const sampleH2HKey = h2hKeys[Math.floor(Math.random() * h2hKeys.length)];
  const sampleH2HMatchIds = h2hIndex[sampleH2HKey];
  const sampleH2HSummary = h2hSummaries.find(s => s.h2h_id === sampleH2HKey);
  
  assert(sampleH2HMatchIds && sampleH2HMatchIds.length > 0, 'H2H lookup');
  assert(sampleH2HSummary && sampleH2HSummary.total_matches === sampleH2HMatchIds.length, 'H2H count consistency');

  // --- TEAM KNOWLEDGE ---
  console.log('\n--- TEAM KNOWLEDGE ---');
  const teamIds = Object.keys(teamAliasIndex);
  const sampleTeamId = teamIds[Math.floor(Math.random() * teamIds.length)];
  const sampleTeam = teamAliasIndex[sampleTeamId];
  
  assert(sampleTeam && sampleTeam.name, 'Canonical team lookup');
  assert(sampleTeam.aliases && sampleTeam.aliases.length > 0, 'Alias resolution');

  // --- PLAYER KNOWLEDGE ---
  console.log('\n--- PLAYER KNOWLEDGE ---');
  const players = playersIndex.players || [];
  
  // Player index -> Profile resolution
  const samplePlayerEntry = players[Math.floor(Math.random() * players.length)];
  let sampleProfile = null;
  if (samplePlayerEntry) {
    const profilePath = path.join(STATS_DIR, 'players', samplePlayerEntry.file);
    sampleProfile = loadJson(profilePath);
  }
  
  assert(sampleProfile && getPlayerId(sampleProfile) === samplePlayerEntry.player_id, 'Player profile → index consistency');

  // Zero-goal players
  const zeroGoalEntry = players.find(p => p.total_goals === 0);
  let zeroGoalProfile = null;
  if (zeroGoalEntry) {
    zeroGoalProfile = loadJson(path.join(STATS_DIR, 'players', zeroGoalEntry.file));
  }
  assert(zeroGoalProfile && getPlayerGoals(zeroGoalProfile) === 0, 'Zero-goal player support');

  // Historical players
  const histEntry = players.find(p => p.player_id.startsWith('HIST_'));
  let histProfile = null;
  if (histEntry) {
    histProfile = loadJson(path.join(STATS_DIR, 'players', histEntry.file));
  }
  assert(histProfile && getPlayerSource(histProfile) === 'historical_unmatched', 'Historical player support', !histProfile); // Warn if missing, don't fail

  // --- NEGATIVE QUERIES ---
  console.log('\n--- NEGATIVE QUERIES ---');
  assert(!matchIndex['FAKE_MATCH_999'], 'Unknown match ID returns null');
  assert(!h2hIndex['FAKE_TEAM_A_vs_FAKE_TEAM_B'], 'Unknown H2H returns null');
  assert(!teamAliasIndex['99999999'], 'Unknown team ID returns null');

  // --- CROSS-INDEX CONSISTENCY ---
  console.log('\n--- CROSS-INDEX ---');
  // Check if H2H matches actually exist in match index
  let crossIndexValid = true;
  if (sampleH2HMatchIds) {
    for (const mId of sampleH2HMatchIds.slice(0, 5)) { // Test a sample of 5
      if (!matchIndex[mId]) {
        crossIndexValid = false;
        break;
      }
    }
  }
  assert(crossIndexValid, 'H2H references valid in Match Index');

  console.log('\n============================================================');
  console.log(' STEP 12 COMPLETE');
  console.log('============================================================');
  console.log(`📊 Tests Passed:  ${pass}`);
  console.log(`🟡 Warnings:     ${warn}`);
  console.log(`❌ Tests Failed: ${fail}`);
  console.log('\n🔒 V2 DATA WAS NOT MODIFIED.');

  if (fail > 0) {
    console.log('\n🔴 KNOWLEDGE STRUCTURE: FAIL');
    process.exit(1);
  } else {
    console.log('\n🟢 KNOWLEDGE STRUCTURE: PASS');
    console.log('🟡 DATA COMPLETENESS: IN PROGRESS');
  }
}

runValidation().catch(err => {
  console.error('❌ Validation Script Failed:', err);
  process.exit(1);
});