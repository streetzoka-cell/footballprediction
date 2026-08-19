'use strict';

const KnowledgeQueryEngine = require('../../src/kim/KnowledgeQueryEngine');

console.log('============================================================');
console.log(' ZOKASCORE V2 PIPELINE — STEP 13: KNOWLEDGE QUERY ENGINE TEST');
console.log('============================================================\n');

let pass = 0;
let fail = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    pass++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    fail++;
  }
}

// 1. Team Operations
console.log('--- TEAM OPERATIONS ---');
const teamRes = KnowledgeQueryEngine.findTeam('Arsenal');
assert(teamRes.status === 'ok' && teamRes.data.team_id === '11', `Find Team (Arsenal) -> ID: ${teamRes.data?.team_id || 'N/A'}`);

if (teamRes.status !== 'ok') {
  console.log('\nStopping because Arsenal could not be resolved.');
  process.exit(1);
}

const arsenalId = teamRes.data.team_id;

const teamStatsRes = KnowledgeQueryEngine.getTeamHistory(arsenalId);
assert(teamStatsRes.status === 'ok' && teamStatsRes.data.total_matches > 0, `Get Team History (Arsenal: ${arsenalId})`);

const teamSeasonRes = KnowledgeQueryEngine.getTeamSeason(arsenalId, '2023');
assert(teamSeasonRes.status === 'ok' && teamSeasonRes.data.matches > 0, `Get Team Season (Arsenal ${arsenalId} 2023)`);

const searchTeamsRes = KnowledgeQueryEngine.searchTeams('United');
assert(searchTeamsRes.status === 'ok' && searchTeamsRes.data.length > 1, 'Search Teams (United)');

// 2. Match Operations
console.log('\n--- MATCH OPERATIONS ---');
const matchIndex = KnowledgeQueryEngine.getMatchIndex();
const sampleMatchId = Object.keys(matchIndex)[0];

const matchRes = KnowledgeQueryEngine.getMatch(sampleMatchId);
assert(matchRes.status === 'ok' && matchRes.data.home_team_id, 'Get Match by ID');

// Dynamically find an H2H pair to test
const h2hIndex = KnowledgeQueryEngine.getH2HIndex();
const sampleH2HKey = Object.keys(h2hIndex)[0];
const [teamAId, teamBId] = sampleH2HKey.split('_vs_');

const h2hRes = KnowledgeQueryEngine.getH2H(teamAId, teamBId);
assert(h2hRes.status === 'ok' && h2hRes.data.total_matches > 0, `Get Dynamic H2H (${teamAId} vs ${teamBId})`);

// 3. Player Operations
console.log('\n--- PLAYER OPERATIONS ---');
const playerRes = KnowledgeQueryEngine.findPlayer('Miroslav Klose');
assert(playerRes.status === 'ok' && playerRes.data.player_id === '10', 'Find Player (Klose)');

const playerStatsRes = KnowledgeQueryEngine.getPlayerStats('10');
assert(playerStatsRes.status === 'ok' && playerStatsRes.data.identity.name === 'Miroslav Klose', 'Get Player Stats (Klose)');

// Test Zero-Goal Player with accents
const zeroGoalRes = KnowledgeQueryEngine.findPlayer('René Adler');
if (zeroGoalRes.status === 'ok') {
    const zeroStatsRes = KnowledgeQueryEngine.getPlayerStats(zeroGoalRes.data.player_id);
    assert(zeroStatsRes.status === 'ok' && zeroStatsRes.data.statistics.total_goals === 0, 'Get Zero-Goal Player (René Adler)');
} else {
    assert(false, 'Get Zero-Goal Player (René Adler) - Not Found');
}

const searchPlayersRes = KnowledgeQueryEngine.searchPlayers('Salah');
assert(searchPlayersRes.status === 'ok' && searchPlayersRes.data.length > 0, 'Search Players (Salah)');

// 4. Negative Operations
console.log('\n--- NEGATIVE OPERATIONS ---');
const badTeam = KnowledgeQueryEngine.findTeam('ZOKA United FC');
assert(badTeam.status === 'not_found', 'Negative Team Lookup');

const badPlayer = KnowledgeQueryEngine.findPlayer('Fake Player 999');
assert(badPlayer.status === 'not_found', 'Negative Player Lookup');

console.log('\n============================================================');
console.log(' STEP 13 COMPLETE');
console.log('============================================================');
console.log(`📊 Tests Passed: ${pass}`);
console.log(`❌ Tests Failed: ${fail}`);

if (fail > 0) process.exit(1);