/*
 * dailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 *
 * BUDGET: 1 API call per day.
 *
 * FIXES:
 *   1. Rollover date-filtering FIXED: no longer filters by
 *      yesterdayStr inside todayFixtures. Just moves ALL docs
 *      from today→yesterday and tomorrow→today. The data
 *      already contains the correct dates from yesterday's fetch.
 *   2. Integrity check FIXED: now checks that the collection
 *      HAS docs (any date) rather than checking for a specific
 *      date. After rollover, todayFixtures contains tomorrow's
 *      date — that's correct, not a failure.
 *   3. No longer clears and re-fetches today/yesterday on
 *      restart. If data exists, it's left alone.
 */

const { api, isBudgetAvailable } = require("../config/api");
const {
  LEAGUES,
  FINISHED_STATUSES,
  getDateOffset,
  META_DOCS,
  TRACK_ALL_LEAGUES,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
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
    // META DEDUP — skip if we already fetched tomorrow today
    // FIX: Only check tomorrow data, not today/yesterday.
    // Today/yesterday are managed by rollover and should
    // NOT be cleared on restart.
    // ══════════════════════════════════════════════════════
    const meta = await getMeta(META_DOCS.FOOTBALL_SCHEDULER);
    const alreadyFetchedToday = meta?.lastDailyFetchDate === todayStr;

    if (alreadyFetchedToday) {
      // Verify tomorrow data exists (the thing we actually fetched)
      const tomorrowDocs = await this.repo.getAllTomorrow();

      if (tomorrowDocs.length > 0) {
        logger.info(
          `[DailyFixtures] Tomorrow data verified (${tomorrowDocs.length} docs) — skipping (meta dedup)`
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
        `[DailyFixtures] Meta says done but tomorrow is empty — re-fetching`
      );
    }

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER (0 API calls)
    //
    // FIX: Move ALL docs, don't filter by date.
    // todayFixtures contains whatever date was fetched.
    // tomorrowFixtures contains tomorrow's date.
    // Just shift them: today→yesterday, tomorrow→today.
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
        // Move ALL of today's docs to yesterday
        const r = await this.repo.replaceYesterday(currentTodayDocs);
        rolloverYesterday = r.written;

        // Recover finished games from what we just moved
        const ftGames = currentTodayDocs.filter((d) =>
          FINISHED_STATUSES.includes(d.status)
        );
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else {
        await this.repo.replaceYesterday([]);
      }

      if (currentTomorrowDocs.length > 0) {
        // Move ALL of tomorrow's docs to today
        const r = await this.repo.replaceToday(currentTomorrowDocs);
        rolloverToday = r.written;
      } else {
        await this.repo.replaceToday([]);
      }

      logger.info(
        `[DailyFixtures] Rollover: ${rolloverYesterday} → yesterday, ${rolloverToday} → today, ${recoveredFT} FT recovered`
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

    if (!isBudgetAvailable(1)) {
      logger.warn(
        `[DailyFixtures] Budget too low — skipping tomorrow fetch`
      );
      fetchSuccess = true; // Don't fail meta update for budget
    } else {
      try {
        const result = await this._fetchTomorrow(tomorrowStr);
        fetchTotal = result.total;
        fetchWrites = result.writes;
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
    // PHASE 3: UPDATE META
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
        verifiedAt: new Date().toISOString(),
      });
      logger.info(`[DailyFixtures] Meta updated successfully`);
    } else {
      logger.warn(
        `[DailyFixtures] Meta NOT updated — fetch failed — will retry next run`
      );
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[DailyFixtures] Complete — rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `FT recovered: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `metaUpdated: ${fetchSuccess}, ` +
      `${fetchSuccess && fetchTotal > 0 ? 1 : 0} API call, ${duration} ms`
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
      `[DailyFixtures] Tomorrow: ${filtered.length} tracked, ${written} written`
    );

    return { total: filtered.length, writes: written, raw: filtered };
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