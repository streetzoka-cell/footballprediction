/*
 * dailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 *
 * ★ BUDGET OVERHAUL:
 *
 * OLD rollover (per day):
 *   getAllToday()          → 100 reads
 *   getAllTomorrow()       → 100 reads
 *   replaceYesterday()     → 100 reads + 100 deletes + 100 writes
 *   replaceToday()         → 100 reads + 100 deletes + 100 writes
 *   replaceTomorrow()      → 100 reads + 100 deletes + 100 writes
 *   TOTAL: 500 reads + 300 deletes + 300 writes = 1,100 ops
 *
 * NEW rollover (per day):
 *   Use in-memory cache    → 0 reads
 *   diffWrite yesterday    → 0 reads + ~0 deletes + 100 writes
 *   diffWrite today        → 0 reads + ~0 deletes + 100 writes
 *   diffWrite tomorrow     → 0 reads + ~0 deletes + 100 writes
 *   TOTAL: 0 reads + ~0 deletes + 300 writes = ~300 ops
 *
 *   73% reduction in ops, 100% reduction in reads
 *
 * ★ EMPTY COLLECTION RECOVERY:
 * If yesterday/today/tomorrow collections are empty after rollover,
 * automatically fetches from API-Football and saves to Firebase.
 * This handles: first run, restart with lost cache, days with no prior data.
 *
 * On restart (rare): one-time 200 reads to warm cache.
 */

