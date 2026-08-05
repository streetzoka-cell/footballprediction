// backend-v1/src/scheduler/jobs/statsJob.js
const StatsEngine = require('../../services/StatsEngine');
const logger = require('../../utils/logger');

async function execute() {
  try {
    const now = new Date();
    const isMidnight = now.getUTCHours() === 0 && now.getUTCMinutes() < 5;

    if (isMidnight) {
      logger.info('[StatsJob] Midnight detected. Resetting daily stats...');
      await StatsEngine.resetDailyStats();
    }

    // Ensure latest stats are pushed to global.json
    await StatsEngine.getStats(); 
    
    logger.info('[StatsJob] Stats cache synced to global.json.');
    return { success: true };
  } catch (err) {
    logger.error(`[StatsJob] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  execute,
  schedule: '*/15 * * * *' // Runs every 15 minutes
};