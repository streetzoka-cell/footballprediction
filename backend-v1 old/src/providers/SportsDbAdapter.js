// footballprediction/backend-v1/src/providers/SportsDbAdapter.js

const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const env = require('../config/env');
const logger = require('../utils/logger');
const Normaliser = require('../normalisers/sportsDbNormaliser');

class SportsDbAdapter extends BaseProvider {
  constructor() {
    super();
    this.providerName = 'sportsdb';
    this.api = axios.create({
      baseURL: `${env.SPORTSDB_BASE_URL}/${env.SPORTSDB_API_KEY}`,
      timeout: 10000,
    });
  }

  isBudgetAvailable() { return true; }
  getRemaining() { return 999999; }

  async getTeam(teamId) {
    try {
      const res = await this.api.get(`/lookupteam.php?id=${teamId}`);
      const data = res.data?.teams?.[0];
      return Normaliser.normalizeTeam(data);
    } catch (err) {
      logger.error(`[SportsDb] getTeam failed: ${err.message}`);
      return null;
    }
  }

  async getLeague(leagueId) {
    try {
      const res = await this.api.get(`/lookupleague.php?id=${leagueId}`);
      const data = res.data?.leagues?.[0];
      return Normaliser.normalizeLeague(data);
    } catch (err) {
      logger.error(`[SportsDb] getLeague failed: ${err.message}`);
      return null;
    }
  }
  
  async getLiveFixtures() { return []; }
  async getFixtures(date) { return []; }
  async health() {
    return { provider: this.providerName, status: 'online', budgetRemaining: 'infinite' };
  }
}

module.exports = new SportsDbAdapter();
