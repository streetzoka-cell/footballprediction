/*
 * dailyFixtures.js
 * Perfect daily fetch with 3-day rollover.
 *
 * BUDGET: 1 API call per day.
 *
 * THE DATE BUG THIS FIXES:
 *   Old code used module-level TOMORROW constant — computed once
 *   at server start. If server ran for 3 days, it kept fetching
 *   the same date. Now dates are computed fresh inside run().
 *
 * 3-DAY ROLLOVER (0 API calls — pure Firestore):
 *   At 3 AM the window cascades:
 *     todayFixtures    → yesterdayFixtures
 *     tomorrowFixtures → todayFixtures
 *     API fetch        → tomorrowFixtures
 *
 *   Result: users always see yesterday/today/tomorrow schedule.
 *
 * META DEDUP:
 *   If server restarts after cron already ran, run() checks
 *   meta doc and skips the fetch. Saves 1 request.
 *
 * OVERNIGHT FT RECOVERY:
 *   Games that finished between last night's live poll and
 *   this morning's cron are caught during rollover — their
 *   normalized docs are written to finishedFixtures.
 *   0 API calls — data already in Firestore.
 */

const { api, isBudgetAvailable } = require("../config/api");
const {
  LEAGUES,
  FINISHED_STATUSES,
  getDateOffset,
  META_DOCS,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");

class DailyFixturesService {
  /**
   * @param {FixturesRepository} repo
   * @param {TeamsProcessor} teamsProcessor
   *
   * NOTE: ftProcessor removed — FT recovery handled inline
   * from rollover data (0 API calls, already-normalized docs).
   */
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
    // ── Dynamic dates (fixes stale constant bug) ──
    const todayStr = getDateOffset(0);
    const yesterdayStr = getDateOffset(-1);
    const tomorrowStr = getDateOffset(1);

    logger.info(
      `[DailyFixtures] Run for ${tomorrowStr} (today: ${todayStr})`
    );

    // ── Meta dedup — skip if already fetched today ──
    const meta = await getMeta(META_DOCS.FOOTBALL_SCHEDULER);
    if (meta?.lastDailyFetchDate === todayStr) {
      logger.info(
        `[DailyFixtures] Already fetched ${tomorrowStr} today — skipping (meta dedup)`
      );
      return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: true };
    }

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER (0 API calls)
    // Read both collections FIRST, then write.
    // This avoids reading back docs we just wrote.
    // ══════════════════════════════════════════

    let rolloverYesterday = 0;
    let rolloverToday = 0;
    let recoveredFT = 0;

    const [currentTodayDocs, currentTomorrowDocs] = await Promise.all([
      this.repo.getAllToday(),
      this.repo.getAllTomorrow(),
    ]);

    // Skip rollover entirely on first run (both empty)
    if (currentTodayDocs.length > 0 || currentTomorrowDocs.length > 0) {
      // ── Filter by correct dates (handles server downtime) ──
      // If server was down 2 days, old docs have wrong dates.
      // Only roll over docs that match the target date.
      const validYesterday = currentTodayDocs.filter(
        (d) => d.date === yesterdayStr
      );
      const validToday = currentTomorrowDocs.filter(
        (d) => d.date === todayStr
      );

      // ── Write yesterday (today's old data → yesterday) ──
      if (validYesterday.length > 0) {
        const r = await this.repo.replaceYesterday(validYesterday);
        rolloverYesterday = r.written;

        // ── Recover overnight FT games ──
        // Games that finished after last live poll are in
        // todayFixtures with FT status but never transitioned.
        const ftGames = validYesterday.filter((d) =>
          FINISHED_STATUSES.includes(d.status)
        );
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else {
        // Clear stale yesterday even if nothing to write
        await this.repo.replaceYesterday([]);
      }

      // ── Write today (tomorrow's old data → today) ──
      if (validToday.length > 0) {
        const r = await this.repo.replaceToday(validToday);
        rolloverToday = r.written;
      } else {
        await this.repo.replaceToday([]);
      }

      logger.info(
        `[DailyFixtures] Rollover: ${rolloverYesterday} → yesterday, ${rolloverToday} → today, ${recoveredFT} FT recovered`
      );
    } else {
      // First run — clear empty collections to be safe
      await this.repo.replaceYesterday([]);
      await this.repo.replaceToday([]);
      logger.info(`[DailyFixtures] First run — no rollover data`);
    }

    // ══════════════════════════════════════════
    // PHASE 2: FETCH NEW TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;

    if (!isBudgetAvailable(1)) {
      logger.warn(
        `[DailyFixtures] Budget too low — skipping tomorrow fetch`
      );
    } else {
      const result = await this._fetchTomorrow(tomorrowStr);
      fetchTotal = result.total;
      fetchWrites = result.writes;

      // Extract teams from new tomorrow data
      if (result.raw.length > 0) {
        await this.teamsProcessor.process(result.raw);
      }
    }

    // ══════════════════════════════════════════
    // PHASE 3: UPDATE META
    // ══════════════════════════════════════════

    await setMeta(META_DOCS.FOOTBALL_SCHEDULER, {
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
      `[DailyFixtures] Complete — rollover: ${rolloverYesterday}+${rolloverToday}, ` +
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
      return { total: 0, writes: 0, raw: [] };
    }

    const errors = raw?.errors || {};
    if (Object.keys(errors).length > 0) {
      logger.warn(
        `[DailyFixtures] Blocked: ${JSON.stringify(errors)}`
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