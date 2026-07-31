// backend-v1/src/scheduler/jobs/liveJob.js
const liveService = require('../../services/LiveMatchService');
const { updateFixturesWithLive } = require('../../services/LiveSyncService'); // ★ NEW
const QuotaManager = require('../../services/QuotaManager');
const logger = require('../../utils/logger');

let prevLiveIds = new Set();

async function execute() {
  try {
    if (!QuotaManager.canPollLive()) {
      logger.warn('[LiveJob] Live polling blocked. Daily live budget exhausted.');
      return 5 * 60 * 1000;
    }

    const result = await liveService.syncLiveMatches();
    
    if (!result.skipped) {
      QuotaManager.recordLiveCall();
    }

    const currentLiveCount = result.count;
    const currentLiveIds = new Set(result.liveMatches.map(m => String(m.id)));

    // ★ UNIFY DATA: Write live scores into the static fixtures JSON files!
    if (result.liveMatches && result.liveMatches.length > 0) {
      await updateFixturesWithLive(result.liveMatches);
    }

    // Smart FT Detection
    if (prevLiveIds.size > 0 && currentLiveIds.size < prevLiveIds.size) {
        const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
        if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
            logger.info(`[LiveJob] ${finishedIds.length} match(es) left the live list. Triggering immediate FT sync...`);
            // Note: FinishedFixturesJob will handle moving them to results.json officially
        }
    }
    prevLiveIds = currentLiveIds;

    // Determine Next Interval
    let intervalMs;
    if (currentLiveCount === 0) {
      intervalMs = 5 * 60 * 1000;   // 5 mins
    } else if (currentLiveCount <= 5) {
      intervalMs = 15 * 60 * 1000;  // 15 mins
    } else if (currentLiveCount <= 15) {
      intervalMs = 13 * 60 * 1000;  // 13 mins
    } else if (currentLiveCount <= 30) {
      intervalMs = 8 * 60 * 1000;   // 8 mins
    } else {
      intervalMs = 5 * 60 * 1000;   // 5 mins
    }

    const stats = QuotaManager.getStats();
    logger.info(`[LiveJob] Next poll in ${intervalMs / 60000}m [Live: ${currentLiveCount} matches, LiveBudget: ${stats.liveRemaining} left, FTBudget: ${stats.ftRemaining} left]`);
    return intervalMs;

  } catch (err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return 5 * 60 * 1000; // 5 mins fallback on error
  }
}

module.exports = { execute };