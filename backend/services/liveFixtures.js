// /*
//  * liveFixtures.js
//  * Fetches live football fixtures and manages the live → finished transition.
//  *
//  * Budget cost: 1 request per poll (?live=all returns all live games)
//  *
//  * Flow:
//  *   1. Check budget (MIN_BUDGET_TO_POLL floor)
//  *   2. Fetch ?live=all (1 API call)
//  *   3. Check for API-level errors (blocked, rate-limited, etc.)
//  *   4. Filter to tracked leagues
//  *   5. Detect fixtures that disappeared from live response (went FT)
//  *      — uses in-memory snapshot only, zero Firestore reads for comparison
//  *   6. Transition those to finishedFixtures (assume FT status)
//  *   7. Write live fixtures (replace pattern — no stale docs)
//  *   8. Update in-memory snapshot
//  *   9. Return hasLive flag for scheduler adaptive polling
//  *
//  * Edge case: server restarts while game is live →
//  *   in-memory map is empty → that FT won't be captured here.
//  *   The daily fixtures cron catches it the next day.
//  */

// const { api, isBudgetAvailable } = require("../config/api");
// const {
//   LEAGUES,
//   LIVE_POLLING,
// } = require("../config/constants");
// const { withRetry } = require("../utils/retry");
// const logger = require("../utils/logger");

// class LiveFixturesService {
//   /**
//    * @param {FixturesRepository} repo
//    * @param {FinishedFixturesProcessor} ftProcessor
//    */
//   constructor(repo, ftProcessor) {
//     if (!repo) throw new Error("FixturesRepository is required.");
//     if (!ftProcessor) throw new Error("FinishedFixturesProcessor is required.");

//     this.repo = repo;
//     this.ftProcessor = ftProcessor;

//     // In-memory snapshot of last poll — used to detect
//     // live → finished transitions without any Firestore reads.
//     // Lost on restart (daily cron catches stragglers).
//     this.lastLiveSnapshot = new Map();

//     // Pre-compute tracked league IDs
//     this.trackedLeagueIds = new Set(
//       LEAGUES.filter((l) => l.active).map((l) => l.id)
//     );
//   }

//   // ==========================================================
//   // PUBLIC
//   // ==========================================================

//   async run() {
//     // ── Guard: Budget available? (use constant, not magic number) ──
//     if (!isBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL)) {
//       logger.warn("[LiveFixtures] Skipping — budget exhausted");
//       return this._emptyResult();
//     }

//     const startTime = Date.now();

//     // ── 1. Fetch all live fixtures (1 API call) ──
//     let response;
//     try {
//       response = await withRetry(
//         () =>
//           api.get("/fixtures", {
//             params: { live: "all" },
//           }),
//         "LiveFixtures:fetch"
//       );
//     } catch (err) {
//       logger.error(`[LiveFixtures] Fetch failed: ${err.message}`);
//       return this._emptyResult();
//     }

//     // ── 2. Check for API-level errors (matches guide pattern) ──
//     const apiErrors = response?.errors || {};
//     if (Object.keys(apiErrors).length > 0) {
//       logger.warn(
//         `[LiveFixtures] API blocked: ${JSON.stringify(apiErrors)}`
//       );
//       return this._emptyResult();
//     }

//     const rawFixtures = response?.response || [];

//     // ── 3. Filter to tracked leagues ──
//     // Football API nests ID under fixture.fixture.id
//     const filtered = rawFixtures.filter((f) =>
//       this.trackedLeagueIds.has(f.league?.id)
//     );

//     logger.info(
//       `[LiveFixtures] API: ${rawFixtures.length} total, ${filtered.length} tracked`
//     );

//     // ── 4. Detect transitions via in-memory diff only ──
//     // Previous version called getAllLiveIds() — a Firestore read
//     // every poll. Completely unnecessary when we already keep
//     // the snapshot in memory.
//     const previousIds = new Set(this.lastLiveSnapshot.keys());
//     const newIds = new Set(filtered.map((f) => f.fixture.id));
//     const disappearedIds = [...previousIds].filter(
//       (id) => !newIds.has(id)
//     );

//     let transitioned = 0;
//     if (disappearedIds.length > 0) {
//       transitioned = await this._handleTransitions(disappearedIds);
//     }

//     // ── 5. Write live fixtures ──
//     const docs = filtered.map((f) => this.normalize(f));
//     let writes = 0;

//     if (docs.length > 0) {
//       writes = await this.repo.replaceLive(docs);
//     } else if (previousIds.size > 0) {
//       // No live games but we had stale docs — clear the collection
//       await this.repo.clearLive();
//       this.lastLiveSnapshot.clear();
//     }

//     // ── 6. Update in-memory snapshot ──
//     this.lastLiveSnapshot.clear();
//     for (const doc of docs) {
//       this.lastLiveSnapshot.set(doc.id, doc);
//     }

//     const duration = Date.now() - startTime;
//     const hasLive = docs.length > 0;

//     logger.info(
//       `[LiveFixtures] ${writes} live, ${transitioned} → finished, ${duration} ms`
//     );

