// ═══════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db } from '../utils/firebase';
import {
  collection, query, where, doc,
  setDoc, getDoc, getDocs, writeBatch, serverTimestamp, increment, runTransaction
} from 'firebase/firestore';

import { dataLayer } from '../utils/dataLayer';
import { todayStr, yesterdayStr, tomorrowStr, getWeekStart, getMonthStart } from '../utils/dates';
import { useAppData, EMPTY_STATS } from '../context/AppDataContext';
import { eventBus, EVENT } from '../utils/eventBus';

import {
  SPORT, TIMEOUT, CACHE_KEY, PATHS,
  calcPoints, RESULT_TYPE, POINTS,
} from '../utils/constants';

export { todayStr, yesterdayStr, tomorrowStr, getWeekStart, getMonthStart };

// ═══════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════

function safeEnsureUser(appData, uid) {
  if (!uid || !appData?.ensureUserData) return Promise.resolve();
  return Promise.race([
    appData.ensureUserData(uid),
    new Promise((resolve) => setTimeout(resolve, TIMEOUT.USER_LOAD_SAFETY)),
  ]);
}

function computeStats(entries) {
  if (!entries.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
  return {
    avg: (entries.reduce((s, u) => s + u.accuracy, 0) / entries.length).toFixed(1),
    preds: entries.reduce((s, u) => s + u.predictions, 0),
    exact: entries.reduce((s, u) => s + u.exact, 0),
    players: entries.length,
  };
}

function rankEntries(list) {
  return list
    .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
    .map((u, i) => ({
      ...u,
      rank: i + 1,
      accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
    }));
}

export function invalidateCache(key) { dataLayer.invalidate(key); }
export function invalidateCachePrefix(prefix) { dataLayer.invalidatePrefix(prefix); }

// ═══════════════════════════════════════════════════
// ★ ZOKA PICKS HOOKS (for guests)
// ═══════════════════════════════════════════════════

export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);
  const [picks, setPicks] = useState(null);

  // For today, just use context (now reactive via event listeners)
  useEffect(() => {
    if (isToday) setPicks(appData.zokaPicks);
  }, [isToday, appData.zokaPicks]);

  // For other dates, fetch independently
  useEffect(() => {
    if (isToday) return;
    cancelledRef.current = false;
    dataLayer.fetchZokaPicks(dateStr)
      .then((data) => { if (!cancelledRef.current) setPicks(data); })
      .catch(() => { if (!cancelledRef.current) setPicks(null); });
    return () => { cancelledRef.current = true; };
  }, [dateStr, isToday]);

  return isToday ? appData.zokaPicks : picks;
}

export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const [voteStats, setVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  // For today, use context (now reactive)
  useEffect(() => {
    if (isToday) {
      setVoteStats(appData.zokaVoteStats);
      setUserVotes(appData.currentUserVotes);
    }
  }, [isToday, appData.zokaVoteStats, appData.currentUserVotes]);

  // For other dates, fetch independently
  useEffect(() => {
    if (isToday) return;
    let cancelled = false;
    dataLayer.fetchZokaVotes(dateStr)
      .then((data) => { if (!cancelled) setVoteStats(data?.stats || {}); })
      .catch(() => { /* ignore */ });
    try {
      const stored = localStorage.getItem(`zoka_votes_${dateStr}`);
      if (stored && !cancelled) setUserVotes(JSON.parse(stored));
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, [dateStr, isToday]);

  return {
    votes: [],
    voteStats: isToday ? appData.zokaVoteStats : voteStats,
    userVotes: isToday ? appData.currentUserVotes : userVotes,
  };
}

// ═══════════════════════════════════════════════════
// ★ FEATURED MATCHES HOOKS (for logged-in users)
// ═══════════════════════════════════════════════════

export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);
  const [preds, setPreds] = useState(null);
  const [loading, setLoading] = useState(!isToday);

  // For today, use context (now reactive)
  useEffect(() => {
    if (isToday) {
      setPreds(appData.activePredictions);
      setLoading(appData.loading);
    }
  }, [isToday, appData.activePredictions, appData.loading]);

  // For other dates, fetch independently
  useEffect(() => {
    if (isToday) return;
    cancelledRef.current = false;
    setLoading(true);
    dataLayer.fetchActivePredictions(dateStr)
      .then((data) => { if (!cancelledRef.current) { setPreds(data); setLoading(false); } })
      .catch(() => { if (!cancelledRef.current) { setPreds([]); setLoading(false); } });
    return () => { cancelledRef.current = true; };
  }, [dateStr, isToday]);

  const scoreMap = useMemo(() => dataLayer.getScoreMap(isToday ? appData.activePredictions : preds || []), [isToday, appData.activePredictions, preds]);

  return {
    preds: isToday ? appData.activePredictions : (preds || []),
    scoreMap,
    loading: isToday ? appData.loading : loading,
    error: null,
    lastUpdate: appData.lastUpdate || Date.now(),
  };
}

