// backend-v1/src/scheduler/jobs/liveJob.js
const liveService = require('../../services/LiveMatchService');
const QuotaManager = require('../../services/QuotaManager');
const logger = require('../../utils/logger');

let prevLiveIds = new Set();

async function execute() {
  try {
    // Don't hammer the API if we've exhausted today's budget
    if (!QuotaManager.canPollLive()) {
      logger.warn('[LiveJob] Live polling blocked. Daily live budget exhausted.');
      return 30 * 60 * 1000; // Retry in 30 minutes
    }

    const result = await liveService.syncLiveMatches();
    if (!result.skipped) {
      QuotaManager.recordLiveCall();
    }

    const currentLiveCount = result.count;
    const currentLiveIds = new Set(
      result.liveMatches.map((m) => String(m.id))
    );

    // Detect matches that disappeared from the live feed (likely finished)
    if (prevLiveIds.size > 0 && currentLiveIds.size < prevLiveIds.size) {
      const finishedIds = [...prevLiveIds].filter((id) => !currentLiveIds.has(id));
      if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
        logger.info(`[LiveJob] ${finishedIds.length} match(es) left the live list. Triggering immediate FT sync...`);
      }
    }
    prevLiveIds = currentLiveIds;

    // Adaptive polling intervals
    let intervalMs;
    if (currentLiveCount === 0) {
      // ★ No live football -> wait 20 minutes before checking again
      intervalMs = 20 * 60 * 1000;
    } else if (currentLiveCount <= 5) {
      intervalMs = 15 * 60 * 1000;
    } else if (currentLiveCount <= 15) {
      intervalMs = 10 * 60 * 1000;
    } else if (currentLiveCount <= 30) {
      intervalMs = 8 * 60 * 1000;
    } else {
      intervalMs = 5 * 60 * 1000;
    }

    const stats = QuotaManager.getStats();
    logger.info(
      `[LiveJob] Next poll in ${intervalMs / 60000}m ` +
      `[Live: ${currentLiveCount} matches, ` +
      `LiveBudget: ${stats.liveRemaining} left, ` +
      `FTBudget: ${stats.ftRemaining} left]`
    );
    return intervalMs;
  } catch (err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return 30 * 60 * 1000; // Retry after 30 minutes on failure
  }
}

module.exports = { execute };