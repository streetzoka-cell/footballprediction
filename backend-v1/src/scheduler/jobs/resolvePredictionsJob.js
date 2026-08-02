// backend-v1/src/scheduler/jobs/resolvePredictionsJob.js

const RankingEngine = require('../../services/RankingEngine');
const LeaderboardEngine = require('../../services/LeaderboardEngine');

async function resolveMatch(matchId, homeScore, awayScore, matchDate) {
  const result = await RankingEngine.resolveMatch({
    matchId,
    homeScore,
    awayScore,
    matchDate,
    source: 'scheduler',
  });

  return result.resolved;
}

async function rebuildDailyLeaderboard(dateStr) {
  return LeaderboardEngine.rebuildDailyLeaderboard(dateStr);
}

async function resolveMatchAndBuildLeaderboard(
  matchId,
  homeScore,
  awayScore,
  matchDate
) {
  return resolveMatch(matchId, homeScore, awayScore, matchDate);
}

module.exports = {
  resolveMatch,
  rebuildDailyLeaderboard,
  resolveMatchAndBuildLeaderboard,
};