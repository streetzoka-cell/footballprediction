/*
 * leagues.js
 * Fetches football league metadata and writes to Firestore.
 *
 * Budget cost: 19 requests per WEEK (one per active league)
 *   Amortized: ~2.7 requests/day
 *
 * Flow:
 *   1. Check budget for all active leagues
 *   2. Fetch each league by ID (1 API call each)
 *   3. Check for API-level errors
 *   4. Normalize
 *   5. Replace entire leagues collection
 */

const { api, isBudgetAvailable } = require("../config/api");
const { LEAGUES, SEASON } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class LeaguesService {
  constructor(leagueRepository) {
    if (!leagueRepository) {
      throw new Error("LeagueRepository is required.");
    }
    this.repo = leagueRepository;
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
        `[Leagues] Skipping — need ${apiCallsNeeded} requests, budget too low`
      );
      return { total: 0, writes: 0, apiCalls: 0, duration: 0 };
    }

    logger.info(
      `[Leagues] Starting sync (${apiCallsNeeded} API calls)...`
    );

    const docs = [];
    let apiCalls = 0;

    for (const league of activeLeagues) {
      try {
        const response = await withRetry(
          () =>
            api.get("/leagues", {
              params: { id: league.id },
            }),
          `Leagues:${league.id}`
        );

        apiCalls++;

        // ── Check for API-level errors ──
        const errors = response?.errors || {};
        if (Object.keys(errors).length > 0) {
          logger.warn(
            `[Leagues] ${league.name} blocked: ${JSON.stringify(errors)}`
          );
          await this._sleep(300);
          continue;
        }

        const leagues = response?.response || [];

        for (const raw of leagues) {
          docs.push(this.normalize(raw));
        }
      } catch (err) {
        logger.error(
          `[Leagues] ${league.name} failed: ${err.message}`
        );
        // Continue with other leagues — don't let one failure block all
      }

      // Small delay between league calls to avoid rate limits
      if (apiCalls < apiCallsNeeded) {
        await this._sleep(300);
      }
    }

    // Replace entire collection (atomic clear + write)
    const result = await this.repo.replaceLeagues(docs);

    // ── Write reference snapshot for frontend ──
    try {
      await snapshotWriter.writeReference("leagues", "football", docs);
    } catch (err) {
      logger.error(`[Leagues] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[Leagues] Sync complete (${result.written} writes, ${apiCalls} API calls, ${duration} ms)`
    );

    return {
      total: docs.length,
      writes: result.written,
      apiCalls,
      duration,
    };
  }

  // ==========================================================
  // NORMALIZE
  // ==========================================================

  normalize(leagueData) {
    const league = leagueData.league;
    const country = leagueData.country;

    // Find the season object matching our computed current season.
    // If the API doesn't have a season entry for this year (e.g.,
    // league hasn't announced next season yet), this is null —
    // not forced. The frontend handles null gracefully.
    const currentSeason =
      leagueData.seasons?.find((s) => s.year === SEASON) ?? null;

    return {
      id: league.id,

      name: league.name,
      type: league.type,
      logo: league.logo,
      flag: league.flag ?? null,

      countryName: country?.name ?? null,
      countryCode: country?.code ?? null,
      countryFlag: country?.flag ?? null,

      season: currentSeason,

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

module.exports = LeaguesService;