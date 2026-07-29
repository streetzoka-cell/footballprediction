// backend-v1/src/scheduler/jobs/liveJob.js
const liveService = require('../../services/LiveMatchService');
const fixtureService = require('../../services/FixtureService');
const apiFootball = require('../../providers/ApiFootballAdapter');
const { API, LIVE_POLLING } = require('../../config/constants');
const logger = require('../../utils/logger');

let prevLiveCount = 0;
let liveRequestsToday = 0;

async function execute() {
  try {
    const remaining = apiFootball.getRemaining();
    const isNearFinish = false; // Can be expanded later to check match minutes
    
    // 1. Check Hard Limits
    if (remaining <= 0) {
      logger.warn(`[LiveJob] Budget EXHAUSTED (0/${API.DAILY_BUDGET}). Pausing.`);
      return LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    if (remaining < LIVE_POLLING.MIN_BUDGET_TO_POLL) {
      logger.warn(`[LiveJob] Budget CRITICAL (${remaining}/${API.DAILY_BUDGET}). Skipping poll.`);
      return LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    if (liveRequestsToday >= LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP) {
      logger.warn(`[LiveJob] Daily Live Cap reached (${liveRequestsToday}/${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}). Skipping.`);
      return LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    // 2. Execute Live Poll
    const result = await liveService.syncLiveMatches();
    const currentLiveCount = result.count;
    
    if (!result.skipped) {
      liveRequestsToday++;
    }

    // 3. Determine Next Interval (Adaptive Tiers)
    let desired;
    let liveTier;

    if (currentLiveCount === 0) {
      liveTier = "IDLE";
      desired = LIVE_POLLING.IDLE_INTERVAL_MS;
    } else if (currentLiveCount <= 5) {
      liveTier = "LIVE_LOW";
      desired = LIVE_POLLING.LOW_LIVE_INTERVAL_MS;
    } else if (currentLiveCount <= 15) {
      liveTier = "LIVE_MED";
      desired = LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;
    } else if (currentLiveCount <= 40) {
      liveTier = "LIVE_HIGH";
      desired = LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;
    } else {
      liveTier = "LIVE_MASS";
      desired = LIVE_POLLING.MASSIVE_LIVE_INTERVAL_MS;
    }

    // 4. Smart Pacing Calculation (The Genius Math)
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = Math.max(0, endOfDay - now);
    const hoursUntilMidnight = msUntilMidnight / 3600000;

    const spendableBudget = Math.max(0, remaining - LIVE_POLLING.RESERVE_FOR_DAILY_CRON);
    const capRemaining = Math.max(0, LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP - liveRequestsToday);
    const spendableCalls = Math.min(spendableBudget, capRemaining);

    let expectedWindowHours;
    if (hoursUntilMidnight < 1.5) {
      expectedWindowHours = hoursUntilMidnight;
    } else if (currentLiveCount > 0) {
      expectedWindowHours = Math.min(hoursUntilMidnight, 4);
    } else {
      expectedWindowHours = 1;
    }

    const expectedWindowMs = Math.max(0.5, expectedWindowHours) * 3600000;

    let pacingFloor = 0;
    let isPacing = false;

    if (spendableCalls <= 0) {
      pacingFloor = LIVE_POLLING.IDLE_INTERVAL_MS;
    } else {
      const expectedPollsAtDesired = expectedWindowMs / desired;
      if (spendableCalls < expectedPollsAtDesired) {
        pacingFloor = expectedWindowMs / spendableCalls;
        const maxAllowedFloor = 3600000 / LIVE_POLLING.MIN_POLLS_PER_LIVE_HOUR;
        pacingFloor = Math.min(pacingFloor, maxAllowedFloor);
        if (pacingFloor > desired) isPacing = true;
      }
    }

    let interval;
    if (spendableCalls <= 0 && currentLiveCount > 0) {
      interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    } else {
      interval = Math.max(desired, pacingFloor);
    }
    if (currentLiveCount === 0) interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    
    interval = Math.min(interval, LIVE_POLLING.IDLE_INTERVAL_MS);

    let mode = liveTier;
    if (spendableCalls <= 0) mode = "BUDGET_LOCKED";
    else if (isPacing) mode = `PACING+${liveTier}`;

    // 5. FT Recovery Check
    if (prevLiveCount > 0 && currentLiveCount === 0 && !result.skipped) {
      logger.info(`[LiveJob] Live session ended. Triggering immediate FT confirmation in ${LIVE_POLLING.FT_CONFIRMATION_DELAY_MS / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, LIVE_POLLING.FT_CONFIRMATION_DELAY_MS));
      await fixtureService.syncTodayFixtures();
      await fixtureService.syncYesterdayResults();
      logger.info(`[LiveJob] Immediate FT confirmation completed.`);
    }

    prevLiveCount = currentLiveCount;

    const logRemaining = remaining !== null ? remaining : API.DAILY_BUDGET;
    logger.info(
      `[LiveJob] [${mode}] Next poll in ${(interval / 60000).toFixed(1)}m ` +
      `[Live: ${liveRequestsToday}/${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP} cap, API: ${logRemaining}/${API.DAILY_BUDGET}, ` +
      `LiveMatches: ${currentLiveCount}, Spendable: ${spendableCalls}, TimeLeft: ${hoursUntilMidnight.toFixed(1)}h]`
    );

    return interval;

  } catch (err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return LIVE_POLLING.ERROR_BACKOFF_MS;
  }
}

module.exports = { execute };