//     return {
//       total: filtered.length,
//       writes,
//       removed: transitioned,
//       hasLive,
//       duration,
//     };
//   }

//   // ==========================================================
//   // TRANSITIONS — live → finished
//   //
//   // When a fixture disappears from the ?live=all response,
//   // it finished. We use the in-memory snapshot to get its
//   // last known state, mark it FT, and write to finished.
//   //
//   // Zero extra API calls. Zero extra Firestore reads.
//   // The daily cron is the source of truth — this is best-effort.
//   //
//   // WHY we assume FT instead of checking lastKnown.status:
//   //   A fixture that was genuinely live has a status like "2H"
//   //   or "ET" — never "FT". If it disappeared from the live
//   //   endpoint, it BY DEFINITION finished. Checking
//   //   FINISHED_STATUSES on the old status would always return
//   //   false, making transitions impossible.
//   //
//   //   If it was actually POSTP/CANC, the daily cron corrects it.
//   //   Losing a final score is worse than a wrong status label.
//   // ==========================================================

//   async _handleTransitions(disappearedIds) {
//     const toFinish = [];

//     for (const id of disappearedIds) {
//       const lastKnown = this.lastLiveSnapshot.get(id);

//       // disappearedIds comes from snapshot keys, so this
//       // shouldn't happen — but guard against corruption.
//       if (!lastKnown) continue;

//       // Assume FT with last known scores preserved
//       toFinish.push({
//         ...lastKnown,
//         status: "FT",
//         statusLong: "Match Finished",
//         elapsed: null,
//         _updatedAt: new Date().toISOString(),
//       });
//     }

//     if (toFinish.length === 0) return 0;

//     logger.info(
//       `[LiveFixtures] Transitioning ${toFinish.length} → finished`
//     );

//     // Flat docs — matches guide pattern:
//     //   ftDocs = raw.map(f => ftProcessor.normalize(f));
//     //   await this.repo.batchUpsertFinished(ftDocs);
//     await this.repo.batchUpsertFinished(toFinish);

//     return toFinish.length;
//   }

//   // ==========================================================
//   // NORMALIZE
//   //
//   // Extends the daily normalize with score breakdowns
//   // (halftime, fulltime, extratime, penalty) — only available
//   // in live responses. When these transition to finished,
//   // the score data is preserved — valuable for match history.
//   // ==========================================================

//   normalize(fixture) {
//     const f = fixture.fixture;
//     const l = fixture.league;
//     const t = fixture.teams;
//     const g = fixture.goals;
//     const s = fixture.score;

//     return {
//       id: f.id,

//       date: f.date,
//       timestamp: f.timestamp,

//       status: f.status.short,
//       statusLong: f.status.long,
//       elapsed: f.status.elapsed ?? null,
//       referee: f.referee ?? null,

//       leagueId: l.id,
//       leagueName: l.name,
//       leagueCountry: l.country,
//       leagueLogo: l.logo,
//       leagueFlag: l.flag ?? null,
//       season: l.season,
//       round: l.round,

//       homeTeamId: t.home.id,
//       homeTeamName: t.home.name,
//       homeTeamLogo: t.home.logo,

//       awayTeamId: t.away.id,
//       awayTeamName: t.away.name,
//       awayTeamLogo: t.away.logo,

//       goalsHome: g.home,
//       goalsAway: g.away,

//       scoreHalftimeHome: s.halftime?.home ?? null,
//       scoreHalftimeAway: s.halftime?.away ?? null,

//       scoreFulltimeHome: s.fulltime?.home ?? null,
//       scoreFulltimeAway: s.fulltime?.away ?? null,

//       scoreExtratimeHome: s.extratime?.home ?? null,
//       scoreExtratimeAway: s.extratime?.away ?? null,

//       scorePenaltyHome: s.penalty?.home ?? null,
//       scorePenaltyAway: s.penalty?.away ?? null,

//       sport: "football",

//       _updatedAt: new Date().toISOString(),
//     };
//   }

//   // ==========================================================
//   // HELPERS
//   // ==========================================================

//   _emptyResult() {
//     return { total: 0, writes: 0, removed: 0, hasLive: false, duration: 0 };
//   }
// }

// module.exports = LiveFixturesService;


/*
 * liveFixtures.js
 * Fetches live football fixtures with DAILY CAP.
 *
 * Budget cost: UP TO 25 requests/day (hard cap).
 * Real-time scores for users viewing live matches.
 *
 * Key changes from original:
 *   - Checks isLiveCapAvailable() BEFORE fetching
 *   - Increments live counter AFTER successful fetch
 *   - When cap hit → returns empty (scheduler slows to 60min)
 *   - No other changes to logic
 */

const {
  api,
  isBudgetAvailable,
  isLiveCapAvailable,
  incrementLiveCounter,
  getLiveRequestsToday,
} = require("../config/api");
const { LEAGUES, LIVE_POLLING } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");

class LiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo) throw new Error("FixturesRepository is required.");
    if (!ftProcessor) throw new Error("FinishedFixturesProcessor is required.");

    this.repo = repo;
    this.ftProcessor = ftProcessor;

    this.lastLiveSnapshot = new Map();

    this.trackedLeagueIds = new Set(
      LEAGUES.filter((l) => l.active).map((l) => l.id)
    );
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  async run() {
    // ── Guard 1: API budget ──
    if (!isBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL)) {
      logger.warn("[LiveFixtures] Skipping — API budget exhausted");
      return this._emptyResult();
    }

    // ── Guard 2: Daily live cap ──
    if (!isLiveCapAvailable()) {
      logger.warn(
        `[LiveFixtures] Daily live cap reached (${getLiveRequestsToday()}/${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}) — skipping`
      );
      return this._emptyResult({ capReached: true });
    }

    const startTime = Date.now();

    // ── Fetch all live fixtures (1 API call) ──
    let response;
    try {
      response = await withRetry(
        () => api.get("/fixtures", { params: { live: "all" } }),
        "LiveFixtures:fetch"
      );
    } catch (err) {
      logger.error(`[LiveFixtures] Fetch failed: ${err.message}`);
      return this._emptyResult();
    }

    // ── Count this live request ──
    const liveCount = incrementLiveCounter();

    // ── Check for API-level errors ──
    const apiErrors = response?.errors || {};
    if (Object.keys(apiErrors).length > 0) {
      logger.warn(`[LiveFixtures] API blocked: ${JSON.stringify(apiErrors)}`);
      return this._emptyResult();
    }

    const rawFixtures = response?.response || [];

    // ── Filter to tracked leagues ──
    const filtered = rawFixtures.filter((f) =>
      this.trackedLeagueIds.has(f.league?.id)
    );

    logger.info(
      `[LiveFixtures] API: ${rawFixtures.length} total, ${filtered.length} tracked [live req ${liveCount}/${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}]`
    );

    // ── Detect transitions via in-memory diff ──
    const previousIds = new Set(this.lastLiveSnapshot.keys());
    const newIds = new Set(filtered.map((f) => f.fixture.id));
    const disappearedIds = [...previousIds].filter((id) => !newIds.has(id));

    let transitioned = 0;
    if (disappearedIds.length > 0) {
      transitioned = await this._handleTransitions(disappearedIds);
    }

    // ── Write live fixtures ──
    const docs = filtered.map((f) => this.normalize(f));
    let writes = 0;

    if (docs.length > 0) {
      writes = await this.repo.replaceLive(docs);
    } else if (previousIds.size > 0) {
      await this.repo.clearLive();
      this.lastLiveSnapshot.clear();
    }

    // ── Update in-memory snapshot ──
    this.lastLiveSnapshot.clear();
    for (const doc of docs) {
      this.lastLiveSnapshot.set(doc.id, doc);
    }

    const duration = Date.now() - startTime;
    const hasLive = docs.length > 0;

    logger.info(
      `[LiveFixtures] ${writes} live, ${transitioned} → finished, ${duration} ms`
    );

    return {
      total: filtered.length,
      writes,
      removed: transitioned,
      hasLive,
      duration,
      capReached: false,
    };
  }

  // ==========================================================
  // TRANSITIONS
  // ==========================================================

  async _handleTransitions(disappearedIds) {
    const toFinish = [];

    for (const id of disappearedIds) {
      const lastKnown = this.lastLiveSnapshot.get(id);
      if (!lastKnown) continue;

      toFinish.push({
        ...lastKnown,
        status: "FT",
        statusLong: "Match Finished",
        elapsed: null,
        _updatedAt: new Date().toISOString(),
      });
    }

    if (toFinish.length === 0) return 0;

    logger.info(`[LiveFixtures] Transitioning ${toFinish.length} → finished`);
    await this.repo.batchUpsertFinished(toFinish);
    return toFinish.length;
  }

  // ==========================================================
  // NORMALIZE
  // ==========================================================

  normalize(fixture) {
    const f = fixture.fixture;
    const l = fixture.league;
    const t = fixture.teams;
    const g = fixture.goals;
    const s = fixture.score;

    return {
      id: f.id,

      date: f.date,
      timestamp: f.timestamp,

      status: f.status.short,
      statusLong: f.status.long,
      elapsed: f.status.elapsed ?? null,
      referee: f.referee ?? null,

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

      scoreHalftimeHome: s.halftime?.home ?? null,
      scoreHalftimeAway: s.halftime?.away ?? null,

      scoreFulltimeHome: s.fulltime?.home ?? null,
      scoreFulltimeAway: s.fulltime?.away ?? null,

      scoreExtratimeHome: s.extratime?.extrace ?? null,
      scoreExtratimeAway: s.extratime?.away ?? null,

      scorePenaltyHome: s.penalty?.home ?? null,
      scorePenaltyAway: s.penalty?.away ?? null,

      sport: "football",

      _updatedAt: new Date().toISOString(),
    };
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  _emptyResult(extra = {}) {
    return {
      total: 0,
      writes: 0,
      removed: 0,
      hasLive: false,
      duration: 0,
      ...extra,
    };
  }
}

module.exports = LiveFixturesService;