// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js
// REFACTORED — Uses centralized data layer instead of direct Firestore reads
//
// ALL hooks now use dataLayer for caching.
// The cache is shared across all components, so navigating between
// pages does NOT cause duplicate Firestore reads.
//
// HOOK API UNCHANGED — Pages don't need to modify their imports.
// ═════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
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
import { dataLayer, todayStr, yesterdayStr, tomorrowStr, getWeekStart, getMonthStart } from '../utils/dataLayer';
import { useAppData } from '../context/AppDataContext';

/* ═══════════════════════════════════════════════════════════════
   EXPORTED DATE HELPERS
   ═══════════════════════════════════════════════════════════════ */

export { todayStr, yesterdayStr, tomorrowStr, getWeekStart, getMonthStart };

/* ═══════════════════════════════════════════════════════════════
   POINTS CALCULATION
   ═══════════════════════════════════════════════════════════════ */

export function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD HELPERS
   ═══════════════════════════════════════════════════════════════ */

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
      accuracy: u.resolved > 0
        ? Math.round(((u.exact + u.result) / u.resolved) * 100)
        : 0,
    }));
}

/* ═══════════════════════════════════════════════════════════════
   CACHE INVALIDATION HELPERS
   ═══════════════════════════════════════════════════════════════ */

export function invalidateCache(key) {
  dataLayer.invalidate(key);
}

