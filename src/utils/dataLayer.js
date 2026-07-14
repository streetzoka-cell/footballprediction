// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dataLayer.js
// DIRECT FIRESTORE DATA LAYER — Zero-Backend Architecture
//
// ★ SINGLE SOURCE for all date helpers
// ★ Integrates with EventBus for reactive updates
// ★ Clear separation: Zoka (guests) vs User (logged-in)
// ★ Predictions fetched by date — they never disappear
// ═══════════════════════════════════════════════════

import { db, auth } from './firebase';
import {
  collection, query, where, doc,
  getDoc, getDocs, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';

import {
  SPORT, TTL, TIMEOUT, PATHS, CACHE_KEY,
  getSnapshotDocId, getRefDocId,
} from './constants';

import { eventBus, EVENT } from './eventBus';

// ═══════════════════════════════════════════════════
// DATE HELPERS — SINGLE SOURCE OF TRUTH
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// DATE HELPERS — RE-EXPORTED FROM SINGLE SOURCE
// ═══════════════════════════════════════════════════════════════
export { 
  todayStr, yesterdayStr, tomorrowStr, getDateStr,
  getWeekStart, getMonthStart, getLocalDateFromUtc,
  formatTime, formatDateShort, isInRolloverWindow, getDateRange
} from './dates';

import { todayStr, getWeekStart, getMonthStart } from './dates';
// ═══════════════════════════════════════════════════
// TIMEOUT UTILITY
// ═══════════════════════════════════════════════════

function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════
// LOCAL STORAGE CACHE
// ═══════════════════════════════════════════════════

class LocalCache {
  constructor(prefix = 'fxdl') {
    this._prefix = prefix;
    this._cleanupInterval = null;
  }

  _key(key) { return `${this._prefix}:${key}`; }

  get(key, ttlMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > (ttlMs ?? entry.ttl)) return undefined;
      return entry.data;
    } catch { return undefined; }
  }

  getWithGrace(key, ttlMs, graceMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;
      const entry = JSON.parse(raw);
      const effectiveTtl = ttlMs ?? entry.ttl;
      const age = Date.now() - entry.ts;
      if (age > effectiveTtl + (graceMs ?? TTL.STALE_GRACE)) {
        localStorage.removeItem(this._key(key));
        return undefined;
      }
      return { data: entry.data, stale: age > effectiveTtl, age };
    } catch { return undefined; }
  }

  set(key, data, ttlMs) {
    try {
      localStorage.setItem(this._key(key), JSON.stringify({ data, ts: Date.now(), ttl: ttlMs }));
    } catch {
      this._cleanup();
      try {
        localStorage.setItem(this._key(key), JSON.stringify({ data, ts: Date.now(), ttl: ttlMs }));
      } catch { /* storage full */ }
    }
  }

  delete(key) { try { localStorage.removeItem(this._key(key)); } catch { /* */ } }

  deletePrefix(prefix) {
    const fullPrefix = this._key(prefix);
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(fullPrefix)) toDelete.push(k);
    }
    toDelete.forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } });
  }

  _cleanup() {
    const now = Date.now();
    const prefix = this._prefix + ':';
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) {
        try {
          const entry = JSON.parse(localStorage.getItem(k));
          if (now - entry.ts > entry.ttl * 2) toDelete.push(k);
        } catch { toDelete.push(k); }
      }
    }
    toDelete.forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } });
  }

  startPeriodicCleanup(intervalMs = 60_000) {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => this._cleanup(), intervalMs);
  }

  stopPeriodicCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// ═══════════════════════════════════════════════════
// DATA LAYER CLASS
// ═══════════════════════════════════════════════════

class DataLayer {
  constructor() {
    this._memory = new Map();
    this._locks = new Map();
    this._subscribers = new Map();
    this._local = new LocalCache();
    this._backgroundRefreshInProgress = new Set();
    this._local.startPeriodicCleanup();
  }

