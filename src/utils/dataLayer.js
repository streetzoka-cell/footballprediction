// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/utils/dataLayer.js
// DIRECT FIRESTORE DATA LAYER — Zero-Backend Architecture
//
// ★ ENHANCED: Now integrates with EventBus for reactive updates
// ★ ENHANCED: Uses shared constants from constants.js
// ★ ENHANCED: Emits events on every cache update
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from './firebase';
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';

import {
  SPORT,
  SPORT_PREFIX,
  TTL,
  TIMEOUT,
  PATHS,
  CACHE_KEY,
  getSnapshotDocId,
  getRefDocId,
} from './constants';

import { eventBus, EVENT } from './eventBus';  // ★ EVENT comes from here, not constants

// ═══════════════════════════════════════════════════════════════
// TIMEOUT UTILITY
// ═══════════════════════════════════════════════════════════════

function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ═══════════════════════════════════════════════════════════════
// DATE HELPERS
// ═══════════════════════════════════════════════════════════════

export const todayStr = () => new Date().toISOString().split('T')[0];

export const yesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

export const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

export const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff)
    .toISOString()
    .split('T')[0];
};

export const getMonthStart = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE CACHE
// ═══════════════════════════════════════════════════════════════

class LocalCache {
  constructor(prefix = 'fxdl') {
    this._prefix = prefix;
    this._cleanupInterval = null;
  }

  _key(key) {
    return `${this._prefix}:${key}`;
  }

  get(key, ttlMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;

      const entry = JSON.parse(raw);
      const effectiveTtl = ttlMs ?? entry.ttl;

      if (Date.now() - entry.ts > effectiveTtl) {
        return undefined;
      }

      return entry.data;
    } catch {
      return undefined;
    }
  }

  getWithGrace(key, ttlMs, graceMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;

      const entry = JSON.parse(raw);
      const effectiveTtl = ttlMs ?? entry.ttl;
      const age = Date.now() - entry.ts;
      const maxAge = effectiveTtl + (graceMs ?? TTL.STALE_GRACE);

      if (age > maxAge) {
        localStorage.removeItem(this._key(key));
        return undefined;
      }

      return {
        data: entry.data,
        stale: age > effectiveTtl,
        age,
      };
    } catch {
      return undefined;
    }
  }

  set(key, data, ttlMs) {
    try {
      localStorage.setItem(this._key(key), JSON.stringify({
        data,
        ts: Date.now(),
        ttl: ttlMs,
      }));
    } catch (err) {
      this._cleanup();
      try {
        localStorage.setItem(this._key(key), JSON.stringify({
          data,
          ts: Date.now(),
          ttl: ttlMs,
        }));
      } catch {
        // Storage full — give up
      }
    }
  }

  delete(key) {
    try {
      localStorage.removeItem(this._key(key));
    } catch { /* ignore */ }
  }

  deletePrefix(prefix) {
    const fullPrefix = this._key(prefix);
    const toDelete = [];

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(fullPrefix)) {
        toDelete.push(k);
      }
    }

    toDelete.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
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
          if (now - entry.ts > entry.ttl * 2) {
            toDelete.push(k);
          }
        } catch {
          toDelete.push(k);
        }
      }
    }

    toDelete.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
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

// ═══════════════════════════════════════════════════════════════
// DATA LAYER CLASS — ENHANCED WITH EVENT BUS
// ═══════════════════════════════════════════════════════════════

class DataLayer {
  constructor() {
    this._memory = new Map();
    this._locks = new Map();
    this._subscribers = new Map();
    this._local = new LocalCache();
    this._backgroundRefreshInProgress = new Set();

    // Track which keys map to which events for automatic emission
    this._keyEventMap = new Map();

    this._local.startPeriodicCleanup();
  }

  // ─────────────────────────────────────────────────────────
  // MEMORY CACHE
  // ─────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────
  // MAIN GET OR SET — Now emits events
  // ─────────────────────────────────────────────────────────

  async getOrSet(key, fetchFn, ttlMs, options = {}) {
    const { 
      graceMs = TTL.STALE_GRACE, 
      skipLocal = false,
      event,  // ★ NEW: Event to emit on update
      eventPayload, // ★ NEW: Payload builder or static payload
    } = options;

    // Layer 1: Memory cache
    const memData = this._memGet(key, ttlMs);
    if (memData !== undefined) return memData;

    // Layer 2: localStorage cache
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
      try {
        return await existingLock;
      } catch {
        // Lock failed, fall through
      }
    }