export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);
  const [preds, setPreds] = useState(null);

  // ★ Ensure user data is loaded (lazy, once)
  useEffect(() => {
    if (uid) safeEnsureUser(appData, uid);
  }, [uid, appData]);

  // For today, use context (now reactive via MATCH_RESOLVED events)
  useEffect(() => {
    if (isToday && uid) {
      setPreds(appData.userPredictions);
    } else if (!uid) {
      setPreds({});
    }
  }, [isToday, uid, appData.userPredictions]);

  // For other dates, fetch independently
  useEffect(() => {
    if (isToday || !uid) return;
    cancelledRef.current = false;
    dataLayer.fetchUserPredictions(uid, dateStr)
      .then((data) => { if (!cancelledRef.current) setPreds(data); })
      .catch(() => { if (!cancelledRef.current) setPreds({}); });
    return () => { cancelledRef.current = true; };
  }, [uid, dateStr, isToday]);

  return isToday ? (appData.userPredictions || {}) : (preds || {});
}

// ═══════════════════════════════════════════════════
// ★ PREDICTION RESULTS HOOK
// ═══════════════════════════════════════════════════

export function usePredictionResults(uid) {
  const appData = useAppData();

  // ★ Ensure user data is loaded
  useEffect(() => {
    if (uid) safeEnsureUser(appData, uid);
  }, [uid, appData]);

  // ★ Just return from context - it's now reactive!
  if (!uid) return { results: [], resultMap: {} };
  return appData.predictionResults || { results: [], resultMap: {} };
}

// ═══════════════════════════════════════════════════
// ★ USER POINTS HOOK
// ═══════════════════════════════════════════════════

export function useUserPoints(uid) {
  const appData = useAppData();

  // ★ Ensure user data is loaded
  useEffect(() => {
    if (uid) safeEnsureUser(appData, uid);
  }, [uid, appData]);

  // ★ Just return from context - it's now reactive!
  return uid ? appData.userPoints : null;
}

// ═══════════════════════════════════════════════════
// ★ USER STATS HOOK
// ═══════════════════════════════════════════════════

export function useMyStats(uid) {
  const appData = useAppData();

  // ★ Ensure user data is loaded
  useEffect(() => {
    if (uid) safeEnsureUser(appData, uid);
  }, [uid, appData]);

  // ★ Just return from context - it's now reactive!
  if (!uid) return EMPTY_STATS;
  return appData.userStats;
}

// ═══════════════════════════════════════════════════
// ★ LEADERBOARD HOOKS
// ═══════════════════════════════════════════════════

export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);
  const [local, setLocal] = useState({ entries: null, top3: null, rest: null, stats: null, loading: false });

  // For today, use context (now reactive via DAILY_LEADERBOARD_UPDATED events)
  useEffect(() => {
    if (isToday) {
      setLocal({
        entries: appData.dailyEntries,
        top3: appData.dailyTop3,
        rest: appData.dailyRest,
        stats: appData.dailyStats,
        loading: appData.loading,
      });
    }
  }, [isToday, appData.dailyEntries, appData.dailyTop3, appData.dailyRest, appData.dailyStats, appData.loading]);

  // For other dates, fetch independently
  useEffect(() => {
    if (isToday) return;
    cancelledRef.current = false;
    setLocal((prev) => ({ ...prev, loading: true }));
    dataLayer.fetchDailyLeaderboard(dateStr)
      .then((data) => {
        if (!cancelledRef.current) {
          if (data?.entries) {
            setLocal({
              entries: data.entries,
              top3: data.top3 || data.entries.slice(0, 3),
              rest: data.rest || data.entries.slice(3),
              stats: data.stats || computeStats(data.entries),
              loading: false,
            });
          } else {
            setLocal({ entries: [], top3: [], rest: [], stats: computeStats([]), loading: false });
          }
        }
      })
      .catch(() => {
        if (!cancelledRef.current) {
          setLocal({ entries: [], top3: [], rest: [], stats: computeStats([]), loading: false });
        }
      });
    return () => { cancelledRef.current = true; };
  }, [dateStr, isToday]);

  return {
    entries: isToday ? (appData.dailyEntries || []) : (local.entries || []),
    top3: isToday ? (appData.dailyTop3 || []) : (local.top3 || []),
    rest: isToday ? (appData.dailyRest || []) : (local.rest || []),
    stats: isToday ? (appData.dailyStats || computeStats([])) : (local.stats || computeStats([])),
    loading: isToday ? appData.loading : local.loading,
    isLive: false,
  };
}