  // ─── Memory Cache ────────────────────────────────
  _memGet(key, ttlMs) {
    const entry = this._memory.get(key);
    if (!entry) return undefined;
    if (ttlMs > 0 && Date.now() - entry.ts > ttlMs) {
      this._memory.delete(key);
      return undefined;
    }
    return entry.data;
  }

  _memSet(key, data, ttlMs) {
    this._memory.set(key, { data, ts: Date.now(), ttl: ttlMs });
  }

  // ─── Main getOrSet — emits events on fresh fetch ─
  async getOrSet(key, fetchFn, ttlMs, options = {}) {
    const { graceMs, skipLocal, event, eventPayload } = options;

    // Layer 1: Memory
    const memData = this._memGet(key, ttlMs);
    if (memData !== undefined) return memData;

    // Layer 2: localStorage
    if (!skipLocal) {
      const localData = this._local.get(key, ttlMs);
      if (localData !== undefined) {
        this._memSet(key, localData, ttlMs);
        return localData;
      }

      // Layer 2.5: Stale-while-revalidate
      const staleEntry = this._local.getWithGrace(key, ttlMs, graceMs);
      if (staleEntry) {
        this._memSet(key, staleEntry.data, ttlMs);
        if (staleEntry.stale) {
          this._backgroundRefresh(key, fetchFn, ttlMs, { event, eventPayload });
        }
        return staleEntry.data;
      }
    }

    // Layer 3: Thundering herd protection
    const existingLock = this._locks.get(key);
    if (existingLock) {
      try { return await existingLock; } catch { /* fall through */ }
    }

    // Layer 4: Fetch from Firestore
    const promise = fetchFn()
      .then((data) => {
        this._memSet(key, data, ttlMs);
        if (!skipLocal) this._local.set(key, data, ttlMs);
        this._notifySubscribers(key, data);
        if (event) {
          const payload = typeof eventPayload === 'function'
            ? eventPayload(data)
            : (eventPayload || { key });
          eventBus.emit(event, payload);
        }
        return data;
      })
      .catch((err) => {
        console.warn(`[DataLayer] Fetch error for ${key}:`, err.message);
        throw err;
      })
      .finally(() => {
        this._locks.delete(key);
        this._backgroundRefreshInProgress.delete(key);
      });

    this._locks.set(key, promise);
    return promise;
  }

  _backgroundRefresh(key, fetchFn, ttlMs, options = {}) {
    if (this._backgroundRefreshInProgress.has(key) || this._locks.has(key)) return;
    this._backgroundRefreshInProgress.add(key);

    queueMicrotask(async () => {
      try {
        const data = await fetchFn();
        this._memSet(key, data, ttlMs);
        this._local.set(key, data, ttlMs);
        this._notifySubscribers(key, data);
        if (options.event) {
          const payload = typeof options.eventPayload === 'function'
            ? options.eventPayload(data)
            : (options.eventPayload || { key, background: true });
          eventBus.emit(options.event, payload);
        }
      } catch (err) {
        console.debug(`[DataLayer] Background refresh failed for ${key}:`, err.message);
      } finally {
        this._backgroundRefreshInProgress.delete(key);
      }
    });
  }

