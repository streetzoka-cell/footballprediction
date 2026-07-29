// backend-v1/src/services/LiveMatchService.js
const ProviderManager = require('../providers/ProviderManager');
const { writeFootballSnapshot } = require('./SnapshotService');
const { getDateOffset } = require('../config/constants');
const QuotaManager = require('./QuotaManager');
const PriorityEngine = require('./PriorityEngine');
const logger = require('../utils/logger');

async function syncLiveMatches() {
  // 1. Check Quota before making any API calls
  if (!QuotaManager.canPollLive()) {
    logger.info('[LiveMatchService] Skipped polling due to quota limits.');
    return { count: 0, skipped: true, providerUsed: 'skipped' };
  }

  logger.info(`[LiveMatchService] Polling live matches...`);
  const liveMatches = await ProviderManager.getLiveFixtures();
  
  // 2. Ensure it's an array
  if (!Array.isArray(liveMatches)) {
    logger.error('[LiveMatchService] Provider did not return an array for live matches.');
    return { count: 0, skipped: true, providerUsed: 'error' };
  }

  // 3. Sort by Priority
  liveMatches.sort((a, b) => PriorityEngine.calculatePriority(b) - PriorityEngine.calculatePriority(a));

  const todayStr = getDateOffset(0);
  await writeFootballSnapshot(todayStr, { live: liveMatches });

  return { count: liveMatches.length, skipped: false, providerUsed: 'api-football' };
}

module.exports = { syncLiveMatches };