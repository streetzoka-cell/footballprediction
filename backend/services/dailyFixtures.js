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

      // Cache empty (restart) — one-time warmup from Firestore
      logger.info(`[DailyFixtures] Cache empty after restart — warming up...`);
      await this._warmupCache();
      if (this._docCache.tomorrow.length > 0) {
        logger.info(
          `[DailyFixtures] Warmup done (${this._docCache.tomorrow.length} docs) — skipping`
        );
        return {
          total: 0,
          writes: 0,
          apiCalls: 0,
          duration: 0,
          deduped: true,
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

    // ══════════════════════════════════════════
    // PHASE 2: FETCH NEW TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;
    let tomorrowNewIds = new Set();

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

    this._docCache.yesterday = yesterdayDocs;
    this._docCache.yesterdayIds = new Set(yesterdayDocs.map((d) => String(d.id)));
    this._docCache.today = todayDocs;
    this._docCache.todayIds = new Set(todayDocs.map((d) => String(d.id)));
    // tomorrow updated from fetch result
    if (fetchSuccess) {
      // Keep existing tomorrow cache if fetch didn't return new data
      if (tomorrowNewIds.size > 0) {
        this._docCache.tomorrowIds = tomorrowNewIds;
      }
    }

    // ══════════════════════════════════════════
    // PHASE 4: UPDATE META (no read needed — merge handles it)
    // ══════════════════════════════════════════

    if (fetchSuccess) {
      // ★ Removed unnecessary getMeta() read before setMeta()
      // setMeta uses merge:true — existing fields are preserved
      await setMeta(META_DOCS.FOOTBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        rolloverYesterday,
        rolloverToday,
        recoveredFT,
        fetchTotal,
        fetchWrites,
        verifiedAt: new Date().toISOString(),
      });
      logger.info(`[DailyFixtures] Meta updated`);
    }

    // ══════════════════════════════════════════
    // PHASE 5: INVALIDATE API CACHE
    // ══════════════════════════════════════════

    cache.invalidatePrefix("ft:");

    const duration = Date.now() - startTime;

    logger.info(
      `[DailyFixtures] Complete — ` +
      `rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `stale deleted: ${rolloverDeleted}, ` +
      `FT: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `${fetchSuccess && fetchTotal > 0 ? 1 : 0} API call, ${duration}ms`
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
      metaUpdated: fetchSuccess,
    };
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

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