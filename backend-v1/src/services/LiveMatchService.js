// backend-v1/src/services/LiveMatchService.js
const ProviderManager = require('../providers/ProviderManager');
const { writeFootballSnapshot } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const QuotaManager = require('./QuotaManager');
const logger = require('../utils/logger');

async function syncLiveMatches() {
  if (!QuotaManager.canPollLive()) {
    logger.info('[LiveMatchService] Skipped polling due to quota limits.');
    return { count: 0, skipped: true, liveMatches: [] };
  }

  logger.info(`[LiveMatchService] Polling live matches...`);
  const liveMatches = await ProviderManager.getLiveFixtures();
  
  if (!Array.isArray(liveMatches)) {
    logger.error('[LiveMatchService] Provider did not return an array for live matches.');
    return { count: 0, skipped: true, liveMatches: [] };
  }

  const todayStr = getDateOffset(0);
  await writeFootballSnapshot(todayStr, { live: liveMatches });

  return { count: liveMatches.length, skipped: false, liveMatches };
}

module.exports = { syncLiveMatches };