export function useHistoricalLeaderboard(period) {
  const appData = useAppData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cachedData = appData.historicalLeaderboards?.[period];

  useEffect(() => {
    if (cachedData) {
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setError('timeout');
      }
    }, TIMEOUT.HIST_LOAD_SAFETY);

    appData.loadHistoricalLeaderboard?.(period)
      .then(() => {
        if (!cancelled) {
          setLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoading(false);
          setError('load_failed');
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [period, cachedData, appData]);

  const data = appData.historicalLeaderboards?.[period] || cachedData;
  const entries = data?.entries || [];
  const stale = data?.stale ?? true;
  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);
  const stats = useMemo(() => computeStats(entries), [entries]);

  return { entries, top3, rest, stats, loading, error, stale };
}

// ═══════════════════════════════════════════════════
// ★ USER ACTIONS
// ═══════════════════════════════════════════════════

export async function savePrediction(uid, displayName, pred, h, a) {
  if (!db) throw new Error('Firestore not initialized');

  const matchId = String(pred.matchId || pred.id);
  const dateStr = pred.matchDate || pred._dateStr || todayStr();
  const predId = `${uid}_${matchId}`;

  // Prevent [object Object] from being saved if pred.homeTeam is an object
  const homeTeamName = typeof pred.homeTeam === 'object'
    ? (pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home')
    : (pred.homeTeam || 'Home');

  const awayTeamName = typeof pred.awayTeam === 'object'
    ? (pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away')
    : (pred.awayTeam || 'Away');

  await setDoc(doc(db, PATHS.USER_PREDICTIONS, predId), {
    userId: uid,
    displayName: displayName || 'Anonymous',
    matchId,
    predId,
    homeScore: Number(h),
    awayScore: Number(a),
    matchDate: dateStr,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeLogo: pred.homeLogo || pred.homeTeam?.crest || pred.homeTeam?.logo || null,
    awayLogo: pred.awayLogo || pred.awayTeam?.crest || pred.awayTeam?.logo || null,
    league: pred.league?.name || pred.league || '',
    kickoff: pred.kickoff || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // ★ Invalidate cache - context will handle re-fetch via event
  dataLayer.invalidate(CACHE_KEY.userPredictions(uid, dateStr));

  // ★ Emit event - context listener will refresh user data
  eventBus.emit(EVENT.USER_PREDICTION_SAVED, {
    uid,
    matchId,
    predId,
    dateStr,
    homeScore: Number(h),
    awayScore: Number(a),
  });
}

export async function saveZokaVote(uid, matchId, vote) {
  if (!db) return;
  const dateStr = todayStr();
  await setDoc(
    doc(db, PATHS.ZOKA_VOTE_STATS, dateStr),
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

  try {
    const key = `zoka_votes_${dateStr}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing[matchId] = vote;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* ignore */ }

  // ★ Emit event - context listener will refresh vote stats
  dataLayer.invalidate(CACHE_KEY.zokaVotes(dateStr));
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote, dateStr });
}

export async function removeZokaVote(uid, matchId, newVote) {
  if (!db) return;
  const dateStr = todayStr();
  const key = `zoka_votes_${dateStr}`;
  let existing = {};
  try {
    existing = JSON.parse(localStorage.getItem(key) || '{}');
  } catch { /* ignore */ }
  const oldV = existing[matchId];

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, PATHS.ZOKA_VOTE_STATS, dateStr);
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data().stats?.[matchId] : null;
    if (!current) return;

    const matchStats = { ...current };
    if (oldV === 'agree') {
      matchStats.agree = Math.max(0, (matchStats.agree || 1) - 1);
      matchStats.total = Math.max(0, (matchStats.total || 1) - 1);
    } else if (oldV === 'disagree') {
      matchStats.disagree = Math.max(0, (matchStats.disagree || 1) - 1);
      matchStats.total = Math.max(0, (matchStats.total || 1) - 1);
    }

    if (newVote) {
      if (newVote === 'agree') matchStats.agree = (matchStats.agree || 0) + 1;
      else matchStats.disagree = (matchStats.disagree || 0) + 1;
      matchStats.total = (matchStats.total || 0) + 1;
    }
    transaction.set(ref, { stats: { [matchId]: matchStats }, updatedAt: serverTimestamp() }, { merge: true });
  });

  try {
    if (newVote) existing[matchId] = newVote;
    else delete existing[matchId];
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* ignore */ }

  // ★ Emit event - context listener will refresh
  dataLayer.invalidate(CACHE_KEY.zokaVotes(dateStr));
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote: newVote, dateStr });
}

// ═══════════════════════════════════════════════════
// ★ ADMIN FUNCTIONS
// ⚠️ SECURITY WARNING: These should ideally be Cloud Functions.
// ═══════════════════════════════════════════════════

async function _updateDailySummaryIncremental(dateStr, resolvedList) {
  if (!db || !resolvedList.length) return;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, PATHS.DAILY_LEADERBOARD, dateStr);
    const snap = await transaction.get(ref);
    const base = snap.exists() ? snap.data() : null;
    const entryMap = new Map();
    if (base?.entries) base.entries.forEach((e) => entryMap.set(e.uid, { ...e }));
    const scoreMap = base?.scoreMap ? { ...base.scoreMap } : {};

    for (const r of resolvedList) {
      scoreMap[String(r.matchId)] = { h: r.actualH, a: r.actualA };
      let entry = entryMap.get(r.userId);
      if (!entry) {
        entry = {
          uid: r.userId,
          displayName: r.displayName || 'Player',
          points: 0,
          predictions: 0,
          exact: 0,
          result: 0,
          miss: 0,
          resolved: 0,
        };
        entryMap.set(r.userId, entry);
      }
      entry.displayName = r.displayName || entry.displayName || 'Player';
      entry.predictions += 1;
      entry.resolved += 1;
      entry.points += r.points;
      if (r.resultType === RESULT_TYPE.EXACT) entry.exact += 1;
      else if (r.resultType === RESULT_TYPE.RESULT) entry.result += 1;
      else entry.miss += 1;
    }

    const entries = rankEntries([...entryMap.values()].filter((u) => u.predictions > 0));
    transaction.set(
      ref,
      {
        entries,
        top3: entries.slice(0, 3),
        rest: entries.slice(3),
        stats: computeStats(entries),
        scoreMap,
        predDist: base?.predDist || {},
        predCounts: base?.predCounts || {},
        date: dateStr,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  // ★ Emit with entries: null so hooks fetch fresh data
  eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries: null });
}

async function _updateGoatIncremental(resolvedList) {
  if (!db || !resolvedList.length) return;

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current');
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;

    const entryMap = new Map();
    (snap.data().entries || []).forEach((e) => entryMap.set(e.uid, { ...e }));

    for (const r of resolvedList) {
      let entry = entryMap.get(r.userId);
      if (!entry) {
        entry = {
          uid: r.userId,
          displayName: r.displayName || 'Player',
          points: 0,
          predictions: 0,
          exact: 0,
          result: 0,
          miss: 0,
          resolved: 0,
        };
        entryMap.set(r.userId, entry);
      }
      entry.displayName = r.displayName || entry.displayName || 'Player';
      entry.points += r.points;
      entry.predictions += 1;
      entry.resolved += 1;
      if (r.resultType === RESULT_TYPE.EXACT) entry.exact += 1;
      else if (r.resultType === RESULT_TYPE.RESULT) entry.result += 1;
      else entry.miss += 1;
    }

    const entries = rankEntries([...entryMap.values()].filter((u) => u.predictions > 0));
    transaction.set(
      ref,
      {
        entries,
        top3: entries.slice(0, 3),
        rest: entries.slice(3),
        stats: computeStats(entries),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });

  eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries: null });
}

const _resolvingNow = new Set();

export async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    const dateKey = matchDate || todayStr();
    const numH = Number(actualH);
    const numA = Number(actualA);
    if (isNaN(numH) || isNaN(numA)) {
      console.error(`[Resolver] Invalid scores for ${matchId}`);
      return 0;
    }

    const statusRef = doc(db, PATHS.MATCH_RESOLUTION_STATUS, dateKey);

    // Use transaction for exactly-once resolution lock
    let alreadyResolved = false;
    await runTransaction(db, async (transaction) => {
      const statusSnap = await transaction.get(statusRef);
      const resolvedMatches = statusSnap.exists() ? statusSnap.data().resolvedMatches || [] : [];
      if (resolvedMatches.includes(String(matchId))) {
        alreadyResolved = true;
        return;
      }
      resolvedMatches.push(String(matchId));
      transaction.set(statusRef, { resolvedMatches, lastResolvedAt: serverTimestamp(), date: dateKey }, { merge: true });
    });

    if (alreadyResolved) return 0;

    const predsSnap = await getDocs(
      query(collection(db, PATHS.USER_PREDICTIONS), where('matchId', '==', String(matchId)))
    );

    if (predsSnap.empty) return 0;

    const resolvedList = [];
    const predBatch = writeBatch(db);
    let hasError = false;

    predsSnap.forEach((d) => {
      if (hasError) return;
      try {
        const p = d.data();
        const uid = p.userId;
        const r = calcPoints(p.homeScore, p.awayScore, numH, numA);
        const points = r.points ?? 0;
        const resultType = r.type ?? 'miss';

        resolvedList.push({
          userId: uid,
          displayName: p.displayName || 'Player',
          matchId: String(matchId),
          points,
          resultType,
          actualH: numH,
          actualA: numA,
        });

        predBatch.set(
          doc(db, 'prediction_results', `${uid}_${matchId}`),
          {
            userId: uid,
            matchId: String(matchId),
            predId: `${uid}_${matchId}`,
            matchDate: p.matchDate || dateKey,
            homeTeam: p.homeTeam || 'Home',
            awayTeam: p.awayTeam || 'Away',
            homeLogo: p.homeLogo || null,
            awayLogo: p.awayLogo || null,
            league: p.league || '',
            kickoff: p.kickoff || null,
            predictedHome: p.homeScore,
            predictedAway: p.awayScore,
            actualHome: numH,
            actualAway: numA,
            points,
            resultType,
            resolvedAt: serverTimestamp(),
          },
          { merge: true }
        );

        predBatch.set(
          doc(db, 'user_points_total', uid),
          {
            totalPoints: increment(points),
            exactCount: increment(resultType === 'exact' ? 1 : 0),
            resultCount: increment(resultType === 'result' ? 1 : 0),
            missCount: increment(resultType === 'miss' ? 1 : 0),
            predictionsCount: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('[Resolver] Error processing prediction for', matchId, err);
        hasError = true;
      }
    });

    if (hasError) return 0;
    try {
      await predBatch.commit();
    } catch (err) {
      console.error('[Resolver] Batch commit failed:', err);
      return 0;
    }

    // Update zoka picks with actual scores
    const metaBatch = writeBatch(db);
    const zokaSnap = await getDoc(doc(db, PATHS.ZOKA_PICKS, dateKey));

    let zokaChanged = false;
    if (zokaSnap.exists()) {
      const zokaData = zokaSnap.data();
      const matches = zokaData.matches || [];
      const updated = matches.map((m) => {
        if (String(m.matchId) === String(matchId) && m.status !== 'finished') {
          zokaChanged = true;
          return { ...m, homeScore: numH, awayScore: numA, status: 'finished' };
        }
        return m;
      });

      if (zokaChanged) {
        metaBatch.set(doc(db, PATHS.ZOKA_PICKS, dateKey), { ...zokaData, matches: updated, updatedAt: serverTimestamp() }, { merge: true });
      }
    }

    try {
      await metaBatch.commit();
    } catch (err) {
      console.error('[Resolver] Meta batch failed:', err);
    }

    // Update leaderboards
    await _updateDailySummaryIncremental(dateKey, resolvedList);
    await _updateGoatIncremental(resolvedList);

    // ★ Invalidate all relevant caches
    dataLayer.invalidatePrefix(`dlb:${dateKey}`);
    resolvedList.forEach((r) => {
      dataLayer.invalidate(CACHE_KEY.userPoints(r.userId));
      dataLayer.invalidate(CACHE_KEY.predictionResults(r.userId, dateKey));
      dataLayer.invalidate(CACHE_KEY.userPredictions(r.userId, dateKey));
    });
    dataLayer.invalidate(CACHE_KEY.historical('goat'));
    dataLayer.invalidate(CACHE_KEY.activePredictions(dateKey));
    dataLayer.invalidate(CACHE_KEY.zokaPicks(dateKey));

    // ★ Emit event - AppDataContext listener will handle UI updates
    eventBus.emit(EVENT.MATCH_RESOLVED, {
      matchId: String(matchId),
      dateStr: dateKey,
      actualH: numH,
      actualA: numA,
      results: resolvedList,
      affectedUsers: resolvedList.map((r) => r.userId),
    });

    return resolvedList.length;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

// ═══════════════════════════════════════════════════
// ★ REBUILD FUNCTIONS (admin use)
// ═══════════════════════════════════════════════════

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();
  try {
    const resultsSnap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('matchDate', '==', dateStr)));
    let predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('matchDate', '==', dateStr)));
    if (predsSnap.empty) predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '!=', '')));
    const activeSnap = await getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr)));

    const scoreMap = {};
    activeSnap.docs.forEach((d) => {
      const p = d.data();
      if (p.status === 'finished' && p.homeScore != null) {
        scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore };
      }
    });

    const userStats = {};
    resultsSnap.docs.forEach((d) => {
      const r = d.data();
      if (!userStats[r.userId]) {
        userStats[r.userId] = { uid: r.userId, displayName: 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      }
      const u = userStats[r.userId];
      u.predictions++;
      u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
      else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
      else u.miss++;
    });

    const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));
    predsSnap.docs.forEach((d) => {
      const p = d.data();
      if (p.matchDate && p.matchDate !== dateStr) return;
      const mid = String(p.matchId);
      if (resolvedIds.has(mid)) {
        if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || 'Player';
        return;
      }
      if (!userStats[p.userId]) {
        userStats[p.userId] = { uid: p.userId, displayName: p.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      }
      const u = userStats[p.userId];
      u.predictions++;
      const actual = scoreMap[mid];
      if (!actual) return;
      u.resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
      u.points += r.points;
      if (r.type === RESULT_TYPE.EXACT) u.exact++;
      else if (r.type === RESULT_TYPE.RESULT) u.result++;
      else u.miss++;
    });

    const entries = rankEntries(Object.values(userStats).filter((u) => u.predictions > 0));
    await setDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      scoreMap,
      updatedAt: serverTimestamp(),
      date: dateStr,
    });

    dataLayer.invalidate(CACHE_KEY.activePredictions(dateStr));
    dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(dateStr));
    eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries });
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr });
  } catch (e) {
    console.error('[Summary] Rebuild failed:', e);
  }
}

export async function rebuildGoatLeaderboard() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, PATHS.USER_POINTS_TOTAL));
    const entries = rankEntries(
      snap
        .docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => (u.predictionsCount || 0) > 0)
        .map((u) => ({
          uid: u.id,
          displayName: u.displayName || 'Player',
          points: u.totalPoints || 0,
          predictions: u.predictionsCount || 0,
          exact: u.exactCount || 0,
          result: u.resultCount || 0,
          miss: u.missCount || 0,
          resolved: u.predictionsCount || 0,
        }))
    );
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      updatedAt: serverTimestamp(),
    });
    dataLayer.invalidate(CACHE_KEY.historical('goat'));
    eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries });
  } catch (e) {
    console.error('[GOAT] Rebuild failed:', e);
  }
}

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;
  if (!startDate) {
    if (period === 'weekly') startDate = getWeekStart();
    else if (period === 'monthly') startDate = getMonthStart();
    else return;
  }
  const docId = period === 'goat' ? 'current' : period === 'weekly' ? `weekly_${startDate}` : `monthly_${startDate}`;
  try {
    const snap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))));
    const userMap = {};
    snap.docs.forEach((d) => {
      const r = d.data();
      if (!userMap[r.userId]) {
        userMap[r.userId] = { uid: r.userId, displayName: 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      }
      const u = userMap[r.userId];
      u.predictions++;
      u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
      else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
      else u.miss++;
    });
    const entries = rankEntries(Object.values(userMap).filter((u) => u.predictions > 0));
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      period,
      startDate,
      updatedAt: serverTimestamp(),
    });
    dataLayer.invalidate(CACHE_KEY.historical(period));
    eventBus.emit(EVENT.LEADERBOARD_UPDATED, { period, entries });
  } catch (e) {
    console.error(`[Period] Rebuild ${period} failed:`, e);
  }
}

export async function rebuildAllLeaderboards() {
  await Promise.all([
    rebuildDailySummary(todayStr()),
    rebuildGoatLeaderboard(),
    rebuildPeriodLeaderboard('weekly'),
    rebuildPeriodLeaderboard('monthly'),
  ]);
}

export async function adminRefreshActivePredictions(dateStr) {
  dataLayer.invalidate(CACHE_KEY.activePredictions(dateStr));
  return await dataLayer.fetchActivePredictions(dateStr);
}

export function useUniversalResolver() {}

export { eventBus, EVENT };
