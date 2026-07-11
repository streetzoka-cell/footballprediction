/*
 * basketballDailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 *
 * ★ BUDGET OVERHAUL: Same as football — in-memory cache,
 * diffWrite, no reads during rollover.
 */

const {
  basketballApi,
  isBasketballConfigured,
  isBasketballBudgetAvailable,
} = require("../config/basketballApi");
const {
  BASKETBALL_LEAGUES,
  BASKETBALL_FINISHED_STATUSES,
  COLLECTIONS,
  getDateOffset,
  META_DOCS,
  TRACK_ALL_LEAGUES,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

class BasketballDailyFixturesService {
  constructor(repo) {
    if (!repo) throw new Error("BasketballFixturesRepository is required.");
    this.repo = repo;

    this.trackedLeagueIds = new Set(
      BASKETBALL_LEAGUES.filter((l) => l.active).map((l) => l.id)
    );

    // ★ In-memory cache
    this._docCache = {
      yesterday: [],
      today: [],
      tomorrow: [],
      yesterdayIds: new Set(),
      todayIds: new Set(),
      tomorrowIds: new Set(),
    };
  }

  // ==========================================================
  // PUBLIC
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
    // META DEDUP — cache-first (0 reads)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;

    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    const fetchDone = meta?.lastDailyFetchDate === todayStr;

    if (fetchDone) {
      if (this._docCache.tomorrow.length > 0) {
        logger.info(
          `[BasketballDaily] Cache verified (${this._docCache.tomorrow.length} docs) — skipping`
        );
        return {
          total: this._docCache.tomorrow.length,
          writes: 0,
          apiCalls: 0,
          duration: 0,
          deduped: true,
        };
      }

      logger.info(`[BasketballDaily] Cache empty — warming up...`);
      await this._warmupCache();
      if (this._docCache.tomorrow.length > 0) {
        return {
          total: this._docCache.tomorrow.length,
          writes: 0,
          apiCalls: 0,
          duration: 0,
          deduped: true,
        };
      }

      logger.warn(
        `[BasketballDaily] Meta says done but no data — re-fetching`
      );
    }

    // ══════════════════════════════════════════
    // PHASE 1: ROLLOVER (0 reads!)
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let rolloverDeleted = 0;
    let recoveredFT = 0;

    const yesterdayDocs = this._docCache.today;
    const todayDocs = this._docCache.tomorrow;

    try {
      if (yesterdayDocs.length > 0) {
        const r = await this.repo.diffWrite(
          COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES,
          yesterdayDocs,
          this._docCache.todayIds
        );
        rolloverYesterday = r.written;
        rolloverDeleted += r.deleted;

        const ftGames = yesterdayDocs.filter((d) =>
          BASKETBALL_FINISHED_STATUSES.includes(d.status)
        );
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else if (this._docCache.yesterdayIds.size > 0) {
        rolloverDeleted += await this.repo.removeByIds(
          COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES,
          [...this._docCache.yesterdayIds]
        );
      }

      if (todayDocs.length > 0) {
        const r = await this.repo.diffWrite(
          COLLECTIONS.BASKETBALL_TODAY_FIXTURES,
          todayDocs,
          this._docCache.tomorrowIds
        );
        rolloverToday = r.written;
        rolloverDeleted += r.deleted;
      } else if (this._docCache.todayIds.size > 0) {
        rolloverDeleted += await this.repo.removeByIds(
          COLLECTIONS.BASKETBALL_TODAY_FIXTURES,
          [...this._docCache.todayIds]
        );
      }

      logger.info(
        `[BasketballDaily] Rollover: ${rolloverYesterday}→yesterday, ` +
        `${rolloverToday}→today, ${recoveredFT} FT, ${rolloverDeleted} stale`
      );
    } catch (err) {
      logger.error(`[BasketballDaily] Rollover failed: ${err.message}`);
    }

    // ══════════════════════════════════════════
    // PHASE 2: FETCH TOMORROW (1 API call)
    // ══════════════════════════════════════════

    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(`[BasketballDaily] Budget too low — skipping fetch`);
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
    // PHASE 3: UPDATE CACHE + META
    // ══════════════════════════════════════════

    this._docCache.yesterday = yesterdayDocs;
    this._docCache.yesterdayIds = new Set(yesterdayDocs.map((d) => String(d.id)));
    this._docCache.today = todayDocs;
    this._docCache.todayIds = new Set(todayDocs.map((d) => String(d.id)));

    if (fetchSuccess) {
      await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        fetchTotal,
        fetchWrites,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Invalidate API cache
    cache.invalidatePrefix("bb:");

    const duration = Date.now() - startTime;

    logger.info(
      `[BasketballDaily] Complete — ` +
      `rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `stale: ${rolloverDeleted}, FT: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ${duration}ms`
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

  async _warmupCache() {
    try {
      const [todayDocs, tomorrowDocs] = await Promise.all([
        this.repo.getAllToday(),
        this.repo.getAllTomorrow(),
      ]);

      if (todayDocs.length > 0) {
        this._docCache.today = todayDocs;
        this._docCache.todayIds = new Set(todayDocs.map((d) => String(d.id)));
      }
      if (tomorrowDocs.length > 0) {
        this._docCache.tomorrow = tomorrowDocs;
        this._docCache.tomorrowIds = new Set(tomorrowDocs.map((d) => String(d.id)));
      }
    } catch (err) {
      logger.error(`[BasketballDaily] Warmup failed: ${err.message}`);
    }
  }

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
      const result = await this.repo.diffWrite(
        COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES,
        docs,
        this._docCache.tomorrowIds
      );
      written = result.written;

      this._docCache.tomorrow = docs;
      this._docCache.tomorrowIds = result.newIds;
    } else if (this._docCache.tomorrowIds.size > 0) {
      await this.repo.removeByIds(
        COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES,
        [...this._docCache.tomorrowIds]
      );
      this._docCache.tomorrow = [];
      this._docCache.tomorrowIds = new Set();
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