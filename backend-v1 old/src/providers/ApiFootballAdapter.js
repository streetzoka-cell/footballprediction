// footballprediction/backend-v1/src/providers/ApiFootballAdapter.js
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
    });
    
    // â˜… NEW: Initialize multiple keys
    this.keys = [];
    if (env.API_FOOTBALL_KEY) {
      this.keys.push({ key: env.API_FOOTBALL_KEY, remaining: env.API_FOOTBALL_DAILY_BUDGET, lastResetDate: new Date().toISOString().split('T')[0] });
    }
    if (env.API_FOOTBALL_KEY_2) {
      this.keys.push({ key: env.API_FOOTBALL_KEY_2, remaining: env.API_FOOTBALL_DAILY_BUDGET, lastResetDate: new Date().toISOString().split('T')[0] });
    }

    this.activeKeyIndex = 0;
    this._setupInterceptors();
  }

  _resetIfNewDay() {
    const today = new Date().toISOString().split('T')[0];
    let reset = false;
    this.keys.forEach(k => {
      if (k.lastResetDate !== today) {
        k.remaining = env.API_FOOTBALL_DAILY_BUDGET; // Default to 100 per key
        k.lastResetDate = today;
        reset = true;
      }
    });
    if (reset) logger.info(`[ApiFootball] New day - Local budget counter reset for ${this.keys.length} keys.`);
  }

  getActiveKey() {
    this._resetIfNewDay();
    // Find a key with remaining budget
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.activeKeyIndex + i) % this.keys.length;
      if (this.keys[idx].remaining > 0) {
        this.activeKeyIndex = idx; // Set as active
        return this.keys[idx];
      }
    }
    return null; // All keys exhausted
  }

  _setupInterceptors() {
    this.api.interceptors.request.use((cfg) => {
      const activeKey = this.getActiveKey();
      if (!activeKey) {
        const err = new Error('All API-Football keys exhausted (0 remaining). Blocked: ' + cfg.url);
        err.code = 'BUDGET_EXHAUSTED';
        return Promise.reject(err);
      }
      
      // Attach the active key to headers dynamically
      cfg.headers['x-apisports-key'] = activeKey.key;
      return cfg;
    });

    this.api.interceptors.response.use(
      (res) => {
        // â˜… Update remaining calls for the specific key used
        const usedKey = res.config.headers['x-apisports-key'];
        const keyObj = this.keys.find(k => k.key === usedKey);
        
        if (keyObj) {
          const dailyRemaining = res.headers['x-ratelimit-requests-remaining'];
          if (dailyRemaining != null && !isNaN(parseInt(dailyRemaining, 10))) {
            keyObj.remaining = parseInt(dailyRemaining, 10);
          } else {
            // Fallback decrement if header is missing
            keyObj.remaining = Math.max(0, keyObj.remaining - 1);
          }
        }
        return res;
      },
      (err) => {
        if (err.response?.status === 429) {
          const usedKey = err.response.config.headers['x-apisports-key'];
          const keyObj = this.keys.find(k => k.key === usedKey);
          if (keyObj) {
            keyObj.remaining = 0;
            logger.warn(`[ApiFootball] Key ending in ...${usedKey.slice(-4)} hit 429 (Rate Limit). Marking as exhausted.`);
          }
        }
        return Promise.reject(err);
      }
    );
  }

  isBudgetAvailable(req = 1) {
    this._resetIfNewDay();
    return this.keys.some(k => k.remaining >= req);
  }

  getRemaining() {
    this._resetIfNewDay();
    // Return sum of all keys remaining
    return this.keys.reduce((sum, k) => sum + k.remaining, 0);
  }

  async _fetch(endpoint, params = {}) {
    if (!this.isBudgetAvailable(1)) throw new Error('All API-Football keys exhausted');
    return withRetry(async () => {
      const res = await this.api.get(endpoint, { params });
      return res.data?.response || [];
    }, `ApiFootball.${endpoint}`);
  }

  async getFixtures(dateStr) {
    const data = await this._fetch('/fixtures', { date: dateStr });
    logger.info(`[ApiFootball] Fetched ${data.length} fixtures for ${dateStr}. Total Remaining: ${this.getRemaining()}`);
    return data.map(Normaliser.normalizeMatch);
  }

  async getLiveFixtures() {
    const data = await this._fetch('/fixtures', { live: 'all' });
    logger.info(`[ApiFootball] Fetched ${data.length} live matches. Total Remaining: ${this.getRemaining()}`);
    return data.map(Normaliser.normalizeMatch);
  }

  async getStandings(leagueId, season) {
    const data = await this._fetch('/standings', { league: leagueId, season });
    return data[0]?.league || null;
  }

  async getTeams(leagueId, season) {
    const data = await this._fetch('/teams', { league: leagueId, season });
    return data || [];
  }

  async health() {
    return {
      provider: this.providerName,
      budgetRemaining: this.getRemaining(),
      budgetDaily: this.keys.length * env.API_FOOTBALL_DAILY_BUDGET,
      keysActive: this.keys.length
    };
  }
}

module.exports = new ApiFootballAdapter();
