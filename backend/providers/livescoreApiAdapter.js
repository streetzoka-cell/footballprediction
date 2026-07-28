const axios = require('axios');
const https = require('https'); 
const env = require('../config/env');
const logger = require('../utils/logger');

// ───────────────────────────────────────────────
// Live-Score API Budget Tracker (1500/day)
// ───────────────────────────────────────────────
let remainingRequests = 1500;
let lastResetDate = new Date().toDateString();

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (lastResetDate !== today) {
    remainingRequests = 1500;
    lastResetDate = today;
    logger.info(`[LivescoreAPI] New day (${today}) — budget reset to 1500`);
  }
}

function isBudgetAvailable(required = 1) {
  resetIfNewDay();
  return remainingRequests >= required;
}

function getRemainingRequests() {
  resetIfNewDay();
  return remainingRequests;
}

function decrementBudget(count = 1) {
  resetIfNewDay();
  remainingRequests -= count;
}

const api = axios.create({
  baseURL: 'https://livescore-api.com/api-client',
  timeout: 15000,
  params: {
    key: env.livescoreApi?.apiKey,
    secret: env.livescoreApi?.apiSecret
  },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

class LivescoreApiAdapter {
  async getLive() {
    if (!isBudgetAvailable(1)) throw new Error('LivescoreAPI budget exhausted');
    try {
      decrementBudget(1);
      const res = await api.get('/matches/live.json');
      const matches = res.data?.data?.match || [];
      logger.info(`[LivescoreAPI] Successfully fetched ${matches.length} live matches.`);
      return matches.map(this.normalizeMatch);
    } catch (err) {
      if (err.response) {
        logger.error(`[LivescoreAPI] Live API Error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
      } else {
        logger.error(`[LivescoreAPI] Live Network Error: ${err.message}`);
      }
      throw err;
    }
  }

  async getFixtures(dateStr) {
    if (!isBudgetAvailable(1)) throw new Error('LivescoreAPI budget exhausted');
    try {
      decrementBudget(1);
      const res = await api.get('/fixtures/matches.json', { params: { from: dateStr, to: dateStr } });
      const matches = res.data?.data?.match || [];
      logger.info(`[LivescoreAPI] Successfully fetched ${matches.length} fixtures for ${dateStr}.`);
      return matches.map(this.normalizeMatch);
    } catch (err) {
      if (err.response) {
        logger.error(`[LivescoreAPI] Fixtures API Error ${err.response.status}: ${JSON.stringify(err.response.data)}`);
      } else {
        logger.error(`[LivescoreAPI] Fixtures Network Error: ${err.message}`);
      }
      throw err;
    }
  }

  // ───────────────────────────────────────────────
  // Normalizer (Maps Live-Score API to your exact API-Football shape)
  // ───────────────────────────────────────────────
  normalizeMatch(m) {
    // The API uses 'time' for status (e.g., "FT", "HT", "1H", "NS")
    const shortStatus = m.time || 'NS';
    const statusMap = { 'IN PLAY': '1H', 'HALF TIME': 'HT', 'FINISHED': 'FT', 'NOT STARTED': 'NS' };
    const mappedStatus = statusMap[(shortStatus || '').toUpperCase()] || shortStatus;
    
    const scores = (m.score || '0-0').split('-').map(s => s.trim());
    const htScores = (m.ht_score || ' - ').split('-').map(s => s.trim());
    
    // ★ FIX: Extract nested objects safely
    const competition = m.competition || {};
    const country = m.country || {};
    const home = m.home || {};
    const away = m.away || {};

    return {
      fixture: {
        id: m.id,
        date: m.added ? new Date(m.added).toISOString() : null,
        timestamp: m.added ? new Date(m.added).getTime() / 1000 : null,
        status: { short: mappedStatus, long: shortStatus, elapsed: m.minute || null }
      },
      league: {
        id: competition.id, 
        name: competition.name, 
        country: country.name,
        logo: null, 
        flag: country.flag || null, 
        season: new Date().getFullYear(), 
        round: null
      },
      teams: {
        home: { id: home.id, name: home.name, logo: home.logo || null },
        away: { id: away.id, name: away.name, logo: away.logo || null }
      },
      goals: { home: parseInt(scores[0], 10) || null, away: parseInt(scores[1], 10) || null },
      score: {
        halftime: { home: parseInt(htScores[0], 10) || null, away: parseInt(htScores[1], 10) || null },
        fulltime: { home: parseInt(scores[0], 10) || null, away: parseInt(scores[1], 10) || null },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null }
      }
    };
  }
}

// ★ EXPORTED INSTANCE AND FUNCTIONS
const instance = new LivescoreApiAdapter();
instance.isBudgetAvailable = isBudgetAvailable;
instance.getRemainingRequests = getRemainingRequests;

module.exports = instance;
module.exports.getRemainingRequests = getRemainingRequests;