// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/utils/dataLayer.js
// DIRECT FIRESTORE DATA LAYER — Zero-Backend Architecture
//
// ★ STRATEGY: Three-layer cache + single-document reads
//
// Cache layers (checked in order):
//   1. In-memory cache     → Same tab, instant (~0ms)
//   2. localStorage cache  → Same browser, fast (~1ms), survives reloads
//   3. Firestore read      → Last resort, single-document only (~50ms)
//
// Thundering herd protection:
//   If 100 concurrent requests arrive after cache expiry,
//   only request #1 reads from Firestore. Requests #2-100 wait and share.
//   (Works within same browser — different users have independent caches)
//
// Stale-while-revalidate:
//   When localStorage data is expired but within grace period,
//   return stale data immediately and trigger background refresh.
//
// ★ BUDGET MATH (2,000 users/day):
//   Fixture snapshots:    1 doc × ~3,000 cold visits  =  3,000 reads
//   Reference data:       1 doc × ~200 new devices    =    800 reads
//   Daily leaderboard:    1 doc × ~3,000 cold visits  =  3,000 reads
//   Zoka picks/votes:     2 docs × ~3,000             =  6,000 reads
//   Active predictions:   1 doc × ~1,200 (lazy load)  =  1,200 reads
//   User predictions:     ~10 docs × ~600 (lazy)      =  6,000 reads
//   User results:         ~10 docs × ~600 (lazy)      =  6,000 reads
//   User points:          1 doc × ~600 (lazy)         =    600 reads
//   Historical boards:    1 doc × ~400 (lazy)         =    400 reads
//   ─────────────────────────────────────────────────────────────────
//   TOTAL:                                          ≈ 27,000 reads/day
//   Budget:                                          50,000 reads/day
//   Headroom:                                         46% remaining
//
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

// ═══════════════════════════════════════════════════════════════
// TTL CONFIGURATION
//
// These control how long data stays "fresh" before a Firestore
// read is triggered. Longer TTLs = fewer reads = more budget.
//
// Trade-off: Longer TTLs = slightly stale data.
// Current values are tuned for a football prediction app where
// scores change every few minutes during matches.
// ═══════════════════════════════════════════════════════════════

const TTL = {
  // Snapshot data (single-doc reads from fixture_snapshots/)
  FIXTURE_SNAPSHOT:       5 * 60 * 1000,    // 5 min — live scores change during matches
  FIXTURE_SNAPSHOT_IDLE:  30 * 60 * 1000,   // 30 min — when no live matches

  // Reference data (single-doc reads from reference_data/)
  REFERENCE:              24 * 60 * 60 * 1000, // 24 hours — leagues/teams/standings rarely change

  // Prediction data
  ACTIVE_PREDICTIONS:     10 * 60 * 1000,   // 10 min — admin updates these occasionally
  DAILY_LEADERBOARD:      10 * 60 * 1000,   // 10 min — updates as matches finish
  ZOKA_PICKS:             30 * 60 * 1000,   // 30 min
  ZOKA_VOTES:             10 * 60 * 1000,   // 10 min — vote counts change

  // User-specific data (per-user queries)
  USER_DATA:              10 * 60 * 1000,   // 10 min

  // Historical leaderboards
  HISTORICAL:             60 * 60 * 1000,   // 1 hour

  // localStorage grace period
  // After TTL expires, still return stale data for this long
  // while triggering a background refresh
  STALE_GRACE:            30 * 60 * 1000,   // 30 min grace
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
// LOCAL STORAGE CACHE
//
// Persists data across page reloads and browser tabs.
// Each entry stores: { data, ts (timestamp), ttl }
//
// Stale data is kept for STALE_GRACE period and returned
// immediately while a background refresh fetches fresh data.
// ═══════════════════════════════════════════════════════════════

class LocalCache {
  constructor(prefix = 'fxdl') {
    this._prefix = prefix;
    this._cleanupInterval = null;
  }

  _key(key) {
    return `${this._prefix}:${key}`;
  }

  /**
   * Get fresh data from localStorage.
   * Returns undefined if expired or missing.
   */
  get(key, ttlMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;

      const entry = JSON.parse(raw);
      const effectiveTtl = ttlMs ?? entry.ttl;

      if (Date.now() - entry.ts > effectiveTtl) {
        return undefined; // Expired
      }

      return entry.data;
    } catch {
      return undefined;
    }
  }

  /**
   * Get data from localStorage, even if expired (within grace period).
   * Returns { data, stale: boolean } or undefined if too old.
   */
  getWithGrace(key, ttlMs, graceMs) {
    try {
      const raw = localStorage.getItem(this._key(key));
      if (!raw) return undefined;

      const entry = JSON.parse(raw);
      const effectiveTtl = ttlMs ?? entry.ttl;
      const age = Date.now() - entry.ts;
      const maxAge = effectiveTtl + (graceMs ?? TTL.STALE_GRACE);

      if (age > maxAge) {
        // Too old even for stale — delete it
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

  /**
   * Store data in localStorage with TTL metadata.
   */
  set(key, data, ttlMs) {
    try {
      localStorage.setItem(this._key(key), JSON.stringify({
        data,
        ts: Date.now(),
        ttl: ttlMs,
      }));
    } catch (err) {
      // Storage full — cleanup and retry
      this._cleanup();
      try {
        localStorage.setItem(this._key(key), JSON.stringify({
          data,
          ts: Date.now(),
          ttl: ttlMs,
        }));
      } catch {
        // Still full — give up (cache won't persist, but in-memory still works)
      }
    }
  }

  /**
   * Delete a specific key.
   */
  delete(key) {
    try {
      localStorage.removeItem(this._key(key));
    } catch { /* ignore */ }
  }

  /**
   * Delete all keys with a given prefix.
   */
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

  /**
   * Remove entries that are more than 2× their TTL old.
   */
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
          toDelete.push(k); // Corrupted entry
        }
      }
    }

    toDelete.forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
  }

  /**
   * Start periodic cleanup (call once at app init).
   */
  startPeriodicCleanup(intervalMs = 60_000) {
    if (this._cleanupInterval) return;
    this._cleanupInterval = setInterval(() => this._cleanup(), intervalMs);
  }

  /**
   * Stop periodic cleanup.
   */
  stopPeriodicCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// DATA LAYER CLASS
