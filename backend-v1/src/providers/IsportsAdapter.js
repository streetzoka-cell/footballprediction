// backend-v1/src/providers/IsportsAdapter.js
const { fetchWithRetry } = require('../utils/RetryEngine');
const logger = require('../utils/logger');
const env = require('../config/env');
const BaseProvider = require('./BaseProvider');

const PRIMARY_BASE = env.ISPORTS_PRIMARY_URL;
const BACKUP_BASE  = env.ISPORTS_BACKUP_URL;
const TIMEOUT = 30000; // Safe for Cloudflare, enough for iSports
const PER_KEY_BUDGET = env.ISPORTS_DAILY_BUDGET || 200;

// ★ NEW: The Smart Live Minute Calculator
function getLiveMinute(match) {
  // 1. Trust iSports official minute if it exists and is > 0
  if (match.extraExplain && match.extraExplain.minute > 0) {
    return match.extraExplain.minute;
  }

  // 2. Fallback calculation using halfStartTime
  if (match.halfStartTime) {
    const now = Math.floor(Date.now() / 1000);
    let minutes = Math.floor((now - match.halfStartTime) / 60);

    if (minutes < 0) minutes = 0;

    // iSports status 3 = 2nd Half. Add 45 minutes.
    if (match.status === 3) {
      minutes += 45;
    }

    return minutes;
  }

  return 0; // Default to 0 if no data
}

class IsportsAdapter extends BaseProvider {
  constructor() {
    super();
    this.name = 'isports';

    // ★ Multi-key support: 2 accounts × 200 calls each = 400 total
    this.keys = [];
    if (env.ISPORTS_API_KEY) {
      this.keys.push({ key: env.ISPORTS_API_KEY, remaining: PER_KEY_BUDGET, lastResetDate: new Date().toDateString() });
    }
    if (env.ISPORTS_API_KEY_2) {
      this.keys.push({ key: env.ISPORTS_API_KEY_2, remaining: PER_KEY_BUDGET, lastResetDate: new Date().toDateString() });
    }

    this.activeKeyIndex = 0;
    this.avgLatency = 0;
    this.lastSuccessTime = null;

    logger.info(
      `[IsportsAdapter] Initialized ${this.keys.length} key(s) × ${PER_KEY_BUDGET}/key = ` +
      `${this.keys.length * PER_KEY_BUDGET} total daily budget.`
    );
  }

  _resetIfNewDay() {
    const today = new Date().toDateString();
    let reset = false;
    this.keys.forEach((k) => {
      if (k.lastResetDate !== today) {
        k.remaining = PER_KEY_BUDGET;
        k.lastResetDate = today;
        reset = true;
      }
    });
    if (reset) logger.info(`[IsportsAdapter] New day - quota reset for ${this.keys.length} key(s).`);
  }

  // Pick the next key that still has budget (rotates to balance load)
  _getActiveKey() {
    this._resetIfNewDay();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.activeKeyIndex + i) % this.keys.length;
      if (this.keys[idx].remaining > 0) {
        this.activeKeyIndex = idx;
        return this.keys[idx];
      }
    }
    return null; // all keys exhausted
  }

  isBudgetAvailable(req = 1) {
    this._resetIfNewDay();
    return this.keys.some((k) => k.remaining >= req);
  }

  getRemaining() {
    this._resetIfNewDay();
    return this.keys.reduce((sum, k) => sum + k.remaining, 0);
  }

async _requestWithFailover(path, params = {}) {
  const activeKey = this._getActiveKey();

  if (!activeKey) {
    throw new Error('iSports daily quota depleted (all keys exhausted)');
  }

  activeKey.remaining = Math.max(0, activeKey.remaining - 1);

  this.activeKeyIndex =
    (this.activeKeyIndex + 1) % this.keys.length;

  const query = {
    api_key: activeKey.key,
    ...params
  };

  const bases = [PRIMARY_BASE, BACKUP_BASE];

  let lastErr = null;

  for (const base of bases) {
    const url = `${base}${path}`;

    try {
      const t0 = Date.now();

      const { data, status } = await fetchWithRetry(
        {
          url,
          params: query,
          timeout: TIMEOUT,
          validateStatus: () => true
        },
        3
      );

      const latency = Date.now() - t0;
      this.avgLatency = Math.round(
        (this.avgLatency + latency) / 2
      );

      if (status < 200 || status >= 300) {
        lastErr = new Error(`HTTP ${status}`);
        continue;
      }

      if (data.code !== 0) {
        lastErr = new Error(
          `iSports API Error ${data.code}: ${data.message}`
        );
        continue;
      }

      const payload = data.data;

      if (!payload || (Array.isArray(payload) && payload.length === 0)) {
        lastErr = new Error('Empty payload');
        continue;
      }

      this.lastSuccessTime = new Date().toISOString();

      return payload;

    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error(`iSports failed for ${path}`);
}

  async getLiveFixtures() {
    const allMatches = await this._requestWithFailover('/sport/football/livescores');
    
    // ★ NEW: Map and inject the calculated liveMinute
    return allMatches
      .filter((m) => m.status > 0)
      .map((m) => ({
        ...m,
        liveMinute: getLiveMinute(m),
        displayMinute: getLiveMinute(m) // Duplicate it for the normaliser to easily find
      }));
  }

  async getFixtures(date) {
    return this._requestWithFailover('/sport/football/schedule/basic', date ? { date } : {});
  }

  async getLeague(id) {
    return this._requestWithFailover('/sport/football/league', { league_id: id });
  }

  async health() {
    return {
      provider: 'isports',
      healthy: this.isBudgetAvailable(1),
      latency: this.avgLatency,
      quotaRemaining: this.getRemaining(),
      keysActive: this.keys.filter((k) => k.remaining > 0).length,
      lastSuccess: this.lastSuccessTime,
    };
  }
}

module.exports = new IsportsAdapter();