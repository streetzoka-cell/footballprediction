/*
 * basketballDailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 *
 * FIXES: Same as football — no date filtering during
 * rollover, no integrity check that clears data on restart.
 */

const {
  basketballApi,
  isBasketballConfigured,
  isBasketballBudgetAvailable,
} = require("../config/basketballApi");
const {
  BASKETBALL_LEAGUES,
  BASKETBALL_FINISHED_STATUSES,
  getDateOffset,
  META_DOCS,
  TRACK_ALL_LEAGUES,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");

class BasketballDailyFixturesService {
  constructor(repo) {
    if (!repo) throw new Error("BasketballFixturesRepository is required.");
    this.repo = repo;

    this.trackedLeagueIds = new Set(
      BASKETBALL_LEAGUES.filter((l) => l.active).map((l) => l.id)
    );
  }

  // ==========================================================
  // FULL RUN
  // ==========================================================

  async run() {
    if (!isBasketballConfigured) {
      return { total: 0, writes: 0, apiCalls: 0, duration: 0 };
    }

    const todayStr = getDateOffset(0);
    const tomorrowStr = getDateOffset(1);

    logger.info(
      `[BasketballDaily] Full run for ${tomorrowStr} (today: ${todayStr})`
    );

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // META DEDUP — only check tomorrow data
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;

    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    const fetchDone = meta?.lastDailyFetchDate === todayStr;

    if (fetchDone) {
      const tomorrowDocs = await this.repo.getAllTomorrow();

      if (tomorrowDocs.length > 0) {
        logger.info(
          `[BasketballDaily] Tomorrow data verified (${tomorrowDocs.length} docs) — skipping`
        );
        return {
          total: tomorrowDocs.length,
          writes: 0,
          apiCalls: 0,
          duration: 0,
          deduped: true,
        };
      }

      logger.warn(
        `[BasketballDaily] Meta says done but tomorrow is empty — re-fetching`
      );
    }

    // ══════════════════════════════════════════
    // PHASE 1: ROLLOVER (0 API calls)
    // FIX: Move ALL docs, no date filtering
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let recoveredFT = 0;

    const [currentTodayDocs, currentTomorrowDocs] = await Promise.all([
      this.repo.getAllToday(),
      this.repo.getAllTomorrow(),
    ]);

    try {
      if (currentTodayDocs.length > 0) {
        const r = await this.repo.replaceYesterday(currentTodayDocs);
        rolloverYesterday = r.written;

        const ftGames = currentTodayDocs.filter((d) =>
          BASKETBALL_FINISHED_STATUSES.includes(d.status)
        );
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else {
        await this.repo.replaceYesterday([]);
      }

      if (currentTomorrowDocs.length > 0) {
        const r = await this.repo.replaceToday(currentTomorrowDocs);
        rolloverToday = r.written;
      } else {
        await this.repo.replaceToday([]);
      }

      logger.info(
        `[BasketballDaily] Rollover: ${rolloverYesterday} → yesterday, ${rolloverToday} → today, ${recoveredFT} FT recovered`
      );
    } catch (err) {
      logger.error(`[BasketballDaily] Rollover failed: ${err.message}`);
    }

    // ══════════════════════════════════════════
    // PHASE 2: FETCH TOMORROW (1 API call)
    // ══════════════════════════════════════════

    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(`[BasketballDaily] Budget too low — skipping tomorrow fetch`);
      fetchSuccess = true;
    } else {
      try {
        const result = await this._fetchTomorrow(tomorrowStr);
        fetchTotal = result.total;
        fetchWrites = result.writes;
        fetchSuccess = true;
      } catch (err) {
        logger.error(`[BasketballDaily] Tomorrow fetch failed: ${err.message}`);
        fetchSuccess = false;
      }
    }

    // ══════════════════════════════════════════
    // PHASE 3: UPDATE META
    // ══════════════════════════════════════════

    if (fetchSuccess) {
      await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
        ...(await getMeta(META_DOCS.BASKETBALL_SCHEDULER)) || {},
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        fetchTotal,
        fetchWrites,
        fetchedAt: new Date().toISOString(),
      });
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[BasketballDaily] Complete — ` +
      `rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `FT recovered: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `${duration}ms`
    );

    return {
      total: fetchTotal,
      writes: fetchWrites + rolloverYesterday + rolloverToday,
      apiCalls: fetchSuccess && fetchTotal > 0 ? 1 : 0,
      duration,
      rolloverYesterday,
      rolloverToday,
      recoveredFT,
      deduped: false,
    };
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

  async _fetchTomorrow(tomorrowStr) {
    logger.info(
      `[BasketballDaily] Fetching tomorrow (${tomorrowStr})...`
    );

    let raw;
    try {
      raw = await withRetry(
        () =>
          basketballApi.get("/games", { params: { date: tomorrowStr } }),
        "BasketballDaily:tomorrow"
      );
    } catch (err) {
      logger.error(
        `[BasketballDaily] Tomorrow fetch failed: ${err.message}`
      );
      throw err;
    }

    const errors = raw?.errors || {};
    if (Object.keys(errors).length > 0) {
      logger.warn(
        `[BasketballDaily] Blocked: ${JSON.stringify(errors)}`
      );
      return { total: 0, writes: 0, raw: [] };
    }

    const allFixtures = raw?.response || [];

    const filtered = TRACK_ALL_LEAGUES
      ? allFixtures
      : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));

    const docs = filtered.map((f) => this.normalize(f));

    let written = 0;
    if (docs.length > 0) {
      const result = await this.repo.replaceTomorrow(docs);
      written = result.written;
    } else {
      await this.repo.replaceTomorrow([]);
    }

    logger.info(
      `[BasketballDaily] Tomorrow: ${filtered.length} tracked, ${written} written`
    );

    return { total: filtered.length, writes: written, raw: filtered };
  }

  normalize(fixture) {
    const scores = fixture.scores || {};

    return {
      id: fixture.id,
      date: fixture.date,
      timestamp: fixture.timestamp,
      status: fixture.status?.short || "NS",
      statusLong: fixture.status?.long || "Not Started",
      elapsed: fixture.status?.elapsed ?? null,
      leagueId: fixture.league?.id,
      leagueName: fixture.league?.name,
      leagueCountry: fixture.league?.country,
      leagueLogo: fixture.league?.logo,
      season: fixture.league?.season,
      homeTeamId: fixture.teams?.home?.id,
      homeTeamName: fixture.teams?.home?.name,
      homeTeamLogo: fixture.teams?.home?.logo,
      awayTeamId: fixture.teams?.away?.id,
      awayTeamName: fixture.teams?.away?.name,
      awayTeamLogo: fixture.teams?.away?.logo,
      pointsHome: scores.home?.total ?? null,
      pointsAway: scores.away?.total ?? null,
      sport: "basketball",
      _updatedAt: new Date().toISOString(),
    };
  }
}

module.exports = BasketballDailyFixturesService;