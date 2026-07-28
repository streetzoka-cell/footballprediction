const { isLiveCapAvailable, incrementLiveCounter } = require("../config/api");
const { LIVE_POLLING, TRACK_ALL_LEAGUES, COLLECTIONS, TODAY, getLocalDateFromUtc, BLOCKED_LEAGUE_IDS, LEAGUES } = require("../config/constants");
const cache = require("../utils/cache");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");
const { calculateMatchScore, categorizeMatch } = require("./matchScoreEngine"); // NEW IMPORT

const providerManager = require('../config/providerManager'); 
const fixtureRepository = require('../repositories/fixtureRepository'); 
const { eventBus, EVENT } = require('../utils/eventBus'); 

class LiveFixturesService {
  constructor(repo, ftProcessor) {
    if (!repo) throw new Error("FixturesRepository is required for FT processing.");
    if (!ftProcessor) throw new Error("FinishedFixturesProcessor is required.");
    
    this.repo = repo; 
    this.ftProcessor = ftProcessor;
    
    this.lastLiveSnapshot = new Map();
    this.lastFinishedSnapshot = new Map();
    this.trackedLeagueIds = new Set(LEAGUES.filter((l) => l.active).map((l) => l.id));
  }

  async run() {
    if (!isLiveCapAvailable()) return this._emptyResult({ capReached: true });

    const startTime = Date.now();
    let rawFixtures;

    try {
      rawFixtures = await providerManager.getLive();
    } catch (err) { 
      logger.error(`[LiveFixtures] Provider fetch failed: ${err.message}`);
      return this._emptyResult(); 
    }

    incrementLiveCounter();

    if (!rawFixtures || rawFixtures.length === 0) {
      if (this.lastLiveSnapshot.size > 0) {
        const disappearedIds = Array.from(this.lastLiveSnapshot.keys());
        await this._handleTransitions(disappearedIds);
        await fixtureRepository.deleteLiveFixtures(disappearedIds);
        this.lastLiveSnapshot.clear();
        eventBus.emit(EVENT.CACHE_INVALIDATED, { key: 'ft:live' });
      }
      return this._emptyResult();
    }

    const filtered = TRACK_ALL_LEAGUES 
      ? (BLOCKED_LEAGUE_IDS.size > 0 ? rawFixtures.filter(f => !BLOCKED_LEAGUE_IDS.has(f.league?.id)) : rawFixtures)
      : rawFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));

    // NEW: Normalize and Score
    let newDocs = filtered.map((f) => this.normalize(f)).filter(f => f.homeTeamName && f.awayTeamName && f.homeTeamName !== 'TBD');
    
    // Inject scoring. 
    // ★ FIX: Do NOT drop HIDDEN matches from live updates! 
    // If a match is already in todayFixtures and it goes live, we MUST update its score.
    newDocs = newDocs.map(doc => {
      doc.matchScore = calculateMatchScore(doc);
      doc.category = categorizeMatch(doc.matchScore);
      return doc;
    });

    const newIds = new Set(newDocs.map((d) => d.id));
    const oldIds = new Set(this.lastLiveSnapshot.keys());
    const disappearedIds = [];
    
    oldIds.forEach((id) => { if (!newIds.has(id)) disappearedIds.push(id); });

    let transitioned = 0;
    if (disappearedIds.length > 0) {
      transitioned = await this._handleTransitions(disappearedIds);
    }

    let writeCount = 0;
    const isFirstPoll = this.lastLiveSnapshot.size === 0;

    if (isFirstPoll) {
      if (newDocs.length > 0) writeCount = await fixtureRepository.writeLiveFixtures(newDocs);
    } else {
      const toWrite = newDocs.filter((d) => {
        const old = this.lastLiveSnapshot.get(d.id);
        if (!old) return true;
        return d.goalsHome !== old.goalsHome || d.goalsAway !== old.goalsAway || d.status !== old.status || d.elapsed !== old.elapsed;
      });

      if (toWrite.length > 0) writeCount = await fixtureRepository.writeLiveFixtures(toWrite);
      if (disappearedIds.length > 0) await fixtureRepository.deleteLiveFixtures(disappearedIds);
    }

    this.lastLiveSnapshot.clear();
    newDocs.forEach((doc) => this.lastLiveSnapshot.set(doc.id, doc));

    const nearFTCount = newDocs.reduce((count, d) => {
      if (["ET", "BT", "P"].includes(d.status)) return count + 1;
      if (d.elapsed != null && d.elapsed >= 80) return count + 1;
      return count;
    }, 0);

    const dataChanged = writeCount > 0 || disappearedIds.length > 0 || isFirstPoll;

    if (dataChanged) {
      cache.invalidate("ft:live");
      if (transitioned > 0) cache.invalidate("ft:finished");

      eventBus.emit(EVENT.CACHE_INVALIDATED, { key: 'ft:live' });
      eventBus.emit(EVENT.LIVE_FIXTURES_UPDATED, { count: newDocs.length });

      try {
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
    const toFinish = [];
    disappearedIds.forEach((id) => {
      const lastKnown = this.lastLiveSnapshot.get(id);
      if (!lastKnown) return;
      
      toFinish.push({
        ...lastKnown,
        status: "FT",
        statusLong: "Match Finished",
        elapsed: null,
        _updatedAt: new Date().toISOString(),
      });
    });

    if (toFinish.length === 0) return 0;
    
    await this.repo.batchUpsertFinished(toFinish);
    cache.invalidate("ft:finished");
    eventBus.emit(EVENT.CACHE_INVALIDATED, { key: 'ft:finished' });
    
    toFinish.forEach((doc) => this.lastFinishedSnapshot.set(String(doc.id), doc));

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