export function invalidateCachePrefix(prefix) {
  dataLayer.invalidatePrefix(prefix);
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: INCREMENTAL DAILY SUMMARY UPDATE
   ═══════════════════════════════════════════════════════════════ */

async function _updateDailySummaryIncremental(dateStr, resolvedList) {
  if (!db || !resolvedList.length) return;

  const ref = doc(db, 'daily_leaderboard', dateStr);
  const snap = await getDoc(ref);

  const base = snap.exists() ? snap.data() : null;
  const entryMap = new Map();
  if (base?.entries) {
    base.entries.forEach((e) => entryMap.set(e.uid, { ...e }));
  }

  const scoreMap = base?.scoreMap ? { ...base.scoreMap } : {};

  for (const r of resolvedList) {
    scoreMap[String(r.matchId)] = { h: r.actualH, a: r.actualA };

    let entry = entryMap.get(r.userId);
    if (!entry) {
      entry = {
        uid: r.userId,
        displayName: r.displayName || 'Player',
        points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
      };
      entryMap.set(r.userId, entry);
    }
    entry.displayName = r.displayName || entry.displayName || 'Player';
    entry.predictions += 1;
    entry.resolved += 1;
    entry.points += r.points;
    if (r.resultType === 'exact') entry.exact += 1;
    else if (r.resultType === 'result') entry.result += 1;
    else entry.miss += 1;
  }

  const entries = rankEntries([...entryMap.values()].filter((u) => u.predictions > 0));

  await setDoc(ref, {
    entries,
    top3: entries.slice(0, 3),
    rest: entries.slice(3),
    stats: computeStats(entries),
    scoreMap,
    predDist: base?.predDist || {},
    predCounts: base?.predCounts || {},
    date: dateStr,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: INCREMENTAL GOAT UPDATE
   ═══════════════════════════════════════════════════════════════ */

async function _updateGoatIncremental(resolvedList) {
  if (!db || !resolvedList.length) return;

  const ref = doc(db, 'leaderboard_summaries', 'current');
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await rebuildGoatLeaderboard();
    return;
  }

  const data = snap.data();
  const entryMap = new Map();
  (data.entries || []).forEach((e) => entryMap.set(e.uid, { ...e }));

  for (const r of resolvedList) {
    let entry = entryMap.get(r.userId);
    if (!entry) {
      entry = {
        uid: r.userId,
        displayName: r.displayName || 'Player',
        points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
      };
      entryMap.set(r.userId, entry);
    }
    entry.displayName = r.displayName || entry.displayName || 'Player';
    entry.points += r.points;
    entry.predictions += 1;
    entry.resolved += 1;
    if (r.resultType === 'exact') entry.exact += 1;
    else if (r.resultType === 'result') entry.result += 1;
    else entry.miss += 1;
  }

  const entries = rankEntries([...entryMap.values()].filter((u) => u.predictions > 0));

  await setDoc(ref, {
    entries,
    top3: entries.slice(0, 3),
    rest: entries.slice(3),
    stats: computeStats(entries),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: FULL DAILY SUMMARY REBUILD
   ═══════════════════════════════════════════════════════════════ */

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();

  try {
    const resultsSnap = await getDocs(
      query(collection(db, 'prediction_results'), where('matchDate', '==', dateStr))
    );
    const predsSnap = await getDocs(
      query(collection(db, 'user_predictions'), where('matchDate', '==', dateStr))
    );
    const activeSnap = await getDocs(
      query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr))
    );

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
        userStats[r.userId] = {
          uid: r.userId, displayName: 'Player',
          points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        };
      }
      const u = userStats[r.userId];
      u.predictions++; u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === 'exact') u.exact++;
      else if (r.resultType === 'result') u.result++;
      else u.miss++;
    });

    const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));
    predsSnap.docs.forEach((d) => {
      const p = d.data();
      const mid = String(p.matchId);
      if (resolvedIds.has(mid)) {
        if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || 'Player';
        return;
      }
      if (!userStats[p.userId]) {
        userStats[p.userId] = {
          uid: p.userId, displayName: p.displayName || 'Player',
          points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
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

    const entries = rankEntries(
      Object.values(userStats).filter((u) => u.predictions > 0)
    );

    const predDist = {};
    const predCounts = {};
    predsSnap.docs.forEach((d) => {
      const p = d.data();
      if (!predDist[p.predId]) predDist[p.predId] = {};
      const k = `${p.homeScore}-${p.awayScore}`;
      predDist[p.predId][k] = (predDist[p.predId][k] || 0) + 1;
      predCounts[p.predId] = (predCounts[p.predId] || 0) + 1;
    });

    await setDoc(doc(db, 'daily_leaderboard', dateStr), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      predDist,
      predCounts,
      scoreMap,
      updatedAt: serverTimestamp(),
      date: dateStr,
    });

    invalidateCache(`active_${dateStr}`);
    invalidateCache(`dlb_${dateStr}`);
    console.log(`[Summary] Rebuilt for ${dateStr}: ${entries.length} players`);
  } catch (e) {
    console.error('[Summary] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: FULL GOAT LEADERBOARD REBUILD
   ═══════════════════════════════════════════════════════════════ */

export async function rebuildGoatLeaderboard() {
  if (!db) return;

  try {
    const snap = await getDocs(collection(db, 'user_points_total'));

    const entries = rankEntries(
      snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
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

    await setDoc(doc(db, 'leaderboard_summaries', 'current'), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      updatedAt: serverTimestamp(),
    });

    invalidateCache('hist_goat');
    console.log(`[GOAT] Rebuilt: ${entries.length} players`);
  } catch (e) {
    console.error('[GOAT] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: FULL PERIOD LEADERBOARD REBUILD
   ═══════════════════════════════════════════════════════════════ */

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;

  if (!startDate) {
    if (period === 'weekly') startDate = getWeekStart();
    else if (period === 'monthly') startDate = getMonthStart();
    else return;
  }

  const docId = period === 'goat' ? 'current' : period === 'weekly' ? `weekly_${startDate}` : `monthly_${startDate}`;
  const cacheKey = `hist_${period}`;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'prediction_results'),
        where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))
      )
    );

    const userMap = {};
    snap.docs.forEach((d) => {
      const r = d.data();
      if (!userMap[r.userId]) {
        userMap[r.userId] = {
          uid: r.userId, displayName: 'Player',
          points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        };
      }
      const u = userMap[r.userId];
      u.predictions++; u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === 'exact') u.exact++;
      else if (r.resultType === 'result') u.result++;
      else u.miss++;
    });

    const entries = rankEntries(
      Object.values(userMap).filter((u) => u.predictions > 0)
    );

    await setDoc(doc(db, 'leaderboard_summaries', docId), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      period,
      startDate,
      updatedAt: serverTimestamp(),
    });

    invalidateCache(cacheKey);
    console.log(`[Period] Rebuilt ${period} (${startDate}): ${entries.length} players`);
  } catch (e) {
    console.error(`[Period] Rebuild ${period} failed:`, e);
  }
}

