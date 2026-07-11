// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js — QUOTA-OPTIMIZED v2
// ═══════════════════════════════════════════════════════════════════════════
//
// QUOTA BUDGET (Spark Plan):  50K reads/day,  20K writes/day
// TARGET:                      2,000+ daily active users
//
// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY
// ═══════════════════════════════════════════════════════════════════════════
//
//  1. ZERO onSnapshot collection listeners from non-admin clients.
//     Every "real-time" listener is replaced with a one-time getDoc/getDocs
//     wrapped in a module-level session cache.
//
//  2. Session cache survives component mounts/unmounts within the same tab.
//     Navigating Home → Predictions → Leaderboard = 0 extra reads.
//
//  3. Single-document reads replace collection scans wherever possible:
//       - daily_leaderboard/{date}    → replaces 3 collection listeners
//       - zoka_vote_stats/{date}      → replaces zoka_votes collection scan
//       - user_points_total/{uid}     → was already 1 doc (unchanged)
//       - zoka_picks/{date}           → was already 1 doc (unchanged)
//
//  4. User-specific composite queries replace full-table scans:
//       - user_predictions WHERE userId==uid AND matchDate==date
//       - prediction_results WHERE userId==uid AND matchDate==date
//
//  5. Admin is the ONLY client that reads collections for resolution.
//     Admin writes a daily_leaderboard summary doc that all users read.
//
//  6. Zoka votes: individual vote docs removed; stats stored in single doc
//     with atomic increments. User's own vote stored in localStorage.
//
// ═══════════════════════════════════════════════════════════════════════════
// REQUIRED FIRESTORE COMPOSITE INDEXES (create in Console → Indexes)
// ═══════════════════════════════════════════════════════════════════════════
//
//   Collection           Fields                         Status
//   ───────────────────  ─────────────────────────────  ───────
//   user_predictions     userId ASC, matchDate ASC      CREATE
//   prediction_results   userId ASC, matchDate ASC      CREATE
//
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { db } from '../utils/firebase';
import {
  collection,
  query,
  where,
  doc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

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

export function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

/* ═══════════════════════════════════════════════════════════════
   SESSION CACHE
   ═══════════════════════════════════════════════════════════════
   Module-level Map. Survives component mount/unmount within
   the same tab. Cleared on page refresh (natural behavior).

   Each entry has a timestamp. On read, if expired, deleted.
   Concurrent duplicate reads are deduplicated via _inflight.
   ═══════════════════════════════════════════════════════════════ */

const _cache = new Map();
const _inflight = new Map();

function _cacheGet(key, ttlMs) {
  if (ttlMs <= 0) return undefined;
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > ttlMs) {
    _cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function _cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
}

/** Delete a specific cache entry (call after writes to force fresh read) */
export function invalidateCache(key) {
  _cache.delete(key);
}

/** Delete all entries matching a prefix */
export function invalidateCachePrefix(prefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CACHED READ HELPERS
   ═══════════════════════════════════════════════════════════════ */

/**
 * Read a single document with caching.
 * Deduplicates concurrent reads for the same key.
 */
async function readDocOnce(docRef, cacheKey, ttlMs = 60000) {
  const cached = _cacheGet(cacheKey, ttlMs);
  if (cached !== undefined) return cached;

  if (_inflight.has(cacheKey)) return _inflight.get(cacheKey);

  const promise = getDoc(docRef)
    .then((snap) => {
      const data = snap.exists() ? snap.data() : null;
      _cacheSet(cacheKey, data);
      _inflight.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      _inflight.delete(cacheKey);
      console.warn('[Cache] readDocOnce error:', err.message);
      return null;
    });

  _inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Read a collection query with caching.
 * Deduplicates concurrent reads for the same key.
 */
async function readDocsOnce(queryRef, cacheKey, ttlMs = 60000) {
  const cached = _cacheGet(cacheKey, ttlMs);
  if (cached !== undefined) return cached;

  if (_inflight.has(cacheKey)) return _inflight.get(cacheKey);

  const promise = getDocs(queryRef)
    .then((snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      _cacheSet(cacheKey, data);
      _inflight.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      _inflight.delete(cacheKey);
      console.warn('[Cache] readDocsOnce error:', err.message);
      return [];
    });

  _inflight.set(cacheKey, promise);
  return promise;
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN-ONLY: REBUILD DAILY SUMMARY
   ═══════════════════════════════════════════════════════════════
   Reads all data for a date and writes a single summary doc
   that clients read instead of scanning collections.

   Cost: ~2,500 reads (admin only), writes 1 doc.
   Runs only when a match is resolved (~5-10 times/day).
   ═══════════════════════════════════════════════════════════════ */

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();

  try {
    // Read prediction_results for this date (resolved data)
    const resultsSnap = await getDocs(
      query(
        collection(db, 'prediction_results'),
        where('matchDate', '==', dateStr)
      )
    );

    // Read user_predictions for this date (unresolved + display names)
    const predsSnap = await getDocs(
      query(
        collection(db, 'user_predictions'),
        where('matchDate', '==', dateStr)
      )
    );

    // Read active_predictions for score map
    const activeSnap = await getDocs(
      query(
        collection(db, 'active_predictions'),
        where('matchDate', '==', dateStr)
      )
    );

    // Build score map from finished matches
    const scoreMap = {};
    activeSnap.docs.forEach((d) => {
      const p = d.data();
      if (p.status === 'finished' && p.homeScore != null) {
        scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore };
      }
    });

    // Build user stats from prediction_results (authoritative)
    const userStats = {};
    resultsSnap.docs.forEach((d) => {
      const r = d.data();
      if (!userStats[r.userId]) {
        userStats[r.userId] = {
          uid: r.userId,
          displayName: 'Player',
          points: 0,
          predictions: 0,
          exact: 0,
          result: 0,
          miss: 0,
          resolved: 0,
        };
      }
      const u = userStats[r.userId];
      u.predictions++;
      u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === 'exact') u.exact++;
      else if (r.resultType === 'result') u.result++;
      else u.miss++;
    });

    // Add unresolved predictions (compute on-the-fly from raw data)
    const resolvedMatchIds = new Set(
      resultsSnap.docs.map((d) => String(d.data().matchId))
    );

    predsSnap.docs.forEach((d) => {
      const p = d.data();
      const mid = String(p.matchId);

      if (resolvedMatchIds.has(mid)) {
        // Grab display name from raw prediction
        if (userStats[p.userId]) {
          userStats[p.userId].displayName = p.displayName || 'Player';
        }
        return;
      }

      if (!userStats[p.userId]) {
        userStats[p.userId] = {
          uid: p.userId,
          displayName: p.displayName || 'Player',
          points: 0,
          predictions: 0,
          exact: 0,
          result: 0,
          miss: 0,
          resolved: 0,
        };
      }
      const u = userStats[p.userId];
      u.displayName = p.displayName || 'Player';
      u.predictions++;

      const actual = scoreMap[mid];
      if (!actual) return;
      u.resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
      u.points += r.points;
      if (r.type === 'exact') u.exact++;
      else if (r.type === 'result') u.result++;
      else u.miss++;
    });

    // Sort and rank
    const entries = Object.values(userStats)
      .filter((u) => u.predictions > 0)
      .sort(
        (a, b) =>
          b.points - a.points || b.exact - a.exact || b.result - a.result
      )
      .map((u, i) => ({
        ...u,
        rank: i + 1,
        accuracy:
          u.resolved > 0
            ? Math.round(((u.exact + u.result) / u.resolved) * 100)
            : 0,
      }));

    // Compute stats
    const stats = {
      avg:
        entries.length > 0
          ? (
              entries.reduce((s, u) => s + u.accuracy, 0) / entries.length
            ).toFixed(1)
          : '0.0',
      preds: entries.reduce((s, u) => s + u.predictions, 0),
      exact: entries.reduce((s, u) => s + u.exact, 0),
      players: entries.length,
    };

    // Compute prediction distribution (for "X people predicted 2-1")
    const predDist = {};
    const predCounts = {};
    predsSnap.docs.forEach((d) => {
      const p = d.data();
      if (!predDist[p.predId]) predDist[p.predId] = {};
      const k = `${p.homeScore}-${p.awayScore}`;
      predDist[p.predId][k] = (predDist[p.predId][k] || 0) + 1;
      predCounts[p.predId] = (predCounts[p.predId] || 0) + 1;
    });

    // Write the summary doc — 1 write, read by ALL clients
    await setDoc(doc(db, 'daily_leaderboard', dateStr), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats,
      predDist,
      predCounts,
      scoreMap,
      updatedAt: serverTimestamp(),
      date: dateStr,
    });

    // Invalidate admin cache for active predictions
    invalidateCache(`active_${dateStr}`);

    console.log(
      `[Summary] Rebuilt for ${dateStr}: ${entries.length} players`
    );
  } catch (e) {
    console.error('[Summary] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN-ONLY: RESOLVER
   ═══════════════════════════════════════════════════════════════
   Only called from Admin.jsx. Reads user_predictions collection
   (necessary to find who predicted a match), writes results,
   then rebuilds the daily summary doc.
   ═══════════════════════════════════════════════════════════════ */

const _resolvingNow = new Set();

async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    const dateKey = matchDate || todayStr();

    // Check if already resolved
    const statusRef = doc(db, 'match_resolution_status', dateKey);
    const statusSnap = await getDoc(statusRef);
    const alreadyResolved = new Set(
      statusSnap.exists() ? statusSnap.data().resolvedMatches || [] : []
    );
    if (alreadyResolved.has(String(matchId))) return 0;

    // Read all predictions for this match (admin-only collection read)
    const predsSnap = await getDocs(
      query(
        collection(db, 'user_predictions'),
        where('matchId', '==', matchId)
      )
    );

    if (predsSnap.empty) {
      await setDoc(
        statusRef,
        {
          resolvedMatches: [String(matchId)],
          lastResolvedAt: serverTimestamp(),
          date: dateKey,
        },
        { merge: true }
      );
      return 0;
    }

    const batch = writeBatch(db);
    let count = 0;

    predsSnap.forEach((d) => {
      const p = d.data();
      const uid = p.userId;
      const r = calcPoints(p.homeScore, p.awayScore, actualH, actualA);

      // Write prediction result
      batch.set(
        doc(db, 'prediction_results', `${uid}_${matchId}`),
        {
          userId: uid,
          matchId: String(matchId),
          predId: p.predId,
          matchDate: p.matchDate || matchDate || todayStr(),
          homeTeam: p.homeTeam || 'Home',
          awayTeam: p.awayTeam || 'Away',
          homeLogo: p.homeLogo || null,
          awayLogo: p.awayLogo || null,
          league: p.league || '',
          kickoff: p.kickoff || null,
          predictedHome: p.homeScore,
          predictedAway: p.awayScore,
          actualHome: actualH,
          actualAway: actualA,
          points: r.points,
          resultType: r.type,
          resolvedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Update user points total
      batch.set(
        doc(db, 'user_points_total', uid),
        {
          totalPoints: increment(r.points),
          exactCount: increment(r.type === 'exact' ? 1 : 0),
          resultCount: increment(r.type === 'result' ? 1 : 0),
          missCount: increment(r.type === 'miss' ? 1 : 0),
          predictionsCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      count++;
    });

    // Update zoka_picks scores if applicable
    const zokaRef = doc(db, 'zoka_picks', dateKey);
    const zokaSnap = await getDoc(zokaRef);
    if (zokaSnap.exists()) {
      const zokaData = zokaSnap.data();
      const matches = zokaData.matches || [];
      let changed = false;
      const updated = matches.map((m) => {
        if (String(m.matchId) === String(matchId) && m.status !== 'finished') {
          changed = true;
          return {
            ...m,
            homeScore: actualH,
            awayScore: actualA,
            status: 'finished',
          };
        }
        return m;
      });
      if (changed) {
        batch.set(
          zokaRef,
          { ...zokaData, matches: updated, updatedAt: serverTimestamp() },
          { merge: true }
        );
      }
    }

    // Mark as resolved
    batch.set(
      statusRef,
      {
        resolvedMatches: [String(matchId)],
        lastResolvedAt: serverTimestamp(),
        date: dateKey,
      },
      { merge: true }
    );

    await batch.commit();

    // Rebuild the daily summary doc (so clients see updated leaderboard)
    await rebuildDailySummary(dateKey);

    // Invalidate client caches
    invalidateCachePrefix(`dlb_${dateKey}`);
    predsSnap.docs.forEach((d) => {
      const uid = d.data().userId;
      _cache.delete(`upt_${uid}`);
      _cache.delete(`myResults_${uid}_${dateKey}`);
    });

    return count;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useUniversalResolver (NO-OP for non-admin)
   ═══════════════════════════════════════════════════════════════ */

export function useUniversalResolver() {
  // NO-OP: Resolution is now admin-only.
  // Admin.jsx calls resolveMatchForAllUsers() directly.
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useActivePredictions
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(active_predictions) — reads ~10 docs on EVERY change
   NEW: getDocsOnce with 60s session cache

   Reads: ~10 (once per 60s per session, not per component mount)
   ═══════════════════════════════════════════════════════════════ */

export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cacheKey = `active_${dateStr}`;

    const load = async () => {
      setLoading(true);
      const data = await readDocsOnce(
        query(
          collection(db, 'active_predictions'),
          where('matchDate', '==', dateStr)
        ),
        cacheKey,
        60_000
      );
      if (!cancelled) {
        setPreds(data.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
        setLoading(false);
      }
    };

    load();

    // Background refresh every 90s while mounted
    const interval = setInterval(() => {
      if (!cancelled) {
        readDocsOnce(
          query(
            collection(db, 'active_predictions'),
            where('matchDate', '==', dateStr)
          ),
          cacheKey,
          60_000
        ).then((data) => {
          if (!cancelled) {
            setPreds(
              data.sort((a, b) => (b.priority || 0) - (a.priority || 0))
            );
          }
        });
      }
    }, 90_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dateStr]);

  // Derive score map for finished matches
  const scoreMap = useMemo(() => {
    const m = new Map();
    preds.forEach((p) => {
      if (p.status === 'finished' && p.homeScore != null) {
        m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
      }
    });
    return m;
  }, [preds]);

  return { preds, scoreMap, loading, error: null, lastUpdate: Date.now() };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useAllUserPredictions (for distribution counts)
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(user_predictions WHERE date) — reads ALL ~2,000 user preds
   NEW: Read from daily_leaderboard summary doc (uses same cache)

   Reads: 0 (uses daily_leaderboard cache)
   ═══════════════════════════════════════════════════════════════ */

export function useAllUserPredictions(date) {
  const dateStr = date || todayStr();
  const [predCounts, setPredCounts] = useState({});
  const [predDist, setPredDist] = useState({});
  const [userPredMap, setUserPredMap] = useState({});
  const [allPreds, setAllPreds] = useState([]);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    readDocOnce(
      doc(db, 'daily_leaderboard', dateStr),
      `dlb_${dateStr}`,
      90_000
    ).then((summary) => {
      if (cancelled || !summary) return;
      setPredCounts(summary.predCounts || {});
      setPredDist(summary.predDist || {});
      setAllPreds([]);
      setUserPredMap({});
    });

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  return { allPreds, userPredMap, predCounts, predDist, lastUpdate: Date.now() };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyPredictions
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(user_predictions WHERE date) then filter by uid
   NEW: Composite query WHERE userId==uid AND matchDate==date

   Reads: ~10 (once per 45s per session)
   REQUIRES COMPOSITE INDEX: user_predictions (userId ASC, matchDate ASC)
   ═══════════════════════════════════════════════════════════════ */

export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const [myPreds, setMyPreds] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    const load = async () => {
      const cacheKey = `myPreds_${uid}_${dateStr}`;
      const data = await readDocsOnce(
        query(
          collection(db, 'user_predictions'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        ),
        cacheKey,
        45_000
      );
      if (!cancelled) {
        const map = {};
        data.forEach((p) => {
          map[p.predId] = p;
        });
        setMyPreds(map);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [uid, dateStr]);

  return myPreds;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: usePredictionResults
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(prediction_results WHERE userId==uid)
   NEW: Composite query WHERE userId==uid AND matchDate==date

   Reads: ~10 (once per 90s per session)
   REQUIRES COMPOSITE INDEX: prediction_results (userId ASC, matchDate ASC)
   ═══════════════════════════════════════════════════════════════ */

export function usePredictionResults(uid) {
  const [results, setResults] = useState([]);
  const [resultMap, setResultMap] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    const load = async () => {
      const dateStr = todayStr();
      const cacheKey = `myResults_${uid}_${dateStr}`;
      const data = await readDocsOnce(
        query(
          collection(db, 'prediction_results'),
          where('userId', '==', uid),
          where('matchDate', '==', dateStr)
        ),
        cacheKey,
        90_000
      );
      if (!cancelled) {
        const sorted = data.sort(
          (a, b) =>
            (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0)
        );
        setResults(sorted);
        const m = {};
        sorted.forEach((r) => {
          m[String(r.matchId)] = r;
        });
        setResultMap(m);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { results, resultMap };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useUserPoints
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(doc) — reads 1 doc, but reconnects on every mount
   NEW: getDocOnce with 5-minute cache

   Reads: 1 (once per 5min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useUserPoints(uid) {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    readDocOnce(doc(db, 'user_points_total', uid), `upt_${uid}`, 300_000).then(
      (data) => {
        if (!cancelled) setPoints(data);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [uid]);

  return points;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaPicks
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(doc) — 1 doc read, persistent connection
   NEW: getDocOnce with 5-minute cache

   Reads: 1 (once per 5min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const [picks, setPicks] = useState(null);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    readDocOnce(doc(db, 'zoka_picks', dateStr), `zoka_${dateStr}`, 300_000).then(
      (data) => {
        if (!cancelled) setPicks(data);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  return picks;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaVotes
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(zoka_votes WHERE date) — reads ALL vote docs
   NEW: Read from single summary doc + localStorage for own vote

   Reads: 1 (once per 2min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const [voteStats, setVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    // Read aggregate stats from single doc
    readDocOnce(
      doc(db, 'zoka_vote_stats', dateStr),
      `zokaVotes_${dateStr}`,
      120_000
    ).then((data) => {
      if (cancelled) return;
      setVoteStats(data?.stats || {});
    });

    // Read user's own votes from localStorage (0 Firestore reads)
    try {
      const stored = localStorage.getItem(`zoka_votes_${dateStr}`);
      if (stored) setUserVotes(JSON.parse(stored));
    } catch {
      // Ignore localStorage errors
    }

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  return { votes: [], voteStats, userVotes };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useDailyLeaderboard
   ═══════════════════════════════════════════════════════════════
   OLD: 3× onSnapshot (prediction_results + user_predictions + active_predictions)
   NEW: Read single pre-computed summary doc (daily_leaderboard/{date})

   Reads: 1 (once per 90s per session)
   ═══════════════════════════════════════════════════════════════ */

export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const [entries, setEntries] = useState([]);
  const [top3, setTop3] = useState([]);
  const [rest, setRest] = useState([]);
  const [stats, setStats] = useState({
    avg: '0.0',
    preds: 0,
    exact: 0,
    players: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const cached = _cacheGet(`dlb_${dateStr}`, 90_000);
      if (cached) {
        if (!cancelled) {
          setEntries(cached.entries || []);
          setTop3(cached.top3 || []);
          setRest(cached.rest || []);
          setStats(
            cached.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 }
          );
          setLoading(false);
        }
        return;
      }

      const data = await readDocOnce(
        doc(db, 'daily_leaderboard', dateStr),
        `dlb_${dateStr}`,
        90_000
      );

      if (cancelled) return;

      if (data && data.entries) {
        setEntries(data.entries);
        setTop3(data.top3 || data.entries.slice(0, 3));
        setRest(data.rest || data.entries.slice(3));
        setStats(
          data.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 }
        );
      } else {
        setEntries([]);
        setTop3([]);
        setRest([]);
        setStats({ avg: '0.0', preds: 0, exact: 0, players: 0 });
      }
      setLoading(false);
    };

    load();

    // Background refresh every 120s
    const interval = setInterval(() => {
      if (!cancelled) {
        readDocOnce(
          doc(db, 'daily_leaderboard', dateStr),
          `dlb_${dateStr}`,
          90_000
        ).then((data) => {
          if (cancelled || !data) return;
          setEntries(data.entries || []);
          setTop3(data.top3 || []);
          setRest(data.rest || []);
          setStats(
            data.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 }
          );
        });
      }
    }, 120_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dateStr]);

  return { entries, top3, rest, stats, loading, isLive: false };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useHistoricalLeaderboard (weekly/monthly/goat)
   ═══════════════════════════════════════════════════════════════
   OLD: onSnapshot(collection) for GOAT — reads ALL user_points_total docs
   NEW: getDocsOnce with long cache (10 min)

   Reads: ~50-200 (once per 10min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useHistoricalLeaderboard(period) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        if (period === 'goat') {
          const data = await readDocsOnce(
            collection(db, 'user_points_total'),
            'hist_goat',
            600_000
          );
          if (cancelled) return;

          const list = data
            .filter((u) => (u.predictionsCount || 0) > 0)
            .sort(
              (a, b) =>
                (b.totalPoints || 0) - (a.totalPoints || 0) ||
                (b.exactCount || 0) - (a.exactCount || 0) ||
                (b.resultCount || 0) - (a.resultCount || 0)
            )
            .map((u, i) => ({
              uid: u.id,
              displayName: u.displayName || 'Player',
              points: u.totalPoints || 0,
              predictions: u.predictionsCount || 0,
              exact: u.exactCount || 0,
              result: u.resultCount || 0,
              miss: u.missCount || 0,
              resolved: u.predictionsCount || 0,
              rank: i + 1,
              accuracy:
                (u.predictionsCount || 0) > 0
                  ? Math.round(
                      ((u.exactCount + u.resultCount) / u.predictionsCount) * 100
                    )
                  : 0,
            }));
          setEntries(list);
        } else {
          let startDate;
          if (period === 'weekly') startDate = getWeekStart();
          else startDate = getMonthStart();

          const data = await readDocsOnce(
            query(
              collection(db, 'prediction_results'),
              where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))
            ),
            `hist_${period}`,
            600_000
          );
          if (cancelled) return;

          const userMap = {};
          data.forEach((r) => {
            if (!userMap[r.userId]) {
              userMap[r.userId] = {
                uid: r.userId,
                displayName: 'Player',
                points: 0,
                predictions: 0,
                exact: 0,
                result: 0,
                miss: 0,
                resolved: 0,
              };
            }
            const u = userMap[r.userId];
            u.predictions++;
            u.resolved++;
            u.points += r.points || 0;
            if (r.resultType === 'exact') u.exact++;
            else if (r.resultType === 'result') u.result++;
            else u.miss++;
          });

          const list = Object.values(userMap)
            .filter((u) => u.predictions > 0)
            .sort(
              (a, b) =>
                b.points - a.points || b.exact - a.exact || b.result - a.result
            )
            .map((u, i) => ({
              ...u,
              rank: i + 1,
              accuracy:
                u.resolved > 0
                  ? Math.round(((u.exact + u.result) / u.resolved) * 100)
                  : 0,
            }));
          setEntries(list);
        }
      } catch (err) {
        if (err.code === 'permission-denied') setError('permissions');
        else setError(err.message);
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const stats = useMemo(() => {
    if (!entries.length) {
      return { avg: '0.0', preds: 0, exact: 0, players: 0 };
    }
    return {
      avg: (
        entries.reduce((s, u) => s + u.accuracy, 0) / entries.length
      ).toFixed(1),
      preds: entries.reduce((s, u) => s + u.predictions, 0),
      exact: entries.reduce((s, u) => s + u.exact, 0),
      players: entries.length,
    };
  }, [entries]);

  return { entries, top3, rest, stats, loading, error };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyStats
   ═══════════════════════════════════════════════════════════════
   Combines data from multiple cached hooks.
   Since each sub-hook is cached, this adds 0 extra reads.
   ═══════════════════════════════════════════════════════════════ */

export function useMyStats(uid, date) {
  const dateStr = date || todayStr();
  const { scoreMap, preds: activePreds } = useActivePredictions(dateStr);
  const myPreds = useMyPredictions(uid, dateStr);
  const points = useUserPoints(uid);
  const { resultMap } = usePredictionResults(uid);

  return useMemo(() => {
    const myPredValues = Object.values(myPreds);
    const predicted = myPredValues.length;
    const total = activePreds.length;

    if (points) {
      const exact = points.exactCount || 0;
      const result = points.resultCount || 0;
      const miss = points.missCount || 0;
      const pts = points.totalPoints || 0;
      const resolved = exact + result + miss;
      return {
        predicted,
        total,
        exact,
        result,
        miss,
        points: pts,
        resolved,
        accuracy:
          resolved > 0
            ? Math.round(((exact + result) / resolved) * 100)
            : 0,
        todayExact: Object.values(resultMap).filter(
          (r) => r.resultType === 'exact'
        ).length,
        todayResult: Object.values(resultMap).filter(
          (r) => r.resultType === 'result'
        ).length,
        todayMiss: Object.values(resultMap).filter(
          (r) => r.resultType === 'miss'
        ).length,
        todayPoints: Object.values(resultMap).reduce(
          (s, r) => s + (r.points || 0),
          0
        ),
      };
    }

    let exact = 0;
    let result = 0;
    let miss = 0;
    let pts = 0;
    let resolved = 0;

    myPredValues.forEach((p) => {
      const a = scoreMap.get(String(p.matchId));
      if (!a) return;
      resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, a.h, a.a);
      pts += r.points;
      if (r.type === 'exact') exact++;
      else if (r.type === 'result') result++;
      else miss++;
    });

    return {
      predicted,
      total,
      exact,
      result,
      miss,
      points: pts,
      resolved,
      accuracy:
        resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
      todayExact: exact,
      todayResult: result,
      todayMiss: miss,
      todayPoints: pts,
    };
  }, [myPreds, scoreMap, activePreds, points, resultMap]);
}

/* ═══════════════════════════════════════════════════════════════
   ACTION: savePrediction
   ═══════════════════════════════════════════════════════════════ */

export async function savePrediction(uid, displayName, pred, h, a) {
  if (!db) return;
  const dateStr = pred.matchDate || todayStr();

  await setDoc(
    doc(db, 'user_predictions', `${uid}_${pred.id}`),
    {
      userId: uid,
      displayName: displayName || 'Anonymous',
      matchId: pred.matchId,
      predId: pred.id,
      homeScore: h,
      awayScore: a,
      matchDate: dateStr,
      homeTeam: pred.homeTeam?.name || pred.homeTeam || 'Home',
      awayTeam: pred.awayTeam?.name || pred.awayTeam || 'Away',
      homeLogo: pred.homeLogo || pred.homeTeam?.logo || null,
      awayLogo: pred.awayLogo || pred.awayTeam?.logo || null,
      league: pred.league?.name || pred.league || '',
      kickoff: pred.kickoff || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Invalidate cache so next read picks up the new prediction
  invalidateCache(`myPreds_${uid}_${dateStr}`);
}

/* ═══════════════════════════════════════════════════════════════
   ACTION: saveZokaVote
   ═══════════════════════════════════════════════════════════════
   Uses atomic increments on a single stats doc.
   User's own vote stored in localStorage for display.

   OLD: setDoc per vote doc + onSnapshot to read all votes
   NEW: 1 write (atomic increment) + localStorage for own vote
   ═══════════════════════════════════════════════════════════════ */

export async function saveZokaVote(uid, matchId, vote) {
  if (!db) return;
  const dateStr = todayStr();

  // Atomic increment on single stats doc (1 write)
  await setDoc(
    doc(db, 'zoka_vote_stats', dateStr),
    {
      stats: {
        [matchId]: {
          agree: increment(vote === 'agree' ? 1 : 0),
          disagree: increment(vote === 'disagree' ? 1 : 0),
          total: increment(1),
        },
      },
      updatedAt: serverTimestamp(),
      date: dateStr,
    },
    { merge: true }
  );

  // Store user's own vote in localStorage (0 reads)
  try {
    const key = `zoka_votes_${dateStr}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing[matchId] = vote;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // Ignore localStorage errors
  }

  // Invalidate stats cache
  invalidateCache(`zokaVotes_${dateStr}`);
}

/* ═══════════════════════════════════════════════════════════════
   ACTION: removeZokaVote
   ═══════════════════════════════════════════════════════════════
   Decrements old count, increments new count (if toggling).
   ═══════════════════════════════════════════════════════════════ */

export async function removeZokaVote(uid, matchId, newVote) {
  if (!db) return;
  const dateStr = todayStr();

  // Read current stats to know what to decrement
  const snap = await getDoc(doc(db, 'zoka_vote_stats', dateStr));
  if (!snap.exists()) return;

  const data = snap.data();
  const current = data.stats?.[matchId];
  if (!current) return;

  // Get old vote from localStorage
  const key = `zoka_votes_${dateStr}`;
  let existing = {};
  try {
    existing = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    // Ignore localStorage errors
  }

  const oldV = existing[matchId];
  const matchStats = { ...current };

  // Decrement old vote
  if (oldV === 'agree') {
    matchStats.agree = Math.max(0, (matchStats.agree || 1) - 1);
    matchStats.total = Math.max(0, (matchStats.total || 1) - 1);
  } else if (oldV === 'disagree') {
    matchStats.disagree = Math.max(0, (matchStats.disagree || 1) - 1);
    matchStats.total = Math.max(0, (matchStats.total || 1) - 1);
  }

  // If toggling (not just removing), increment new vote
  if (newVote) {
    if (newVote === 'agree') matchStats.agree = (matchStats.agree || 0) + 1;
    else matchStats.disagree = (matchStats.disagree || 0) + 1;
    matchStats.total = (matchStats.total || 0) + 1;
    existing[matchId] = newVote;
  } else {
    delete existing[matchId];
  }

  await setDoc(
    doc(db, 'zoka_vote_stats', dateStr),
    {
      stats: {
        [matchId]: matchStats,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  try {
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // Ignore localStorage errors
  }

  invalidateCache(`zokaVotes_${dateStr}`);
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN EXPORTS
   ═══════════════════════════════════════════════════════════════ */

/** Resolve a match for all users. Admin only. */
export { resolveMatchForAllUsers };

/** Force-refresh active predictions (bypass cache). Admin only. */
export async function adminRefreshActivePredictions(dateStr) {
  invalidateCache(`active_${dateStr}`);
  const data = await readDocsOnce(
    query(
      collection(db, 'active_predictions'),
      where('matchDate', '==', dateStr)
    ),
    `active_${dateStr}`,
    0 // force refresh
  );
  return data.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}