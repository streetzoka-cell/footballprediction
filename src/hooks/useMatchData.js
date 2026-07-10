// ═══════════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js
// ═══════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for all prediction/leaderboard data.
// Every page imports from here. No more inline data fetching.
// The universal resolver runs on EVERY page, not just Admin.
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { db } from '../utils/firebase';
import {
  collection, query, where, onSnapshot, doc, setDoc,
  getDoc, getDocs, writeBatch, serverTimestamp,
  increment, arrayUnion
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
export const todayStr = () => new Date().toISOString().split('T')[0];
export const yesterdayStr = () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};
export const tomorrowStr = () => {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};
export const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split('T')[0];
};
export const getMonthStart = () =>
  new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

export function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

/* ═══════════════════════════════════════════════════════════════
   1. UNIVERSAL RESOLVER
   ═══════════════════════════════════════════════════════════════
   Runs on EVERY page. Watches active_predictions for finished
   matches. If prediction_results don't exist yet, resolves them.
   Uses match_resolution_status doc to prevent double-resolution.
   ═══════════════════════════════════════════════════════════════ */
const _resolvingNow = new Set(); // in-memory guard for concurrent calls

async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    // Check if already resolved via status doc
    const dateKey = matchDate || todayStr();
    const statusRef = doc(db, 'match_resolution_status', dateKey);
    const statusSnap = await getDoc(statusRef);
    const alreadyResolved = new Set(
      statusSnap.exists() ? (statusSnap.data().resolvedMatches || []) : []
    );
    if (alreadyResolved.has(String(matchId))) {
      return 0; // Already done
    }

    // Get all user predictions for this match
    const predsSnap = await getDocs(
      query(collection(db, 'user_predictions'), where('matchId', '==', matchId))
    );
    if (predsSnap.empty) {
      // Mark as resolved even if no predictions (avoid re-checking)
      await setDoc(statusRef, {
        resolvedMatches: arrayUnion(String(matchId)),
        lastResolvedAt: serverTimestamp(),
        date: dateKey,
      }, { merge: true });
      return 0;
    }

    const batch = writeBatch(db);
    let count = 0;

    predsSnap.forEach(d => {
      const p = d.data();
      const uid = p.userId;
      const r = calcPoints(p.homeScore, p.awayScore, actualH, actualA);

      // Write prediction result (idempotent with merge:true)
      batch.set(doc(db, 'prediction_results', `${uid}_${matchId}`), {
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
      }, { merge: true });

      // Update cumulative points (increment is atomic)
      batch.set(doc(db, 'user_points_total', uid), {
        totalPoints: increment(r.points),
        exactCount: increment(r.type === 'exact' ? 1 : 0),
        resultCount: increment(r.type === 'result' ? 1 : 0),
        missCount: increment(r.type === 'miss' ? 1 : 0),
        predictionsCount: increment(1),
        resolvedMatchIds: arrayUnion(String(matchId)),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      count++;
    });

    // Also update zoka_picks if this match is in there
    const zokaRef = doc(db, 'zoka_picks', dateKey);
    const zokaSnap = await getDoc(zokaRef);
    if (zokaSnap.exists()) {
      const zokaData = zokaSnap.data();
      const matches = zokaData.matches || [];
      let changed = false;
      const updated = matches.map(m => {
        if (String(m.matchId) === String(matchId) && m.status !== 'finished') {
          changed = true;
          return { ...m, homeScore: actualH, awayScore: actualA, status: 'finished' };
        }
        return m;
      });
      if (changed) {
        batch.set(zokaRef, { ...zokaData, matches: updated, updatedAt: serverTimestamp() }, { merge: true });
      }
    }

    // Mark match as resolved
    batch.set(statusRef, {
      resolvedMatches: arrayUnion(String(matchId)),
      lastResolvedAt: serverTimestamp(),
      date: dateKey,
    }, { merge: true });

    await batch.commit();
    return count;
  } catch (e) {
    console.error(`[UniversalResolver] Failed for match ${matchId}:`, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

/**
 * Hook: useUniversalResolver
 * Call this on EVERY page to ensure resolution happens even without Admin open.
 * Returns { status: 'idle' | 'resolving' | 'done', lastResolved: number }
 */
export function useUniversalResolver(date) {
  const dateStr = date || todayStr();
  const [status, setStatus] = useState('idle');
  const [lastResolved, setLastResolved] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!db) return;

    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr));
    const unsub = onSnapshot(q, async (snap) => {
      if (!mountedRef.current) return;

      const preds = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const finished = preds.filter(
        p => p.status === 'finished' && p.homeScore != null && p.awayScore != null
      );

      if (finished.length === 0) {
        setStatus('idle');
        return;
      }

      setStatus('resolving');
      let total = 0;

      // Resolve each finished match (resolver internally skips already-resolved ones)
      for (const p of finished) {
        const n = await resolveMatchForAllUsers(
          String(p.matchId), p.homeScore, p.awayScore, dateStr
        );
        total += n;
      }

      if (total > 0 && mountedRef.current) {
        setLastResolved(total);
        setStatus('done');
        // Reset status after a delay
        setTimeout(() => {
          if (mountedRef.current) setStatus('idle');
        }, 3000);
      } else if (mountedRef.current) {
        setStatus('idle');
      }
    }, err => {
      console.error('[UniversalResolver] Snapshot error:', err);
      if (mountedRef.current) setStatus('idle');
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [dateStr]);

  return { status, lastResolved };
}

/* ═══════════════════════════════════════════════════════════════
   2. ACTIVE PREDICTIONS (featured matches for a date)
   ═══════════════════════════════════════════════════════════════ */
export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      setPreds(list);
      setLastUpdate(Date.now());
      setLoading(false);
      setError(null);
    }, err => {
      console.error('[useActivePredictions]', err);
      setError(err.message);
      setLoading(false);
    });
    return () => unsub();
  }, [dateStr]);

  // Derive score map for finished matches
  const scoreMap = useMemo(() => {
    const m = new Map();
    preds.forEach(p => {
      if (p.status === 'finished' && p.homeScore != null) {
        m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
      }
    });
    return m;
  }, [preds]);

  return { preds, scoreMap, loading, error, lastUpdate };
}

