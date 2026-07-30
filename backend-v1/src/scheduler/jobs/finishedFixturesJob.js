// backend-v1/src/scheduler/jobs/finishedFixturesJob.js
const fixtureService = require('../../services/FixtureService');
const { resolveMatch, rebuildDailyLeaderboard } = require('./resolvePredictionsJob');

async function execute() {
  // 1. Get all finished matches for today
  const finishedMatches = await fixtureService.syncFinishedFixtures();
  const count = Array.isArray(finishedMatches) ? finishedMatches.length : 0;

  if (count > 0) {
    console.log(`[FinishedFixturesJob] Found ${count} finished matches. Processing...`);
    
    const datesToRebuild = new Set(); // Track which dates need a leaderboard rebuild

    // 2. Resolve each match silently (without rebuilding the leaderboard yet)
    for (const match of finishedMatches) {
      try {
        const score = match.score?.fullTime || match.score || {};
        const homeScore = score.home;
        const awayScore = score.away;
        const matchDate = match.dateStr || (match.date && match.date.split('T')[0]);

        if (homeScore != null && awayScore != null && matchDate) {
          // ★ We call resolveMatch, NOT resolveAndBuildLeaderboard
          const wasResolved = await resolveMatch(match.id, homeScore, awayScore, matchDate);
          if (wasResolved && matchDate) {
            datesToRebuild.add(matchDate); // Mark this date for rebuild
          }
        }
      } catch (err) {
        console.error(`[FinishedFixturesJob] Error processing match ${match.id}:`, err.message);
      }
    }

    // 3. Rebuild the leaderboard ONLY ONCE for each affected date
    for (const dateStr of datesToRebuild) {
      console.log(`[FinishedFixturesJob] Rebuilding leaderboard for ${dateStr}...`);
      await rebuildDailyLeaderboard(dateStr);
    }
  }

  return { count };
}

module.exports = { execute };