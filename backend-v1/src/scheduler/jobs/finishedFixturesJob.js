// backend-v1/src/scheduler/jobs/finishedFixturesJob.js
const fixtureService = require('../../services/FixtureService');
const { resolveMatchAndBuildLeaderboard } = require('./resolvePredictionsJob');

async function execute() {
  // 1. Sync finished fixtures. Now returns an ARRAY of finished matches
  const finishedMatches = await fixtureService.syncFinishedFixtures();
  
  const count = Array.isArray(finishedMatches) ? finishedMatches.length : 0;

  // 2. If matches finished, resolve predictions and rebuild leaderboards
  if (count > 0) {
    console.log(`[FinishedFixturesJob] Found ${count} finished matches. Resolving predictions...`);
    
    for (const match of finishedMatches) {
      try {
        // Safely extract scores (handles both API formats)
        const homeScore = match.score?.fullTime?.home ?? match.goalsHomeTeam ?? match.homeScore;
        const awayScore = match.score?.fullTime?.away ?? match.goalsAwayTeam ?? match.awayScore;
        
        // Safely extract date string (YYYY-MM-DD)
        const matchDate = match.dateStr || (match.utcDate ? match.utcDate.split('T')[0] : (match.date ? match.date.split('T')[0] : null));

        if (homeScore != null && awayScore != null && matchDate) {
          await resolveMatchAndBuildLeaderboard(match.id, homeScore, awayScore, matchDate);
        } else {
          console.warn(`[FinishedFixturesJob] Missing score or date for match ${match.id}`);
        }
      } catch (err) {
        console.error(`[FinishedFixturesJob] Error resolving match ${match.id}:`, err.message);
      }
    }
  }

  return { count };
}

module.exports = { execute };