/* ═══════════════════════════════════════════════════════════════
   3. USER PREDICTIONS (all users' predictions for a date)
   ═══════════════════════════════════════════════════════════════ */
export function useAllUserPredictions(date) {
  const dateStr = date || todayStr();
  const [allPreds, setAllPreds] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', dateStr));
    const unsub = onSnapshot(q, snap => {
      setAllPreds(snap.docs.map(d => d.data()));
      setLastUpdate(Date.now());
    }, () => {});
    return () => unsub();
  }, [dateStr]);

  // Map: predId -> user's prediction
  const userPredMap = useMemo(() => {
    const m = {};
    allPreds.forEach(p => { m[p.predId] = p; });
    return m;
  }, [allPreds]);

  // Map: predId -> count of predictions
  const predCounts = useMemo(() => {
    const m = {};
    allPreds.forEach(p => { m[p.predId] = (m[p.predId] || 0) + 1; });
    return m;
  }, [allPreds]);

  // Map: predId -> { "2-1": 5, "1-0": 3, ... }
  const predDist = useMemo(() => {
    const m = {};
    allPreds.forEach(p => {
      if (!m[p.predId]) m[p.predId] = {};
      const k = `${p.homeScore}-${p.awayScore}`;
      m[p.predId][k] = (m[p.predId][k] || 0) + 1;
    });
    return m;
  }, [allPreds]);

  return { allPreds, userPredMap, predCounts, predDist, lastUpdate };
}

/* ═══════════════════════════════════════════════════════════════
   4. SINGLE USER'S PREDICTIONS (for the logged-in user)
   ═══════════════════════════════════════════════════════════════ */
export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const [myPreds, setMyPreds] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', dateStr));
    const unsub = onSnapshot(q, snap => {
      const map = {};
      snap.docs.forEach(d => {
        const p = d.data();
        if (p.userId === uid) map[p.predId] = p;
      });
      setMyPreds(map);
    }, () => {});
    return () => unsub();
  }, [uid, dateStr]);

  return myPreds;
}

