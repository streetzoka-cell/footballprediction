/*
 * liveFixtures.js
 * ★ TIMEZONE FIX: Groups live matches by local date (EAT) to write to correct snapshot docs.
 * ★ SIZE FIX: Caps lastFinishedSnapshot to 50 to prevent 1MB Firestore limit errors.
 */

const {
  api, isBudgetAvailable, isLiveCapAvailable, incrementLiveCounter,
} = require("../config/api");
const {
  LEAGUES, LIVE_POLLING, TRACK_ALL_LEAGUES, COLLECTIONS, TODAY, getLocalDateFromUtc,
} = require("../config/constants");
const { withRetry } = require("../utils/retry");
const { batchWrite, deleteByIds } = require("../config/firebase");
const cache = require("../utils/cache");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class LiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo) throw new Error("FixturesRepository is required.");
    if (!ftProcessor) throw new Error("FinishedFixturesProcessor is required.");
    this.repo = repo;
    this.ftProcessor = ftProcessor;
    this.lastLiveSnapshot = new Map();
    this.lastFinishedSnapshot = new Map();
    this.trackedLeagueIds = new Set(LEAGUES.filter((l) => l.active).map((l) => l.id));
  }

  async run() {
    if (!isBudgetAvailable(LIVE_POLLING.MIN_BUDGET_TO_POLL)) return this._emptyResult();
    if (!isLiveCapAvailable()) return this._emptyResult({ capReached: true });

    var startTime = Date.now();
    var response;
    try {
      response = await withRetry(() => api.get("/fixtures", { params: { live: "all" } }), "LiveFixtures:fetch");
    } catch (err) { return this._emptyResult(); }

    incrementLiveCounter();
    if (Object.keys(response?.errors || {}).length > 0) return this._emptyResult({ capReached: true });

    var rawFixtures = response?.response || [];
    var filtered = TRACK_ALL_LEAGUES ? rawFixtures : rawFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));

    var newDocs = filtered.map((f) => this.normalize(f));
    var newIds = new Set(newDocs.map((d) => d.id));
    var oldIds = new Set(this.lastLiveSnapshot.keys());
    var disappearedIds = [];
    oldIds.forEach((id) => { if (!newIds.has(id)) disappearedIds.push(id); });

    var transitioned = 0;
    if (disappearedIds.length > 0) transitioned = await this._handleTransitions(disappearedIds);

    var writeCount = 0;
    var isFirstPoll = this.lastLiveSnapshot.size === 0;

    if (isFirstPoll) {
      if (newDocs.length > 0) writeCount = await this.repo.batchWrite(COLLECTIONS.LIVE_FIXTURES, newDocs);
    } else {
      var toWrite = newDocs.filter((d) => {
        var old = this.lastLiveSnapshot.get(d.id);
        if (!old) return true;
        return d.goalsHome !== old.goalsHome || d.goalsAway !== old.goalsAway || d.status !== old.status || d.elapsed !== old.elapsed;
      });

      if (toWrite.length > 0) writeCount = await this.repo.batchWrite(COLLECTIONS.LIVE_FIXTURES, toWrite);
      if (disappearedIds.length > 0) await deleteByIds(COLLECTIONS.LIVE_FIXTURES, disappearedIds);
      if (newDocs.length === 0 && oldIds.size > 0) await deleteByIds(COLLECTIONS.LIVE_FIXTURES, Array.from(oldIds));
    }

    this.lastLiveSnapshot.clear();
    newDocs.forEach((doc) => this.lastLiveSnapshot.set(doc.id, doc));

    var nearFTCount = newDocs.reduce((count, d) => {
      if (["ET", "BT", "P"].indexOf(d.status) !== -1) return count + 1;
      if (d.elapsed != null && d.elapsed >= 80) return count + 1;
      return count;
    }, 0);

    var dataChanged = writeCount > 0 || disappearedIds.length > 0 || isFirstPoll;

    if (dataChanged) {
      cache.invalidate("ft:live");
      if (transitioned > 0) cache.invalidate("ft:finished");

      try {
        // Group by Local Date (EAT) to write to separate documents
        const liveByDate = {};
        newDocs.forEach(doc => {
          const localDate = getLocalDateFromUtc(doc.date) || TODAY;
          if (!liveByDate[localDate]) liveByDate[localDate] = [];
          liveByDate[localDate].push(doc);
        });

        const finishedByDate = {};
        Array.from(this.lastFinishedSnapshot.values()).forEach(doc => {
          const localDate = getLocalDateFromUtc(doc.date) || TODAY;
          if (!finishedByDate[localDate]) finishedByDate[localDate] = [];
          finishedByDate[localDate].push(doc);
        });

        const allDates = new Set([...Object.keys(liveByDate), ...Object.keys(finishedByDate)]);
        for (const dateStr of allDates) {
          await snapshotWriter.writeFootballSnapshot(dateStr, {
            live: liveByDate[dateStr] || [],
            finished: finishedByDate[dateStr] || [],
          });
        }
      } catch (err) {
        logger.error("[LiveFixtures] Snapshot write failed: " + err.message);
      }
    }

    return {
      success: true, liveCount: newDocs.length, nearFT: nearFTCount, isNearFinish: nearFTCount > 0,
      total: newDocs.length, writes: writeCount, removed: transitioned, hasLive: newDocs.length > 0,
      duration: Date.now() - startTime, capReached: false, polled: true,
    };
  }

  async _handleTransitions(disappearedIds) {
    var toFinish = [];
    disappearedIds.forEach((id) => {
      var lastKnown = this.lastLiveSnapshot.get(id);
      if (!lastKnown) return;
      toFinish.push({
        id: lastKnown.id, date: lastKnown.date, timestamp: lastKnown.timestamp,
        status: "FT", statusLong: "Match Finished", elapsed: null,
        leagueId: lastKnown.leagueId, leagueName: lastKnown.leagueName, leagueCountry: lastKnown.leagueCountry,
        leagueLogo: lastKnown.leagueLogo, leagueFlag: lastKnown.leagueFlag, season: lastKnown.season, round: lastKnown.round,
        homeTeamId: lastKnown.homeTeamId, homeTeamName: lastKnown.homeTeamName, homeTeamLogo: lastKnown.homeTeamLogo,
        awayTeamId: lastKnown.awayTeamId, awayTeamName: lastKnown.awayTeamName, awayTeamLogo: lastKnown.awayTeamLogo,
        goalsHome: lastKnown.goalsHome, goalsAway: lastKnown.goalsAway,
        scoreHalftimeHome: lastKnown.scoreHalftimeHome, scoreHalftimeAway: lastKnown.scoreHalftimeAway,
        scoreFulltimeHome: lastKnown.scoreFulltimeHome, scoreFulltimeAway: lastKnown.scoreFulltimeAway,
        scoreExtratimeHome: lastKnown.scoreExtratimeHome, scoreExtratimeAway: lastKnown.scoreExtratimeAway,
        scorePenaltyHome: lastKnown.scorePenaltyHome, scorePenaltyAway: lastKnown.scorePenaltyAway,
        sport: "football", _updatedAt: new Date().toISOString(),
      });
    });

    if (toFinish.length === 0) return 0;
    await this.repo.batchUpsertFinished(toFinish);
    cache.invalidate("ft:finished");
    
    toFinish.forEach((doc) => this.lastFinishedSnapshot.set(String(doc.id), doc));

    // ★ FIX: Prevent lastFinishedSnapshot from growing infinitely and causing 1MB errors
    if (this.lastFinishedSnapshot.size > 50) {
      const keys = Array.from(this.lastFinishedSnapshot.keys());
      const keysToDelete = keys.slice(0, this.lastFinishedSnapshot.size - 50);
      keysToDelete.forEach(k => this.lastFinishedSnapshot.delete(k));
    }

    return toFinish.length;
  }

  normalize(fixture) {
    const f = fixture.fixture || {}, l = fixture.league || {}, t = fixture.teams || {}, g = fixture.goals || {}, s = fixture.score || {};
    const home = t.home || {}, away = t.away || {}, ht = s.halftime || {}, ft = s.fulltime || {}, et = s.extratime || {}, pen = s.penalty || {};
    return {
      id: f.id, date: f.date, timestamp: f.timestamp,
      status: f.status ? f.status.short : null, statusLong: f.status ? f.status.long : null, elapsed: f.status?.elapsed ?? null,
      referee: f.referee || null, leagueId: l.id, leagueName: l.name, leagueCountry: l.country, leagueLogo: l.logo, leagueFlag: l.flag || null,
      season: l.season, round: l.round, homeTeamId: home.id, homeTeamName: home.name, homeTeamLogo: home.logo,
      awayTeamId: away.id, awayTeamName: away.name, awayTeamLogo: away.logo,
      goalsHome: g.home ?? null, goalsAway: g.away ?? null,
      scoreHalftimeHome: ht.home ?? null, scoreHalftimeAway: ht.away ?? null,
      scoreFulltimeHome: ft.home ?? null, scoreFulltimeAway: ft.away ?? null,
      scoreExtratimeHome: et.home ?? null, scoreExtratimeAway: et.away ?? null,
      scorePenaltyHome: pen.home ?? null, scorePenaltyAway: pen.away ?? null,
      sport: "football", _updatedAt: new Date().toISOString(),
    };
  }

  _emptyResult(extra = {}) {
    return { success: false, liveCount: 0, nearFT: 0, isNearFinish: false, total: 0, writes: 0, removed: 0, hasLive: false, duration: 0, capReached: false, polled: false, ...extra };
  }
}

module.exports = LiveFixturesService;