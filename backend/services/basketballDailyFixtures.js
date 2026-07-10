/*
 * basketballDailyFixtures.js
 * Same integrity verification fix as football.
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
  // PUBLIC
  // ==========================================================

  async run() {
    if (!isBasketballConfigured) {
      logger.warn(
        "[BasketballDaily] Skipping — API not configured"
      );
      return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: true };
    }

    const todayStr = getDateOffset(0);
    const yesterdayStr = getDateOffset(-1);
    const tomorrowStr = getDateOffset(1);

    logger.info(
      `[BasketballDaily] Run for ${tomorrowStr} (today: ${todayStr})`
    );

    // ══════════════════════════════════════════════════════
    // META DEDUP WITH DATA INTEGRITY VERIFICATION
    // ══════════════════════════════════════════════════════
    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    const alreadyFetchedToday = meta?.lastDailyFetchDate === todayStr;

    if (alreadyFetchedToday) {
      const integrity = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      
      if (integrity.valid) {
        logger.info(
          `[BasketballDaily] Data verified (today: ${integrity.todayCount}, yesterday: ${integrity.yesterdayCount}) — skipping`
        );
        return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: true };
      }

      logger.warn(
        `⚠️ [BasketballDaily] DATA INTEGRITY CHECK FAILED! ` +
        `todayFixtures: ${integrity.todayTotal} (${integrity.todayCount} for ${todayStr}), ` +
        `yesterdayFixtures: ${integrity.yesterdayTotal} (${integrity.yesterdayCount} for ${yesterdayStr}) ` +
        `— FORCING RECOVERY`
      );
    }

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let recoveredFT = 0;
    let rolloverSuccess = false;

    const [currentTodayDocs, currentTomorrowDocs] = await Promise.all([
      this.repo.getAllToday(),
      this.repo.getAllTomorrow(),
    ]);

    try {
      if (currentTodayDocs.length > 0 || currentTomorrowDocs.length > 0) {
        const validYesterday = currentTodayDocs.filter(
          (d) => d.date === yesterdayStr
        );
        const validToday = currentTomorrowDocs.filter(
          (d) => d.date === todayStr
        );

        if (validYesterday.length > 0) {
          const r = await this.repo.replaceYesterday(validYesterday);
          rolloverYesterday = r.written;

          const ftGames = validYesterday.filter((d) =>
            BASKETBALL_FINISHED_STATUSES.includes(d.status)
          );
          if (ftGames.length > 0) {
            await this.repo.batchUpsertFinished(ftGames);
            recoveredFT = ftGames.length;
          }
        } else {
          await this.repo.replaceYesterday([]);
        }

        if (validToday.length > 0) {
          const r = await this.repo.replaceToday(validToday);
          rolloverToday = r.written;
        } else {
          await this.repo.replaceToday([]);
        }

        logger.info(
          `[BasketballDaily] Rollover: ${rolloverYesterday} → yesterday, ${rolloverToday} → today, ${recoveredFT} FT recovered`
        );
      } else {
        await this.repo.replaceYesterday([]);
        await this.repo.replaceToday([]);
        logger.info(`[BasketballDaily] First run — no rollover data`);
      }

      const afterRollover = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      rolloverSuccess = afterRollover.valid;
    } catch (err) {
      logger.error(`[BasketballDaily] Rollover failed: ${err.message}`);
      rolloverSuccess = false;
    }

    // ══════════════════════════════════════════
    // PHASE 2: FETCH NEW TOMORROW
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;

    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(
        `[BasketballDaily] Budget too low — skipping tomorrow fetch`
      );
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
    // PHASE 3: UPDATE META — ONLY IF SUCCESSFUL
    // ══════════════════════════════════════════

    const shouldUpdateMeta = rolloverSuccess && (fetchSuccess || !isBasketballBudgetAvailable(1));

    if (shouldUpdateMeta) {
      await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr,
        lastTomorrowDate: tomorrowStr,
        rolloverYesterday,
        rolloverToday,
        recoveredFT,
        fetchTotal,
        fetchWrites,
        verifiedAt: new Date().toISOString(),
      });
      logger.info(`[BasketballDaily] Meta updated successfully`);
    } else {
      logger.warn(
        `[BasketballDaily] Meta NOT updated — rollover: ${rolloverSuccess}, fetch: ${fetchSuccess}`
      );
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[BasketballDaily] Complete — rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `FT recovered: ${recoveredFT}, fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `metaUpdated: ${shouldUpdateMeta}, ${duration} ms`
    );

    return {
      total: fetchTotal,
      writes: fetchWrites + rolloverYesterday + rolloverToday,
      apiCalls: fetchTotal > 0 || fetchWrites >= 0 ? 1 : 0,
      duration,
      rolloverYesterday,
      rolloverToday,
      recoveredFT,
      deduped: false,
      metaUpdated: shouldUpdateMeta,
      recovery: alreadyFetchedToday && !shouldUpdateMeta,
    };
  }

  // ==========================================================
  // DATA INTEGRITY VERIFICATION
  // ==========================================================

  async _verifyDataIntegrity(todayStr, yesterdayStr) {
    try {
      const [todayDocs, yesterdayDocs] = await Promise.all([
        this.repo.getAllToday(),
        this.repo.getAllYesterday(),
      ]);

      const todayForDate = todayDocs.filter(d => d.date === todayStr);
      const yesterdayForDate = yesterdayDocs.filter(d => d.date === yesterdayStr);

      return {
        valid: todayForDate.length > 0 || yesterdayForDate.length > 0 || 
               (todayDocs.length === 0 && yesterdayDocs.length === 0),
        todayCount: todayForDate.length,
        todayTotal: todayDocs.length,
        yesterdayCount: yesterdayForDate.length,
        yesterdayTotal: yesterdayDocs.length,
      };
    } catch (err) {
      logger.error(`[BasketballDaily] Integrity check failed: ${err.message}`);
      return { valid: false, todayCount: 0, todayTotal: 0, yesterdayCount: 0, yesterdayTotal: 0 };
    }
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

    const filtered = allFixtures.filter((f) =>
      this.trackedLeagueIds.has(f.league?.id)
    );

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