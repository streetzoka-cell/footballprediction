// footballprediction/backend-v1/src/providers/IsportsAdapter.js
const { fetchWithRetry } = require('../utils/RetryEngine');
const logger = require('../utils/logger');
const env = require('../config/env');
const BaseProvider = require('./BaseProvider');

const PRIMARY_BASE = env.ISPORTS_PRIMARY_URL;
const BACKUP_BASE  = env.ISPORTS_BACKUP_URL;
const API_KEY = env.ISPORTS_API_KEY;
const TIMEOUT = 30000; // â˜… CHANGED to 8000ms. Safe for Cloudflare, enough for iSports.

const DAILY_LIMIT = 190; 
let callsToday = 0;
let lastResetDate = new Date().toDateString();
let lastSuccessTime = null;
let avgLatency = 0;

function resetQuotaIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    callsToday = 0;
    lastResetDate = today;
    logger.info(`[IsportsAdapter] Daily quota reset. 200 calls available.`);
  }
}

async function requestWithFailover(path, params = {}) {
  resetQuotaIfNewDay();
  
  if (callsToday >= DAILY_LIMIT) {
    throw new Error('iSports daily quota depleted');
  }
  callsToday++;
  
  const query = { api_key: API_KEY, ...params };
  const TIMEOUT = 8000;
  let lastErr = null;

  for (const base of bases) {
    const url = `${base}${path}`;
    try {
      const t0 = Date.now();
      const { data, status } = await fetchWithRetry({
        url,
        params: query,
        timeout: TIMEOUT,
        validateStatus: () => true,
      }, 3); 
      
      const latency = Date.now() - t0;
      avgLatency = Math.round((avgLatency + latency) / 2);

      if (status < 200 || status >= 300) { lastErr = new Error(`HTTP ${status}`); continue; }
      if (data.code !== 0) { lastErr = new Error(`iSports API Error ${data.code}: ${data.message}`); continue; }

      const payload = data.data;
      if (!payload || (Array.isArray(payload) && payload.length === 0)) { lastErr = new Error(`Empty payload`); continue; }

      lastSuccessTime = new Date().toISOString();
      return payload;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`iSports: both bases failed for ${path}`);
}

class IsportsAdapter extends BaseProvider {
  constructor() { 
    super(); 
    this.name = 'isports';
  }

  isBudgetAvailable(req = 1) { return callsToday + req <= DAILY_LIMIT; }
  getRemaining() { return DAILY_LIMIT - callsToday; }

  async getLiveFixtures() { 
    const allMatches = await requestWithFailover('/sport/football/livescores');
    return allMatches.filter(m => m.status > 0);
  }
  
  async getFixtures(date) { return requestWithFailover('/sport/football/schedule/basic', date ? { date } : {}); }
  async getLeague(id) { return requestWithFailover('/sport/football/league', { league_id: id }); }

  async health() {
    return {
      provider: 'isports',
      healthy: callsToday < DAILY_LIMIT,
      latency: avgLatency,
      quotaRemaining: DAILY_LIMIT - callsToday,
      lastSuccess: lastSuccessTime
    };
  }
}

module.exports = new IsportsAdapter();
