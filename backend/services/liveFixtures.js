const {
  api, isBudgetAvailable, isLiveCapAvailable,
  incrementLiveCounter, getLiveRequestsToday,
} = require("../config/api");
const { LEAGUES, LIVE_POLLING, TRACK_ALL_LEAGUES, COLLECTIONS } = require("../config/constants");
const { withRetry } = require("../utils/retry");
const { batchWrite, deleteByIds } = require("../config/firebase");
const cache = require("../utils/cache");
const logger = require("../utils/logger");

class LiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo) throw new Error("FixturesRepository is required.");
    if (!ftProcessor) throw new Error("FinishedFixturesProcessor is required.");
    this.repo = repo;
    this.ftProcessor = ftProcessor;
    this.lastLiveSnapshot = new Map();
    this.trackedLeagueIds = new Set(
      LEAGUES.filter(function (l) { return l.active; }).map(function (l) { return l.id; })
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
        function () { return api.get("/fixtures", { params: { live: "all" } }); },
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

    var rawFixtures = (response && response.response) ? response.response : [];
    var filtered = TRACK_ALL_LEAGUES
      ? rawFixtures
      : rawFixtures.filter(function (f) { return this.trackedLeagueIds.has(f.league && f.league.id); }.bind(this));

    logger.info(
      "[LiveFixtures] API: " + rawFixtures.length + " total, " + filtered.length + " tracked"
    );

    var newDocs = filtered.map(function (f) { return this.normalize(f); }.bind(this));
    var newIds = new Set(newDocs.map(function (d) { return d.id; }));
    var oldIds = new Set(this.lastLiveSnapshot.keys());
    var disappearedIds = [];
    oldIds.forEach(function (id) {
      if (!newIds.has(id)) disappearedIds.push(id);
    });

    var transitioned = 0;
    if (disappearedIds.length > 0) {
      transitioned = await this._handleTransitions(disappearedIds);
    }

    var writeCount = 0;
    var isFirstPoll = this.lastLiveSnapshot.size === 0;

    if (isFirstPoll) {
      // First poll after restart — use replaceLive to be safe
      if (newDocs.length > 0) {
        var r = await this.repo.replaceLive(newDocs);
        writeCount = r.written;
      }
    } else {
      // Normal poll — diff-based (only write changed docs)
      var toWrite = newDocs.filter(function (d) {
        var old = this.lastLiveSnapshot.get(d.id);
        if (!old) return true;
        return d.goalsHome !== old.goalsHome || d.goalsAway !== old.goalsAway ||
               d.status !== old.status || d.elapsed !== old.elapsed;
      }.bind(this));

      if (toWrite.length > 0) {
        writeCount = await this.repo.batchWrite(COLLECTIONS.LIVE_FIXTURES, toWrite);
      }

      // Delete disappeared docs by ID
      if (disappearedIds.length > 0) {
        await deleteByIds(COLLECTIONS.LIVE_FIXTURES, disappearedIds);
      }

      // If no live and had some before, clear all
      if (newDocs.length === 0 && oldIds.size > 0) {
        await deleteByIds(COLLECTIONS.LIVE_FIXTURES, Array.from(oldIds));
      }
    }

    this.lastLiveSnapshot.clear();
    newDocs.forEach(function (doc) { this.lastLiveSnapshot.set(doc.id, doc); }.bind(this));

    cache.invalidate("ft:live");

    var duration = Date.now() - startTime;
    logger.info(
      "[LiveFixtures] " + writeCount + " written, " + transitioned + "→finished, " + duration + "ms"
    );

    return {
      total: newDocs.length, writes: writeCount, removed: transitioned,
      hasLive: newDocs.length > 0, duration: duration, capReached: false,
    };
  }

  async _handleTransitions(disappearedIds) {
    var toFinish = [];
    disappearedIds.forEach(function (id) {
      var lastKnown = this.lastLiveSnapshot.get(id);
      if (!lastKnown) return;
      toFinish.push({
        id: lastKnown.id,
        date: lastKnown.date, timestamp: lastKnown.timestamp,
        status: "FT", statusLong: "Match Finished", elapsed: null,
        leagueId: lastKnown.leagueId, leagueName: lastKnown.leagueName,
        leagueCountry: lastKnown.leagueCountry, leagueLogo: lastKnown.leagueLogo,
        leagueFlag: lastKnown.leagueFlag, season: lastKnown.season, round: lastKnown.round,
        homeTeamId: lastKnown.homeTeamId, homeTeamName: lastKnown.homeTeamName,
        homeTeamLogo: lastKnown.homeTeamLogo, awayTeamId: lastKnown.awayTeamId,
        awayTeamName: lastKnown.awayTeamName, awayTeamLogo: lastKnown.awayTeamLogo,
        goalsHome: lastKnown.goalsHome, goalsAway: lastKnown.goalsAway,
        scoreHalftimeHome: lastKnown.scoreHalftimeHome,
        scoreHalftimeAway: lastKnown.scoreHalftimeAway,
        scoreFulltimeHome: lastKnown.scoreFulltimeHome,
        scoreFulltimeAway: lastKnown.scoreFulltimeAway,
        scoreExtratimeHome: lastKnown.scoreExtratimeHome,
        scoreExtratimeAway: lastKnown.scoreExtratimeAway,
        scorePenaltyHome: lastKnown.scorePenaltyHome,
        scorePenaltyAway: lastKnown.scorePenaltyAway,
        sport: "football", _updatedAt: new Date().toISOString(),
      });
    }.bind(this));

    if (toFinish.length === 0) return 0;
    logger.info("[LiveFixtures] Transitioning " + toFinish.length + " → finished");
    await this.repo.batchUpsertFinished(toFinish);
    cache.invalidate("ft:finished");
    return toFinish.length;
  }

  normalize(fixture) {
    var f = fixture.fixture, l = fixture.league, t = fixture.teams;
    var g = fixture.goals, s = fixture.score;
    return {
      id: f.id, date: f.date, timestamp: f.timestamp,
      status: f.status.short, statusLong: f.status.long,
      elapsed: f.status.elapsed != null ? f.status.elapsed : null,
      referee: f.referee || null,
      leagueId: l.id, leagueName: l.name, leagueCountry: l.country,
      leagueLogo: l.logo, leagueFlag: l.flag || null, season: l.season, round: l.round,
      homeTeamId: t.home.id, homeTeamName: t.home.name, homeTeamLogo: t.home.logo,
      awayTeamId: t.away.id, awayTeamName: t.away.name, awayTeamLogo: t.away.logo,
      goalsHome: g.home, goalsAway: g.away,
      scoreHalftimeHome: s.halftime && s.halftime.home, scoreHalftimeAway: s.halftime && s.halftime.away,
      scoreFulltimeHome: s.fulltime && s.fulltime.home, scoreFulltimeAway: s.fulltime && s.fulltime.away,
      scoreExtratimeHome: s.extratime && s.extratime.home, scoreExtratimeAway: s.extratime && s.extratime.away,
      scorePenaltyHome: s.penalty && s.penalty.home, scorePenaltyAway: s.penalty && s.penalty.away,
      sport: "football", _updatedAt: new Date().toISOString(),
    };
  }

  _emptyResult(extra) {
    return {
      total: 0, writes: 0, removed: 0,
      hasLive: false, duration: 0, capReached: false,
    };
  }
}

module.exports = LiveFixturesService;