// ═══════════════════════════════════════════════════════════════

class DataLayer {
  constructor() {
    /** @type {Map<string, {data: *, ts: number, ttl: number}>} */
    this._memory = new Map();
    /** @type {Map<string, Promise<*>>} */
    this._locks = new Map();
    /** @type {Map<string, Set<Function>>} */
    this._subscribers = new Map();
    /** @type {LocalCache} */
    this._local = new LocalCache();
    /** @type {Set<string>} */
    this._backgroundRefreshInProgress = new Set();

    // Start localStorage cleanup
    this._local.startPeriodicCleanup();
  }

  // ─────────────────────────────────────────────────────────
  // MEMORY CACHE (Layer 1 — fastest)
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
  // MAIN GET OR SET — Three-Layer Cache + Thundering Herd
  //
  // Resolution order:
  //   1. Memory cache (fresh)     → return immediately
  //   2. localStorage (fresh)     → promote to memory, return
  //   3. localStorage (stale+grace)→ promote to memory, return + background refresh
  //   4. Lock exists              → wait for lock, return cached result
  //   5. No cache at all          → acquire lock, fetch from Firestore
  //
  // Result: 1 Firestore read per cache-key per TTL period,
  //         regardless of how many tabs/users request it (per browser).
  // ─────────────────────────────────────────────────────────

