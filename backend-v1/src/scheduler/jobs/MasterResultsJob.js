// backend-v1/src/scheduler/jobs/MasterResultsJob.js
const fixtureService = require('../../services/FixtureService');
const logger = require('../../utils/logger');

async function execute() {
  try {
    logger.info('[MasterResultsJob] Running 45-minute master results sync...');
    
    // Fetches accurate results for Today and Yesterday directly from API
    await fixtureService.syncMasterResults(0);
    await fixtureService.syncMasterResults(-1);
    
    return { success: true };
  } catch (err) {
    logger.error(`[MasterResultsJob] Failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  execute,
  // Run every 45 minutes
  schedule: '*/45 * * * *'
};