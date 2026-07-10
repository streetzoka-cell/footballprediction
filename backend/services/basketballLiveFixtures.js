/*
 * basketballLiveFixtures.js
 * Fetches live basketball fixtures with DAILY CAP.
 *
 * Budget cost: UP TO 15 requests/day (hard cap).
 */

const {
  basketballApi,
  isBasketballConfigured,
  isBasketballBudgetAvailable,
  isBasketballLiveCapAvailable,
  incrementBasketballLiveCounter,
  getBasketballLiveRequestsToday,
} = require("../config/basketballApi");
const { BASKETBALL_LEAGUES, LIVE_POLLING } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const logger = require("../utils/logger");

class BasketballLiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo) throw new Error("BasketballFixturesRepository is required.");
    if (!ftProcessor)
      throw new Error("BasketballFinishedFixturesProcessor is required.");

    this.repo = repo;
    this.ftProcessor = ftProcessor;

    this.lastLiveSnapshot = new Map();

    this.trackedLeagueIds = new Set(
      BASKETBALL_LEAGUES.filter((l) => l.active).map((l) => l.id)
    );
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  async run() {
    if (!isBasketballConfigured) {
      logger.warn("[BasketballLive] Skipping — API not configured");
      return this._emptyResult();
    }

    // ── Guard 1: API budget ──
    if (!isBasketballBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL)) {
      logger.warn("[BasketballLive] Skipping — budget exhausted");
      return this._emptyResult();
    }

    // ── Guard 2: Daily live cap ──
    if (!isBasketballLiveCapAvailable()) {
      logger.warn(
        `[BasketballLive] Daily live cap reached (${getBasketballLiveRequestsToday()}/${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}) — skipping`
      );
      return this._emptyResult({ capReached: true });
    }

    const startTime = Date.now();

   // ── Fetch today's games (1 API call) ──
// API-Basketball does not support live=all.
// We fetch today's games and detect live status locally.
let response;

try {
  const today = new Date().toISOString().slice(0, 10);

  response = await withRetry(
    () =>
      basketballApi.get("/games", {
        params: {
          date: today,
        },
      }),
    "BasketballLive:fetch"
  );

} catch (err) {
  logger.error(`[BasketballLive] Fetch failed: ${err.message}`);
  return this._emptyResult();
}
    // ── Count this live request ──
    const liveCount = incrementBasketballLiveCounter();

    // ── Check API errors ──
    const apiErrors = response?.errors || {};
    if (Object.keys(apiErrors).length > 0) {
      logger.warn(`[BasketballLive] API blocked: ${JSON.stringify(apiErrors)}`);
      return this._emptyResult();
    }

    const rawFixtures = response?.response || [];

    // ── Filter ──
    const filtered = rawFixtures.filter((f) => {
  const isTrackedLeague = this.trackedLeagueIds.has(f.league?.id);

  const liveStatuses = [
    "Q1",
    "Q2",
    "Q3",
    "Q4",
    "OT",
    "LIVE",
    "IN PLAY"
  ];

  const isLive = liveStatuses.includes(
    f.status?.short?.toUpperCase()
  );

  return isTrackedLeague && isLive;
});

    logger.info(
      `[BasketballLive] API: ${rawFixtures.length} total, ${filtered.length} tracked [live req ${liveCount}/${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}]`
    );

    // ── Detect transitions ──
    const previousIds = new Set(this.lastLiveSnapshot.keys());
    const newIds = new Set(filtered.map((f) => f.id));
    const disappearedIds = [...previousIds].filter((id) => !newIds.has(id));

    let transitioned = 0;
    if (disappearedIds.length > 0) {
      transitioned = await this._handleTransitions(disappearedIds);
    }

    // ── Write ──
    const docs = filtered.map((f) => this.normalize(f));
    let writes = 0;

    if (docs.length > 0) {
      writes = await this.repo.replaceLive(docs);
    } else if (previousIds.size > 0) {
      await this.repo.clearLive();
      this.lastLiveSnapshot.clear();
    }

    // ── Update snapshot ──
    this.lastLiveSnapshot.clear();
    for (const doc of docs) {
      this.lastLiveSnapshot.set(doc.id, doc);
    }

    const duration = Date.now() - startTime;
    const hasLive = docs.length > 0;

    logger.info(
      `[BasketballLive] ${writes} live, ${transitioned} → finished, ${duration} ms`
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
        statusLong: "Game Finished",
        elapsed: null,
        currentPeriod: null,
        _updatedAt: new Date().toISOString(),
      });
    }

    if (toFinish.length === 0) return 0;

    logger.info(`[BasketballLive] Transitioning ${toFinish.length} → finished`);
    await this.repo.batchUpsertFinished(toFinish);
    return toFinish.length;
  }

  // ==========================================================
  // NORMALIZE
  // ==========================================================

  normalize(fixture) {
    const scores = fixture.scores || {};
    const periods = fixture.periods || {};

    return {
      id: fixture.id,

      date: fixture.date,
      timestamp: fixture.timestamp,

      status: fixture.status?.short || "NS",
      statusLong: fixture.status?.long || "Not Started",
      elapsed: fixture.status?.elapsed ?? null,
      currentPeriod: this._getCurrentPeriod(fixture.status?.short),

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

      q1Home: scores.home?.q1 ?? null,
      q1Away: scores.away?.q1 ?? null,
      q2Home: scores.home?.q2 ?? null,
      q2Away: scores.away?.q2 ?? null,
      q3Home: scores.home?.q3 ?? null,
      q3Away: scores.away?.q3 ?? null,
      q4Home: scores.home?.q4 ?? null,
      q4Away: scores.away?.q4 ?? null,

      otHome: scores.home?.ot ?? null,
      otAway: scores.away?.ot ?? null,

      firstQuarterStart: periods.firstQuarterStart ?? null,
      secondQuarterStart: periods.secondQuarterStart ?? null,
      thirdQuarterStart: periods.thirdQuarterStart ?? null,
      fourthQuarterStart: periods.fourthQuarterStart ?? null,

      sport: "basketball",
      _updatedAt: new Date().toISOString(),
    };
  }

  _getCurrentPeriod(statusShort) {
    const map = {
      "1Q": 1, Q1: 1,
      "2Q": 2, Q2: 2,
      "3Q": 3, Q3: 3,
      "4Q": 4, Q4: 4,
      OT: 5,
    };
    return map[statusShort] ?? null;
  }

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

module.exports = BasketballLiveFixturesService;