  async getOrSet(key, fetchFn, ttlMs, options = {}) {
    const { graceMs = TTL.STALE_GRACE, skipLocal = false } = options;

    // Layer 1: Memory cache
    const memData = this._memGet(key, ttlMs);
    if (memData !== undefined) return memData;

    // Layer 2: localStorage cache (if not skipped)
    if (!skipLocal) {
      const localData = this._local.get(key, ttlMs);
      if (localData !== undefined) {
        // Promote to memory
        this._memSet(key, localData, ttlMs);
        return localData;
      }

      // Layer 2.5: Stale-while-revalidate
      const staleEntry = this._local.getWithGrace(key, ttlMs, graceMs);
      if (staleEntry) {
        // Promote stale data to memory
        this._memSet(key, staleEntry.data, ttlMs);

        // Trigger background refresh (non-blocking)
        if (staleEntry.stale) {
          this._backgroundRefresh(key, fetchFn, ttlMs);
        }

        return staleEntry.data;
      }
    }

    // Layer 3: Thundering herd — check for in-flight request
    const existingLock = this._locks.get(key);
    if (existingLock) {
      try {
        return await existingLock;
      } catch {
        // Lock failed, fall through to try ourselves
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
   * Background refresh — fetches fresh data without blocking the caller.
   * Updates memory + localStorage when complete. Notifies subscribers.
   */
  _backgroundRefresh(key, fetchFn, ttlMs) {
    if (this._backgroundRefreshInProgress.has(key)) return;
    if (this._locks.has(key)) return; // Already fetching

    this._backgroundRefreshInProgress.add(key);

    // Use microtask so we don't block the current execution
    queueMicrotask(async () => {
      try {
        const data = await fetchFn();
        this._memSet(key, data, ttlMs);
        this._local.set(key, data, ttlMs);
        this._notifySubscribers(key, data);
      } catch (err) {
        // Silent fail — stale data is still better than no data
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
  // CACHE INVALIDATION
  // ─────────────────────────────────────────────────────────

  invalidate(key) {
    this._memory.delete(key);
    this._local.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._memory.keys()) {
      if (key.startsWith(prefix)) this._memory.delete(key);
    }
    this._local.deletePrefix(prefix);
  }

  clear() {
    this._memory.clear();
    this._locks.clear();
    this._local.deletePrefix('');
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
  //
  // ★ All fixture/reference fetchers read SINGLE DOCUMENTS.
  //   This is the key to staying under 50K reads.
  //
  // ★ User-specific fetchers use queries (unavoidable for
  //   per-user data), but are LAZY-LOADED and heavily cached.
  // ═════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────
  // FOOTBALL FIXTURES — 1 DOC READ
  //
  // Reads: 1 document (contains all fixtures for the day)
  // Cache: 5 min (live) / 30 min (idle)
  // localStorage: yes
  // ─────────────────────────────────────────────────────────

  async fetchFootballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `snap:ft:${dateStr}`;

    // Use shorter TTL when there might be live matches
    const now = new Date();
    const hour = now.getUTCHours();
    const isMatchHours = hour >= 12 && hour <= 23; // Rough heuristic
    const ttl = isMatchHours ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await getDoc(doc(db, 'fixture_snapshots', dateStr));
      if (!snap.exists()) return null;

      return snap.data();
    }, ttl);
  }

  /**
   * Get specific fixture arrays from the snapshot.
   * Returns { today, tomorrow, yesterday, live, finished }.
   */
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
  // BASKETBALL FIXTURES — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchBasketballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `snap:bb:${dateStr}`;

    const now = new Date();
    const hour = now.getUTCHours();
    const isMatchHours = hour >= 0 && hour <= 10; // Basketball often at night US time
    const ttl = isMatchHours ? TTL.FIXTURE_SNAPSHOT : TTL.FIXTURE_SNAPSHOT_IDLE;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await getDoc(doc(db, 'fixture_snapshots', `basketball_${dateStr}`));
      if (!snap.exists()) return null;

      return snap.data();
    }, ttl);
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
  // REFERENCE DATA — 1 DOC READ EACH
  //
  // Reads: 1 document per type
  // Cache: 24 hours
  // localStorage: yes (persists across days)
  // ─────────────────────────────────────────────────────────

  async fetchLeagues(sport = 'football') {
    const docId = sport === 'basketball' ? 'bb_leagues' : 'leagues';
    const key = `snap:ref:${docId}`;

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await getDoc(doc(db, 'reference_data', docId));
      if (!snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  async fetchTeams(sport = 'football') {
    const docId = sport === 'basketball' ? 'bb_teams' : 'teams';
    const key = `snap:ref:${docId}`;

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await getDoc(doc(db, 'reference_data', docId));
      if (!snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  async fetchStandings(sport = 'football') {
    const docId = sport === 'basketball' ? 'bb_standings' : 'standings';
    const key = `snap:ref:${docId}`;

    return this.getOrSet(key, async () => {
      if (!db) return [];

      const snap = await getDoc(doc(db, 'reference_data', docId));
      if (!snap.exists()) return [];

      return snap.data().data || [];
    }, TTL.REFERENCE);
  }

  // ─────────────────────────────────────────────────────────
  // ACTIVE PREDICTIONS — 1 DOC READ (snapshot)
  //
  // If snapshot exists: 1 read
  // If no snapshot (fallback): query collection (~10 docs)
  //
  // ★ Recommended: Set up snapshot writer in admin/backend
  //   to keep this at 1 read. Without snapshot, it's ~10 reads.
  // ─────────────────────────────────────────────────────────

  async fetchActivePredictions(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `active:${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return [];

      // Try snapshot first (1 read)
      const snap = await getDoc(doc(db, 'prediction_snapshots', dateStr));
      if (snap.exists()) {
        return snap.data().predictions || [];
      }

      // Fallback: query collection (~10 reads)
      // This path should be rare once snapshots are set up
      console.warn('[DataLayer] No prediction snapshot — falling back to collection query');
      const querySnap = await getDocs(
        query(
          collection(db, 'active_predictions'),
          where('matchDate', '==', dateStr)
        )
      );

      return querySnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }, TTL.ACTIVE_PREDICTIONS);
  }

  // ─────────────────────────────────────────────────────────
  // DAILY LEADERBOARD — 1 DOC READ
  //
  // Reads: 1 (pre-computed summary doc)
  // Cache: 10 min
  // ─────────────────────────────────────────────────────────

  async fetchDailyLeaderboard(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `dlb:${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await getDoc(doc(db, 'daily_leaderboard', dateStr));
      if (!snap.exists()) return null;

      return snap.data();
    }, TTL.DAILY_LEADERBOARD);
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA PICKS — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchZokaPicks(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `zoka:${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return null;

      const snap = await getDoc(doc(db, 'zoka_picks', dateStr));
      if (!snap.exists()) return null;

      return snap.data();
    }, TTL.ZOKA_PICKS);
  }

  // ─────────────────────────────────────────────────────────
  // ZOKA VOTES — 1 DOC READ
  // ─────────────────────────────────────────────────────────

  async fetchZokaVotes(dateStr) {
    dateStr = dateStr || todayStr();
    const key = `zokaVotes:${dateStr}`;

    return this.getOrSet(key, async () => {
      if (!db) return { stats: {} };

      const snap = await getDoc(doc(db, 'zoka_vote_stats', dateStr));
      if (!snap.exists()) return { stats: {} };

      return { stats: snap.data()?.stats || {} };
    }, TTL.ZOKA_VOTES);
  }

  // ─────────────────────────────────────────────────────────
  // USER PREDICTIONS — QUERY READ (~10 docs)
  //
  // ★ LAZY-LOADED: Only called when user visits Predictions/Profile page.
  //   NOT called on app startup.
  //
  // Reads: ~10 (1 query × ~10 docs)
  // Cache: 10 min + localStorage
  // REQUIRES COMPOSITE INDEX: user_predictions (userId ASC, matchDate ASC)
  // ─────────────────────────────────────────────────────────

  async fetchUserPredictions(uid, dateStr) {
    if (!uid || !db) return {};
    dateStr = dateStr || todayStr();
    const key = `myPreds:${uid}:${dateStr}`;

    return this.getOrSet(key, async () => {
      const snap = await getDocs(
        query(
          collection(db, 'user_predictions'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )
      );

      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[data.predId] = { id: d.id, ...data };
      });

      return map;
    }, TTL.USER_DATA);
  }

  // ─────────────────────────────────────────────────────────
  // PREDICTION RESULTS — QUERY READ (~10 docs)
  //
  // ★ LAZY-LOADED
  // REQUIRES COMPOSITE INDEX: prediction_results (userId ASC, matchDate ASC)
  // ─────────────────────────────────────────────────────────

  async fetchPredictionResults(uid, dateStr) {
    if (!uid || !db) return { results: [], resultMap: {} };
    dateStr = dateStr || todayStr();
    const key = `myResults:${uid}:${dateStr}`;

    return this.getOrSet(key, async () => {
      const snap = await getDocs(
        query(
          collection(db, 'prediction_results'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        )
      );

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
  //
  // ★ LAZY-LOADED
  // ─────────────────────────────────────────────────────────

  async fetchUserPoints(uid) {
    if (!uid || !db) return null;
    const key = `upt:${uid}`;

    return this.getOrSet(key, async () => {
      const snap = await getDoc(doc(db, 'user_points_total', uid));
      if (!snap.exists()) return null;

      return snap.data();
    }, TTL.USER_DATA);
  }

  // ─────────────────────────────────────────────────────────
  // HISTORICAL LEADERBOARD — 1 DOC READ
  //
  // ★ LAZY-LOADED: Only called when user switches to GOAT/Weekly/Monthly tab
  // ─────────────────────────────────────────────────────────

  async fetchHistoricalLeaderboard(period) {
    const docId = this._getPeriodDocId(period);
    const key = `hist:${period}`;

    return this.getOrSet(key, async () => {
      if (!db) return { entries: [], stale: true };

      const snap = await getDoc(doc(db, 'leaderboard_summaries', docId));
      if (!snap.exists()) return { entries: [], stale: true };

      const data = snap.data();
      return { entries: data.entries || [], stale: false };
    }, TTL.HISTORICAL);
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
  // BUDGET TRACKING (development only)
  //
  // Tracks actual Firestore reads to verify budget estimates.
  // Disable in production (set to false).
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