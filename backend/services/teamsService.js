// backend/services/teamsService.js

const { LEAGUES } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");
const providerManager = require("../config/providerManager");
const { FREE_LEAGUES_MAP } = require("../config/freeLeagues");

class TeamsService {
  constructor(teamRepository) {
    if (!teamRepository) {
      throw new Error("TeamRepository is required.");
    }
    this.repo = teamRepository;
  }

  async run() {
    const startTime = Date.now();
    const activeLeagues = LEAGUES.filter((l) => l.active);
    
    logger.info(`[Teams] Starting sync for ${activeLeagues.length} active leagues...`);

    const docs = [];
    let apiCalls = 0;

    for (const league of activeLeagues) {
      try {
        // ★ Use Smart Router: FootballData.org for free leagues, API-Football for others
        const response = await withRetry(
          () => providerManager.getTeams(league.id),
          `Teams:${league.id}`
        );

        // Count API calls only for non-free leagues
        if (!FREE_LEAGUES_MAP[league.id]) {
          apiCalls++;
        }

        const errors = response?.errors || {};
        if (Object.keys(errors).length > 0 && !response?.response) {
          logger.warn(`[Teams] ${league.name} blocked: ${JSON.stringify(errors)}`);
          await this._sleep(300);
          continue;
        }

        const teams = response?.response || [];
        for (const teamData of teams) {
          const team = teamData.team || teamData;
          docs.push(this.normalize(team, league));
        }
      } catch (err) {
        logger.error(`[Teams] ${league.name} failed: ${err.message}`);
      }

      // Small delay between leagues
      await this._sleep(300);
    }

    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertTeams(docs);
    }

    try {
      await snapshotWriter.writeReference("teams", "football", docs);
    } catch (err) {
      logger.error(`[Teams] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`[Teams] Sync complete (${writes} writes, ${apiCalls} API-Football calls, ${duration} ms)`);

    return { total: docs.length, writes, apiCalls, duration };
  }

  normalize(team, league) {
    const venue = team.venue || {};
    return {
      id: team.id,
      name: team.name,
      logo: team.logo,
      venueName: venue.name || null,
      venueAddress: venue.address || null,
      venueCity: venue.city || null,
      venueCapacity: venue.capacity || null,
      venueSurface: venue.surface || null,
      venueImage: venue.image || null,
      leagueId: league.id,
      leagueName: league.name,
      _updatedAt: new Date().toISOString(),
    };
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = TeamsService;