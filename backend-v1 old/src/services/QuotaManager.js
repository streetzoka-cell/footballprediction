// footballprediction/backend-v1/src/services/QuotaManager.js

const logger = require('../utils/logger');

// â˜… Scaled for 2 API keys (200 daily calls total)
const TOTAL_BUDGET = 200; 
const FT_BUDGET = 24;       // 12 calls/day * 2 keys
const FALLBACK_BUDGET = 6;  // 3 calls/day * 2 keys
const EMERGENCY_RESERVE = 16; // 8 calls/day * 2 keys
const LIVE_BUDGET = TOTAL_BUDGET - FT_BUDGET - FALLBACK_BUDGET - EMERGENCY_RESERVE; // 154 calls

class QuotaManager {
  constructor() {
    this.resetDate = new Date().toISOString().split('T')[0];
    this.liveUsed = 0;
    this.ftUsed = 0;
    this.fallbackUsed = 0;
  }

  _resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (this.resetDate !== today) {
      this.liveUsed = 0;
      this.ftUsed = 0;
      this.fallbackUsed = 0;
      this.resetDate = today;
      logger.info('[QuotaManager] New day - Logical budgets reset.');
    }
  }

  canPollLive() {
    this._resetIfNewDay();
    return this.liveUsed < LIVE_BUDGET;
  }

  recordLiveCall() {
    this.liveUsed++;
  }

  canFetchFT() {
    this._resetIfNewDay();
    return this.ftUsed < FT_BUDGET;
  }

  recordFTCall() {
    this.ftUsed++;
  }

  canUseFallback() {
    this._resetIfNewDay();
    return this.fallbackUsed < FALLBACK_BUDGET;
  }

  recordFallbackCall() {
    this.fallbackUsed++;
  }

  getStats() {
    return {
      liveUsed: this.liveUsed,
      liveRemaining: LIVE_BUDGET - this.liveUsed,
      ftUsed: this.ftUsed,
      ftRemaining: FT_BUDGET - this.ftUsed,
      fallbackUsed: this.fallbackUsed,
      fallbackRemaining: FALLBACK_BUDGET - this.fallbackUsed
    };
  }
}

module.exports = new QuotaManager();
