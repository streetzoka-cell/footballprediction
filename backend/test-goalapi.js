const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.GOAL_API_KEY;
const BASE_URL = 'https://api.goal-api.com/v1';

if (!API_KEY) {
  console.error('❌ ERROR: GOAL_API_KEY is missing in your .env file.');
  process.exit(1);
}

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

async function testEndpoint(name, method, url, params) {
  try {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`▶ Testing: ${name}`);
    console.log(`  ${method.toUpperCase()} ${url}`, params ? `Params: ${JSON.stringify(params)}` : '');
    
    const res = await api({ method, url, params });
    console.log(`✅ SUCCESS! Status: ${res.status}`);
    
    const data = res.data?.data || res.data?.response || res.data;
    const str = JSON.stringify(data, null, 2);
    
    console.log(`Data Preview:\n${str.substring(0, 800)}`);
    if (str.length > 800) console.log('... (truncated)');
    
    return data;
  } catch (err) {
    console.log(`❌ FAILED: ${err.response?.status || 'Network Error'}`);
    const errData = err.response?.data;
    if (errData?.details?.path) console.log(`  Path tried: ${errData.details.path}`);
    return null;
  }
}

async function run() {
  console.log('🚀 Starting COMPREHENSIVE GOAL API Tests...');

  // 1. Get a fixture to extract IDs
  const today = new Date().toISOString().split('T')[0];
  const fixturesData = await testEndpoint('Fixtures & Results', 'get', '/fixtures', { date: today, limit: 1 });
  
  let matchId = null, leagueId = null, homeTeamId = null, awayTeamId = null, playerId = null;
  
  if (fixturesData && Array.isArray(fixturesData) && fixturesData.length > 0) {
    const match = fixturesData[0];
    matchId = match.id;
    leagueId = match.leagueId;
    homeTeamId = match.homeTeamId;
    awayTeamId = match.awayTeamId;
    console.log(`\nExtracted -> Match: ${matchId}, League: ${leagueId}, Home: ${homeTeamId}, Away: ${awayTeamId}`);
  }

  // 2. Live Scores
  await testEndpoint('Live Scores', 'get', '/fixtures', { live: 'all' });

  // 3. Leagues & Competitions
  await testEndpoint('Leagues List', 'get', '/leagues', { limit: 1 });

  // 4. Teams
  if (leagueId) await testEndpoint('Teams (by League)', 'get', '/teams', { league: leagueId, limit: 1 });

  // 5. Players (Usually nested under teams)
  if (homeTeamId) {
      const teamPlayers = await testEndpoint('Players (by Team)', 'get', `/teams/${homeTeamId}/players`, { limit: 1 });
      if (teamPlayers && Array.isArray(teamPlayers) && teamPlayers.length > 0) {
          playerId = teamPlayers[0].id;
      }
  }
  if (playerId) await testEndpoint('Player Details', 'get', `/players/${playerId}`);

  // 6. Standings
  if (leagueId) await testEndpoint('Standings', 'get', `/leagues/${leagueId}/standings`);

  // 7. Top Scorers
  if (leagueId) await testEndpoint('Top Scorers', 'get', `/leagues/${leagueId}/topscorers`);

  // 8. Match Statistics
  if (matchId) await testEndpoint('Match Statistics', 'get', `/fixtures/${matchId}/statistics`);

  // 9. Lineups
  if (matchId) await testEndpoint('Match Lineups', 'get', `/fixtures/${matchId}/lineups`);

  // 10. Match Events
  if (matchId) await testEndpoint('Match Events', 'get', `/fixtures/${matchId}/events`);

  // 11. Head-to-Head (Testing multiple path conventions)
  if (homeTeamId && awayTeamId) {
    console.log('\n▶ Testing: Head-to-Head Alternatives');
    const h2hCandidates = [
      { url: '/h2h', params: { team1: homeTeamId, team2: awayTeamId } },
      { url: `/teams/${homeTeamId}/h2h/${awayTeamId}` },
      { url: `/teams/${homeTeamId}/h2h`, params: { opponent: awayTeamId } },
      { url: '/fixtures/h2h', params: { team1: homeTeamId, team2: awayTeamId } }
    ];
    for (const cand of h2hCandidates) {
      try {
        const res = await api.get(cand.url, { params: cand.params });
        console.log(`✅ H2H MATCH FOUND! Path: ${cand.url}`);
        console.log(`Data Preview: ${JSON.stringify(res.data?.data || res.data, null, 2).substring(0, 500)}`);
        break;
      } catch (err) {
        console.log(`❌ H2H 404: ${cand.url}`);
      }
    }
  }

  // 12. Video Highlights
  if (matchId) await testEndpoint('Video Highlights', 'get', `/fixtures/${matchId}/videos`);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ All comprehensive tests complete!');
}

run().catch(err => console.error('Fatal error:', err.message));