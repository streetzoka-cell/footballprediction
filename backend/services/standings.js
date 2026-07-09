/*
 * standings.js
 * Fetches football league standings and writes to Firestore.
 *
 * Budget cost: 19 requests per WEEK (one per active league)
 *   Amortized: ~2.7 requests/day
 *
 * NOTE: Standings require league+season params — unlike daily
 * fixtures which use date-only. On free plan, this may be blocked
 * for seasons outside 2022-2024. The error check handles this
 * gracefully — blocked leagues are skipped, others succeed.
 *
 * Flow:
 *   1. Check budget for all active leagues
 *   2. Fetch each league's standings (1 API call each)
 *   3. Check for API-level errors per league
 *   4. Normalize
 *   5. Batch upsert with merge (safe — won't delete
 *      standings for a league if one API call fails)
 */

const { api, isBudgetAvailable } = require("../config/api");
const { LEAGUES, SEASON } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");

class StandingsService {
  constructor(standingRepository) {
    if (!standingRepository) {
      throw new Error("StandingRepository is required.");
    }
    this.repo = standingRepository;
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  async run() {
    const startTime = Date.now();

    const activeLeagues = LEAGUES.filter((l) => l.active);
    const apiCallsNeeded = activeLeagues.length;

    if (!isBudgetAvailable(apiCallsNeeded)) {
      logger.warn(
        `[Standings] Skipping — need ${apiCallsNeeded} requests, budget too low`
      );
      return { total: 0, writes: 0, apiCalls: 0, duration: 0 };
    }

    logger.info(
      `[Standings] Starting sync (${apiCallsNeeded} API calls)...`
    );

    const docs = [];
    let apiCalls = 0;

    for (const league of activeLeagues) {
      try {
        const response = await withRetry(
          () =>
            api.get("/standings", {
              params: {
                league: league.id,
                season: SEASON,
              },
            }),
          `Standings:${league.id}`
        );

        apiCalls++;

        // ── Check for API-level errors ──
        const errors = response?.errors || {};
        if (Object.keys(errors).length > 0) {
          logger.warn(
            `[Standings] ${league.name} blocked: ${JSON.stringify(errors)}`
          );
          await this._sleep(300);
          continue;
        }

        const standings = response?.response || [];

        for (const leagueData of standings) {
          docs.push(this.normalizeLeague(leagueData));
        }
      } catch (err) {
        logger.error(
          `[Standings] ${league.name} failed: ${err.message}`
        );
        // Continue with other leagues — don't let one failure block all
      }

      // Small delay between league calls to avoid rate limits
      if (apiCalls < apiCallsNeeded) {
        await this._sleep(300);
      }
    }

    // Batch upsert with merge — correct for standings because
    // if one league fails, we don't want to wipe the other 18.
    // Unlike fixtures (replace), standings accumulate.
    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertStandings(docs);
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[Standings] Sync complete (${writes} writes, ${apiCalls} API calls, ${duration} ms)`
    );

    return {
      total: docs.length,
      writes,
      apiCalls,
      duration,
    };
  }

  // ==========================================================
  // NORMALIZE
  // ==========================================================

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

  // ==========================================================
  // HELPERS
  // ==========================================================

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = StandingsService;