/* ═══════════════════════════════════════════════════════════════
   5. PREDICTION RESULTS (resolved outcomes for a user)
   ═══════════════════════════════════════════════════════════════ */
export function usePredictionResults(uid) {
  const [results, setResults] = useState([]);
  const [resultMap, setResultMap] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    const q = query(collection(db, 'prediction_results'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => d.data())
        .sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
      setResults(list);
      const m = {};
      list.forEach(r => { m[String(r.matchId)] = r; });
      setResultMap(m);
    }, () => {});
    return () => unsub();
  }, [uid]);

  return { results, resultMap };
}

/* ═══════════════════════════════════════════════════════════════
   6. USER POINTS TOTAL (cumulative stats)
   ═══════════════════════════════════════════════════════════════ */
export function useUserPoints(uid) {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!uid || !db) return;
    const unsub = onSnapshot(doc(db, 'user_points_total', uid), snap => {
      setPoints(snap.exists() ? snap.data() : null);
    }, () => setPoints(null));
    return () => unsub();
  }, [uid]);

  return points;
}

/* ═══════════════════════════════════════════════════════════════
   7. ZOKA PICKS (admin's published picks)
   ═══════════════════════════════════════════════════════════════ */
export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const [picks, setPicks] = useState(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'zoka_picks', dateStr), snap => {
      setPicks(snap.exists() ? snap.data() : null);
    }, () => setPicks(null));
    return () => unsub();
  }, [dateStr]);

  return picks;
}

/* ═══════════════════════════════════════════════════════════════
   8. ZOKA VOTES
   ═══════════════════════════════════════════════════════════════ */
export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const [votes, setVotes] = useState([]);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'zoka_votes'), where('date', '==', dateStr));
    const unsub = onSnapshot(q, snap => setVotes(snap.docs.map(d => d.data())), () => {});
    return () => unsub();
  }, [dateStr]);

  const voteStats = useMemo(() => {
    const s = {};
    votes.forEach(v => {
      if (!s[v.matchId]) s[v.matchId] = { agree: 0, disagree: 0, total: 0 };
      if (v.vote === 'agree') s[v.matchId].agree++;
      else s[v.matchId].disagree++;
      s[v.matchId].total++;
    });
    return s;
  }, [votes]);

  const userVotes = useMemo(() => {
    const m = {};
    votes.forEach(v => { m[v.matchId] = v.vote; });
    return m;
  }, [votes]);

  return { votes, voteStats, userVotes };
}

/* ═══════════════════════════════════════════════════════════════
   9. DAILY LEADERBOARD — THE KEY UNIFIED COMPUTATION
   ═══════════════════════════════════════════════════════════════
   This is THE single source of truth for daily rankings.
   Both Predictions.jsx and Leaderboard.jsx use THIS function.
   
   Strategy:
   - Read prediction_results for today's resolved matches (authoritative)
   - ALSO read user_predictions + active_predictions scores (for unresolved/real-time)
   - Merge: use prediction_results when available, compute when not
   - This means the leaderboard is ALWAYS consistent
   ═══════════════════════════════════════════════════════════════ */