    // Layer 4: Fetch from Firestore
    const promise = fetchFn()
      .then((data) => {
        this._memSet(key, data, ttlMs);
        if (!skipLocal) {
          this._local.set(key, data, ttlMs);
        }
        this._notifySubscribers(key, data);
        
        // ★ Emit event if configured
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

  /**
   * Background refresh with event emission
   */
  _backgroundRefresh(key, fetchFn, ttlMs, options = {}) {
    if (this._backgroundRefreshInProgress.has(key)) return;
    if (this._locks.has(key)) return;

    this._backgroundRefreshInProgress.add(key);

    queueMicrotask(async () => {
      try {
        const data = await fetchFn();
        this._memSet(key, data, ttlMs);
        this._local.set(key, data, ttlMs);
        this._notifySubscribers(key, data);
        
        // ★ Emit event on background refresh too
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

  // ─────────────────────────────────────────────────────────
  // SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────

  subscribe(key, callback) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
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

  // ─────────────────────────────────────────────────────────
  // CACHE INVALIDATION — Now emits events
  // ─────────────────────────────────────────────────────────

  invalidate(key) {
    this._memory.delete(key);
    this._local.delete(key);
    
    // ★ Emit cache invalidation event
    eventBus.emit(EVENT.CACHE_INVALIDATED, { key });
  }

  invalidatePrefix(prefix) {
    const invalidatedKeys = [];
    
    for (const key of this._memory.keys()) {
      if (key.startsWith(prefix)) {
        this._memory.delete(key);
        invalidatedKeys.push(key);
      }
    }
    this._local.deletePrefix(prefix);
    
    // ★ Emit cache invalidation event
    eventBus.emit(EVENT.CACHE_INVALIDATED, { prefix, keys: invalidatedKeys });
  }

  clear() {
    this._memory.clear();
    this._locks.clear();
    this._local.deletePrefix('');
    
    eventBus.emit(EVENT.CACHE_INVALIDATED, { cleared: true });
  }

  // ─────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────

  getStats() {
    return {
      memoryCacheSize: this._memory.size,
      pendingLocks: this._locks.size,
      backgroundRefreshes: this._backgroundRefreshInProgress.size,
      subscribers: this._subscribers.size,
    };
  }

  // ═════════════════════════════════════════════════════════
  // DATA FETCHERS
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // FOOTBALL FIXTURES — 1 DOC READ + EVENT EMISSION
  // ─────────────────────────────────────────────────────────

  async fetchFootballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.snapshot(SPORT.FOOTBALL, dateStr);

    const now = new Date();
    const hour = now.getUTCHours();
    const isMatchHours = hour >= 12 && hour <= 23;
    const ttl = isMatchHours ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, dateStr)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return null;

      return snap.data();
    }, ttl, {
      event: EVENT.FOOTBALL_UPDATED,
      eventPayload: (data) => ({ sport: SPORT.FOOTBALL, dateStr, snapshot: data }),
    });
  }

  async fetchFootballFixtures(dateStr) {
    const snapshot = await this.fetchFootballSnapshot(dateStr);
    if (!snapshot) {
      return {
        today: [],
        tomorrow: [],
        yesterday: [],
        live: [],
        finished: [],
        updatedAt: null,
      };
    }

    return {
      today: snapshot.today || [],
      tomorrow: snapshot.tomorrow || [],
      yesterday: snapshot.yesterday || [],
      live: snapshot.live || [],
      finished: snapshot.finished || [],
      updatedAt: snapshot.updatedAt || null,
    };
  }

  // ─────────────────────────────────────────────────────────
  // BASKETBALL FIXTURES — 1 DOC READ + EVENT EMISSION
  // ─────────────────────────────────────────────────────────

  async fetchBasketballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.snapshot(SPORT.BASKETBALL, dateStr);
    const docId = getSnapshotDocId(SPORT.BASKETBALL, dateStr);

    const now = new Date();
    const hour = now.getUTCHours();
    const isMatchHours = hour >= 0 && hour <= 10;
    const ttl = isMatchHours ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, docId)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return null;

      return snap.data();
    }, ttl, {
      event: EVENT.BASKETBALL_UPDATED,
      eventPayload: (data) => ({ sport: SPORT.BASKETBALL, dateStr, snapshot: data }),
    });
  }

  async fetchBasketballFixtures(dateStr) {
    const snapshot = await this.fetchBasketballSnapshot(dateStr);
    if (!snapshot) {
      return {
        today: [],
        tomorrow: [],
        yesterday: [],
        live: [],
        finished: [],
        updatedAt: null,
      };
    }

    return {
      today: snapshot.today || [],
      tomorrow: snapshot.tomorrow || [],
      yesterday: snapshot.yesterday || [],
      live: snapshot.live || [],
      finished: snapshot.finished || [],
      updatedAt: snapshot.updatedAt || null,
    };
  }

  // ─────────────────────────────────────────────────────────
  // GENERIC SNAPSHOT FETCH (for any sport)
  // ─────────────────────────────────────────────────────────

  async fetchSnapshot(sport, dateStr) {
    if (sport === SPORT.BASKETBALL) {
      return this.fetchBasketballSnapshot(dateStr);
    }
    return this.fetchFootballSnapshot(dateStr);
  }

  async fetchFixtures(sport, dateStr) {
    if (sport === SPORT.BASKETBALL) {
      return this.fetchBasketballFixtures(dateStr);
    }
    return this.fetchFootballFixtures(dateStr);
  }

  // ─────────────────────────────────────────────────────────
  // REFERENCE DATA — 1 DOC READ EACH
  // ─────────────────────────────────────────────────────────

  async fetchLeagues(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('leagues', sport);
    const key = CACHE_KEY.reference(docId);

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.REFERENCE_DATA, docId)),
        TIMEOUT.REFERENCE,
        null
      );

      if (!snap || !snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  async fetchTeams(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('teams', sport);
    const key = CACHE_KEY.reference(docId);

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.REFERENCE_DATA, docId)),
        TIMEOUT.REFERENCE,
        null
      );

      if (!snap || !snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  async fetchStandings(sport = SPORT.FOOTBALL) {
    const docId = getRefDocId('standings', sport);
    const key = CACHE_KEY.reference(docId);

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.REFERENCE_DATA, docId)),
        TIMEOUT.REFERENCE,
        null
      );

      if (!snap || !snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  // ─────────────────────────────────────────────────────────
  // ACTIVE PREDICTIONS — 1 DOC READ (with fallback query)
  // ─────────────────────────────────────────────────────────

  async fetchActivePredictions(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.activePredictions(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return [];

      // Try snapshot first
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (snap && snap.exists()) {
        return snap.data().predictions || [];
      }

      // Fallback: query collection
      console.debug('[DataLayer] No prediction snapshot — falling back to collection query');

      const querySnap = await withTimeout(
        getDocs(
          query(
            collection(db, PATHS.ACTIVE_PREDICTIONS),
            where('matchDate', '==', dateStr)
          )
        ),
        TIMEOUT.COLLECTION_QUERY,
        { docs: [] }
      );

      if (!querySnap || !querySnap.docs) return [];

      return querySnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }, TTL.ACTIVE_PREDICTIONS, {
      event: EVENT.PREDICTIONS_UPDATED,
      eventPayload: (data) => ({ dateStr, predictions: data }),
    });
  }

  // ─────────────────────────────────────────────────────────
  // DAILY LEADERBOARD — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchDailyLeaderboard(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.dailyLeaderboard(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return null;

      return snap.data();
    }, TTL.DAILY_LEADERBOARD, {
      event: EVENT.DAILY_LEADERBOARD_UPDATED,
      eventPayload: (data) => ({ dateStr, leaderboard: data }),
    });
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA PICKS — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchZokaPicks(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.zokaPicks(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.ZOKA_PICKS, dateStr)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return null;

      return snap.data();
    }, TTL.ZOKA_PICKS, {
      event: EVENT.ZOKA_PICKS_UPDATED,
      eventPayload: (data) => ({ dateStr, picks: data }),
    });
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA VOTES — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchZokaVotes(dateStr) {
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.zokaVotes(dateStr);

    return this.getOrSet(key, async () => {
      if (!db) return { stats: {} };

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.ZOKA_VOTE_STATS, dateStr)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return { stats: {} };

      return { stats: snap.data()?.stats || {} };
    }, TTL.ZOKA_VOTES);
  }

  // ─────────────────────────────────────────────────────────
  // USER PREDICTIONS — QUERY READ
  // ─────────────────────────────────────────────────────────

  async fetchUserPredictions(uid, dateStr) {
    if (!uid || !db) return {};
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.userPredictions(uid, dateStr);

    return this.getOrSet(key, async () => {
      const snap = await withTimeout(
        getDocs(
          query(
            collection(db, PATHS.USER_PREDICTIONS),
            where('userId', '==', uid),
            where('matchDate', '==', dateStr)
          )
        ),
        TIMEOUT.USER_QUERY,
        { docs: [] }
      );

      if (!snap || !snap.docs) return {};

      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.predId] = { id: d.id, ...data };
      });

      return map;
    }, TTL.USER_DATA);
  }

  // ─────────────────────────────────────────────────────────
  // PREDICTION RESULTS — QUERY READ
  // ─────────────────────────────────────────────────────────

  async fetchPredictionResults(uid, dateStr) {
    if (!uid || !db) return { results: [], resultMap: {} };
    dateStr = dateStr || todayStr();
    const key = CACHE_KEY.predictionResults(uid, dateStr);

    return this.getOrSet(key, async () => {
      const snap = await withTimeout(
        getDocs(
          query(
            collection(db, PATHS.PREDICTION_RESULTS),
            where('userId', '==', uid),
            where('matchDate', '==', dateStr)
          )
        ),
        TIMEOUT.USER_QUERY,
        { docs: [] }
      );

      if (!snap || !snap.docs) return { results: [], resultMap: {} };

      const results = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));

      const resultMap = {};
      results.forEach((r) => {
        resultMap[String(r.matchId)] = r;
      });

      return { results, resultMap };
    }, TTL.USER_DATA);
  }

  // ─────────────────────────────────────────────────────────
  // USER POINTS — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchUserPoints(uid) {
    if (!uid || !db) return null;
    const key = CACHE_KEY.userPoints(uid);

    return this.getOrSet(key, async () => {
      const snap = await withTimeout(
        getDoc(doc(db, PATHS.USER_POINTS_TOTAL, uid)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return null;

      return snap.data();
    }, TTL.USER_DATA);
  }

  // ─────────────────────────────────────────────────────────
  // HISTORICAL LEADERBOARD — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchHistoricalLeaderboard(period) {
    const docId = this._getPeriodDocId(period);
    const key = CACHE_KEY.historical(period);

    return this.getOrSet(key, async () => {
      if (!db) return { entries: [], stale: true };

      const snap = await withTimeout(
        getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId)),
        TIMEOUT.SNAPSHOT_READ,
        null
      );

      if (!snap || !snap.exists()) return { entries: [], stale: true };

      const data = snap.data();
      return { entries: data.entries || [], stale: false };
    }, TTL.HISTORICAL, {
      event: EVENT.LEADERBOARD_UPDATED,
      eventPayload: (data) => ({ period, leaderboard: data }),
    });
  }

  // ─────────────────────────────────────────────────────────
  // COMPUTED HELPERS
  // ─────────────────────────────────────────────────────────

  getScoreMap(predictions) {
    const map = new Map();
    if (predictions) {
      predictions.forEach((p) => {
        if (p.status === 'finished' && p.homeScore != null) {
          map.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
        }
      });
    }
    return map;
  }

  _getPeriodDocId(period) {
    if (period === 'goat') return 'current';
    if (period === 'weekly') return `weekly_${getWeekStart()}`;
    if (period === 'monthly') return `monthly_${getMonthStart()}`;
    return period;
  }

  // ─────────────────────────────────────────────────────────
  // REACTIVE SUBSCRIPTIONS
  //
  // Subscribe to data updates via event bus.
  // Returns unsubscribe function.
  // ─────────────────────────────────────────────────────────

  /**
   * Subscribe to fixture updates for a sport.
   * @param {string} sport - 'football' or 'basketball'
   * @param {Function} callback - Called with { sport, dateStr, snapshot }
   * @returns {Function} Unsubscribe
   */
  onFixturesUpdated(sport, callback) {
    const event = sport === SPORT.BASKETBALL 
      ? EVENT.BASKETBALL_UPDATED 
      : EVENT.FOOTBALL_UPDATED;
    return eventBus.on(event, callback);
  }

  /**
   * Subscribe to prediction updates.
   * @param {Function} callback - Called with { dateStr, predictions }
   * @returns {Function} Unsubscribe
   */
  onPredictionsUpdated(callback) {
    return eventBus.on(EVENT.PREDICTIONS_UPDATED, callback);
  }

  /**
   * Subscribe to leaderboard updates.
   * @param {Function} callback - Called with { period, leaderboard }
   * @returns {Function} Unsubscribe
   */
  onLeaderboardUpdated(callback) {
    return eventBus.on(EVENT.LEADERBOARD_UPDATED, callback);
  }

  /**
   * Subscribe to cache invalidation events.
   * Useful for debugging or cross-component coordination.
   * @param {Function} callback - Called with { key?, prefix?, cleared? }
   * @returns {Function} Unsubscribe
   */
  onCacheInvalidated(callback) {
    return eventBus.on(EVENT.CACHE_INVALIDATED, callback);
  }

  // ─────────────────────────────────────────────────────────
  // BUDGET TRACKING (development only)
  // ─────────────────────────────────────────────────────────

  _trackRead(count = 1) {
    if (!this._readLog) {
      this._readLog = { reads: 0, byKey: {}, startTime: Date.now() };
    }
    this._readLog.reads += count;
  }

  getReadStats() {
    if (!this._readLog) return null;
    const elapsed = Date.now() - this._readLog.startTime;
    return {
      totalReads: this._readLog.reads,
      elapsedMin: Math.round(elapsed / 60000),
      readsPerMin: elapsed > 0 ? (this._readLog.reads / (elapsed / 60000)).toFixed(1) : 0,
      projectedDaily: elapsed > 60000
        ? Math.round(this._readLog.reads * (1440 / (elapsed / 60000)))
        : null,
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════

export const dataLayer = new DataLayer();
export default dataLayer;