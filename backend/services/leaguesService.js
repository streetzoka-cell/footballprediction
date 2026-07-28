const { LEAGUES, SEASON } = require("../config/constants");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class LeaguesService {
  constructor(leagueRepository) {
    if (!leagueRepository) throw new Error("LeagueRepository is required.");
    this.repo = leagueRepository;
  }

  async run() {
    const startTime = Date.now();
    logger.info(`[Leagues] Syncing ${LEAGUES.length} leagues from local constants (0 API calls)...`);

    // Map the local constants array to the expected UI shape
    const docs = LEAGUES.filter(l => l.active).map(league => {
      return {
        id: league.id,
        name: league.name,
        type: "League",
        logo: null, 
        flag: league.flag || null,
        countryName: league.country || null,
        countryCode: null,
        countryFlag: null,
        season: { year: SEASON, start: null, end: null, current: true },
        _updatedAt: new Date().toISOString(),
      };
    });

    const result = await this.repo.replaceLeagues(docs);

    try {
      await snapshotWriter.writeReference("leagues", "football", docs);
    } catch (err) {
      logger.error(`[Leagues] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`[Leagues] Sync complete (${result.written} writes, 0 API calls, ${duration} ms)`);

    return { total: docs.length, writes: result.written, apiCalls: 0, duration };
  }
}

module.exports = LeaguesService;