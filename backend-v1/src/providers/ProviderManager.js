// backend-v1/src/providers/ProviderManager.js
const { getProvider } = require('./ProviderFactory');
const logger = require('../utils/logger');

const apiFootball = getProvider('api-football');
const sportsDb = getProvider('sportsdb');
const footballData = getProvider('football-data'); // ★ NEW

module.exports = {
  // Live & Fixtures (API-Football)
  getLiveFixtures: () => apiFootball.getLiveFixtures(),
  getFixtures: (date) => apiFootball.getFixtures(date),
  
  // ★ CHANGED: Standings & Teams now use FootballData.org first!
  getStandings: async (leagueId, season) => {
    try {
      const data = await footballData.getStandings(leagueId, season);
      if (data) return data;
    } catch (e) { logger.warn('[ProviderManager] FootballData failed for standings, trying API-Football'); }
    return apiFootball.getStandings(leagueId, season);
  },
  
  getTeams: async (leagueId, season) => {
    try {
      const data = await footballData.getTeams(leagueId, season);
      if (data && data.length > 0) return data;
    } catch (e) { logger.warn('[ProviderManager] FootballData failed for teams, trying API-Football'); }
    return apiFootball.getTeams(leagueId, season);
  },
  
  // Media & Static Data (TheSportsDB)
  getTeam: (id) => sportsDb.getTeam(id),
  getLeague: (id) => sportsDb.getLeague(id),
  
  getHealthStatus: async () => {
    const [afHealth, fdHealth, sdbHealth] = await Promise.all([
      apiFootball.health(),
      footballData.health(),
      sportsDb.health()
    ]);
    return {
      'api-football': afHealth,
      'football-data': fdHealth,
      'sportsdb': sdbHealth
    };
  },
  
  getActiveProviderName: () => 'API-Football (Live) + FootballData (Standings/Teams) + SportsDB (Media)',
};