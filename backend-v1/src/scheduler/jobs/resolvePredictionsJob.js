// backend-v1/src/scheduler/jobs/resolvePredictionsJob.js

const RankingEngine = require('../../services/RankingEngine');
const LeaderboardEngine = require('../../services/LeaderboardEngine');

async function resolveMatch(
  matchId,
  homeScore,
  awayScore,
  matchDate
) {

  const result = await RankingEngine.resolveMatch({
    matchId,
    homeScore,
    awayScore,
    matchDate,
    source: 'scheduler',
  });


  // Only rebuild leaderboard if something changed
  if (
    result &&
    result.resolved === true
  ) {
    return true;
  }


  return false;
}


async function rebuildDailyLeaderboard(dateStr) {

  return LeaderboardEngine.rebuildDailyLeaderboard(
    dateStr
  );

}


async function resolveMatchAndBuildLeaderboard(
  matchId,
  homeScore,
  awayScore,
  matchDate
){

  const changed = await resolveMatch(
    matchId,
    homeScore,
    awayScore,
    matchDate
  );


  if(changed){

    await rebuildDailyLeaderboard(
      matchDate
    );

  }


  return changed;

}


module.exports = {

  resolveMatch,

  rebuildDailyLeaderboard,

  resolveMatchAndBuildLeaderboard

};