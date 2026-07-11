/*
 * basketballDailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 *
 * ★ BUDGET OVERHAUL: Same as football — in-memory cache,
 * diffWrite, no reads during rollover.
 *
 * ★ EMPTY COLLECTION RECOVERY:
 * If yesterday/today/tomorrow collections are empty after rollover,
 * automatically fetches from API-Basketball and saves to Firebase.
 *
 * On restart (rare): one-time warmup reads all 3 days.
 * After warmup: cache is complete → no surprise API calls.
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
const snapshotWriter = require("./snapshotWriter");

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
    const yesterdayStr = getDateOffset(-1);

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
        const needsFill = 
          this._docCache.yesterday.length === 0 || 
          this._docCache.today.length === 0;
        
        if (!needsFill) {
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
        
        logger.info(`[BasketballDaily] Some days empty — filling...`);
        const fillResult = await this._fillEmptyDays(
          yesterdayStr, 
          todayStr, 
          tomorrowStr,
          { skipTomorrow: true }
        );
        cache.invalidatePrefix("bb:");
        return {
          total: this._docCache.tomorrow.length,
          writes: fillResult.writes,
          apiCalls: fillResult.fetches,
          duration: Date.now() - startTime,
          deduped: true,
          extraFetches: fillResult.fetches,
          extraWrites: fillResult.writes,
        };
      }

      logger.info(`[BasketballDaily] Cache empty — warming up...`);
      await this._warmupCache();
      
      if (this._docCache.tomorrow.length > 0) {
        const fillResult = await this._fillEmptyDays(
          yesterdayStr, 
          todayStr, 
          tomorrowStr,
          { skipTomorrow: true }
        );
        cache.invalidatePrefix("bb:");
        return {
          total: this._docCache.tomorrow.length,
          writes: fillResult.writes,
          apiCalls: fillResult.fetches,
          duration: Date.now() - startTime,
          deduped: true,
          extraFetches: fillResult.fetches,
          extraWrites: fillResult.writes,
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

    // ══════════════════════════════════════════════════════
    // PHASE 1.5: FILL EMPTY COLLECTIONS FROM API
    // ══════════════════════════════════════════════════════

    const fillResult = await this._fillEmptyDays(
      yesterdayStr, 
      todayStr, 
      tomorrowStr,
      { skipTomorrow: true }
    );

    // ══════════════════════════════════════════
    // PHASE 2: FETCH TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let tomorrowApiCall = 0;

    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(`[BasketballDaily] Budget too low — skipping fetch`);
      fetchSuccess = true;
    } else {
      try {
        const result = await this._fetchTomorrow(tomorrowStr);
        fetchTotal = result.total;
        fetchWrites = result.writes;
        fetchSuccess = true;
        tomorrowApiCall = result.total > 0 ? 1 : 0;
      } catch (err) {
        logger.error(`[BasketballDaily] Tomorrow fetch failed: ${err.message}`);
        fetchSuccess = false;
      }
    }

    // ══════════════════════════════════════════
    // PHASE 3: UPDATE CACHE + META
    // ══════════════════════════════════════════

    if (this._docCache.yesterday.length === 0 && yesterdayDocs.length > 0) {
      this._docCache.yesterday = yesterdayDocs;
    }
    this._docCache.yesterdayIds = new Set(
      this._docCache.yesterday.map((d) => String(d.id))
    );

    if (this._docCache.today.length === 0 && todayDocs.length > 0) {
      this._docCache.today = todayDocs;
    }
    this._docCache.todayIds = new Set(
      this._docCache.today.map((d) => String(d.id))
    );

    if (fetchSuccess) {
      await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        fetchTotal,
        fetchWrites,
        extraFetches: fillResult.fetches,
        extraWrites: fillResult.writes,
        fetchedAt: new Date().toISOString(),
      });
    }

    // Invalidate API cache
    cache.invalidatePrefix("bb:");

    // ── Write snapshot for frontend (single-doc read) ──
    try {
      await snapshotWriter.writeBasketballSnapshot(todayStr, {
        yesterday: this._docCache.yesterday,
        today: this._docCache.today,
        tomorrow: this._docCache.tomorrow,
      });
    } catch (err) {
      logger.error(`[BasketballDaily] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;
    const totalApiCalls = fillResult.fetches + tomorrowApiCall;

    logger.info(
      `[BasketballDaily] Complete — ` +
      `rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `stale: ${rolloverDeleted}, FT: ${recoveredFT}, ` +
      `empty fills: ${fillResult.fetches} calls (${fillResult.writes} writes), ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `${totalApiCalls} API calls, ${duration}ms`
    );

    return {
      total: fetchTotal,
      writes: fetchWrites + rolloverYesterday + rolloverToday + fillResult.writes,
      apiCalls: totalApiCalls,
      duration,
      rolloverYesterday,
      rolloverToday,
      recoveredFT,
      extraFetches: fillResult.fetches,
      extraWrites: fillResult.writes,
      deduped: false,
    };
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

  /**
   * Fill empty day collections from API-Basketball.
   */
  async _fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, options = {}) {
    let fetches = 0;
    let writes = 0;
    const filledDays = [];

    const daysToCheck = [
      { 
        key: "yesterday", 
        date: yesterdayStr, 
        collection: COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES 
      },
      { 
        key: "today", 
        date: todayStr, 
        collection: COLLECTIONS.BASKETBALL_TODAY_FIXTURES 
      },
      { 
        key: "tomorrow", 
        date: tomorrowStr, 
        collection: COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES,
        skip: options.skipTomorrow 
      },
    ];

    for (const day of daysToCheck) {
      if (day.skip) continue;
      
      if (this._docCache[day.key].length === 0) {
        const result = await this._fetchDayForCollection(
          day.date,
          day.key,
          day.collection
        );
        fetches += result.fetches;
        writes += result.writes;
        if (result.fetches > 0) {
          filledDays.push(day.key);
        }
      }
    }

    if (fetches > 0) {
      logger.info(
        `[BasketballDaily] Empty fill: ${filledDays.join(", ")} — ${fetches} API calls, ${writes} writes`
      );
    }

    return { fetches, writes, filledDays };
  }

  /**
   * Fetch a single day's fixtures from API-Basketball and save to collection.
   */
  async _fetchDayForCollection(dateStr, dayKey, collection) {
    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(
        `[BasketballDaily] Budget too low — cannot fetch ${dayKey} (${dateStr})`
      );
      return { fetches: 0, writes: 0 };
    }

    logger.info(
      `[BasketballDaily] ${dayKey} is empty — fetching ${dateStr} from API-Basketball...`
    );

    try {
      const raw = await withRetry(
        () =>
          basketballApi.get("/games", { params: { date: dateStr } }),
        `BasketballDaily:${dayKey}:fill`
      );

      const errors = raw?.errors || {};
      if (Object.keys(errors).length > 0) {
        logger.warn(
          `[BasketballDaily] API blocked for ${dayKey}: ${JSON.stringify(errors)}`
        );
        return { fetches: 1, writes: 0 };
      }

      const allFixtures = raw?.response || [];
      const filtered = TRACK_ALL_LEAGUES
        ? allFixtures
        : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));

      const docs = filtered.map((f) => this.normalize(f));

      let written = 0;
      let newIds = new Set();

      if (docs.length > 0) {
        const result = await this.repo.diffWrite(
          collection,
          docs,
          this._docCache[`${dayKey}Ids`]
        );
        written = result.written;
        newIds = result.newIds;
      }

      // Update cache
      this._docCache[dayKey] = docs;
      this._docCache[`${dayKey}Ids`] = newIds;

      logger.info(
        `[BasketballDaily] ${dayKey} (${dateStr}): ${filtered.length} tracked, ${written} written`
      );

      return { fetches: 1, writes: written };
    } catch (err) {
      logger.error(
        `[BasketballDaily] Failed to fetch ${dayKey} (${dateStr}): ${err.message}`
      );
      return { fetches: 1, writes: 0 };
    }
  }

  /**
   * Warmup in-memory cache from Firestore after restart.
   * Reads ALL 3 days in parallel. One-time cost.
   * After warmup, cache is complete → no surprise API calls.
   */
  async _warmupCache() {
    try {
      const [yesterdayDocs, todayDocs, tomorrowDocs] = await Promise.all([
        this.repo.getAllYesterday(),
        this.repo.getAllToday(),
        this.repo.getAllTomorrow(),
      ]);

      if (yesterdayDocs.length > 0) {
        this._docCache.yesterday = yesterdayDocs;
        this._docCache.yesterdayIds = new Set(yesterdayDocs.map((d) => String(d.id)));
      }

      if (todayDocs.length > 0) {
        this._docCache.today = todayDocs;
        this._docCache.todayIds = new Set(todayDocs.map((d) => String(d.id)));
      }

      if (tomorrowDocs.length > 0) {
        this._docCache.tomorrow = tomorrowDocs;
        this._docCache.tomorrowIds = new Set(tomorrowDocs.map((d) => String(d.id)));
      }

      logger.info(
        `[BasketballDaily] Warmup: yesterday=${yesterdayDocs.length}, today=${todayDocs.length}, tomorrow=${tomorrowDocs.length}`
      );
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