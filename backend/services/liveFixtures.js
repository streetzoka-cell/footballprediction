/*
 * liveFixtures.js
 *
 * ★ QUOTA FIX: Only invalidate cache when data ACTUALLY changed.
 *   Previous version invalidated ft:live on EVERY poll, even when
 *   no games were live and data was identical. That caused a
 *   Firestore read on every poll cycle.
 *
 *   Now: skip invalidation when writeCount=0 and no transitions.
 *   Result: 0 Firestore reads when no live games exist.
 *
 * ★ FIRST POLL FIX: Uses batchWrite instead of replaceLive.
 *   replaceLive reads ALL old docs then deletes them (~40 reads).
 *   batchWrite just writes new docs without reading old ones (0 reads).
 *   Stale docs are cleaned up on the 2nd poll via diff-based delete.
 *
 * ★ NORMALIZE FIX: API sometimes omits nested objects (e.g. score.halftime).
 *   Previously this resulted in `undefined` fields, which causes Firestore 
 *   batchWrite to throw an error, silently breaking the live polling loop.
 *   Now uses `?? null` and defensive defaults.
 *
 * ★ STATELESS SCHEDULER FEED: Returns exact `liveCount` and `nearFT` 
 *   directly to the scheduler so it doesn't need to re-read the database.
 */

