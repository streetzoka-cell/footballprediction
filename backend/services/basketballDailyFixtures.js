/*
 * basketballDailyFixtures.js
 * Perfect daily fetch with 3-day rollover for basketball.
 *
 * BUDGET: 1 API call per day.
 * Identical pattern to football dailyFixtures.
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
  /**
   * @param {BasketballFixturesRepository} repo
   */
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
      return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: false };
    }

    // ── Dynamic dates ──
    const todayStr = getDateOffset(0);
    const yesterdayStr = getDateOffset(-1);
    const tomorrowStr = getDateOffset(1);

    logger.info(
      `[BasketballDaily] Run for ${tomorrowStr} (today: ${todayStr})`
    );

    // ── Meta dedup ──
    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    if (meta?.lastDailyFetchDate === todayStr) {
      logger.info(
        `[BasketballDaily] Already fetched ${tomorrowStr} today — skipping`
      );
      return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: true };
    }

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER (0 API calls)
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let recoveredFT = 0;

    const [currentTodayDocs, currentTomorrowDocs] = await Promise.all([
      this.repo.getAllToday(),
      this.repo.getAllTomorrow(),
    ]);

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

        // Recover overnight FT games
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

    // ══════════════════════════════════════════
    // PHASE 2: FETCH NEW TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;

    if (!isBasketballBudgetAvailable(1)) {
      logger.warn(
        `[BasketballDaily] Budget too low — skipping tomorrow fetch`
      );
    } else {
      const result = await this._fetchTomorrow(tomorrowStr);
      fetchTotal = result.total;
      fetchWrites = result.writes;
    }

    // ══════════════════════════════════════════
    // PHASE 3: UPDATE META
    // ══════════════════════════════════════════

    await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
      lastDailyFetchDate: todayStr,
      lastTomorrowDate: tomorrowStr,
      rolloverYesterday,
      rolloverToday,
      recoveredFT,
      fetchTotal,
      fetchWrites,
    });

    const duration = Date.now() - startTime;

    logger.info(
      `[BasketballDaily] Complete — rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `FT recovered: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `1 API call, ${duration} ms`
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
      return { total: 0, writes: 0, raw: [] };
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