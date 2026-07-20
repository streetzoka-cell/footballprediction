/*
 * dailyFixtures.js
 * Smart daily fetch with 3-day rollover.
 */

const { api, isBudgetAvailable } = require("../config/api");
const {
  LEAGUES,
  FINISHED_STATUSES,
  RESOLVED_STATUSES, // ★ NEW
  COLLECTIONS,
  getDateOffset,
  META_DOCS,
  TRACK_ALL_LEAGUES,
  BLOCKED_LEAGUE_IDS,
} = require("../config/constants");
const { getMeta, setMeta } = require("../config/firebase");
const { withRetry } = require("../utils/retry");
const cache = require("../utils/cache");
const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class DailyFixturesService {
  constructor(repo, teamsProcessor) {
    if (!repo) throw new Error("FixturesRepository is required.");
    if (!teamsProcessor) throw new Error("TeamsProcessor is required.");

    this.repo = repo;
    this.teamsProcessor = teamsProcessor;

    this.trackedLeagueIds = new Set(
      LEAGUES.filter((l) => l.active).map((l) => l.id)
    );

    this._docCache = {
      yesterday: [],
      today: [],
      tomorrow: [],
      yesterdayIds: new Set(),
      todayIds: new Set(),
      tomorrowIds: new Set(),
    };
  }

  async run() {
    const todayStr = getDateOffset(0);
    const tomorrowStr = getDateOffset(1);
    const yesterdayStr = getDateOffset(-1);

    logger.info(`[DailyFixtures] Run for ${tomorrowStr} (today: ${todayStr})`);
    const startTime = Date.now();

    // ★ NEW: Check and recover stale matches (e.g. yesterday's games still marked as 1H)
    await this._recoverStaleFixtures(todayStr);

    const meta = await getMeta(META_DOCS.FOOTBALL_SCHEDULER);
    const alreadyFetchedToday = meta?.lastDailyFetchDate === todayStr;

    if (alreadyFetchedToday) {
      if (this._docCache.tomorrow.length > 0) {
        const needsFill = this._docCache.yesterday.length === 0 || this._docCache.today.length === 0;
        if (!needsFill) {
          logger.info(`[DailyFixtures] Cache verified — skipping`);
          await this._writeSnapshot();
          return { total: 0, writes: 0, apiCalls: 0, duration: 0, deduped: true };
        }
        
        logger.info(`[DailyFixtures] Some days empty — filling...`);
        const fillResult = await this._fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, { skipTomorrow: true });
        cache.invalidatePrefix("ft:");
        await this._writeSnapshot();
        return { total: this._docCache.tomorrow.length, writes: fillResult.writes, apiCalls: fillResult.fetches, duration: Date.now() - startTime, deduped: true };
      }

      logger.info(`[DailyFixtures] Cache empty after restart — warming up...`);
      await this._warmupCache();
      
      if (this._docCache.tomorrow.length > 0) {
        const fillResult = await this._fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, { skipTomorrow: true });
        cache.invalidatePrefix("ft:");
        await this._writeSnapshot();
        return { total: this._docCache.tomorrow.length, writes: fillResult.writes, apiCalls: fillResult.fetches, duration: Date.now() - startTime, deduped: true };
      }
      logger.warn(`[DailyFixtures] Meta says done but no data found — re-fetching`);
    }

    let rolloverYesterday = 0, rolloverToday = 0, rolloverDeleted = 0, recoveredFT = 0;
    const yesterdayDocs = this._docCache.today;
    const todayDocs = this._docCache.tomorrow;
    const yesterdayPrevIds = this._docCache.todayIds;
    const todayPrevIds = this._docCache.tomorrowIds;

    try {
      if (yesterdayDocs.length > 0) {
        const r = await this.repo.diffWrite(COLLECTIONS.YESTERDAY_FIXTURES, yesterdayDocs, yesterdayPrevIds);
        rolloverYesterday = r.written;
        rolloverDeleted += r.deleted;
        const ftGames = yesterdayDocs.filter((d) => FINISHED_STATUSES.includes(d.status));
        if (ftGames.length > 0) {
          await this.repo.batchUpsertFinished(ftGames);
          recoveredFT = ftGames.length;
        }
      } else {
        if (this._docCache.yesterdayIds.size > 0) {
          const d = await this.repo.removeByIds(COLLECTIONS.YESTERDAY_FIXTURES, [...this._docCache.yesterdayIds]);
          rolloverDeleted += d;
        }
      }

      if (todayDocs.length > 0) {
        const r = await this.repo.diffWrite(COLLECTIONS.TODAY_FIXTURES, todayDocs, todayPrevIds);
        rolloverToday = r.written;
        rolloverDeleted += r.deleted;
      } else {
        if (this._docCache.todayIds.size > 0) {
          const d = await this.repo.removeByIds(COLLECTIONS.TODAY_FIXTURES, [...this._docCache.todayIds]);
          rolloverDeleted += d;
        }
      }
      logger.info(`[DailyFixtures] Rollover: ${rolloverYesterday}→yesterday, ${rolloverToday}→today, ${recoveredFT} FT, ${rolloverDeleted} stale deleted`);
    } catch (err) {
      logger.error(`[DailyFixtures] Rollover failed: ${err.message}`);
    }

    const fillResult = await this._fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, { skipTomorrow: true });

    let fetchTotal = 0, fetchWrites = 0, fetchSuccess = false, tomorrowNewIds = new Set(), tomorrowApiCall = 0;

    if (!isBudgetAvailable(1)) {
      logger.warn(`[DailyFixtures] Budget too low — skipping tomorrow fetch`);
      fetchSuccess = true;
    } else {
      try {
        const result = await this._fetchTomorrow(tomorrowStr);
        fetchTotal = result.total;
        fetchWrites = result.writes;
        tomorrowNewIds = result.newIds;
        fetchSuccess = true;
        tomorrowApiCall = result.total > 0 ? 1 : 0;
        if (result.raw.length > 0) await this.teamsProcessor.process(result.raw);
      } catch (err) {
        logger.error(`[DailyFixtures] Tomorrow fetch failed: ${err.message}`);
        fetchSuccess = false;
      }
    }

    if (this._docCache.yesterday.length === 0 && yesterdayDocs.length > 0) this._docCache.yesterday = yesterdayDocs;
    this._docCache.yesterdayIds = new Set(this._docCache.yesterday.map((d) => String(d.id)));

    if (this._docCache.today.length === 0 && todayDocs.length > 0) this._docCache.today = todayDocs;
    this._docCache.todayIds = new Set(this._docCache.today.map((d) => String(d.id)));

    if (fetchSuccess && tomorrowNewIds.size > 0) this._docCache.tomorrowIds = tomorrowNewIds;

    if (fetchSuccess) {
      await setMeta(META_DOCS.FOOTBALL_SCHEDULER, {
        lastDailyFetchDate: todayStr, lastTomorrowDate: tomorrowStr,
        rolloverYesterday, rolloverToday, recoveredFT, fetchTotal, fetchWrites,
        extraFetches: fillResult.fetches, extraWrites: fillResult.writes, verifiedAt: new Date().toISOString(),
      });
    }

    cache.invalidatePrefix("ft:");
    await this._writeSnapshot();

    const duration = Date.now() - startTime;
    const totalApiCalls = fillResult.fetches + tomorrowApiCall;
    logger.info(`[DailyFixtures] Complete — ${totalApiCalls} API calls, ${duration}ms`);

    return {
      total: fetchTotal, writes: fetchWrites + rolloverYesterday + rolloverToday + fillResult.writes,
      apiCalls: totalApiCalls, duration, rolloverYesterday, rolloverToday, recoveredFT,
      extraFetches: fillResult.fetches, extraWrites: fillResult.writes, deduped: false, metaUpdated: fetchSuccess,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // ★ NEW: STALE FT RECOVERY
  // Finds matches from previous days that were never updated to FT
  // and smoothly updates them by fetching exact dates from the API.
  // ═══════════════════════════════════════════════════════════════
  async _recoverStaleFixtures(todayStr) {
    try {
      const [yesterdayDocs, todayDocs] = await Promise.all([
        this.repo.getAllYesterday(),
        this.repo.getAllToday()
      ]);

      const isStale = (d) => {
        // If it's already resolved (FT, PST, CANC, etc.), it's not stale
        if (RESOLVED_STATUSES.includes(d.status)) return false;
        const matchDateStr = d.date ? new Date(d.date).toISOString().split("T")[0] : null;
        // If the match date is before today, and it's not resolved, it's stale
        return matchDateStr && matchDateStr < todayStr;
      };

      const staleYesterday = yesterdayDocs.filter(isStale);
      const staleToday = todayDocs.filter(isStale);
      const totalStale = staleYesterday.length + staleToday.length;

      if (totalStale === 0) {
        logger.info(`[DailyFixtures] No stale matches found. All previous games are resolved.`);
        return 0;
      }

      logger.info(`[DailyFixtures] Found ${totalStale} stale matches (Yesterday: ${staleYesterday.length}, Today: ${staleToday.length}). Recovering...`);
      
      if (!isBudgetAvailable(1)) {
        logger.warn(`[DailyFixtures] Budget too low — skipping stale recovery`);
        return 0;
      }

      const datesToFetch = new Set();
      [...staleYesterday, ...staleToday].forEach(d => {
        const matchDateStr = d.date ? new Date(d.date).toISOString().split("T")[0] : null;
        if (matchDateStr) datesToFetch.add(matchDateStr);
      });

      let recovered = 0;

      for (const dateStr of datesToFetch) {
        const raw = await withRetry(() => api.get("/fixtures", { params: { date: dateStr } }), `DailyFixtures:recoverStale:${dateStr}`);
        if (Object.keys(raw?.errors || {}).length > 0) continue;

        const allFixtures = raw?.response || [];
        const filtered = TRACK_ALL_LEAGUES 
          ? (BLOCKED_LEAGUE_IDS.size > 0 ? allFixtures.filter(f => !BLOCKED_LEAGUE_IDS.has(f.league?.id)) : allFixtures)
          : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));
          
        const updatedDocs = filtered.map((f) => this.normalize(f));
        const updatedMap = new Map(updatedDocs.map(d => [String(d.id), d]));

        const yestDocsToWrite = [];
        const todDocsToWrite = [];

        for (const s of staleYesterday) {
          const updated = updatedMap.get(String(s.id));
          if (updated) {
            yestDocsToWrite.push(updated);
            if (FINISHED_STATUSES.includes(updated.status)) recovered++;
          }
        }

        for (const s of staleToday) {
          const updated = updatedMap.get(String(s.id));
          if (updated) {
            todDocsToWrite.push(updated);
            if (FINISHED_STATUSES.includes(updated.status)) recovered++;
          }
        }

        // ★ SAFE WRITE: Pass empty set for prevIds so diffWrite deletes nothing else
        if (yestDocsToWrite.length > 0) {
          await this.repo.diffWrite(COLLECTIONS.YESTERDAY_FIXTURES, yestDocsToWrite, new Set());
          const ftGames = yestDocsToWrite.filter(d => FINISHED_STATUSES.includes(d.status));
          if (ftGames.length > 0) await this.repo.batchUpsertFinished(ftGames);
        }
        if (todDocsToWrite.length > 0) {
          await this.repo.diffWrite(COLLECTIONS.TODAY_FIXTURES, todDocsToWrite, new Set());
          const ftGames = todDocsToWrite.filter(d => FINISHED_STATUSES.includes(d.status));
          if (ftGames.length > 0) await this.repo.batchUpsertFinished(ftGames);
        }
      }

      if (totalStale > 0) {
        logger.info(`[DailyFixtures] Recovered ${recovered} stale matches to FT. Updating cache & snapshots...`);
        cache.invalidatePrefix("ft:");
        await this._warmupCache();
        await this._writeSnapshot();
      }
      return recovered;
    } catch (err) {
      logger.error(`[DailyFixtures] Stale recovery failed: ${err.message}`);
      return 0;
    }
  }

  async _writeSnapshot() {
    try {
      const todayStr = getDateOffset(0);
      const tomorrowStr = getDateOffset(1);
      const yesterdayStr = getDateOffset(-1);
      
      logger.info(`[DailyFixtures] Writing snapshots: Yest(${this._docCache.yesterday.length}), Today(${this._docCache.today.length}), Tom(${this._docCache.tomorrow.length})`);
      
      await Promise.all([
        snapshotWriter.writeFootballSnapshot(yesterdayStr, { matches: this._docCache.yesterday }),
        snapshotWriter.writeFootballSnapshot(todayStr, { matches: this._docCache.today }),
        snapshotWriter.writeFootballSnapshot(tomorrowStr, { matches: this._docCache.tomorrow })
      ]);
      
      logger.info(`[DailyFixtures] Snapshots written to Firestore for frontend`);
    } catch (err) {
      logger.error(`[DailyFixtures] Snapshot write failed: ${err.message}`);
    }
  }

  async _fillEmptyDays(yesterdayStr, todayStr, tomorrowStr, options = {}) {
    let fetches = 0, writes = 0;
    const filledDays = [];
    const daysToCheck = [
      { key: "yesterday", date: yesterdayStr, collection: COLLECTIONS.YESTERDAY_FIXTURES },
      { key: "today", date: todayStr, collection: COLLECTIONS.TODAY_FIXTURES },
      { key: "tomorrow", date: tomorrowStr, collection: COLLECTIONS.TOMORROW_FIXTURES, skip: options.skipTomorrow },
    ];

    for (const day of daysToCheck) {
      if (day.skip) continue;
      if (this._docCache[day.key].length === 0) {
        const result = await this._fetchDayForCollection(day.date, day.key, day.collection);
        fetches += result.fetches;
        writes += result.writes;
        if (result.fetches > 0) filledDays.push(day.key);
      }
    }
    return { fetches, writes, filledDays };
  }

  async _fetchDayForCollection(dateStr, dayKey, collection) {
    if (!isBudgetAvailable(1)) return { fetches: 0, writes: 0 };
    try {
      const raw = await withRetry(() => api.get("/fixtures", { params: { date: dateStr } }), `DailyFixtures:${dayKey}:fill`);
      const errors = raw?.errors || {};
      if (Object.keys(errors).length > 0) return { fetches: 1, writes: 0 };

      const allFixtures = raw?.response || [];
      const filtered = TRACK_ALL_LEAGUES 
        ? (BLOCKED_LEAGUE_IDS.size > 0 ? allFixtures.filter(f => !BLOCKED_LEAGUE_IDS.has(f.league?.id)) : allFixtures)
        : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));
        
      const docs = filtered.map((f) => this.normalize(f));

      let written = 0, newIds = new Set();
      if (docs.length > 0) {
        const result = await this.repo.diffWrite(collection, docs, this._docCache[`${dayKey}Ids`]);
        written = result.written;
        newIds = result.newIds;
      }

      this._docCache[dayKey] = docs;
      this._docCache[`${dayKey}Ids`] = newIds;
      return { fetches: 1, writes: written };
    } catch (err) {
      return { fetches: 1, writes: 0 };
    }
  }

  async _warmupCache() {
    try {
      const [yesterdayDocs, todayDocs, tomorrowDocs] = await Promise.all([
        this.repo.getAllYesterday(), this.repo.getAllToday(), this.repo.getAllTomorrow(),
      ]);
      if (yesterdayDocs.length > 0) { this._docCache.yesterday = yesterdayDocs; this._docCache.yesterdayIds = new Set(yesterdayDocs.map((d) => String(d.id))); }
      if (todayDocs.length > 0) { this._docCache.today = todayDocs; this._docCache.todayIds = new Set(todayDocs.map((d) => String(d.id))); }
      if (tomorrowDocs.length > 0) { this._docCache.tomorrow = tomorrowDocs; this._docCache.tomorrowIds = new Set(tomorrowDocs.map((d) => String(d.id))); }
    } catch (err) {}
  }

  async _fetchTomorrow(tomorrowStr) {
    let raw;
    try {
      raw = await withRetry(() => api.get("/fixtures", { params: { date: tomorrowStr } }), "DailyFixtures:tomorrow");
    } catch (err) { throw err; }

    if (Object.keys(raw?.errors || {}).length > 0) return { total: 0, writes: 0, raw: [], newIds: new Set() };

    const allFixtures = raw?.response || [];
    const filtered = TRACK_ALL_LEAGUES 
      ? (BLOCKED_LEAGUE_IDS.size > 0 ? allFixtures.filter(f => !BLOCKED_LEAGUE_IDS.has(f.league?.id)) : allFixtures)
      : allFixtures.filter((f) => this.trackedLeagueIds.has(f.league?.id));
      
    logger.info(`[DailyFixtures] Tomorrow API returned ${allFixtures.length} matches. Filtered to ${filtered.length}.`);

    const docs = filtered.map((f) => this.normalize(f));

    let written = 0, newIds = new Set();
    if (docs.length > 0) {
      const result = await this.repo.diffWrite(COLLECTIONS.TOMORROW_FIXTURES, docs, this._docCache.tomorrowIds);
      written = result.written;
      newIds = result.newIds;
      this._docCache.tomorrow = docs;
      this._docCache.tomorrowIds = newIds;
    } else {
      if (this._docCache.tomorrowIds.size > 0) {
        await this.repo.removeByIds(COLLECTIONS.TOMORROW_FIXTURES, [...this._docCache.tomorrowIds]);
        this._docCache.tomorrow = [];
        this._docCache.tomorrowIds = new Set();
      }
    }
    return { total: filtered.length, writes: written, raw: filtered, newIds };
  }

  normalize(fixture) {
    const f = fixture.fixture, l = fixture.league, t = fixture.teams, g = fixture.goals;
    return {
      id: f.id, date: f.date, timestamp: f.timestamp,
      status: f.status.short, statusLong: f.status.long, elapsed: f.status.elapsed ?? null,
      leagueId: l.id, leagueName: l.name, leagueCountry: l.country, leagueLogo: l.logo, leagueFlag: l.flag ?? null,
      season: l.season, round: l.round,
      homeTeamId: t.home.id, homeTeamName: t.home.name, homeTeamLogo: t.home.logo,
      awayTeamId: t.away.id, awayTeamName: t.away.name, awayTeamLogo: t.away.logo,
      goalsHome: g.home, goalsAway: g.away, sport: "football", _updatedAt: new Date().toISOString(),
    };
  }
}

module.exports = DailyFixturesService;