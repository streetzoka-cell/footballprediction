// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/utils/dataLayer.js
// CENTRALIZED FIRESTORE DATA LAYER
//
// SINGLE SOURCE OF TRUTH for all Firestore reads.
// - In-memory cache with configurable TTL
// - Thundering herd protection (deduplication of concurrent requests)
// - Background refresh support
// - Manual cache invalidation
// - NO page should read from Firestore directly
//
// CACHE STRATEGY:
// - 30-minute TTL for all data
// - 10-minute poll intervals for active data
// - Cache survives page navigation (module-level singleton)
// - Concurrent requests are deduplicated (100 requests = 1 Firestore read)
// ═════════════════════════════════════════════════════════════════════════════

import { db } from './firebase';
import {
  collection,
  query,
  where,
  doc,
  getDoc,
  getDocs,
} from 'firebase/firestore';

// ═══════════════════════════════════════════════════════════════
// CACHE TTL CONFIGURATION
// ═══════════════════════════════════════════════════════════════
// 30-minute TTLs + 10-minute poll intervals = 1 Firestore read
// per hook per 30-minute session (instead of 1 read per poll)
// ═══════════════════════════════════════════════════════════════

const CACHE_TTL = {
  ACTIVE_PREDICTIONS: 30 * 60 * 1000,   // 30 min
  DAILY_LEADERBOARD: 30 * 60 * 1000,    // 30 min
  ZOKA_PICKS: 30 * 60 * 1000,           // 30 min
  ZOKA_VOTES: 30 * 60 * 1000,           // 30 min
  HISTORICAL_GOAT: 30 * 60 * 1000,      // 30 min
  HISTORICAL_WEEKLY: 30 * 60 * 1000,    // 30 min
  HISTORICAL_MONTHLY: 30 * 60 * 1000,   // 30 min
  USER_PREDICTIONS: 30 * 60 * 1000,     // 30 min
  PREDICTION_RESULTS: 30 * 60 * 1000,   // 30 min
  USER_POINTS: 30 * 60 * 1000,          // 30 min
};

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
// DATA LAYER CLASS
// ═══════════════════════════════════════════════════════════════

class DataLayer {
  constructor() {
    /** @type {Map<string, {data: *, ts: number, ttl: number}>} */
    this._cache = new Map();
    /** @type {Map<string, Promise<*>>} */
    this._locks = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._subscribers = new Map();
    /** @type {Map<string, number>} */
    this._pollTimers = new Map();
  }

  // ─────────────────────────────────────────────────────────
  // CACHE OPERATIONS
  // ─────────────────────────────────────────────────────────