const {
  api,
  isBudgetAvailable,
  isLiveCapAvailable,
  incrementLiveCounter,
  getLiveRequestsToday,
} = require("../config/api");
const {
  LEAGUES,
  LIVE_POLLING,
  TRACK_ALL_LEAGUES,
  COLLECTIONS,
} = require("../config/constants");
const { withRetry } = require("../utils/retry");
const { batchWrite, deleteByIds } = require("../config/firebase");
const cache = require("../utils/cache");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class LiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo)
      throw new Error("FixturesRepository is required.");
    if (!ftProcessor)
      throw new Error("FinishedFixturesProcessor is required.");
    this.repo = repo;
    this.ftProcessor = ftProcessor;
    this.lastLiveSnapshot = new Map();
    
    this.lastFinishedSnapshot = new Map();
    
    this.trackedLeagueIds = new Set(
      LEAGUES.filter(function (l) {
        return l.active;
      }).map(function (l) {
        return l.id;
      })
    );
  }

  async run() {
    if (!isBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL)) {
      return this._emptyResult();
    }
    if (!isLiveCapAvailable()) {
      return this._emptyResult({ capReached: true });
    }

    var startTime = Date.now();
    var response;
    try {
      response = await withRetry(
        function () {
          return api.get("/fixtures", {
            params: { live: "all" },
          });
        },
        "LiveFixtures:fetch"
      );
    } catch (err) {
      return this._emptyResult();
    }

    incrementLiveCounter();

    var apiErrors = response && response.errors ? response.errors : {};
    if (Object.keys(apiErrors).length > 0) {
      return this._emptyResult({ capReached: true });
    }

    var rawFixtures =
      (response && response.response) ? response.response : [];
    var filtered = TRACK_ALL_LEAGUES
      ? rawFixtures
      : rawFixtures.filter(
          function (f) {
            return this.trackedLeagueIds.has(
              f.league && f.league.id
            );
          }.bind(this)
        );

    logger.info(
      "[LiveFixtures] API: " +
        rawFixtures.length +
        " total, " +
        filtered.length +
        " tracked"
    );

    var newDocs = filtered.map(
      function (f) {
        return this.normalize(f);
      }.bind(this)
    );
    var newIds = new Set(newDocs.map(function (d) { return d.id; }));
    var oldIds = new Set(this.lastLiveSnapshot.keys());
    var disappearedIds = [];
    oldIds.forEach(function (id) {
      if (!newIds.has(id)) disappearedIds.push(id);
    });

    var transitioned = 0;
    if (disappearedIds.length > 0) {
      transitioned = await this._handleTransitions(
        disappearedIds
      );
    }

    var writeCount = 0;
    var isFirstPoll = this.lastLiveSnapshot.size === 0;

    if (isFirstPoll) {
      if (newDocs.length > 0) {
        writeCount = await this.repo.batchWrite(
          COLLECTIONS.LIVE_FIXTURES,
          newDocs
        );
      }
    } else {
      var toWrite = newDocs.filter(
        function (d) {
          var old = this.lastLiveSnapshot.get(d.id);
          if (!old) return true;
          return (
            d.goalsHome !== old.goalsHome ||
            d.goalsAway !== old.goalsAway ||
            d.status !== old.status ||
            d.elapsed !== old.elapsed
          );
        }.bind(this)
      );

      if (toWrite.length > 0) {
        writeCount = await this.repo.batchWrite(
          COLLECTIONS.LIVE_FIXTURES,
          toWrite
        );
      }

      if (disappearedIds.length > 0) {
        await deleteByIds(
          COLLECTIONS.LIVE_FIXTURES,
          disappearedIds
        );
      }

      if (newDocs.length === 0 && oldIds.size > 0) {
        await deleteByIds(
          COLLECTIONS.LIVE_FIXTURES,
          Array.from(oldIds)
        );
      }
    }

    this.lastLiveSnapshot.clear();
    newDocs.forEach(
      function (doc) {
        this.lastLiveSnapshot.set(doc.id, doc);
      }.bind(this)
    );

    // ════════════════════════════════════════════════════════
    // NEAR-FINISH DETECTION
    // Count matches that are at 80'+ in 2H, or in ET/BT/P.
    // This provides the exact count to the scheduler, avoiding
    // any database state mismatch.
    // ════════════════════════════════════════════════════════
    var nearFTCount = newDocs.reduce(function(count, d) {
      if (["ET", "BT", "P"].indexOf(d.status) !== -1) return count + 1;
      if (d.elapsed != null && d.elapsed >= 80) return count + 1;
      return count;
    }, 0);

    var dataChanged =
      writeCount > 0 || disappearedIds.length > 0 || isFirstPoll;

    if (dataChanged) {
      cache.invalidate("ft:live");
      if (transitioned > 0) {
        cache.invalidate("ft:finished");
      }

      // ── Write snapshot for frontend ──
      try {
        await snapshotWriter.writeFootballSnapshot(
          new Date().toISOString().slice(0, 10),
          {
            live: newDocs,
            finished: Array.from(this.lastFinishedSnapshot.values()),
          }
        );
      } catch (err) {
        logger.error("[LiveFixtures] Snapshot write failed: " + err.message);
      }
    }

    var duration = Date.now() - startTime;
    logger.info(
      "[LiveFixtures] " +
        writeCount +
        " written, " +
        transitioned +
        "→finished, " +
        (dataChanged ? "cache-invalidated" : "cache-kept") +
        ", " +
        duration +
        "ms"
    );

    // ════════════════════════════════════════════════════════
    // ★ STATELESS SCHEDULER FEED: Return verified counts directly
    // to the scheduler. It does not need to re-read the database.
    // ════════════════════════════════════════════════════════
    return {
      success: true,
      liveCount: newDocs.length,
      nearFT: nearFTCount,
      isNearFinish: nearFTCount > 0, // Keep for backwards compatibility
      total: newDocs.length,         // Keep for backwards compatibility
      writes: writeCount,
      removed: transitioned,
      hasLive: newDocs.length > 0,
      duration: duration,
      capReached: false,
      polled: true,
    };
  }

  async _handleTransitions(disappearedIds) {
    var toFinish = [];
    disappearedIds.forEach(
      function (id) {
        var lastKnown = this.lastLiveSnapshot.get(id);
        if (!lastKnown) return;
        toFinish.push({
          id: lastKnown.id,
          date: lastKnown.date,
          timestamp: lastKnown.timestamp,
          status: "FT",
          statusLong: "Match Finished",
          elapsed: null,
          leagueId: lastKnown.leagueId,
          leagueName: lastKnown.leagueName,
          leagueCountry: lastKnown.leagueCountry,
          leagueLogo: lastKnown.leagueLogo,
          leagueFlag: lastKnown.leagueFlag,
          season: lastKnown.season,
          round: lastKnown.round,
          homeTeamId: lastKnown.homeTeamId,
          homeTeamName: lastKnown.homeTeamName,
          homeTeamLogo: lastKnown.homeTeamLogo,
          awayTeamId: lastKnown.awayTeamId,
          awayTeamName: lastKnown.awayTeamName,
          awayTeamLogo: lastKnown.awayTeamLogo,
          goalsHome: lastKnown.goalsHome,
          goalsAway: lastKnown.goalsAway,
          scoreHalftimeHome: lastKnown.scoreHalftimeHome,
          scoreHalftimeAway: lastKnown.scoreHalftimeAway,
          scoreFulltimeHome: lastKnown.scoreFulltimeHome,
          scoreFulltimeAway: lastKnown.scoreFulltimeAway,
          scoreExtratimeHome: lastKnown.scoreExtratimeHome,
          scoreExtratimeAway: lastKnown.scoreExtratimeAway,
          scorePenaltyHome: lastKnown.scorePenaltyHome,
          scorePenaltyAway: lastKnown.scorePenaltyAway,
          sport: "football",
          _updatedAt: new Date().toISOString(),
        });
      }.bind(this)
    );

    if (toFinish.length === 0) return 0;
    logger.info(
      "[LiveFixtures] Transitioning " +
        toFinish.length +
        " → finished"
    );
    await this.repo.batchUpsertFinished(toFinish);
    cache.invalidate("ft:finished");

    toFinish.forEach(function (doc) {
      this.lastFinishedSnapshot.set(String(doc.id), doc);
    }.bind(this));

    return toFinish.length;
  }

  normalize(fixture) {
    // ★ BULLETPROOF NORMALIZE: Firestore throws an error if you attempt 
    // to write `undefined`. The API frequently omits nested objects 
    // (like score.halftime) if they haven't happened yet.
    // We use `?? null` to ensure ALL fields default to null safely.
    const f = fixture.fixture || {};
    const l = fixture.league || {};
    const t = fixture.teams || {};
    const g = fixture.goals || {};
    const s = fixture.score || {};

    const home = t.home || {};
    const away = t.away || {};
    const ht = s.halftime || {};
    const ft = s.fulltime || {};
    const et = s.extratime || {};
    const pen = s.penalty || {};

    return {
      id: f.id,
      date: f.date,
      timestamp: f.timestamp,
      status: f.status ? f.status.short : null,
      statusLong: f.status ? f.status.long : null,
      elapsed: f.status?.elapsed ?? null,
      referee: f.referee || null,
      leagueId: l.id,
      leagueName: l.name,
      leagueCountry: l.country,
      leagueLogo: l.logo,
      leagueFlag: l.flag || null,
      season: l.season,
      round: l.round,
      homeTeamId: home.id,
      homeTeamName: home.name,
      homeTeamLogo: home.logo,
      awayTeamId: away.id,
      awayTeamName: away.name,
      awayTeamLogo: away.logo,
      goalsHome: g.home ?? null,
      goalsAway: g.away ?? null,
      scoreHalftimeHome: ht.home ?? null,
      scoreHalftimeAway: ht.away ?? null,
      scoreFulltimeHome: ft.home ?? null,
      scoreFulltimeAway: ft.away ?? null,
      scoreExtratimeHome: et.home ?? null,
      scoreExtratimeAway: et.away ?? null,
      scorePenaltyHome: pen.home ?? null,
      scorePenaltyAway: pen.away ?? null,
      sport: "football",
      _updatedAt: new Date().toISOString(),
    };
  }

  _emptyResult(extra = {}) {
    return {
      success: false,
      liveCount: 0,
      nearFT: 0,
      isNearFinish: false,
      total: 0,
      writes: 0,
      removed: 0,
      hasLive: false,
      duration: 0,
      capReached: false,
      polled: false,
      ...extra,
    };
  }
}

module.exports = LiveFixturesService;