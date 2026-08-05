const { processPendingSync } = require('../../services/UserPredictionStore');
const logger = require('../../utils/logger');

async function execute(force = false) {
  try {
    const result = await processPendingSync(force);

    if (!result.skipped) {
      logger.info(
        `[UserPredictionSyncJob] Completed. Synced=${result.synced || 0}`
      );
    }

    return result;
  } catch (err) {
    logger.error(
      `[UserPredictionSyncJob] Failed: ${err.message}`
    );
    throw err;
  }
}

module.exports = {
  execute,
};