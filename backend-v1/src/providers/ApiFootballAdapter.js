const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const env = require('../config/env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const Normaliser = require('../normalisers/apiFootballNormaliser');

class ApiFootballAdapter extends BaseProvider {
  constructor() {
    super();
    this.providerName = 'api-football';
    this.api = axios.create({
      baseURL: env.API_FOOTBALL_BASE_URL,
      timeout: 15000,
      headers: { 'x-apisports-key': env.API_FOOTBALL_KEY },
    });
    this.remaining = env.API_FOOTBALL_DAILY_BUDGET;
    this.lastResetDate = new Date().toISOString().split('T')[0];

    this._setupInterceptors();
  }

  _resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastResetDate !== today) {
      this.remaining = env.API_FOOTBALL_DAILY_BUDGET;
      this.lastResetDate = today;
      logger.info(`[ApiFootball] New day (${today}) — local budget counter reset to ${this.remaining}`);
    }
  }

     _setupInterceptors() {
    this.api.interceptors.request.use((cfg) => {
      this._resetIfNewDay();
      if (this.remaining <= 0) {
        const err = new Error('ApiFootball daily budget exhausted (0). Blocked: ' + cfg.url);
        err.code = 'BUDGET_EXHAUSTED';
        return Promise.reject(err);
      }
      return cfg;
    });

    this.api.interceptors.response.use(
      (res) => {
        // ★ FIX: API-Football returns daily remaining in this header
        const dailyRemaining = res.headers['x-ratelimit-requests-remaining'];
        if (dailyRemaining != null && !isNaN(parseInt(dailyRemaining, 10))) {
          this.remaining = parseInt(dailyRemaining, 10);
        } else {
          // Fallback: decrement locally if header is missing
          this.remaining = Math.max(0, this.remaining - 1);
        }
        return res;
      },
      (err) => {
        if (err.response?.status === 429) {
          const dailyRemaining = err.response.headers['x-ratelimit-requests-remaining'];
          if (dailyRemaining != null && parseInt(dailyRemaining, 10) === 0) {
            // True daily limit exhausted
            this.remaining = 0;
            logger.warn('[ApiFootball] 429 hit: Daily quota exhausted (0/100).');
          } else {
            // Just a per-minute spike (e.g. 60/min limit hit). Do NOT kill the daily budget.
            logger.warn('[ApiFootball] 429 hit (Per-minute rate limit). Backing off...');
          }
        }
        return Promise.reject(err);
      }
    );
  }
  


  isBudgetAvailable(req = 1) {
    this._resetIfNewDay();
    return this.remaining >= req;
  }

  getRemaining() {
    this._resetIfNewDay();
    return this.remaining;
  }

  async _fetch(endpoint, params = {}) {
    if (!this.isBudgetAvailable(1)) throw new Error('ApiFootball budget exhausted');
    return withRetry(async () => {
      const res = await this.api.get(endpoint, { params });
      return res.data?.response || [];
    }, `ApiFootball.${endpoint}`);
  }

  async getFixtures(dateStr) {
    const data = await this._fetch('/fixtures', { date: dateStr });
    logger.info(`[ApiFootball] Fetched ${data.length} fixtures for ${dateStr}. Remaining: ${this.getRemaining()}`);
    return data.map(Normaliser.normalizeMatch);
  }

  async getLiveFixtures() {
    const data = await this._fetch('/fixtures', { live: 'all' });
    logger.info(`[ApiFootball] Fetched ${data.length} live matches. Remaining: ${this.getRemaining()}`);
    return data.map(Normaliser.normalizeMatch);
  }

    async getStandings(leagueId, season) {
    const data = await this._fetch('/standings', { league: leagueId, season });
    // API-Football returns an array with one object that contains the 'league' key
    return data[0]?.league || null;
  }

  // ★ ADDED: Fetch teams for a specific league
  async getTeams(leagueId, season) {
    const data = await this._fetch('/teams', { league: leagueId, season });
    // API-Football returns an array of team objects
    return data || [];
  }

  async health() {
    return {
      provider: this.providerName,
      budgetRemaining: this.getRemaining(),
      budgetDaily: env.API_FOOTBALL_DAILY_BUDGET,
    };
  }
}

module.exports = new ApiFootballAdapter();