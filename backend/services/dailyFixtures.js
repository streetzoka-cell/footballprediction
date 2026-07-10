/*
 * dailyFixtures.js
 * Smart daily fetch with 3-day rollover + DATA INTEGRITY VERIFICATION.
 *
 * BUDGET: 1 API call per day.
 *
 * FIX: If cron ran but Firestore writes failed, the old meta dedup
 * would skip re-runs forever. Now we VERIFY data exists before skipping.
 *
 * 3-DAY ROLLOVER (0 API calls — pure Firestore):
 *   At 3 AM the window cascades:
 *     todayFixtures    → yesterdayFixtures
 *     tomorrowFixtures → todayFixtures
 *     API fetch        → tomorrowFixtures
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
    const yesterdayStr = getDateOffset(-1);
    const tomorrowStr = getDateOffset(1);

    logger.info(
      `[DailyFixtures] Run for ${tomorrowStr} (today: ${todayStr})`
    );

    // ══════════════════════════════════════════════════════
    // META DEDUP WITH DATA INTEGRITY VERIFICATION
    // ══════════════════════════════════════════════════════
    const meta = await getMeta(META_DOCS.FOOTBALL_SCHEDULER);
    const alreadyFetchedToday = meta?.lastDailyFetchDate === todayStr;

    if (alreadyFetchedToday) {
      const integrity = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      
      if (integrity.valid) {
        logger.info(
          `[DailyFixtures] Data verified (today: ${integrity.todayCount}, yesterday: ${integrity.yesterdayCount}) — skipping (meta dedup)`
        );
        return { 
          total: 0, 
          writes: 0, 
          apiCalls: 0, 
          duration: 0, 
          deduped: true 
        };
      }

      logger.warn(
        `⚠️ [DailyFixtures] DATA INTEGRITY CHECK FAILED! ` +
        `Meta says "${todayStr}" done but: ` +
        `todayFixtures has ${integrity.todayTotal} docs (${integrity.todayCount} for ${todayStr}), ` +
        `yesterdayFixtures has ${integrity.yesterdayTotal} docs (${integrity.yesterdayCount} for ${yesterdayStr}) ` +
        `— FORCING RECOVERY`
      );
    }

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // PHASE 1: 3-DAY ROLLOVER (0 API calls)
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
            FINISHED_STATUSES.includes(d.status)
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
          `[DailyFixtures] Rollover: ${rolloverYesterday} → yesterday, ${rolloverToday} → today, ${recoveredFT} FT recovered`
        );
      } else {
        await this.repo.replaceYesterday([]);
        await this.repo.replaceToday([]);
        logger.info(`[DailyFixtures] First run — no rollover data`);
      }

      const afterRollover = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      rolloverSuccess = afterRollover.valid;
      
      if (!rolloverSuccess) {
        logger.error(
          `[DailyFixtures] ROLLOVER VERIFICATION FAILED — data may be inconsistent`
        );
      }
    } catch (err) {
      logger.error(`[DailyFixtures] Rollover failed: ${err.message}`);
      rolloverSuccess = false;
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
      // If budget too low, that's not a failure — allow meta update
      fetchSuccess = true;
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
    // PHASE 3: UPDATE META — ONLY IF SUCCESSFUL
    // ══════════════════════════════════════════

    const shouldUpdateMeta = rolloverSuccess && fetchSuccess;

    if (shouldUpdateMeta) {
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
        `[DailyFixtures] Meta NOT updated — rollover: ${rolloverSuccess}, fetch: ${fetchSuccess} — will retry next run`
      );
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[DailyFixtures] Complete — rollover: ${rolloverYesterday}+${rolloverToday}, ` +
      `FT recovered: ${recoveredFT}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `metaUpdated: ${shouldUpdateMeta}, ` +
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
      metaUpdated: shouldUpdateMeta,
      recovery: alreadyFetchedToday && !shouldUpdateMeta,
    };
  }

  // ==========================================================
  // DATA INTEGRITY VERIFICATION (ONLY ONE COPY)
  // ==========================================================

     async _verifyDataIntegrity(todayStr, yesterdayStr) {
    try {
      // Use getDb() — the ONLY way to access db from firebase.js
      const { getDb } = require("../config/firebase");
      const db = getDb();
      
      if (!db) {
        logger.warn(`[DailyFixtures] No db instance — skipping verification`);
        return { valid: true, todayCount: 0, todayTotal: 0, yesterdayCount: 0, yesterdayTotal: 0 };
      }

      const { collection, getDocs } = require("firebase/firestore");

      const [todaySnap, yesterdaySnap] = await Promise.all([
        getDocs(collection(db, "todayFixtures")),
        getDocs(collection(db, "yesterdayFixtures")),
      ]);

      const todayDocs = todaySnap.docs.map(d => d.data());
      const yesterdayDocs = yesterdaySnap.docs.map(d => d.data());

      const todayTotal = todayDocs.length;
      const yesterdayTotal = yesterdayDocs.length;
      const todayCount = todayDocs.filter(d => d.date === todayStr).length;
      const yesterdayCount = yesterdayDocs.filter(d => d.date === yesterdayStr).length;

      // FIRST RUN: Both empty = valid
      if (todayTotal === 0 && yesterdayTotal === 0) {
        return { valid: true, todayCount, todayTotal, yesterdayCount, yesterdayTotal };
      }

      // HAS DATA: Check if dates match
      const valid = todayCount > 0 || yesterdayCount > 0;
      
      return { valid, todayCount, todayTotal, yesterdayCount, yesterdayTotal };
    } catch (err) {
      logger.error(`[DailyFixtures] Verification error: ${err.message}`);
      return { valid: false, todayCount: 0, todayTotal: 0, yesterdayCount: 0, yesterdayTotal: 0 };
    }
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