  // ─── Subscriptions ───────────────────────────────
  subscribe(key, callback) {
    if (!this._subscribers.has(key)) this._subscribers.set(key, new Set());
    this._subscribers.get(key).add(callback);
    return () => {
      const subs = this._subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) this._subscribers.delete(key);
      }
    };
  }

  _notifySubscribers(key, data) {
    const subs = this._subscribers.get(key);
    if (!subs) return;
    queueMicrotask(() => {
      subs.forEach((cb) => {
        try { cb(data); } catch (err) {
          console.warn(`[DataLayer] Subscriber error for ${key}:`, err.message);
        }
      });
    });
  }

  // ─── Cache Invalidation ─────────────────────────
  invalidate(key) {
    this._memory.delete(key);
    this._local.delete(key);
    eventBus.emit(EVENT.CACHE_INVALIDATED, { key });
  }

  invalidatePrefix(prefix) {
    const keys = [];
    for (const key of this._memory.keys()) {
      if (key.startsWith(prefix)) {
        this._memory.delete(key);
        keys.push(key);
      }
    }
    this._local.deletePrefix(prefix);
    eventBus.emit(EVENT.CACHE_INVALIDATED, { prefix, keys });
  }

  clear() {
    this._memory.clear();
    this._locks.clear();
    this._local.deletePrefix('');
    eventBus.emit(EVENT.CACHE_INVALIDATED, { cleared: true });
  }

  getStats() {
    return {
      memoryCacheSize: this._memory.size,
      pendingLocks: this._locks.size,
      backgroundRefreshes: this._backgroundRefreshInProgress.size,
      subscribers: this._subscribers.size,
    };
  }

  // ═══════════════════════════════════════════════════
  // DATA FETCHERS
  // ═══════════════════════════════════════════════════

  // ─── Football Fixtures ───────────────────────────
  async fetchFootballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.snapshot(SPORT.FOOTBALL, dateStr);
    const hour = new Date().getUTCHours();
    const ttl = (hour >= 12 && hour <= 23) ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, dateStr)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? snap.data() : null;
    }, ttl, {
      event: EVENT.FOOTBALL_UPDATED,
      eventPayload: (data) => ({ sport: SPORT.FOOTBALL, dateStr, snapshot: data }),
    });
  }

  async fetchFootballFixtures(dateStr) {
    const snapshot = await this.fetchFootballSnapshot(dateStr);
    if (!snapshot) return { today: [], tomorrow: [], yesterday: [], live: [], finished: [], updatedAt: null };
    return {
      today: snapshot.today || [],
      tomorrow: snapshot.tomorrow || [],
      yesterday: snapshot.yesterday || [],
      live: snapshot.live || [],
      finished: snapshot.finished || [],
      updatedAt: snapshot.updatedAt || null,
    };
  }

  // ─── Basketball Fixtures ─────────────────────────
  async fetchBasketballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.snapshot(SPORT.BASKETBALL, dateStr);
    const docId = getSnapshotDocId(SPORT.BASKETBALL, dateStr);
    const hour = new Date().getUTCHours();
    const ttl = (hour >= 0 && hour <= 10) ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, docId)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? snap.data() : null;
    }, ttl, {
      event: EVENT.BASKETBALL_UPDATED,
      eventPayload: (data) => ({ sport: SPORT.BASKETBALL, dateStr, snapshot: data }),
    });
  }

  async fetchBasketballFixtures(dateStr) {
    const snapshot = await this.fetchBasketballSnapshot(dateStr);
    if (!snapshot) return { today: [], tomorrow: [], yesterday: [], live: [], finished: [], updatedAt: null };
    return {
      today: snapshot.today || [],
      tomorrow: snapshot.tomorrow || [],
      yesterday: snapshot.yesterday || [],
      live: snapshot.live || [],
      finished: snapshot.finished || [],
      updatedAt: snapshot.updatedAt || null,
    };
  }

  // ─── Generic Snapshot Fetch ──────────────────────
  async fetchSnapshot(sport, dateStr) {
    return sport === SPORT.BASKETBALL
      ? this.fetchBasketballSnapshot(dateStr)
      : this.fetchFootballSnapshot(dateStr);
  }

  async fetchFixtures(sport, dateStr) {
    return sport === SPORT.BASKETBALL
      ? this.fetchBasketballFixtures(dateStr)
      : this.fetchFootballFixtures(dateStr);
  }

  // ─── Reference Data ─────────────────────────────
  async fetchLeagues(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('leagues', sport);
    return this.getOrSet(CACHE_KEY.reference(docId), async () => {
      if (!db) return [];
      const snap = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, docId)), TIMEOUT.REFERENCE, null);
      return snap?.exists() ? (snap.data().data || []) : [];
    }, TTL.REFERENCE);
  }

  async fetchTeams(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('teams', sport);
    return this.getOrSet(CACHE_KEY.reference(docId), async () => {
      if (!db) return [];
      const snap = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, docId)), TIMEOUT.REFERENCE, null);
      return snap?.exists() ? (snap.data().data || []) : [];
    }, TTL.REFERENCE);
  }

  async fetchStandings(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('standings', sport);
    return this.getOrSet(CACHE_KEY.reference(docId), async () => {
      if (!db) return [];
      const snap = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, docId)), TIMEOUT.REFERENCE, null);
      return snap?.exists() ? (snap.data().data || []) : [];
    }, TTL.REFERENCE);
  }

  // ═══════════════════════════════════════════════════
  // ★ ZOKA PICKS — Platform predictions for GUESTS
  // ═══════════════════════════════════════════════════

  async fetchZokaPicks(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.zokaPicks(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return null;
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.ZOKA_PICKS, dateStr)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? snap.data() : null;
    }, TTL.ZOKA_PICKS, {
      event: EVENT.ZOKA_PICKS_UPDATED,
      eventPayload: (data) => ({ dateStr, picks: data }),
    });
  }

  async fetchZokaVotes(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.zokaVotes(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return { stats: {} };
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.ZOKA_VOTE_STATS, dateStr)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? { stats: snap.data()?.stats || {} } : { stats: {} };
    }, TTL.ZOKA_VOTES);
  }

  // ═══════════════════════════════════════════════════
  // ★ FEATURED MATCHES — For logged-in USER predictions
  // ═══════════════════════════════════════════════════

  async fetchActivePredictions(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.activePredictions(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return [];

      // Try snapshot first (fast, single read)
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr)),
        TIMEOUT.SNAPSHOT_READ, null
      );

      if (snap?.exists()) return snap.data().predictions || [];

      // Fallback: collection query
      const querySnap = await withTimeout(
        getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr))),
        TIMEOUT.COLLECTION_QUERY, { docs: [] }
      );

      return querySnap?.docs
        ? querySnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.priority || 0) - (a.priority || 0))
        : [];
    }, TTL.ACTIVE_PREDICTIONS, {
      event: EVENT.PREDICTIONS_UPDATED,
      eventPayload: (data) => ({ dateStr, predictions: data }),
    });
  }

  // ═══════════════════════════════════════════════════
  // ★ USER PREDICTIONS — Never deleted, grouped by date
  // ═══════════════════════════════════════════════════

  async fetchUserPredictions(uid, dateStr) {
    if (!uid || !db) return {};
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.userPredictions(uid, dateStr);

    return this.getOrSet(key, async () => {
      // Try indexed query (userId + matchDate)
      let snap = await withTimeout(
        getDocs(query(
          collection(db, PATHS.USER_PREDICTIONS),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )),
        TIMEOUT.USER_QUERY, null
      );

      // Fallback: userId only (for old data missing matchDate)
      if (!snap || snap.empty) {
        snap = await withTimeout(
          getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '==', uid))),
          TIMEOUT.USER_QUERY, null
        );
      }

      if (!snap || snap.empty) return {};

      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.matchDate && data.matchDate !== dateStr) return;
        
        // Key by all possible IDs so lookups always work
        const keys = new Set([d.id]);
        if (data.predId) keys.add(String(data.predId));
        if (data.matchId) keys.add(String(data.matchId));
        
        const entry = { id: d.id, ...data };
        keys.forEach((k) => { map[k] = entry; });
      });

      return map;
    }, TTL.USER_DATA);
  }

  async fetchPredictionResults(uid, dateStr) {
    if (!uid || !db) return { results: [], resultMap: {} };
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.predictionResults(uid, dateStr);

    return this.getOrSet(key, async () => {
      let snap = await withTimeout(
        getDocs(query(
          collection(db, PATHS.PREDICTION_RESULTS),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )),
        TIMEOUT.USER_QUERY, null
      );

      if (!snap || snap.empty) {
        snap = await withTimeout(
          getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('userId', '==', uid))),
          TIMEOUT.USER_QUERY, null
        );
      }

      if (!snap || snap.empty) return { results: [], resultMap: {} };

      const results = [];
      const resultMap = {};

      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.matchDate && data.matchDate !== dateStr) return;
        const entry = { id: d.id, ...data };
        results.push(entry);
        if (data.matchId) resultMap[String(data.matchId)] = entry;
      });

      results.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
      return { results, resultMap };
    }, TTL.USER_DATA);
  }

  async fetchUserPoints(uid) {
    if (!uid || !db) return null;
    const key = CACHE_KEY.userPoints(uid);

    return this.getOrSet(key, async () => {
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.USER_POINTS_TOTAL, uid)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? snap.data() : null;
    }, TTL.USER_DATA);
  }

  // ═══════════════════════════════════════════════════
  // ★ LEADERBOARDS — Daily → Weekly → Monthly → GOAT
  // ═══════════════════════════════════════════════════

  async fetchDailyLeaderboard(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.dailyLeaderboard(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return null;
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      return snap?.exists() ? snap.data() : null;
    }, TTL.DAILY_LEADERBOARD, {
      event: EVENT.DAILY_LEADERBOARD_UPDATED,
      eventPayload: (data) => ({ dateStr, leaderboard: data }),
    });
  }

  async fetchHistoricalLeaderboard(period) {
    const docId = this._getPeriodDocId(period);
    const key = CACHE_KEY.historical(period);

    return this.getOrSet(key, async () => {
      if (!db) return { entries: [], stale: true };
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId)),
        TIMEOUT.SNAPSHOT_READ, null
      );
      if (!snap?.exists()) return { entries: [], stale: true };
      const data = snap.data();
      return { entries: data.entries || [], stale: false };
    }, TTL.HISTORICAL, {
      event: EVENT.LEADERBOARD_UPDATED,
      eventPayload: (data) => ({ period, leaderboard: data }),
    });
  }

  // ─── Helpers ─────────────────────────────────────
  getScoreMap(predictions) {
    const map = new Map();
    predictions?.forEach((p) => {
      if (p.status === 'finished' && p.homeScore != null) {
        map.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
      }
    });
    return map;
  }

  _getPeriodDocId(period) {
    if (period === 'goat') return 'current';
    if (period === 'weekly') return `weekly_${getWeekStart()}`;
    if (period === 'monthly') return `monthly_${getMonthStart()}`;
    return period;
  }

  // ─── Reactive Subscriptions ─────────────────────
  onFixturesUpdated(sport, callback) {
    const event = sport === SPORT.BASKETBALL ? EVENT.BASKETBALL_UPDATED : EVENT.FOOTBALL_UPDATED;
    return eventBus.on(event, callback);
  }

  onPredictionsUpdated(callback) { return eventBus.on(EVENT.PREDICTIONS_UPDATED, callback); }
  onLeaderboardUpdated(callback) { return eventBus.on(EVENT.LEADERBOARD_UPDATED, callback); }
  onCacheInvalidated(callback) { return eventBus.on(EVENT.CACHE_INVALIDATED, callback); }
}

// ═══════════════════════════════════════════════════
// USER PREDICTION WRITE OPERATIONS
// ═══════════════════════════════════════════════════

/** Save a user prediction. Doc ID = matchId for reliable lookups. */
export async function saveUserPrediction({ matchId, homeScore, awayScore, matchDate, extra = {} }) {
  const uid = auth.currentUser?.uid;
  if (!uid || !matchId) throw new Error('Not signed in or missing matchId');

  const docId = String(matchId);
  await setDoc(doc(db, PATHS.USER_PREDICTIONS, docId), {
    userId: uid,
    matchId: docId,
    predId: docId,
    matchDate: matchDate || todayStr(),
    homeScore: Number(homeScore),
    awayScore: Number(awayScore),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...extra,
  }, { merge: true });
}

/** Delete a user prediction. */
export async function deleteUserPrediction(matchId) {
  const uid = auth.currentUser?.uid;
  if (!uid || !matchId) return;
  await deleteDoc(doc(db, PATHS.USER_PREDICTIONS, String(matchId)));
}

// ═══════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════
export const dataLayer = new DataLayer();
export default dataLayer;