const { api, isBudgetAvailable } = require("../config/api");
const {
  LEAGUES,
  FINISHED_STATUSES,
  COLLECTIONS,
  getDateOffset,
  META_DOCS,
  TRACK_ALL_LEAGUES,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

class DailyFixturesService {
  constructor(repo, teamsProcessor) {
    if (!repo) throw new Error("FixturesRepository is required.");
    if (!teamsProcessor) throw new Error("TeamsProcessor is required.");

    this.repo = repo;
    this.teamsProcessor = teamsProcessor;

    this.trackedLeagueIds = new Set(
      LEAGUES.filter((l) => l.active).map((l) => l.id)
    );

    // ★ In-memory cache — survives between scheduler runs,
    // lost on process restart (acceptable — warmup handles it)
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
    const todayStr = getDateOffset(0);
    const tomorrowStr = getDateOffset(1);
    const yesterdayStr = getDateOffset(-1);

    logger.info(
      `[DailyFixtures] Run for ${tomorrowStr} (today: ${todayStr})`
    );

    const startTime = Date.now();

    // ══════════════════════════════════════════════════════
    // META DEDUP — check cache first (0 reads)
    // ══════════════════════════════════════════════════════
    const meta = await getMeta(META_DOCS.FOOTBALL_SCHEDULER);
    const alreadyFetchedToday = meta?.lastDailyFetchDate === todayStr;

    if (alreadyFetchedToday) {
      // Check in-memory cache FIRST (0 reads)
      if (this._docCache.tomorrow.length > 0) {
        // ★ Also verify yesterday and today aren't empty
        const needsFill = 
          this._docCache.yesterday.length === 0 || 
          this._docCache.today.length === 0;
        
        if (!needsFill) {
          logger.info(
            `[DailyFixtures] Cache verified (${this._docCache.tomorrow.length} tomorrow docs) — skipping`
          );
          return {
            total: 0,
            writes: 0,
            apiCalls: 0,
            duration: 0,
            deduped: true,
          };
        }
        
        // Some days empty — fill them but don't re-fetch tomorrow
        logger.info(`[DailyFixtures] Some days empty — filling...`);
        const fillResult = await this._fillEmptyDays(
          yesterdayStr, 
          todayStr, 
          tomorrowStr,
          { skipTomorrow: true } // Tomorrow is already populated
        );
        cache.invalidatePrefix("ft:");
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

      // Cache empty (restart) — one-time warmup from Firestore
      logger.info(`[DailyFixtures] Cache empty after restart — warming up...`);
      await this._warmupCache();
      
      if (this._docCache.tomorrow.length > 0) {
        // Warmup got tomorrow — check if other days need filling
        const fillResult = await this._fillEmptyDays(
          yesterdayStr, 
          todayStr, 
          tomorrowStr,
          { skipTomorrow: true }
        );
        cache.invalidatePrefix("ft:");
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
        `[DailyFixtures] Meta says done but no data found — re-fetching`
      );
    }

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER (0 Firestore reads!)
    //
    // Uses in-memory cache instead of reading from Firestore.
    // today→yesterday, tomorrow→today
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let rolloverDeleted = 0;
    let recoveredFT = 0;

    const yesterdayDocs = this._docCache.today;
    const todayDocs = this._docCache.tomorrow;
    const yesterdayPrevIds = this._docCache.todayIds;
    const todayPrevIds = this._docCache.tomorrowIds;

    try {
      // Write yesterday (merge) + delete only stale docs
      if (yesterdayDocs.length > 0) {
        const r = await this.repo.diffWrite(
          COLLECTIONS.YESTERDAY_FIXTURES,
          yesterdayDocs,
          yesterdayPrevIds
        );
        rolloverYesterday = r.written;
        rolloverDeleted += r.deleted;

        // Recover finished games
        const ftGames = yesterdayDocs.filter((d) =>
          FINISHED_STATUSES.includes(d.status)
        );
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else {
        // No docs to write — delete any leftover stale docs
        if (this._docCache.yesterdayIds.size > 0) {
          const d = await this.repo.removeByIds(
            COLLECTIONS.YESTERDAY_FIXTURES,
            [...this._docCache.yesterdayIds]
          );
          rolloverDeleted += d;
        }
      }

      // Write today (merge) + delete only stale docs
      if (todayDocs.length > 0) {
        const r = await this.repo.diffWrite(
          COLLECTIONS.TODAY_FIXTURES,
          todayDocs,
          todayPrevIds
        );
        rolloverToday = r.written;
        rolloverDeleted += r.deleted;
      } else {
        if (this._docCache.todayIds.size > 0) {
          const d = await this.repo.removeByIds(
            COLLECTIONS.TODAY_FIXTURES,
            [...this._docCache.todayIds]
          );
          rolloverDeleted += d;
        }
      }

      logger.info(
        `[DailyFixtures] Rollover: ${rolloverYesterday}→yesterday, ` +
        `${rolloverToday}→today, ${recoveredFT} FT, ${rolloverDeleted} stale deleted`
      );
    } catch (err) {
      logger.error(`[DailyFixtures] Rollover failed: ${err.message}`);
    }

    // ══════════════════════════════════════════════════════
    // PHASE 1.5: FILL EMPTY COLLECTIONS FROM API
    // 
    // If yesterday or today are empty after rollover, fetch from API.
    // This handles:
    //   - First run ever (no cache to rollover)
    //   - Previous day had no fixtures (acceptable — API will return empty)
    //   - Cache was lost (restart) and warmup found nothing
    //
    // Tomorrow is NOT fetched here — that's PHASE 2's job.
    // ══════════════════════════════════════════════════════

    const fillResult = await this._fillEmptyDays(
      yesterdayStr, 
      todayStr, 
      tomorrowStr,
      { skipTomorrow: true } // Let PHASE 2 handle tomorrow
    );

    // ══════════════════════════════════════════
    // PHASE 2: FETCH NEW TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;
    let tomorrowNewIds = new Set();
    let tomorrowApiCall = 0;

    if (!isBudgetAvailable(1)) {
      logger.warn(
        `[DailyFixtures] Budget too low — skipping tomorrow fetch`
      );
      fetchSuccess = true;
    } else {
      try {
        const result = await this._fetchTomorrow(tomorrowStr);
        fetchTotal = result.total;
        fetchWrites = result.writes;
        tomorrowNewIds = result.newIds;
        fetchSuccess = true;
        tomorrowApiCall = result.total > 0 ? 1 : 0;

        if (result.raw.length > 0) {
          await this.teamsProcessor.process(result.raw);
        }
      } catch (err) {
        logger.error(`[DailyFixtures] Tomorrow fetch failed: ${err.message}`);
        fetchSuccess = false;
      }
    }

    // ══════════════════════════════════════════
    // PHASE 3: UPDATE IN-MEMORY CACHE
    // ══════════════════════════════════════════

    // Preserve cache updates from _fillEmptyDays if rollover didn't populate
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

    // Tomorrow updated from fetch result
    if (fetchSuccess && tomorrowNewIds.size > 0) {
      this._docCache.tomorrowIds = tomorrowNewIds;
    }

    // ══════════════════════════════════════════
    // PHASE 4: UPDATE META (no read needed — merge handles it)
    // ══════════════════════════════════════════

    if (fetchSuccess) {
      await setMeta(META_DOCS.FOOTBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        rolloverYesterday,
        rolloverToday,
        recoveredFT,
        fetchTotal,
        fetchWrites,
        extraFetches: fillResult.fetches,
        extraWrites: fillResult.writes,
        verifiedAt: new Date().toISOString(),
      });
      logger.info(`[DailyFixtures] Meta updated`);
    }

    // ══════════════════════════════════════════
    // PHASE 5: INVALIDATE API CACHE
    // ══════════════════════════════════════════

    cache.invalidatePrefix("ft:");

    const duration = Date.now() - startTime;
    const totalApiCalls = fillResult.fetches + tomorrowApiCall;

    logger.info(
      `[DailyFixtures] Complete — ` +
      `rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `stale deleted: ${rolloverDeleted}, ` +
      `FT: ${recoveredFT}, ` +
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
      metaUpdated: fetchSuccess,
    };
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

  /**
   * Fill empty day collections from API.
   * Called after rollover to ensure all 3 days have data.
   * 
   * @param {string} yesterdayStr - Date string for yesterday
   * @param {string} todayStr - Date string for today  
   * @param {string} tomorrowStr - Date string for tomorrow
   * @param {{ skipTomorrow?: boolean }} options - Options
   * @returns {{ fetches: number, writes: number, filledDays: string[] }}
   */
  async _fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, options = {}) {
    let fetches = 0;
    let writes = 0;
    const filledDays = [];

    const daysToCheck = [
      { 
        key: "yesterday", 
        date: yesterdayStr, 
        collection: COLLECTIONS.YESTERDAY_FIXTURES 
      },
      { 
        key: "today", 
        date: todayStr, 
        collection: COLLECTIONS.TODAY_FIXTURES 
      },
      { 
        key: "tomorrow", 
        date: tomorrowStr, 
        collection: COLLECTIONS.TOMORROW_FIXTURES,
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
        `[DailyFixtures] Empty fill: ${filledDays.join(", ")} — ${fetches} API calls, ${writes} writes`
      );
    }

    return { fetches, writes, filledDays };
  }

  /**
   * Fetch a single day's fixtures from API-Football and save to collection.
   * 
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @param {string} dayKey - "yesterday", "today", or "tomorrow"
   * @param {string} collection - Firestore collection name
   * @returns {{ fetches: number, writes: number }}
   */
  async _fetchDayForCollection(dateStr, dayKey, collection) {
    if (!isBudgetAvailable(1)) {
      logger.warn(
        `[DailyFixtures] Budget too low — cannot fetch ${dayKey} (${dateStr})`
      );
      return { fetches: 0, writes: 0 };
    }

    logger.info(
      `[DailyFixtures] ${dayKey} is empty — fetching ${dateStr} from API-Football...`
    );

    try {
      const raw = await withRetry(
        () => api.get("/fixtures", { params: { date: dateStr } }),
        `DailyFixtures:${dayKey}:fill`
      );

      const errors = raw?.errors || {};
      if (Object.keys(errors).length > 0) {
        logger.warn(
          `[DailyFixtures] API blocked for ${dayKey}: ${JSON.stringify(errors)}`
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
        `[DailyFixtures] ${dayKey} (${dateStr}): ${filtered.length} tracked, ${written} written`
      );

      return { fetches: 1, writes: written };
    } catch (err) {
      logger.error(
        `[DailyFixtures] Failed to fetch ${dayKey} (${dateStr}): ${err.message}`
      );
      return { fetches: 1, writes: 0 };
    }
  }

  /**
   * Warmup in-memory cache from Firestore after restart.
   * One-time cost: ~200 reads. Only happens on restart.
   */
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

      logger.info(
        `[DailyFixtures] Warmup: today=${todayDocs.length}, tomorrow=${tomorrowDocs.length}`
      );
    } catch (err) {
      logger.error(`[DailyFixtures] Warmup failed: ${err.message}`);
    }
  }

  async _fetchTomorrow(tomorrowStr) {
    logger.info(`[DailyFixtures] Fetching tomorrow (${tomorrowStr})...`);

    let raw;
    try {
      raw = await withRetry(
        () => api.get("/fixtures", { params: { date: tomorrowStr } }),
        "DailyFixtures:tomorrow"
      );
    } catch (err) {
      logger.error(
        `[DailyFixtures] Tomorrow fetch failed: ${err.message}`
      );
      throw err;
    }

    const errors = raw?.errors || {};
    if (Object.keys(errors).length > 0) {
      logger.warn(
        `[DailyFixtures] Blocked: ${JSON.stringify(errors)}`
      );
      return { total: 0, writes: 0, raw: [], newIds: new Set() };
    }

    const allFixtures = raw?.response || [];

    const filtered = TRACK_ALL_LEAGUES
      ? allFixtures
      : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));

    const docs = filtered.map((f) => this.normalize(f));

    // ★ Use diffWrite instead of replaceCollection
    let written = 0;
    let newIds = new Set();

    if (docs.length > 0) {
      const result = await this.repo.diffWrite(
        COLLECTIONS.TOMORROW_FIXTURES,
        docs,
        this._docCache.tomorrowIds
      );
      written = result.written;
      newIds = result.newIds;

      // Update cache immediately
      this._docCache.tomorrow = docs;
      this._docCache.tomorrowIds = newIds;
    } else {
      // No docs — delete any stale tomorrow docs
      if (this._docCache.tomorrowIds.size > 0) {
        await this.repo.removeByIds(
          COLLECTIONS.TOMORROW_FIXTURES,
          [...this._docCache.tomorrowIds]
        );
        this._docCache.tomorrow = [];
        this._docCache.tomorrowIds = new Set();
      }
    }

    logger.info(
      `[DailyFixtures] Tomorrow: ${filtered.length} tracked, ${written} written`
    );

    return { total: filtered.length, writes: written, raw: filtered, newIds };
  }

  normalize(fixture) {
    const f = fixture.fixture;
    const l = fixture.league;
    const t = fixture.teams;
    const g = fixture.goals;

    return {
      id: f.id,
      date: f.date,
      timestamp: f.timestamp,
      status: f.status.short,
      statusLong: f.status.long,
      elapsed: f.status.elapsed ?? null,
      leagueId: l.id,
      leagueName: l.name,
      leagueCountry: l.country,
      leagueLogo: l.logo,
      leagueFlag: l.flag ?? null,
      season: l.season,
      round: l.round,
      homeTeamId: t.home.id,
      homeTeamName: t.home.name,
      homeTeamLogo: t.home.logo,
      awayTeamId: t.away.id,
      awayTeamName: t.away.name,
      awayTeamLogo: t.away.logo,
      goalsHome: g.home,
      goalsAway: g.away,
      sport: "football",
      _updatedAt: new Date().toISOString(),
    };
  }
}

module.exports = DailyFixturesService;