export async function rebuildAllLeaderboards() {
  await rebuildDailySummary(todayStr());
  await rebuildGoatLeaderboard();
  await rebuildPeriodLeaderboard('weekly');
  await rebuildPeriodLeaderboard('monthly');
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: MATCH RESOLVER
   ═══════════════════════════════════════════════════════════════ */

const _resolvingNow = new Set();

async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    const dateKey = matchDate || todayStr();

    const statusRef = doc(db, 'match_resolution_status', dateKey);
    const statusSnap = await getDoc(statusRef);
    const alreadyResolved = new Set(
      statusSnap.exists() ? statusSnap.data().resolvedMatches || [] : []
    );
    if (alreadyResolved.has(String(matchId))) return 0;

    const predsSnap = await getDocs(
      query(collection(db, 'user_predictions'), where('matchId', '==', matchId))
    );

    if (predsSnap.empty) {
      await setDoc(statusRef, {
        resolvedMatches: [String(matchId)],
        lastResolvedAt: serverTimestamp(),
        date: dateKey,
      }, { merge: true });
      return 0;
    }

    const resolvedList = [];
    const batch = writeBatch(db);

    predsSnap.forEach((d) => {
      const p = d.data();
      const uid = p.userId;
      const r = calcPoints(p.homeScore, p.awayScore, actualH, actualA);

      resolvedList.push({
        userId: uid,
        displayName: p.displayName || 'Player',
        matchId: String(matchId),
        points: r.points,
        resultType: r.type,
        actualH,
        actualA,
      });

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
    });

    const zokaRef = doc(db, 'zoka_picks', dateKey);
    const zokaSnap = await getDoc(zokaRef);
    if (zokaSnap.exists()) {
      const zokaData = zokaSnap.data();
      const matches = zokaData.matches || [];
      let changed = false;
      const updated = matches.map((m) => {
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

    batch.set(statusRef, {
      resolvedMatches: [String(matchId)],
      lastResolvedAt: serverTimestamp(),
      date: dateKey,
    }, { merge: true });

    await batch.commit();

    await _updateDailySummaryIncremental(dateKey, resolvedList);
    await _updateGoatIncremental(resolvedList);

    // Invalidate all affected caches
    invalidateCachePrefix(`dlb_${dateKey}`);
    for (const r of resolvedList) {
      invalidateCache(`upt_${r.userId}`);
      invalidateCache(`myResults_${r.userId}_${dateKey}`);
      invalidateCache(`myPreds_${r.userId}_${dateKey}`);
    }
    invalidateCache('hist_goat');
    invalidateCache('hist_weekly');
    invalidateCache('hist_monthly');
    invalidateCache(`active_${dateKey}`);
    invalidateCache(`zoka_${dateKey}`);

    return resolvedList.length;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

/* ═══════════════════════════════════════════════════════════════
   NO-OP HOOK (kept for backward compatibility)
   ═══════════════════════════════════════════════════════════════ */

export function useUniversalResolver() {}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useActivePredictions
   ═══════════════════════════════════════════════════════════════
   NOW uses dataLayer for caching.
   If date is today, uses context data (no extra reads).
   If date is different (admin page), fetches via dataLayer.
   ═══════════════════════════════════════════════════════════════ */

export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [preds, setPreds] = useState(null);
  const [loading, setLoading] = useState(!isToday);

  // For today's date, use context data
  useEffect(() => {
    if (isToday) {
      setPreds(appData.activePredictions);
      setLoading(appData.loading);
    }
  }, [isToday, appData.activePredictions, appData.loading]);

  // For other dates, fetch via dataLayer
  useEffect(() => {
    if (isToday) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchActivePredictions(dateStr);
        if (!cancelled) {
          setPreds(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPreds([]);
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, [dateStr, isToday]);

  const scoreMap = useMemo(() => dataLayer.getScoreMap(preds || []), [preds]);

  const finalPreds = isToday ? appData.activePredictions : (preds || []);
  const finalLoading = isToday ? appData.loading : loading;

  return {
    preds: finalPreds,
    scoreMap,
    loading: finalLoading,
    error: null,
    lastUpdate: appData.lastUpdate || Date.now(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useAllUserPredictions
   ═══════════════════════════════════════════════════════════════ */

export function useAllUserPredictions(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  if (isToday) {
    return {
      allPreds: [],
      userPredMap: {},
      predCounts: appData.predCounts,
      predDist: appData.predDist,
      lastUpdate: appData.lastUpdate || Date.now(),
    };
  }

  // For other dates, this would need to be implemented
  // But in practice, this hook is only called with today's date
  return {
    allPreds: [],
    userPredMap: {},
    predCounts: {},
    predDist: {},
    lastUpdate: Date.now(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyPredictions
   ═══════════════════════════════════════════════════════════════ */

export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [preds, setPreds] = useState(null);
  const [loading, setLoading] = useState(false);

  // For today + authenticated user, use context data
  useEffect(() => {
    if (isToday && uid) {
      setPreds(appData.userPredictions);
    } else if (!uid) {
      setPreds({});
    }
  }, [isToday, uid, appData.userPredictions]);

  // For other dates, fetch via dataLayer
  useEffect(() => {
    if (isToday || !uid) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchUserPredictions(uid, dateStr);
        if (!cancelled) {
          setPreds(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPreds({});
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, [uid, dateStr, isToday]);

  return isToday ? appData.userPredictions : (preds || {});
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: usePredictionResults
   ═══════════════════════════════════════════════════════════════ */

export function usePredictionResults(uid) {
  const appData = useAppData();

  if (!uid) {
    return { results: [], resultMap: {} };
  }

  return appData.predictionResults;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useUserPoints
   ═══════════════════════════════════════════════════════════════ */

export function useUserPoints(uid) {
  const appData = useAppData();

  if (!uid) {
    return null;
  }

  return appData.userPoints;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaPicks
   ═══════════════════════════════════════════════════════════════ */

export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isToday) {
      setPicks(appData.zokaPicks);
    }
  }, [isToday, appData.zokaPicks]);

  useEffect(() => {
    if (isToday) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchZokaPicks(dateStr);
        if (!cancelled) {
          setPicks(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setPicks(null);
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, [dateStr, isToday]);

  return isToday ? appData.zokaPicks : picks;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaVotes
   ═══════════════════════════════════════════════════════════════ */

export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [voteStats, setVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  useEffect(() => {
    if (isToday) {
      setVoteStats(appData.zokaVoteStats);
      setUserVotes(appData.currentUserVotes);
    }
  }, [isToday, appData.zokaVoteStats, appData.currentUserVotes]);

  useEffect(() => {
    if (isToday) return;

    let cancelled = false;

    const load = async () => {
      try {
        const data = await dataLayer.fetchZokaVotes(dateStr);
        if (!cancelled) {
          setVoteStats(data?.stats || {});
        }
      } catch { /* ignore */ }
    };

    load();

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

/* ═══════════════════════════════════════════════════════════════
   HOOK: useDailyLeaderboard
   ═══════════════════════════════════════════════════════════════ */

export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [entries, setEntries] = useState(null);
  const [top3, setTop3] = useState(null);
  const [rest, setRest] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isToday) {
      setEntries(appData.dailyEntries);
      setTop3(appData.dailyTop3);
      setRest(appData.dailyRest);
      setStats(appData.dailyStats);
      setLoading(appData.loading);
    }
  }, [isToday, appData.dailyEntries, appData.dailyTop3, appData.dailyRest, appData.dailyStats, appData.loading]);

  useEffect(() => {
    if (isToday) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchDailyLeaderboard(dateStr);
        if (!cancelled) {
          if (data?.entries) {
            setEntries(data.entries);
            setTop3(data.top3 || data.entries.slice(0, 3));
            setRest(data.rest || data.entries.slice(3));
            setStats(data.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 });
          } else {
            setEntries([]);
            setTop3([]);
            setRest([]);
            setStats({ avg: '0.0', preds: 0, exact: 0, players: 0 });
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setEntries([]);
          setTop3([]);
          setRest([]);
          setStats({ avg: '0.0', preds: 0, exact: 0, players: 0 });
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelled = true; };
  }, [dateStr, isToday]);

  const finalEntries = isToday ? (appData.dailyEntries || []) : (entries || []);
  const finalTop3 = isToday ? (appData.dailyTop3 || []) : (top3 || []);
  const finalRest = isToday ? (appData.dailyRest || []) : (rest || []);
  const finalStats = isToday ? (appData.dailyStats || { avg: '0.0', preds: 0, exact: 0, players: 0 }) : (stats || { avg: '0.0', preds: 0, exact: 0, players: 0 });
  const finalLoading = isToday ? appData.loading : loading;

  return {
    entries: finalEntries,
    top3: finalTop3,
    rest: finalRest,
    stats: finalStats,
    loading: finalLoading,
    isLive: false,
  };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useHistoricalLeaderboard
   ═══════════════════════════════════════════════════════════════ */

export function useHistoricalLeaderboard(period) {
  const appData = useAppData();
  const [loading, setLoading] = useState(true);

  // Check if we already have this period's data
  const cachedData = appData.historicalLeaderboards[period];

  useEffect(() => {
    if (cachedData) {
      setLoading(false);
      return;
    }

    // Load on-demand
    appData.loadHistoricalLeaderboard(period);
  }, [period, cachedData, appData]);

  const entries = cachedData?.entries || [];
  const stale = cachedData?.stale ?? true;

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);
  const stats = useMemo(() => computeStats(entries), [entries]);

  return { entries, top3, rest, stats, loading, error: null, stale };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyStats
   ═══════════════════════════════════════════════════════════════ */

export function useMyStats(uid, date) {
  const appData = useAppData();

  if (!uid) {
    return {
      predicted: 0,
      total: 0,
      exact: 0,
      result: 0,
      miss: 0,
      points: 0,
      resolved: 0,
      accuracy: 0,
      todayExact: 0,
      todayResult: 0,
      todayMiss: 0,
      todayPoints: 0,
    };
  }

  return appData.userStats;
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

  // Invalidate cache for this user's predictions
  invalidateCache(`myPreds_${uid}_${dateStr}`);

  // Refresh via data layer
  try {
    const freshData = await dataLayer.fetchUserPredictions(uid, dateStr);
    // Notify subscribers
    // Note: This won't trigger a re-render in the context automatically
    // The next poll cycle will pick up the change
  } catch (err) {
    console.warn('[savePrediction] Refresh failed:', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ACTION: saveZokaVote
   ═══════════════════════════════════════════════════════════════ */

export async function saveZokaVote(uid, matchId, vote) {
  if (!db) return;
  const dateStr = todayStr();

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

  try {
    const key = `zoka_votes_${dateStr}`;
    const existing = JSON.parse(localStorage.getItem(key) || '{}');
    existing[matchId] = vote;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* ignore */ }

  invalidateCache(`zokaVotes_${dateStr}`);
}

/* ═══════════════════════════════════════════════════════════════
   ACTION: removeZokaVote
   ═══════════════════════════════════════════════════════════════ */

export async function removeZokaVote(uid, matchId, newVote) {
  if (!db) return;
  const dateStr = todayStr();

  const snap = await getDoc(doc(db, 'zoka_vote_stats', dateStr));
  if (!snap.exists()) return;

  const data = snap.data();
  const current = data.stats?.[matchId];
  if (!current) return;

  const key = `zoka_votes_${dateStr}`;
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* ignore */ }

  const oldV = existing[matchId];
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
    existing[matchId] = newVote;
  } else {
    delete existing[matchId];
  }

  await setDoc(
    doc(db, 'zoka_vote_stats', dateStr),
    { stats: { [matchId]: matchStats }, updatedAt: serverTimestamp() },
    { merge: true }
  );

  try { localStorage.setItem(key, JSON.stringify(existing)); } catch { /* ignore */ }
  invalidateCache(`zokaVotes_${dateStr}`);
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN EXPORTS
   ═══════════════════════════════════════════════════════════════ */

export { resolveMatchForAllUsers };

export async function adminRefreshActivePredictions(dateStr) {
  invalidateCache(`active_${dateStr}`);
  const data = await dataLayer.fetchActivePredictions(dateStr);
  return data;
}