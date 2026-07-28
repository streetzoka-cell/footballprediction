const livescoreApi = require('./livescoreApiAdapter');
const goalApi = require('./goalApiAdapter');
const logger = require('../utils/logger');

class ProviderManager {
  // ★ FIXTURES: GOAL API -> Live-Score API
  async getFixtures(dateStr) {
    try {
      const data = await goalApi.getFixtures(dateStr);
      if (data && data.length > 0) return data;
    } catch (err) {
      logger.warn(`[ProviderManager] GOAL API failed for fixtures: ${err.message}. Falling back...`);
    }

    if (livescoreApi.isBudgetAvailable(1)) {
      try {
        const data = await livescoreApi.getFixtures(dateStr);
        if (data) return data;
      } catch (err) {
        logger.warn(`[ProviderManager] Live-Score API failed for fixtures: ${err.message}.`);
      }
    }

    return [];
  }

  async getFixturesRange(fromDate, toDate) {
    try {
      let allMatches = [];
      let currentDate = new Date(fromDate);
      const endDate = new Date(toDate);
      
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const matches = await this.getFixtures(dateStr);
        allMatches = allMatches.concat(matches);
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      logger.info(`[ProviderManager] Range fetch complete: ${allMatches.length} matches from ${fromDate} to ${toDate}`);
      return allMatches;
    } catch (err) {
      logger.warn(`[ProviderManager] Range fetch failed: ${err.message}`);
      return [];
    }
  }

  // ★ LIVE: Live-Score API -> GOAL API
  async getLive() {
    if (livescoreApi.isBudgetAvailable(1)) {
      try {
        const data = await livescoreApi.getLive();
        if (data) return data;
      } catch (err) {
        logger.warn(`[ProviderManager] Live-Score API failed for live: ${err.message}. Falling back...`);
      }
    }

    try {
      const data = await goalApi.getLive();
      if (data && data.length > 0) return data;
    } catch (err) {
      logger.warn(`[ProviderManager] GOAL API failed for live: ${err.message}.`);
    }

    return [];
  }

  // ★ STANDINGS: GOAL API ONLY
  async getStandings(leagueId, season) {
    try {
      logger.info(`[ProviderManager] Routing Standings to GOAL API (League: ${leagueId})`);
      return await goalApi.getStandings(leagueId, season);
    } catch (err) {
      logger.warn(`[ProviderManager] GOAL API failed for standings: ${err.message}.`);
      return { response: [] };
    }
  }

  // ★ TEAMS: GOAL API ONLY
  async getTeams(leagueId) {
    try {
      logger.info(`[ProviderManager] Routing Teams to GOAL API (League: ${leagueId})`);
      return await goalApi.getTeams(leagueId);
    } catch (err) {
      logger.warn(`[ProviderManager] GOAL API failed for teams: ${err.message}.`);
      return { response: [] };
    }
  }
}

module.exports = new ProviderManager();