// footballprediction/backend-v1/src/providers/BaseProvider.js

/**
 * @abstract
 * Every provider must implement this interface.
 * The rest of the backend (services, repositories) ONLY calls these methods.
 */
class BaseProvider {
  constructor() {
    if (this.constructor === BaseProvider) {
      throw new Error("Cannot instantiate abstract class BaseProvider");
    }
  }

  // Fixtures & Live
  async getLiveFixtures() { throw new Error('Not implemented'); }
  async getFixture(id) { throw new Error('Not implemented'); }
  async getFixtures(date) { throw new Error('Not implemented'); }
  async getFixturesBetween(startDate, endDate) { throw new Error('Not implemented'); }
  async getTeamFixtures(teamId, lastN) { throw new Error('Not implemented'); }
  async getHeadToHead(team1Id, team2Id) { throw new Error('Not implemented'); }

  // Leagues & Standings
  async getLeague(id) { throw new Error('Not implemented'); }
  async getStandings(leagueId, season) { throw new Error('Not implemented'); }
  async getTopScorers(leagueId, season) { throw new Error('Not implemented'); }

  // Teams & Players
  async getTeam(id) { throw new Error('Not implemented'); }
  async getPlayers(teamId) { throw new Error('Not implemented'); }
  async getPlayer(id) { throw new Error('Not implemented'); }

  // Match Details
  async getOdds(fixtureId) { throw new Error('Not implemented'); }
  async getPredictions(fixtureId) { throw new Error('Not implemented'); }
  async getLineups(fixtureId) { throw new Error('Not implemented'); }
  async getStatistics(fixtureId) { throw new Error('Not implemented'); }

  // Media & Search
  async getVideos() { throw new Error('Not implemented'); }
  async search(query) { throw new Error('Not implemented'); }

  // Health & Budget
  async health() { throw new Error('Not implemented'); }
  isBudgetAvailable(req = 1) { throw new Error('Not implemented'); }
  getRemaining() { throw new Error('Not implemented'); }
}

module.exports = BaseProvider;