  _get(key, ttlMs) {
    const entry = this._cache.get(key);
    if (!entry) return undefined;
    const effectiveTtl = ttlMs ?? entry.ttl;
    if (effectiveTtl <= 0) return undefined;
    if (Date.now() - entry.ts > effectiveTtl) {
      this._cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  _set(key, data, ttlMs) {
    this._cache.set(key, {
      data,
      ts: Date.now(),
      ttl: ttlMs ?? 30 * 60 * 1000,
    });
  }

  // ─────────────────────────────────────────────────────────
  // THUNDERING HERD PROTECTION
  //
  // If 100 concurrent requests arrive after cache invalidation:
  // - Request 1: cache miss → acquires lock → fetches from Firestore
  // - Requests 2-100: cache miss → lock exists → wait for lock → return cached result
  // - Result: 1 Firestore read instead of 100
  // ─────────────────────────────────────────────────────────

  async getOrSet(key, fetchFn, ttlMs) {
    // 1. Check fresh cache
    const cached = this._get(key, ttlMs);
    if (cached !== undefined) return cached;

    // 2. Check for in-flight request (thundering herd protection)
    const existingLock = this._locks.get(key);
    if (existingLock) {
      try {
        const result = await existingLock;
        // After waiting, cache should be populated
        const warmed = this._get(key, ttlMs);
        if (warmed !== undefined) return warmed;
        return result;
      } catch {
        // Lock failed, fall through to try ourselves
      }
    }

    // 3. Acquire lock and fetch
    const promise = fetchFn()
      .then((data) => {
        this._set(key, data, ttlMs);
        this._notifySubscribers(key, data);
        return data;
      })
      .catch((err) => {
        console.warn(`[DataLayer] Fetch error for ${key}:`, err.message);
        throw err;
      })
      .finally(() => {
        this._locks.delete(key);
      });

    this._locks.set(key, promise);
    return promise;
  }

  // ─────────────────────────────────────────────────────────
  // SUBSCRIPTIONS (for reactive updates without polling)
  // ─────────────────────────────────────────────────────────

  subscribe(key, callback) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
    this._subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const subs = this._subscribers.get(key);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this._subscribers.delete(key);
        }
      }
    };
  }

  _notifySubscribers(key, data) {
    const subs = this._subscribers.get(key);
    if (!subs) return;

    // Use microtask to avoid synchronous cascades
    queueMicrotask(() => {
      subs.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.warn(`[DataLayer] Subscriber error for ${key}:`, err.message);
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  // CACHE INVALIDATION
  // ─────────────────────────────────────────────────────────

  invalidate(key) {
    this._cache.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._cache.keys()) {
      if (key.startsWith(prefix)) {
        this._cache.delete(key);
      }
    }
  }

  clear() {
    this._cache.clear();
    this._locks.clear();
  }

  // ─────────────────────────────────────────────────────────
  // STATS
  // ─────────────────────────────────────────────────────────

  getStats() {
    return {
      cacheSize: this._cache.size,
      pendingLocks: this._locks.size,
      activePolls: this._pollTimers.size,
      subscribers: this._subscribers.size,
    };
  }

  // ═════════════════════════════════════════════════════════
  // DATA FETCHERS
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // ACTIVE PREDICTIONS
  //
  // Reads: ~10 (1 query × ~10 docs)
  // Cache: 30 min
  // Poll: 10 min (set up by context, not here)
  // ─────────────────────────────────────────────────────────

  async fetchActivePredictions(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `active_${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snapshot = await getDocs(
        query(
          collection(db, 'active_predictions'),
          where('matchDate', '==', dateStr)
        )
      );

      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }, CACHE_TTL.ACTIVE_PREDICTIONS);
  }

  // ─────────────────────────────────────────────────────────
  // DAILY LEADERBOARD
  //
  // Reads: 1 (pre-computed summary doc)
  // Cache: 30 min
  // ─────────────────────────────────────────────────────────

  async fetchDailyLeaderboard(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `dlb_${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const docRef = doc(db, 'daily_leaderboard', dateStr);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) return null;

      return snapshot.data();
    }, CACHE_TTL.DAILY_LEADERBOARD);
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA PICKS
  //
  // Reads: 1
  // Cache: 30 min
  // ─────────────────────────────────────────────────────────

  async fetchZokaPicks(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `zoka_${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const docRef = doc(db, 'zoka_picks', dateStr);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) return null;

      return snapshot.data();
    }, CACHE_TTL.ZOKA_PICKS);
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA VOTES
  //
  // Reads: 1
  // Cache: 30 min
  // ─────────────────────────────────────────────────────────

  async fetchZokaVotes(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `zokaVotes_${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return { stats: {} };

      const docRef = doc(db, 'zoka_vote_stats', dateStr);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) return { stats: {} };

      return { stats: snapshot.data()?.stats || {} };
    }, CACHE_TTL.ZOKA_VOTES);
  }

  // ─────────────────────────────────────────────────────────
  // USER PREDICTIONS
  //
  // Reads: ~10 (1 query × ~10 docs)
  // Cache: 30 min
  // REQUIRES COMPOSITE INDEX: user_predictions (userId ASC, matchDate ASC)
  // ─────────────────────────────────────────────────────────

  async fetchUserPredictions(uid, dateStr) {
    if (!uid || !db) return {};
    dateStr = dateStr || todayStr();
    const key = `myPreds_${uid}_${dateStr}`;

    return this.getOrSet(key, async () => {
      const snapshot = await getDocs(
        query(
          collection(db, 'user_predictions'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )
      );

      const map = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        map[data.predId] = { id: d.id, ...data };
      });

      return map;
    }, CACHE_TTL.USER_PREDICTIONS);
  }

  // ─────────────────────────────────────────────────────────
  // PREDICTION RESULTS
  //
  // Reads: ~10 (1 query × ~10 docs)
  // Cache: 30 min
  // REQUIRES COMPOSITE INDEX: prediction_results (userId ASC, matchDate ASC)
  // ─────────────────────────────────────────────────────────

  async fetchPredictionResults(uid, dateStr) {
    if (!uid || !db) return { results: [], resultMap: {} };
    dateStr = dateStr || todayStr();
    const key = `myResults_${uid}_${dateStr}`;

    return this.getOrSet(key, async () => {
      const snapshot = await getDocs(
        query(
          collection(db, 'prediction_results'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )
      );

      const results = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));

      const resultMap = {};
      results.forEach((r) => {
        resultMap[String(r.matchId)] = r;
      });

      return { results, resultMap };
    }, CACHE_TTL.PREDICTION_RESULTS);
  }

  // ─────────────────────────────────────────────────────────
  // USER POINTS
  //
  // Reads: 1
  // Cache: 30 min
  // ─────────────────────────────────────────────────────────

  async fetchUserPoints(uid) {
    if (!uid || !db) return null;
    const key = `upt_${uid}`;

    return this.getOrSet(key, async () => {
      const docRef = doc(db, 'user_points_total', uid);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) return null;

      return snapshot.data();
    }, CACHE_TTL.USER_POINTS);
  }

  // ─────────────────────────────────────────────────────────
  // HISTORICAL LEADERBOARD (GOAT / WEEKLY / MONTHLY)
  //
  // Reads: 1 (pre-computed summary doc)
  // Cache: 30 min
  //
  // If pre-computed doc doesn't exist, returns { entries: [], stale: true }
  // Admin needs to run rebuildGoatLeaderboard() or rebuildPeriodLeaderboard()
  // ─────────────────────────────────────────────────────────

  async fetchHistoricalLeaderboard(period) {
    const docId = this._getPeriodDocId(period);
    const key = `hist_${period}`;
    const ttl = CACHE_TTL[`HISTORICAL_${period.toUpperCase()}`] || CACHE_TTL.HISTORICAL_GOAT;

    return this.getOrSet(key, async () => {
      if (!db) return { entries: [], stale: true };

      const docRef = doc(db, 'leaderboard_summaries', docId);
      const snapshot = await getDoc(docRef);

      if (!snapshot.exists()) return { entries: [], stale: true };

      const data = snapshot.data();
      return { entries: data.entries || [], stale: false };
    }, ttl);
  }

  // ─────────────────────────────────────────────────────────
  // ALL USER PREDICTIONS (for distribution stats)
  //
  // Reads: 0 (reuses daily_leaderboard cache)
  // ─────────────────────────────────────────────────────────

  async fetchAllUserPredictions(dateStr) {
    dateStr = dateStr || todayStr();
    const summary = await this.fetchDailyLeaderboard(dateStr);

    if (!summary) {
      return { predCounts: {}, predDist: {}, allPreds: [], userPredMap: {} };
    }

    return {
      predCounts: summary.predCounts || {},
      predDist: summary.predDist || {},
      allPreds: [],
      userPredMap: {},
    };
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
}

// ═══════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════

export const dataLayer = new DataLayer();
export default dataLayer;