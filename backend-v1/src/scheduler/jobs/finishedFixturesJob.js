const fixtureService = require('../../services/FixtureService');
const {
  resolveMatch,
  rebuildDailyLeaderboard,
} = require('./resolvePredictionsJob');

async function execute(forceFetch = false) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  const todayFinished = await fixtureService.forceRefreshFinishedMatches(today);
  const yesterdayFinished = await fixtureService.forceRefreshFinishedMatches(yesterday);
  
  const allFinished = [...(todayFinished || []), ...(yesterdayFinished || [])];
  const count = allFinished.length;

  if (count > 0) {
    console.log(`[FinishedFixturesJob] Found ${count} finished matches. Processing...`);

    const datesToRebuild = new Set();

    for (const match of allFinished) {
      try {
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

module.exports = {
  execute,
};