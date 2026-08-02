// footballprediction/backend-v1/src/providers/FootballDataAdapter.js
const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const env = require('../config/env');
const logger = require('../utils/logger');
const Normaliser = require('../normalisers/footballDataNormaliser');

// â˜… FIX: Map API-Football numeric IDs to football-data.org string codes
const LEAGUE_ID_MAP = {
  '39': 'PL',   // Premier League
  '140': 'PD',  // La Liga
  '135': 'SA',  // Serie A
  '78': 'BL1',  // Bundesliga
  '61': 'FL1',  // Ligue 1
  '2': 'CL',    // Champions League
  '3': 'EL',    // Europa League
  '88': 'DED',  // Eredivisie
  '94': 'PPL',  // Primeira Liga
  '71': 'BSA',  // Serie A (Brazil)
  '40': 'ELC',  // Championship
};

class FootballDataAdapter extends BaseProvider {
  constructor() {
    super();
    this.providerName = 'football-data';
    this.api = axios.create({
      baseURL: 'https://api.football-data.org/v4',
      timeout: 10000,
      headers: { 'X-Auth-Token': env.FOOTBALL_DATA_API_KEY }
    });
  }

  isBudgetAvailable() { return true; }
  getRemaining() { return 999999; }

  async getStandings(leagueId, season) {
    const code = LEAGUE_ID_MAP[String(leagueId)];
    if (!code) return null; // If not in free tier, return null so it falls back to API-Football
    
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
    if (!code) return []; // If not in free tier, return empty so it falls back to API-Football

    try {
      const res = await this.api.get(`/competitions/${code}/teams`);
      return Normaliser.normalizeTeams(res.data);
    } catch (err) {
      logger.error(`[FootballData] getTeams failed for ${code}: ${err.message}`);
      return [];
    }
  }

  async getLiveFixtures() { return []; }
  async getFixtures(date) { return []; }
  async health() {
    return { provider: this.providerName, status: 'online', budgetRemaining: 'infinite' };
  }
}

module.exports = new FootballDataAdapter();
