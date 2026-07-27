const { api, isBudgetAvailable } = require('../config/api');
const footballData = require('./footballDataAdapter');
const { FREE_LEAGUES_MAP } = require('../config/freeLeagues');
const logger = require('../utils/logger');

class ProviderManager {
  async getFixtures(dateStr) {
    if (isBudgetAvailable(1)) {
      try {
        const response = await api.get('/fixtures', { params: { date: dateStr } });
        if (response?.response) return response.response;
      } catch (err) {
        logger.warn(`[ProviderManager] API-Football failed for fixtures: ${err.message}. Attempting fallback...`);
      }
    } else {
      logger.warn('[ProviderManager] API-Football budget exhausted. Using fallback.');
    }
    return await footballData.fetchFixtures(dateStr);
  }

  async getFixturesRange(fromDate, toDate) {
    return await footballData.fetchFixturesRange(fromDate, toDate);
  }

  async getLive() {
    if (isBudgetAvailable(1)) {
      try {
        const response = await api.get('/fixtures', { params: { live: 'all' } });
        if (response?.response) return response.response;
      } catch (err) {
        logger.warn(`[ProviderManager] API-Football failed for live: ${err.message}. Attempting fallback...`);
      }
    } else {
      logger.warn('[ProviderManager] API-Football budget exhausted. Using fallback.');
    }
    return await footballData.fetchLive();
  }

  async getStandings(leagueId, season) {
    if (FREE_LEAGUES_MAP[leagueId]) {
      try {
        logger.info(`[ProviderManager] Routing Standings to FootballData (League: ${leagueId})`);
        return await footballData.fetchStandings(leagueId);
      } catch (err) {
        logger.warn(`[ProviderManager] FootballData failed for standings: ${err.message}. Attempting API-Football...`);
      }
    }
    if (isBudgetAvailable(1)) {
      return await api.get("/standings", { params: { league: leagueId, season: season } });
    }
    throw new Error('Budget exhausted and no fallback available for standings');
  }

  async getTeams(leagueId) {
    if (FREE_LEAGUES_MAP[leagueId]) {
      try {
        logger.info(`[ProviderManager] Routing Teams to FootballData (League: ${leagueId})`);
        return await footballData.fetchTeams(leagueId);
      } catch (err) {
        logger.warn(`[ProviderManager] FootballData failed for teams: ${err.message}. Attempting API-Football...`);
      }
    }
    if (isBudgetAvailable(1)) {
      return await api.get("/teams", { params: { league: leagueId } });
    }
    throw new Error('Budget exhausted and no fallback available for teams');
  }
}

module.exports = new ProviderManager();