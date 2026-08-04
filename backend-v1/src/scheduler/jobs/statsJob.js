const StatsEngine = require('../../services/StatsEngine');
const logger = require('../../utils/logger');

async function execute() {
  try {
    logger.info('[Cron] Starting automatic global stats rebuild...');
    await StatsEngine.buildGlobalStats();
    logger.info('[Cron] Global stats rebuild complete.');
  } catch (err) {
    logger.error(`[Cron] Global stats rebuild failed: ${err.message}`);
  }
}

module.exports = {
  execute,
  schedule: '*/2 * * * *' // Every 2 minutes
};