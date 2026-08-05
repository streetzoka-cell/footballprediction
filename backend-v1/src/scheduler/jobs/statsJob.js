// backend-v1/src/jobs/cron/StatsJob.js

const StatsEngine = require('../../services/StatsEngine');
const logger = require('../../utils/logger');

async function execute() {
  try {
    logger.info('[Cron] Manual stats publish...');

    await StatsEngine.buildGlobalStats();

    logger.info('[Cron] Stats publish complete.');
  } catch (err) {
    logger.error(`[Cron] Stats publish failed: ${err.message}`);
  }
}

module.exports = {
  execute,

  // Disabled.
  // Stats are maintained by backend events instead of polling.
  schedule: null,
};