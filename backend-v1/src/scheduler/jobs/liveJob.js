// backend-v1/src/scheduler/jobs/liveJob.js

const liveService = require('../../services/LiveMatchService');
const QuotaManager = require('../../services/QuotaManager');
const logger = require('../../utils/logger');
const fixtureService = require('../../services/FixtureService');
const { submitUrl } = require('../../services/IndexNowService');

// ★ FIX: Defined locally to prevent Module Not Found crash
const createSlug = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

let prevLiveIds = new Set();

async function execute() {
  try {
    if (!QuotaManager.canPollLive()) {
      logger.warn('[LiveJob] Live polling blocked. Daily budget exhausted.');
      return 30 * 60 * 1000;
    }

    const result = await liveService.syncLiveMatches();

    if (result.skipped) {
      logger.info('[LiveJob] Sync skipped by service cache');
      return 15 * 60 * 1000;
    }

    QuotaManager.recordLiveCall();

    const liveMatches = result.liveMatches || [];
    const currentLiveCount = liveMatches.length;
    const currentLiveIds = new Set(liveMatches.map(m => String(m.id)));

    // ★ PING INDEXNOW: Detect matches that JUST went live
    if (prevLiveIds.size > 0 || currentLiveCount > 0) {
      const startedMatches = liveMatches.filter(m => !prevLiveIds.has(String(m.id)));
      
      for (const match of startedMatches) {
        try {
          const homeSlug = createSlug(match.homeName || match.homeTeam?.name);
          const awaySlug = createSlug(match.awayName || match.awayTeam?.name);
          submitUrl(`/match/${match.id}/${homeSlug}-vs-${awaySlug}`);
        } catch (e) { /* Fail silently */ }
      }
    }

    // Detect finished matches.
    if (prevLiveIds.size > 0) {
      const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
      
      if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
        logger.info(`[LiveJob] ${finishedIds.length} match(es) finished. Fetching FT results.`);
        await fixtureService.refreshFinishedMatches();
        QuotaManager.recordFTCall();
      }
    }

    prevLiveIds = currentLiveIds;

    // Adaptive polling
    let intervalMs;
    if (currentLiveCount === 0) intervalMs = 30 * 60 * 1000;
    else if (currentLiveCount <= 5) intervalMs = 15 * 60 * 1000;
    else if (currentLiveCount <= 15) intervalMs = 10 * 60 * 1000;
    else if (currentLiveCount <= 30) intervalMs = 8 * 60 * 1000;
    else intervalMs = 5 * 60 * 1000;

    const stats = QuotaManager.getStats();
    logger.info(`[LiveJob] Next poll ${intervalMs / 60000}m | Live ${currentLiveCount} | Live remaining ${stats.liveRemaining} | FT remaining ${stats.ftRemaining}`);

    return intervalMs;

  } catch(err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return 30 * 60 * 1000;
  }
}

module.exports = { execute };