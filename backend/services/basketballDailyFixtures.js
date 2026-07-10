/*
 * basketballDailyFixtures.js
 * Smart daily fetch with SEPARATE midnight rollover.
 * Same pattern as football.
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
  SCHEDULER,
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
  // MIDNIGHT ROLLOVER (0 API calls)
  // ==========================================================

  async rollover() {
    if (!isBasketballConfigured) {
      return { skipped: true, rolloverYesterday: 0, rolloverToday: 0, recoveredFT: 0 };
    }

    const todayStr = getDateOffset(0);
    const yesterdayStr = getDateOffset(-1);

    logger.info(`[BBDailyRollover] Checking for ${todayStr}...`);

    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    if (meta?.lastRolloverDate === todayStr) {
      const integrity = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      if (integrity.valid) {
        logger.info(
          `[BBDailyRollover] Already done — today: ${integrity.todayCount}, yesterday: ${integrity.yesterdayCount}`
        );
        return { 
          skipped: true, 
          rolloverYesterday: integrity.yesterdayCount, 
          rolloverToday: integrity.todayCount,
          recoveredFT: 0,
        };
      }
      logger.warn(`[BBDailyRollover] Meta says done but DATA MISSING — re-rolling`);
    }

    const startTime = Date.now();

    try {
      const [currentTodayDocs, currentTomorrowDocs] = await Promise.all([
        this.repo.getAllToday(),
        this.repo.getAllTomorrow(),
      ]);

      let rolloverYesterday = 0;
      let rolloverToday = 0;
      let recoveredFT = 0;

      if (currentTodayDocs.length > 0 || currentTomorrowDocs.length > 0) {
        const validYesterday = currentTodayDocs.filter(d => d.date === yesterdayStr);
        const validToday = currentTomorrowDocs.filter(d => d.date === todayStr);

        if (validYesterday.length > 0) {
          const r = await this.repo.replaceYesterday(validYesterday);
          rolloverYesterday = r.written;

          const ftGames = validYesterday.filter(d =>
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
      } else {
        await this.repo.replaceYesterday([]);
        await this.repo.replaceToday([]);
        logger.info(`[BBDailyRollover] First run — no data to roll`);
      }

      const afterRollover = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      
      if (afterRollover.valid) {
        await setMeta(META_DOCS.BASKETBALL_SCHEDULER, {
          ...(meta || {}),
          lastRolloverDate: todayStr,
          rolloverYesterday,
          rolloverToday,
          recoveredFT,
          rolloverAt: new Date().toISOString(),
        });

        const duration = Date.now() - startTime;
        logger.info(
          `[BBDailyRollover] SUCCESS — ${rolloverYesterday} → yesterday, ` +
          `${rolloverToday} → today, ${recoveredFT} FT recovered, ${duration}ms`
        );

        return { skipped: false, success: true, rolloverYesterday, rolloverToday, recoveredFT, duration };
      } else {
        logger.error(`[BBDailyRollover] VERIFICATION FAILED`);
        return { skipped: false, success: false, error: 'VERIFICATION_FAILED' };
      }

    } catch (err) {
      logger.error(`[BBDailyRollover] FAILED: ${err.message}`);
      return { skipped: false, success: false, error: err.message };
    }
  }

  // ==========================================================
  // FULL RUN
  // ==========================================================
async run() {
  if (!isBasketballConfigured) {
    return {
      total: 0,
      writes: 0,
      apiCalls: 0,
      duration: 0,
    };
  }

  const todayStr = getDateOffset(0);
  const yesterdayStr = getDateOffset(-1);
  const tomorrowStr = getDateOffset(1);
    logger.info(
      `[BasketballDaily] Full run for ${tomorrowStr} (today: ${todayStr})`
    );

    const startTime = Date.now();

    // ══════════════════════════════════════════
    // PHASE 1: ROLLOVER (if not done at midnight)
    // ══════════════════════════════════════════
    
    let rolloverResult;
    const meta = await getMeta(META_DOCS.BASKETBALL_SCHEDULER);
    const rolloverDone = meta?.lastRolloverDate === todayStr;

    if (rolloverDone) {
      const integrity = await this._verifyDataIntegrity(todayStr, yesterdayStr);
      if (integrity.valid) {
        logger.info(`[BasketballDaily] Rollover already done — skipping`);
        rolloverResult = { 
          skipped: true, 
          rolloverYesterday: integrity.yesterdayCount, 
          rolloverToday: integrity.todayCount,
          recoveredFT: 0,
        };
      } else {
        logger.warn(`[BasketballDaily] Rollover meta exists but data missing — re-rolling`);
        rolloverResult = await this.rollover();
      }
    } else {
      logger.info(`[BasketballDaily] Rollover not done — running now`);
      rolloverResult = await this.rollover();
    }

    // ══════════════════════════════════════════
    // PHASE 2: FETCH TOMORROW (1 API call)
    // ══════════════════════════════════════════

    let fetchTotal = 0;
    let fetchWrites = 0;
    let fetchSuccess = false;

    const fetchDone = meta?.lastDailyFetchDate === todayStr;
    
    if (fetchDone) {
      const tomorrowDocs = await this.repo.getAllTomorrow();
      const tomorrowForDate = tomorrowDocs.filter(d => d.date === tomorrowStr);
      
      if (tomorrowForDate.length > 0) {
        logger.info(`[BasketballDaily] Tomorrow fetch already done — skipping`);
        fetchTotal = tomorrowForDate.length;
        fetchWrites = tomorrowForDate.length;
        fetchSuccess = true;
      } else {
        logger.warn(`[BasketballDaily] Fetch meta exists but tomorrow data missing — re-fetching`);
      }
    }

    if (!fetchSuccess) {
      if (!isBasketballBudgetAvailable(1)) {
        logger.warn(`[BasketballDaily] Budget too low — skipping tomorrow fetch`);
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
      `rollover: ${rolloverResult.rolloverYesterday || 0}+${rolloverResult.rolloverToday || 0}, ` +
      `FT recovered: ${rolloverResult.recoveredFT || 0}, ` +
      `fetched: ${fetchTotal} (${fetchWrites} written), ` +
      `${duration}ms`
    );

    return {
      total: fetchTotal,
      writes: fetchWrites + (rolloverResult.rolloverYesterday || 0) + (rolloverResult.rolloverToday || 0),
      apiCalls: fetchSuccess ? 1 : 0,
      duration,
      rolloverYesterday: rolloverResult.rolloverYesterday || 0,
      rolloverToday: rolloverResult.rolloverToday || 0,
      recoveredFT: rolloverResult.recoveredFT || 0,
      deduped: false,
    };
  }

  // ==========================================================
  // DATA INTEGRITY VERIFICATION
  // ==========================================================

    async _verifyDataIntegrity(todayStr, yesterdayStr) {
    try {
      const { db } = require("../config/firebase");
      const { collection, getDocs } = require("firebase/firestore");
      
      if (!db) return { valid: false, todayCount: 0, todayTotal: 0, yesterdayCount: 0, yesterdayTotal: 0 };

      const [todaySnap, yesterdaySnap] = await Promise.all([
        getDocs(collection(db, "basketballTodayFixtures")),
        getDocs(collection(db, "basketballYesterdayFixtures")),
      ]);

      const todayDocs = todaySnap.docs.map(d => d.data());
      const yesterdayDocs = yesterdaySnap.docs.map(d => d.data());

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
  // PRIVATE: FETCH TOMORROW
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