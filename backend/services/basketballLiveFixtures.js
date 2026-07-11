/*
 * basketballLiveFixtures.js
 *
 * ★ QUOTA FIX: Same as football — only invalidate cache when
 *   data ACTUALLY changed. When no basketball games are live,
 *   the cache stays warm forever. 0 Firestore reads.
 */

const {
  basketballApi,
  isBasketballConfigured,
  isBasketballBudgetAvailable,
  isBasketballLiveCapAvailable,
  incrementBasketballLiveCounter,
  getBasketballLiveRequestsToday,
} = require("../config/basketballApi");
const {
  BASKETBALL_LEAGUES,
  LIVE_POLLING,
  TRACK_ALL_LEAGUES,
  COLLECTIONS,
} = require("../config/constants");
const { withRetry } = require("../utils/retry");
const { batchWrite, deleteByIds } = require("../config/firebase");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

class BasketballLiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo)
      throw new Error(
        "BasketballFixturesRepository is required."
      );
    if (!ftProcessor)
      throw new Error(
        "BasketballFinishedFixturesProcessor is required."
      );
    this.repo = repo;
    this.ftProcessor = ftProcessor;
    this.lastLiveSnapshot = new Map();
    this.trackedLeagueIds = new Set(
      BASKETBALL_LEAGUES.filter(function (l) {
        return l.active;
      }).map(function (l) {
        return l.id;
      })
    );
  }

  async run() {
    if (!isBasketballConfigured) return this._emptyResult();
    if (!isBasketballBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL))
      return this._emptyResult({ capReached: true });
    if (!isBasketballLiveCapAvailable())
      return this._emptyResult({ capReached: true });

    var startTime = Date.now();
    var response;
    try {
      response = await withRetry(
        function () {
          return basketballApi.get("/games", {
            params: {
              date: new Date()
                .toISOString()
                .slice(0, 10),
            },
          });
        },
        "BasketballLive:fetch"
      );
    } catch (err) {
      return this._emptyResult();
    }

    incrementBasketballLiveCounter();

    var apiErrors =
      response && response.errors ? response.errors : {};
    if (Object.keys(apiErrors).length > 0)
      return this._emptyResult({ capReached: true });

    var rawFixtures =
      (response && response.response)
        ? response.response
        : [];
    var liveStatuses = [
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "OT",
      "LIVE",
      "IN PLAY",
    ];

    var filtered = rawFixtures.filter(function (f) {
      var isTracked =
        TRACK_ALL_LEAGUES ||
        this.trackedLeagueIds.has(
          f.league && f.league.id
        );
      var isLive =
        liveStatuses.indexOf(
          (f.status &&
            f.status.short &&
            f.status.short.toUpperCase()) ||
            ""
        ) !== -1;
      return isTracked && isLive;
    }.bind(this));

    logger.info(
      "[BasketballLive] API: " +
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
    var newIds = new Set(
      newDocs.map(function (d) { return d.id; })
    );
    var oldIds = new Set(this.lastLiveSnapshot.keys());
    var disappearedIds = [];
    oldIds.forEach(function (id) {
      if (!newIds.has(id)) disappearedIds.push(id);
    });

    var transitioned = 0;
    if (disappearedIds.length > 0) {
      var toFinish = [];
      disappearedIds.forEach(
        function (id) {
          var last = this.lastLiveSnapshot.get(id);
          if (!last) return;
          toFinish.push({
            id: last.id,
            date: last.date,
            timestamp: last.timestamp,
            status: "FT",
            statusLong: "Game Finished",
            elapsed: null,
            currentPeriod: null,
            leagueId: last.leagueId,
            leagueName: last.leagueName,
            leagueCountry: last.leagueCountry,
            leagueLogo: last.leagueLogo,
            season: last.season,
            homeTeamId: last.homeTeamId,
            homeTeamName: last.homeTeamName,
            homeTeamLogo: last.homeTeamLogo,
            awayTeamId: last.awayTeamId,
            awayTeamName: last.awayTeamName,
            awayTeamLogo: last.awayTeamLogo,
            pointsHome: last.pointsHome,
            pointsAway: last.pointsAway,
            q1Home: last.q1Home,
            q1Away: last.q1Away,
            q2Home: last.q2Home,
            q2Away: last.q2Away,
            q3Home: last.q3Home,
            q3Away: last.q3Away,
            q4Home: last.q4Home,
            q4Away: last.q4Away,
            otHome: last.otHome,
            otAway: last.otAway,
            sport: "basketball",
            _updatedAt: new Date().toISOString(),
          });
        }.bind(this)
      );
      if (toFinish.length > 0) {
        logger.info(
          "[BasketballLive] Transitioning " +
            toFinish.length +
            " → finished"
        );
        await this.repo.batchUpsertFinished(toFinish);
        cache.invalidate("bb:finished");
        transitioned = toFinish.length;
      }
    }

    var writeCount = 0;
    var isFirstPoll = this.lastLiveSnapshot.size === 0;

    if (isFirstPoll) {
      // First poll — just write, don't read+delete old docs.
      // Next poll will diff and clean up any stale docs.
      if (newDocs.length > 0) {
        writeCount = await this.repo.batchWrite(COLLECTIONS.BASKETBALL_LIVE_FIXTURES, newDocs);
      }
    } else {
      var toWrite = newDocs.filter(function (d) {
        var old = this.lastLiveSnapshot.get(d.id);
        if (!old) return true;
        return (
          d.pointsHome !== old.pointsHome ||
          d.pointsAway !== old.pointsAway ||
          d.status !== old.status ||
          d.elapsed !== old.elapsed
        );
      }.bind(this));
      if (toWrite.length > 0) {
        writeCount = await this.repo.batchWrite(
          COLLECTIONS.BASKETBALL_LIVE_FIXTURES,
          toWrite
        );
      }
      if (disappearedIds.length > 0) {
        await deleteByIds(
          COLLECTIONS.BASKETBALL_LIVE_FIXTURES,
          disappearedIds
        );
      }
      if (newDocs.length === 0 && oldIds.size > 0) {
        await deleteByIds(
          COLLECTIONS.BASKETBALL_LIVE_FIXTURES,
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

    // ★ QUOTA FIX: Only invalidate when data changed
    var dataChanged =
      writeCount > 0 ||
      disappearedIds.length > 0 ||
      isFirstPoll;

    if (dataChanged) {
      cache.invalidate("bb:live");
      if (transitioned > 0) {
        cache.invalidate("bb:finished");
      }
    }

    logger.info(
      "[BasketballLive] " +
        writeCount +
        " written, " +
        transitioned +
        "→finished, " +
        (dataChanged ? "cache-invalidated" : "cache-kept") +
        ", " +
        (Date.now() - startTime) +
        "ms"
    );

    return {
      total: newDocs.length,
      writes: writeCount,
      removed: transitioned,
      hasLive: newDocs.length > 0,
      duration: Date.now() - startTime,
      capReached: false,
    };
  }

  normalize(fixture) {
    var scores = fixture.scores || {};
    var periods = fixture.periods || {};
    var periodMap = {
      "1Q": 1,
      Q1: 1,
      "2Q": 2,
      Q2: 2,
      "3Q": 3,
      Q3: 3,
      "4Q": 4,
      Q4: 4,
      OT: 5,
    };
    return {
      id: fixture.id,
      date: fixture.date,
      timestamp: fixture.timestamp,
      status: (fixture.status && fixture.status.short) || "NS",
      statusLong:
        (fixture.status && fixture.status.long) ||
        "Not Started",
      elapsed:
        (fixture.status && fixture.status.elapsed) != null
          ? fixture.status.elapsed
          : null,
      currentPeriod:
        periodMap[fixture.status && fixture.status.short] ||
        null,
      leagueId: fixture.league && fixture.league.id,
      leagueName: fixture.league && fixture.league.name,
      leagueCountry:
        fixture.league && fixture.league.country,
      leagueLogo: fixture.league && fixture.league.logo,
      season: fixture.league && fixture.league.season,
      homeTeamId:
        fixture.teams &&
        fixture.teams.home &&
        fixture.teams.home.id,
      homeTeamName:
        fixture.teams &&
        fixture.teams.home &&
        fixture.teams.home.name,
      homeTeamLogo:
        fixture.teams &&
        fixture.teams.home &&
        fixture.teams.home.logo,
      awayTeamId:
        fixture.teams &&
        fixture.teams.away &&
        fixture.teams.away.id,
      awayTeamName:
        fixture.teams &&
        fixture.teams.away &&
        fixture.teams.away.name,
      awayTeamLogo:
        fixture.teams &&
        fixture.teams.away &&
        fixture.teams.away.logo,
      pointsHome:
        scores.home && scores.home.total != null
          ? scores.home.total
          : null,
      pointsAway:
        scores.away && scores.away.total != null
          ? scores.away.total
          : null,
      q1Home: scores.home && scores.home.q1,
      q1Away: scores.away && scores.away.q1,
      q2Home: scores.home && scores.home.q2,
      q2Away: scores.away && scores.away.q2,
      q3Home: scores.home && scores.home.q3,
      q3Away: scores.away && scores.away.q3,
      q4Home: scores.home && scores.home.q4,
      q4Away: scores.away && scores.away.q4,
      otHome: scores.home && scores.home.ot,
      otAway: scores.away && scores.away.ot,
      firstQuarterStart: periods.firstQuarterStart || null,
      secondQuarterStart:
        periods.secondQuarterStart || null,
      thirdQuarterStart:
        periods.thirdQuarterStart || null,
      fourthQuarterStart:
        periods.fourthQuarterStart || null,
      sport: "basketball",
      _updatedAt: new Date().toISOString(),
    };
  }

  _emptyResult(extra) {
    return {
      total: 0,
      writes: 0,
      removed: 0,
      hasLive: false,
      duration: 0,
      capReached: false,
    };
  }
}

module.exports = BasketballLiveFixturesService;