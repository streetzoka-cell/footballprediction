// backend-v1/src/scheduler/jobs/leaderboardRebuildJob.js

const LeaderboardEngine = require('../../services/LeaderboardEngine');
const logger = require('../../utils/logger');


async function execute(dates = []) {

  try {

    if (!Array.isArray(dates) || dates.length === 0) {

      logger.info(
        '[LeaderboardJob] No leaderboard updates required'
      );

      return {
        rebuilt: 0
      };
    }


    const uniqueDates = [
      ...new Set(dates)
    ];


    logger.info(
      `[LeaderboardJob] Rebuilding ${uniqueDates.length} leaderboard(s)`
    );


    await Promise.all(
      uniqueDates.map(date =>
        LeaderboardEngine.rebuildDailyLeaderboard(date)
      )
    );


    logger.info(
      '[LeaderboardJob] Leaderboard rebuild complete'
    );


    return {
      rebuilt: uniqueDates.length
    };


  } catch (err) {

    logger.error(
      `[LeaderboardJob] Failed: ${err.message}`
    );


    return {
      rebuilt: 0,
      error: err.message
    };

  }

}


module.exports = {
  execute,

  // Disabled cron:
  // leaderboard rebuilds happen after match resolution
  schedule: null
};