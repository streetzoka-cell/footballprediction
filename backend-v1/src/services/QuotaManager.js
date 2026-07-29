// backend-v1/src/services/QuotaManager.js
const apiFootball = require('../providers/ApiFootballAdapter');
const logger = require('../utils/logger');

const RESERVE_EMERGENCY = 5;
const RESERVE_FIXTURES = 10;

function canPollLive() {
  const remaining = apiFootball.getRemaining();
  const spendable = remaining - RESERVE_EMERGENCY - RESERVE_FIXTURES;
  
  if (spendable <= 0) {
    logger.warn(`[QuotaManager] Live polling blocked. Budget low (${remaining} left).`);
    return false;
  }
  return true;
}

function canSyncFixtures() {
  const remaining = apiFootball.getRemaining();
  if (remaining <= RESERVE_EMERGENCY) {
    logger.warn(`[QuotaManager] Fixture sync blocked. Budget low (${remaining} left).`);
    return false;
  }
  return true;
}

module.exports = { canPollLive, canSyncFixtures };