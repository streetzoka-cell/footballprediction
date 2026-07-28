const { isBudgetAvailable } = require("../config/api");
const { LEAGUES, SEASON } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");
const providerManager = require("../config/providerManager"); // ★ NEW IMPORT

class StandingsService {
  constructor(standingRepository) {
    if (!standingRepository) {
      throw new Error("StandingRepository is required.");
    }
    this.repo = standingRepository;
  }

  async run() {
    const startTime = Date.now();
    const activeLeagues = LEAGUES.filter((l) => l.active);
    
    logger.info(`[Standings] Starting sync for ${activeLeagues.length} active leagues...`);

    const docs = [];
    let apiCalls = 0;

    for (const league of activeLeagues) {
      try {
        // ★ NEW: Use providerManager instead of api.get directly
        const response = await withRetry(
          () => providerManager.getStandings(league.id, SEASON),
          `Standings:${league.id}`
        );

        // If it used API-Football, increment budget counter
        if (!FREE_LEAGUES_MAP[league.id]) {
          apiCalls++;
        }

        const errors = response?.errors || {};
        if (Object.keys(errors).length > 0 && !response?.response) {
          logger.warn(`[Standings] ${league.name} blocked: ${JSON.stringify(errors)}`);
          await this._sleep(300);
          continue;
        }

        const standings = response?.response || [];
        for (const leagueData of standings) {
          docs.push(this.normalizeLeague(leagueData));
        }
      } catch (err) {
        logger.error(`[Standings] ${league.name} failed: ${err.message}`);
      }

      // Small delay between league calls to avoid rate limits
      await this._sleep(300);
    }

    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertStandings(docs);
    }

    try {
      await snapshotWriter.writeReference("standings", "football", docs);
    } catch (err) {
      logger.error(`[Standings] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`[Standings] Sync complete (${writes} writes, ${apiCalls} API-Football calls, ${duration} ms)`);

    return { total: docs.length, writes, apiCalls, duration };
  }

  normalizeLeague(leagueData) {
    const league = leagueData.league;
    const table = leagueData.standings?.[0] || [];

    return {
      id: league.id,
      leagueName: league.name,
      leagueCountry: league.country,
      leagueLogo: league.logo,
      leagueFlag: league.flag ?? null,
      season: league.season,
      standings: table.map((row) => ({
        rank: row.rank,
        teamId: row.team.id,
        teamName: row.team.name,
        teamLogo: row.team.logo,
        played: row.all?.played ?? 0,
        win: row.all?.win ?? 0,
        draw: row.all?.draw ?? 0,
        lose: row.all?.lose ?? 0,
        goalsFor: row.all?.goals?.for ?? 0,
        goalsAgainst: row.all?.goals?.against ?? 0,
        goalDiff: row.goalsDiff ?? 0,
        points: row.points ?? 0,
        form: row.form ?? "",
        description: row.description ?? "",
        homePlayed: row.home?.played ?? 0,
        homeWin: row.home?.win ?? 0,
        homeDraw: row.home?.draw ?? 0,
        homeLose: row.home?.lose ?? 0,
        homeGoalsFor: row.home?.goals?.for ?? 0,
        homeGoalsAgainst: row.home?.goals?.against ?? 0,
        awayPlayed: row.away?.played ?? 0,
        awayWin: row.away?.win ?? 0,
        awayDraw: row.away?.draw ?? 0,
        awayLose: row.away?.lose ?? 0,
        awayGoalsFor: row.away?.goals?.for ?? 0,
        awayGoalsAgainst: row.away?.goals?.against ?? 0,
        lastUpdate: row.update ?? null,
      })),
      _updatedAt: new Date().toISOString(),
    };
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ★ NEW: Need to require FREE_LEAGUES_MAP at the top of the file
const { FREE_LEAGUES_MAP } = require("../config/freeLeagues");

module.exports = StandingsService;