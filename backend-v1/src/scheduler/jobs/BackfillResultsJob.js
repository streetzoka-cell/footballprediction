// backend-v1/src/scheduler/jobs/BackfillResultsJob.js
const fixtureService = require('../../services/FixtureService');
const logger = require('../../utils/logger');

async function execute() {
  try {
    logger.info('[BackfillJob] Backfilling results for the last 14 days...');
    
    for (let i = -1; i >= -14; i--) {
      await fixtureService.syncMasterResults(i);
    }
    
    logger.info('[BackfillJob] 14-day backfill complete.');
    return { success: true };
  } catch (err) {
    logger.error(`[BackfillJob] Failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  execute,
  // Run at 23:50 UTC (10 minutes before midnight)
  schedule: '50 23 * * *'
};