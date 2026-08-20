// backend-v1/src/scheduler/jobs/userPredictionSyncJob.js
const UserPredictionStore = require('../../services/UserPredictionStore');
const logger = require('../../utils/logger');

/**
 * Syncs local WAL (Write-Ahead Log) predictions to Firestore as a backup.
 */
async function execute(force = false) {
  try {
    logger.info(`[UserPredictionSyncJob] Starting WAL sync to Firestore (Force: ${force})...`);
    
    const result = await UserPredictionStore.processPendingSync(force);
    
    if (!result.skipped) {
      logger.info(`[UserPredictionSyncJob] Completed. Synced=${result.synced || 0}`);
    }
    
    return result;
  } catch (err) {
    logger.error(`[UserPredictionSyncJob] Failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  execute,
  schedule: '0 * * * *' // Runs every hour at minute 0
};