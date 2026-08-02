const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const env = require('../config/env');
const logger = require('../utils/logger');
const Normaliser = require('../normalisers/footballDataNormaliser');

const LEAGUE_ID_MAP = {
  '39': 'PL',
  '140': 'PD',
  '135': 'SA',
  '78': 'BL1',
  '61': 'FL1',
  '2': 'CL',
  '3': 'EL',
  '88': 'DED',
  '94': 'PPL',
  '71': 'BSA',
  '40': 'ELC',
};

class FootballDataAdapter extends BaseProvider {
  constructor() {
    super();

    this.providerName = 'football-data';

    this.api = axios.create({
      baseURL: 'https://api.football-data.org/v4',
      timeout: 10000,
      headers: {
        'X-Auth-Token': env.FOOTBALL_DATA_API_KEY,
      },
    });
  }

  isBudgetAvailable() {
    return true;
  }

  getRemaining() {
    return 999999;
  }

  async getStandings(leagueId, season) {
    const code = LEAGUE_ID_MAP[String(leagueId)];

    if (!code) return null;

    try {
      const res = await this.api.get(`/competitions/${code}/standings`);
      return Normaliser.normalizeStandings(res.data);
    } catch (err) {
      logger.error(`[FootballData] getStandings failed for ${code}: ${err.message}`);
      return null;
    }
  }

  async getTeams(leagueId, season) {
    const code = LEAGUE_ID_MAP[String(leagueId)];

    if (!code) return [];

    try {
      const res = await this.api.get(`/competitions/${code}/teams`);
      return Normaliser.normalizeTeams(res.data);
    } catch (err) {
      logger.error(`[FootballData] getTeams failed for ${code}: ${err.message}`);
      return [];
    }
  }

  async getLiveFixtures() {
    return [];
  }

  async getFixtures(date) {
    return [];
  }

  async health() {
    return {
      provider: this.providerName,
      status: 'online',
      budgetRemaining: 'infinite',
    };
  }
}

module.exports = new FootballDataAdapter();