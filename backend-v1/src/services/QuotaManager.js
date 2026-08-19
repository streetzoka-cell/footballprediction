const logger = require('../utils/logger');

// Aligned with actual multi-key provider capacity (400 iSports + 200 API-Football)
const TOTAL_BUDGET = 600; 

// Logical allocation
const LIVE_BUDGET = 350;      // 350 calls for live polling (priority + fallbacks)
const FT_BUDGET = 100;       // 100 calls for FT reconciliation
const FALLBACK_BUDGET = 50;  // 50 calls for emergency data
const EMERGENCY_RESERVE = 100; // 100 calls hard locked for critical failures

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

  // ★ FIX: Only record the call once, at the service layer
  recordLiveCall() {
    if (this.liveUsed < LIVE_BUDGET) {
      this.liveUsed++;
    }
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