export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    setIsLive(true);

    // Listener 1: prediction_results for today (authoritative resolved data)
    const q1 = query(
      collection(db, 'prediction_results'),
      where('matchDate', '==', dateStr)
    );

    // Listener 2: user_predictions for today (for unresolved matches)
    const q2 = query(
      collection(db, 'user_predictions'),
      where('matchDate', '==', dateStr)
    );

    // Listener 3: active_predictions for scores
    const q3 = query(
      collection(db, 'active_predictions'),
      where('matchDate', '==', dateStr)
    );

    let resolvedMap = new Map(); // userId -> { matchId -> result }
    let rawPreds = [];
    let scoreMap = new Map();   // matchId -> { h, a }

    const compute = () => {
      // Step 1: Build user stats from prediction_results (authoritative)
      const userStats = {};

      // Add resolved results
      resolvedMap.forEach((matchResults, userId) => {
        if (!userStats[userId]) {
          userStats[userId] = {
            uid: userId,
            displayName: 'Player',
            points: 0,
            predictions: 0,
            exact: 0,
            result: 0,
            miss: 0,
            resolved: 0,
          };
        }
        const u = userStats[userId];
        matchResults.forEach(r => {
          u.predictions++;
          u.resolved++;
          u.points += r.points || 0;
          if (r.resultType === 'exact') u.exact++;
          else if (r.resultType === 'result') u.result++;
          else u.miss++;
          // Grab display name from first result
          if (u.displayName === 'Player' && r.homeTeam) {
            // Will be overwritten by raw preds if available
          }
        });
      });

      // Step 2: Add unresolved predictions (compute on-the-fly)
      const resolvedMatchIds = new Set();
      resolvedMap.forEach((matchResults) => {
        matchResults.forEach(r => resolvedMatchIds.add(String(r.matchId)));
      });

      rawPreds.forEach(p => {
        const mid = String(p.matchId);
        if (resolvedMatchIds.has(mid)) {
          // Already have authoritative result, just grab display name
          if (userStats[p.userId]) {
            userStats[p.userId].displayName = p.displayName || 'Player';
          }
          return;
        }

        // Not yet resolved — compute from raw data
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

        const actual = scoreMap.get(mid);
        if (!actual) return;
        u.resolved++;
        const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
        u.points += r.points;
        if (r.type === 'exact') u.exact++;
        else if (r.type === 'result') u.result++;
        else u.miss++;
      });

      // Step 3: Sort and rank
      const sorted = Object.values(userStats)
        .filter(u => u.predictions > 0)
        .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
        .map((u, i) => ({
          ...u,
          rank: i + 1,
          accuracy: u.resolved > 0
            ? Math.round(((u.exact + u.result) / u.resolved) * 100)
            : 0,
        }));

      setEntries(sorted);
      setLoading(false);
    };

    const unsub1 = onSnapshot(q1, snap => {
      const map = new Map();
      snap.docs.forEach(d => {
        const r = d.data();
        const uid = r.userId;
        if (!map.has(uid)) map.set(uid, []);
        map.get(uid).push(r);
      });
      resolvedMap = map;
      compute();
    }, err => {
      console.error('[DailyLB] Results error:', err);
      setLoading(false);
    });

    const unsub2 = onSnapshot(q2, snap => {
      rawPreds = snap.docs.map(d => d.data());
      compute();
    }, () => {});

    const unsub3 = onSnapshot(q3, snap => {
      const m = new Map();
      snap.docs.forEach(d => {
        const p = d.data();
        if (p.status === 'finished' && p.homeScore != null) {
          m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
        }
      });
      scoreMap = m;
      compute();
    }, () => {});

    return () => { unsub1(); unsub2(); unsub3(); setIsLive(false); };
  }, [dateStr]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const stats = useMemo(() => {
    if (!entries.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
    return {
      avg: (entries.reduce((s, u) => s + u.accuracy, 0) / entries.length).toFixed(1),
      preds: entries.reduce((s, u) => s + u.predictions, 0),
      exact: entries.reduce((s, u) => s + u.exact, 0),
      players: entries.length,
    };
  }, [entries]);

  return { entries, top3, rest, stats, loading, isLive };
}

/* ═══════════════════════════════════════════════════════════════
   10. HISTORICAL LEADERBOARD (weekly/monthly/goat)
   ═══════════════════════════════════════════════════════════════ */
