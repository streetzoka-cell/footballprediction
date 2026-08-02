// footballprediction/backend-v1/src/scheduler/jobs/finishedFixturesJob.js
const fixtureService = require('../../services/FixtureService');
const { resolveMatch, rebuildDailyLeaderboard } = require('./resolvePredictionsJob');

async function execute(forceFetch = false) {
  // 1. Get all finished matches for today
  const finishedMatches = await fixtureService.syncFinishedFixtures(forceFetch);
  const count = Array.isArray(finishedMatches) ? finishedMatches.length : 0;

  if (count > 0) {
    console.log(`[FinishedFixturesJob] Found ${count} finished matches. Processing...`);
    
    const datesToRebuild = new Set();

    for (const match of finishedMatches) {
      try {
        const score = match.score?.fullTime || match.score || {};
        const homeScore = match.homeScore;
        const awayScore = match.awayScore;
        const matchDate = match.dateStr || (match.date && match.date.split('T')[0]);

        if (homeScore != null && awayScore != null && matchDate) {
          const wasResolved = await resolveMatch(match.id, homeScore, awayScore, matchDate);
          if (wasResolved && matchDate) {
            datesToRebuild.add(matchDate);
          }
        }
      } catch (err) {
        console.error(`[FinishedFixturesJob] Error processing match ${match.id}:`, err.message);
      }
    }

    for (const dateStr of datesToRebuild) {
      console.log(`[FinishedFixturesJob] Rebuilding leaderboard for ${dateStr}...`);
      await rebuildDailyLeaderboard(dateStr);
    }
  }

  return { count };
}

module.exports = { execute };
