// backend-v1/src/scheduler/jobs/liveJob.js
const liveService = require('../../services/LiveMatchService');
const fixtureService = require('../../services/FixtureService');
const QuotaManager = require('../../services/QuotaManager');
const logger = require('../../utils/logger');

let prevLiveIds = new Set();

async function execute() {
  try {
    // 1. Check Quota before making any API calls
    if (!QuotaManager.canPollLive()) {
      logger.warn('[LiveJob] Live polling blocked. Daily live budget exhausted.');
      return 5 * 60 * 1000; // Check again in 5 mins
    }

    const result = await liveService.syncLiveMatches();
    
    if (!result.skipped) {
      QuotaManager.recordLiveCall();
    }

    const currentLiveCount = result.count;
    const currentLiveIds = new Set(result.liveMatches.map(m => String(m.id)));

    // ★ NEW: Smart FT Detection
    // If matches disappeared from the live list, they likely finished.
    // Trigger an immediate FT sync to get their final scores without waiting 2 hours.
    if (prevLiveIds.size > 0 && currentLiveIds.size < prevLiveIds.size) {
        const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
        if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
            logger.info(`[LiveJob] ${finishedIds.length} match(es) left the live list. Triggering immediate FT sync...`);
            await fixtureService.syncFinishedFixtures();
        }
    }
    prevLiveIds = currentLiveIds;

    // 2. Determine Next Interval based on live match count
    let intervalMs;
    if (currentLiveCount === 0) {
      intervalMs = 5 * 60 * 1000;   // 5 mins (check for kickoffs)
    } else if (currentLiveCount <= 5) {
      intervalMs = 15 * 60 * 1000;  // 1-5 matches: 15 mins
    } else if (currentLiveCount <= 15) {
      intervalMs = 13 * 60 * 1000;  // 6-15 matches: 13 mins
    } else if (currentLiveCount <= 30) {
      intervalMs = 8 * 60 * 1000;   // 16-30 matches: 8 mins
    } else {
      intervalMs = 5 * 60 * 1000;   // 31+ matches: 5 mins
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