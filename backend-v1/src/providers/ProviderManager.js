const { getProvider } = require('./ProviderFactory');
const logger = require('../utils/logger');

const apiFootball = getProvider('api-football');
const sportsDb = getProvider('sportsdb');

module.exports = {
  // Live & Fixtures (API-Football)
  getLiveFixtures: () => apiFootball.getLiveFixtures(),
  getFixtures: (date) => apiFootball.getFixtures(date),
  
  // Media & Static Data (TheSportsDB)
  getTeam: (id) => sportsDb.getTeam(id),
  getLeague: (id) => sportsDb.getLeague(id),
  
  getHealthStatus: async () => {
    const [afHealth, sdbHealth] = await Promise.all([
      apiFootball.health(),
      sportsDb.health()
    ]);
    return {
      'api-football': afHealth,
      'sportsdb': sdbHealth
    };
  },
  
  getActiveProviderName: () => 'api-football (Live) + sportsdb (Media)',
};