export function useHistoricalLeaderboard(period) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!db) return;
    setLoading(true);
    setError(null);

    let unsub;

    if (period === 'goat') {
      // Read from user_points_total (cumulative all-time stats)
      unsub = onSnapshot(
        collection(db, 'user_points_total'),
        snap => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(u => (u.predictionsCount || 0) > 0)
            .sort((a, b) =>
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
              rank: 0,
              accuracy: (u.predictionsCount || 0) > 0
                ? Math.round(((u.exactCount + u.resultCount) / u.predictionsCount) * 100)
                : 0,
            }))
            .map((u, i) => ({ ...u, rank: i + 1 }));
          setEntries(list);
          setLoading(false);
        },
        err => {
          if (err.code === 'permission-denied') setError('permissions');
          else setError(err.message);
          setLoading(false);
        }
      );
    } else {
      // Weekly or Monthly — read prediction_results filtered by date
      let startDate;
      if (period === 'weekly') startDate = getWeekStart();
      else startDate = getMonthStart();

      const q = query(
        collection(db, 'prediction_results'),
        where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))
      );

      unsub = onSnapshot(q, snap => {
        const userMap = {};
        snap.docs.forEach(d => {
          const r = d.data();
          if (!userMap[r.userId]) {
            userMap[r.userId] = {
              uid: r.userId,
              displayName: r.homeTeam ? 'Player' : 'Player', // will fix below
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
          u.displayName = 'Player'; // Historical results don't have displayName
          if (r.resultType === 'exact') u.exact++;
          else if (r.resultType === 'result') u.result++;
          else u.miss++;
        });

        // Enrich displayNames from user_points_total
        // (done separately to avoid nested reads in the main listener)

        const list = Object.values(userMap)
          .filter(u => u.predictions > 0)
          .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
          .map((u, i) => ({
            ...u,
            rank: i + 1,
            accuracy: u.resolved > 0
              ? Math.round(((u.exact + u.result) / u.resolved) * 100)
              : 0,
          }));
        setEntries(list);
        setLoading(false);
      }, err => {
        if (err.code === 'permission-denied') setError('permissions');
        else setError(err.message);
        setLoading(false);
      });
    }

    return () => { if (unsub) unsub(); };
  }, [period]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const stats = useMemo(() => {
    if (!entries.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
    return {
      avg: (entries.reduce((s, u) => s + u.accuracy, 0) / entries.length).toFixed(1),
      preds: entries.reduce((s, u) => s + u.predictions, 0),
      exact: entries.reduce((s, u) => s + u.exact, 0),
      players: entries.length,
    };
  }, [entries]);

  return { entries, top3, rest, stats, loading, error };
}

/* ═══════════════════════════════════════════════════════════════
   11. USER STATS (for the current user, combines all sources)
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

    // Try cumulative stats first (from user_points_total — includes ALL days)
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
        accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
        // Today-only stats (from prediction_results)
        todayExact: Object.values(resultMap).filter(r => r.resultType === 'exact').length,
        todayResult: Object.values(resultMap).filter(r => r.resultType === 'result').length,
        todayMiss: Object.values(resultMap).filter(r => r.resultType === 'miss').length,
        todayPoints: Object.values(resultMap).reduce((s, r) => s + (r.points || 0), 0),
      };
    }

    // Fallback: compute today-only from raw data
    let exact = 0, result = 0, miss = 0, pts = 0, resolved = 0;
    myPredValues.forEach(p => {
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
      accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
      todayExact: exact,
      todayResult: result,
      todayMiss: miss,
      todayPoints: pts,
    };
  }, [myPreds, scoreMap, activePreds, points, resultMap]);
}

/* ═══════════════════════════════════════════════════════════════
   12. SAVE / VOTE HELPERS
   ═══════════════════════════════════════════════════════════════ */
export async function savePrediction(uid, displayName, pred, h, a) {
  if (!db) return;
  await setDoc(doc(db, 'user_predictions', `${uid}_${pred.id}`), {
    userId: uid,
    displayName: displayName || 'Anonymous',
    matchId: pred.matchId,
    predId: pred.id,
    homeScore: h,
    awayScore: a,
    matchDate: pred.matchDate || todayStr(),
    homeTeam: pred.homeTeam?.name || pred.homeTeam || 'Home',
    awayTeam: pred.awayTeam?.name || pred.awayTeam || 'Away',
    homeLogo: pred.homeLogo || pred.homeTeam?.logo || null,
    awayLogo: pred.awayLogo || pred.awayTeam?.logo || null,
    league: pred.league?.name || pred.league || '',
    kickoff: pred.kickoff || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveZokaVote(uid, matchId, vote) {
  if (!db) return;
  await setDoc(doc(db, 'zoka_votes', `${uid}_${matchId}`), {
    userId: uid,
    matchId,
    vote,
    date: todayStr(),
    createdAt: serverTimestamp(),
  }, { merge: true });
}

export async function removeZokaVote(uid, matchId) {
  if (!db) return;
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'zoka_votes', `${uid}_${matchId}`));
}