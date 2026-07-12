// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js
//
// ★ ENHANCED: Uses event bus for reactive updates
// ★ ENHANCED: Uses shared constants
// ★ ENHANCED: Proper cleanup of all event subscriptions
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { eventBus, EVENT } from '../utils/eventBus';

// ★ Import shared constants instead of redefining
import {
  SPORT,
  TIMEOUT,
  CACHE_KEY,
  PATHS,
  calcPoints,
  RESULT_TYPE,
  POINTS,
} from '../utils/constants';

/* ═══════════════════════════════════════════════════
   EXPORTED DATE HELPERS
   ═══════════════════════════════════════════════════ */
export { todayStr, yesterdayStr, tomorrowStr, getWeekStart, getMonthStart };

/* ═══════════════════════════════════════════════════
   SAFETY TIMEOUT
   ═══════════════════════════════════════════════════ */

function safeEnsureUser(appData, uid) {
  if (!uid || !appData?.ensureUserData) return Promise.resolve();
  return Promise.race([
    appData.ensureUserData(uid),
    new Promise((resolve) => setTimeout(resolve, TIMEOUT.USER_LOAD_SAFETY)),
  ]);
}

/* ═══════════════════════════════════════════════════
   LEADERBOARD HELPERS
   ═══════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════
   CACHE INVALIDATION HELPERS — Now emit events
   ═══════════════════════════════════════════════════ */

export function invalidateCache(key) {
  dataLayer.invalidate(key);
}

export function invalidateCachePrefix(prefix) {
  dataLayer.invalidatePrefix(prefix);
}

/* ═══════════════════════════════════════════════════
   ADMIN: INCREMENTAL DAILY SUMMARY UPDATE
   ═══════════════════════════════════════════════════ */

async function _updateDailySummaryIncremental(dateStr, resolvedList) {
  if (!db || !resolvedList.length) return;

  const ref = doc(db, PATHS.DAILY_LEADERBOARD, dateStr);
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
    if (r.resultType === RESULT_TYPE.EXACT) entry.exact += 1;
    else if (r.resultType === RESULT_TYPE.RESULT) entry.result += 1;
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

  // ★ Emit leaderboard update event
  eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries });
}

/* ═══════════════════════════════════════════════════
   ADMIN: INCREMENTAL GOAT UPDATE
   ═══════════════════════════════════════════════════ */

async function _updateGoatIncremental(resolvedList) {
  if (!db || !resolvedList.length) return;

  const ref = doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current');
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
    if (r.resultType === RESULT_TYPE.EXACT) entry.exact += 1;
    else if (r.resultType === RESULT_TYPE.RESULT) entry.result += 1;
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

  // ★ Emit GOAT leaderboard update event
  eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries });
}

/* ═══════════════════════════════════════════════════
   ADMIN: FULL DAILY SUMMARY REBUILD
   ═══════════════════════════════════════════════════ */

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();

  try {
    const resultsSnap = await getDocs(
      query(collection(db, PATHS.PREDICTION_RESULTS), where('matchDate', '==', dateStr))
    );
    const predsSnap = await getDocs(
      query(collection(db, PATHS.USER_PREDICTIONS), where('matchDate', '==', dateStr))
    );
    const activeSnap = await getDocs(
      query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr))
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
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
      else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
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
      if (r.type === RESULT_TYPE.EXACT) u.exact++;
      else if (r.type === RESULT_TYPE.RESULT) u.result++;
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

    await setDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr), {
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

    // ★ Invalidate caches and emit events
    dataLayer.invalidate(CACHE_KEY.activePredictions(dateStr));
    dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(dateStr));
    eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries });
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr });
    
    console.log(`[Summary] Rebuilt for ${dateStr}: ${entries.length} players`);
  } catch (e) {
    console.error('[Summary] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════
   ADMIN: FULL GOAT LEADERBOARD REBUILD
   ═══════════════════════════════════════════════════ */

export async function rebuildGoatLeaderboard() {
  if (!db) return;

  try {
    const snap = await getDocs(collection(db, PATHS.USER_POINTS_TOTAL));

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

    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      updatedAt: serverTimestamp(),
    });

    dataLayer.invalidate(CACHE_KEY.historical('goat'));
    eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries });
    
    console.log(`[GOAT] Rebuilt: ${entries.length} players`);
  } catch (e) {
    console.error('[GOAT] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════
   ADMIN: FULL PERIOD LEADERBOARD REBUILD
   ═══════════════════════════════════════════════════ */

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;

  if (!startDate) {
    if (period === 'weekly') startDate = getWeekStart();
    else if (period === 'monthly') startDate = getMonthStart();
    else return;
  }

  const docId = period === 'goat' ? 'current' : period === 'weekly' ? `weekly_${startDate}` : `monthly_${startDate}`;
  const cacheKey = CACHE_KEY.historical(period);

  try {
    const snap = await getDocs(
      query(
        collection(db, PATHS.PREDICTION_RESULTS),
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
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++;
      else if (r.resultType === RESULT_TYPE.RESULT) u.result++;
      else u.miss++;
    });

    const entries = rankEntries(
      Object.values(userMap).filter((u) => u.predictions > 0)
    );

    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId), {
      entries,
      top3: entries.slice(0, 3),
      rest: entries.slice(3),
      stats: computeStats(entries),
      period,
      startDate,
      updatedAt: serverTimestamp(),
    });

    dataLayer.invalidate(cacheKey);
    eventBus.emit(EVENT.LEADERBOARD_UPDATED, { period, entries });
    
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

/* ═══════════════════════════════════════════════════
   ADMIN: MATCH RESOLVER — Emits events
   ═══════════════════════════════════════════════════ */

const _resolvingNow = new Set();

async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    const dateKey = matchDate || todayStr();

    const statusRef = doc(db, PATHS.MATCH_RESOLUTION_STATUS, dateKey);
    const statusSnap = await getDoc(statusRef);
    const alreadyResolved = new Set(
      statusSnap.exists() ? statusSnap.data().resolvedMatches || [] : []
    );
    if (alreadyResolved.has(String(matchId))) return 0;

    const predsSnap = await getDocs(
      query(collection(db, PATHS.USER_PREDICTIONS), where('matchId', '==', matchId))
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
let hasError = false;

predsSnap.forEach((d) => {
  if (hasError) return;
  try {
    const p = d.data();
    const uid = p.userId;
    const actualH = Number(actualH);
    const actualA = Number(actualA);
    
    // ★ Validate actual scores are valid numbers
    if (isNaN(actualH) || isNaN(actualA)) {
      console.warn(`[Resolver] Invalid scores for match ${matchId}:`, { actualH, actualA });
      return;
    }

    // ★ Defensive calcPoints call - handle any edge case
    let points = 0;
    let resultType = 'pending';
    
    try {
      const r = calcPoints(p.homeScore, p.awayScore, actualH, actualA);
      points = r.points ?? 0;
      resultType = r.type ?? 'pending';
    } catch (err) {
      console.error('[Resolver] calcPoints error for match', matchId, err);
      points = 0;
      resultType = 'miss';
    }

    if (points === undefined || resultType === undefined) {
      console.warn(`[Resolver] Unexpected calcPoints result for match ${matchId}`);
      points = 0;
      resultType = 'miss';
    }

    resolvedList.push({
      userId: uid,
      displayName: p.displayName || 'Player',
      matchId: String(matchId),
      points,
      resultType,
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
        points,  // ★ Always a valid number now
        resultType,  // ★ Always a valid string now
        resolvedAt: serverTimestamp(),
      },
      { merge: true }
    );

    batch.set(
      doc(db, 'user_points_total', uid),
      {
        totalPoints: increment(points),  // ★ Use local variable, not r.points
        exactCount: increment(resultType === 'exact' ? 1 : 0),
        resultCount: increment(resultType === 'result' ? 1 : 0),
        missCount: increment(resultType === 'miss' ? 1 : 0),
        predictionsCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('[Resolver] Error processing prediction for match', matchId, err);
    hasError = true;
  }
});

if (hasError) {
  console.error('[Resolver] Batch commit aborted due to processing errors');
} else {
  try {
    await batch.commit();
  } catch (err) {
    console.error('[Resolver] Batch commit failed:', err);
  }
}

const zokaRef = doc(db, PATHS.ZOKA_PICKS, dateKey);
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

    // Invalidate ALL affected caches
    dataLayer.invalidatePrefix(`dlb:${dateKey}`);
    for (const r of resolvedList) {
      dataLayer.invalidate(CACHE_KEY.userPoints(r.userId));
      dataLayer.invalidate(CACHE_KEY.predictionResults(r.userId, dateKey));
      dataLayer.invalidate(CACHE_KEY.userPredictions(r.userId, dateKey));
    }
    dataLayer.invalidate(CACHE_KEY.historical('goat'));
    dataLayer.invalidate(CACHE_KEY.historical('weekly'));
    dataLayer.invalidate(CACHE_KEY.historical('monthly'));
    dataLayer.invalidate(CACHE_KEY.activePredictions(dateKey));
    dataLayer.invalidate(CACHE_KEY.zokaPicks(dateKey));

    // ★ Emit match resolved event for reactive UI updates
    eventBus.emit(EVENT.MATCH_RESOLVED, {
      matchId: String(matchId),
      dateStr: dateKey,
      actualH,
      actualA,
      results: resolvedList,
      affectedUsers: resolvedList.map(r => r.userId),
    });

    return resolvedList.length;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

/* ═══════════════════════════════════════════════════
   NO-OP HOOK
   ═══════════════════════════════════════════════════ */

export function useUniversalResolver() {}

/* ═══════════════════════════════════════════════════
   HOOK: useActivePredictions — Now reactive via events
   ═══════════════════════════════════════════════════ */

export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);

  const [preds, setPreds] = useState(null);
  const [loading, setLoading] = useState(!isToday);

  // ★ Subscribe to prediction updates for reactive refresh
  useEffect(() => {
    if (!isToday) return;
    
    const unsub = eventBus.on(EVENT.PREDICTIONS_UPDATED, (payload) => {
      if (payload.dateStr === dateStr && appData.activePredictions) {
        setPreds(appData.activePredictions);
      }
    });
    
    return unsub;
  }, [isToday, dateStr]);

  useEffect(() => {
    if (isToday) {
      setPreds(appData.activePredictions);
      setLoading(appData.loading);
    }
  }, [isToday, appData.activePredictions, appData.loading]);

  useEffect(() => {
    if (isToday) return;
    cancelledRef.current = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchActivePredictions(dateStr);
        if (!cancelledRef.current) {
          setPreds(data);
          setLoading(false);
        }
      } catch {
        if (!cancelledRef.current) {
          setPreds([]);
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelledRef.current = true; };
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

/* ═══════════════════════════════════════════════════
   HOOK: useAllUserPredictions
   ═══════════════════════════════════════════════════ */

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

  return {
    allPreds: [],
    userPredMap: {},
    predCounts: {},
    predDist: {},
    lastUpdate: Date.now(),
  };
}

/* ═══════════════════════════════════════════════════
   ★ HOOK: useMyPredictions — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);

  const [preds, setPreds] = useState(null);
  const [loading, setLoading] = useState(false);
  const [triggered, setTriggered] = useState(false);

  // ★ Subscribe to prediction save events for this user
  useEffect(() => {
    if (!uid || !isToday) return;
    
    const unsub = eventBus.on(EVENT.USER_PREDICTION_SAVED, (payload) => {
      if (payload.uid === uid && payload.dateStr === dateStr) {
        // Refresh from appData
        setPreds(appData.userPredictions);
      }
    });
    
    return unsub;
  }, [uid, isToday, dateStr]);

  useEffect(() => {
    if (isToday && uid && !triggered) {
      setTriggered(true);
      setLoading(true);
      safeEnsureUser(appData, uid).finally(() => {
        if (!cancelledRef.current) setLoading(false);
      });
    }
  }, [isToday, uid, triggered, appData]);

  useEffect(() => {
    if (isToday && uid && appData._userDataLoaded !== false) {
      setPreds(appData.userPredictions);
      setLoading(false);
    } else if (!uid) {
      setPreds({});
      setLoading(false);
    }
  }, [isToday, uid, appData.userPredictions, appData._userDataLoaded]);

  useEffect(() => {
    if (isToday || !uid) return;
    cancelledRef.current = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchUserPredictions(uid, dateStr);
        if (!cancelledRef.current) {
          setPreds(data);
          setLoading(false);
        }
      } catch {
        if (!cancelledRef.current) {
          setPreds({});
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelledRef.current = true; };
  }, [uid, dateStr, isToday]);

  return isToday ? (appData.userPredictions || {}) : (preds || {});
}

/* ═══════════════════════════════════════════════════
   ★ HOOK: usePredictionResults — Reactive via events
   ═══════════════════════════════════════════════════ */

export function usePredictionResults(uid) {
  const appData = useAppData();
  const [triggered, setTriggered] = useState(false);

  // ★ Subscribe to match resolved events for this user
  useEffect(() => {
    if (!uid) return;
    
    const unsub = eventBus.on(EVENT.MATCH_RESOLVED, (payload) => {
      if (payload.affectedUsers?.includes(uid)) {
        // Force refresh from appData on next render
        setTriggered(t => !t); // Trigger re-read
      }
    });
    
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (uid && !triggered) {
      setTriggered(true);
      safeEnsureUser(appData, uid);
    }
  }, [uid, triggered, appData]);

  if (!uid) {
    return { results: [], resultMap: {} };
  }

  return appData.predictionResults || { results: [], resultMap: {} };
}

/* ═══════════════════════════════════════════════════
   ★ HOOK: useUserPoints — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useUserPoints(uid) {
  const appData = useAppData();
  const [triggered, setTriggered] = useState(false);

  // ★ Subscribe to match resolved events for this user
  useEffect(() => {
    if (!uid) return;
    
    const unsub = eventBus.on(EVENT.MATCH_RESOLVED, (payload) => {
      if (payload.affectedUsers?.includes(uid)) {
        setTriggered(t => !t); // Trigger re-read
      }
    });
    
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (uid && !triggered) {
      setTriggered(true);
      safeEnsureUser(appData, uid);
    }
  }, [uid, triggered, appData]);

  if (!uid) return null;
  return appData.userPoints;
}

/* ═══════════════════════════════════════════════════
   HOOK: useZokaPicks — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);

  const [picks, setPicks] = useState(null);
  const [loading, setLoading] = useState(false);

  // ★ Subscribe to zoka picks updates
  useEffect(() => {
    if (!isToday) return;
    
    const unsub = eventBus.on(EVENT.ZOKA_PICKS_UPDATED, (payload) => {
      if (payload.dateStr === dateStr && appData.zokaPicks) {
        setPicks(appData.zokaPicks);
      }
    });
    
    return unsub;
  }, [isToday, dateStr]);

  useEffect(() => {
    if (isToday) {
      setPicks(appData.zokaPicks);
    }
  }, [isToday, appData.zokaPicks]);

  useEffect(() => {
    if (isToday) return;
    cancelledRef.current = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchZokaPicks(dateStr);
        if (!cancelledRef.current) {
          setPicks(data);
          setLoading(false);
        }
      } catch {
        if (!cancelledRef.current) {
          setPicks(null);
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelledRef.current = true; };
  }, [dateStr, isToday]);

  return isToday ? appData.zokaPicks : picks;
}

/* ═══════════════════════════════════════════════════
   HOOK: useZokaVotes — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();

  const [voteStats, setVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  // ★ Subscribe to vote cast events
  useEffect(() => {
    if (!isToday) return;
    
    const unsub = eventBus.on(EVENT.ZOKA_VOTE_CAST, () => {
      setVoteStats(appData.zokaVoteStats);
    });
    
    return unsub;
  }, [isToday]);

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
        if (cancelled) {
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

/* ═══════════════════════════════════════════════════
   HOOK: useDailyLeaderboard — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const isToday = dateStr === todayStr();
  const appData = useAppData();
  const cancelledRef = useRef(false);

  const [entries, setEntries] = useState(null);
  const [top3, setTop3] = useState(null);
  const [rest, setRest] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  // ★ Subscribe to daily leaderboard updates
  useEffect(() => {
    const unsub = eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (payload) => {
      if (payload.dateStr === dateStr) {
        if (isToday) {
          setEntries(appData.dailyEntries);
          setTop3(appData.dailyTop3);
          setRest(appData.dailyRest);
          setStats(appData.dailyStats);
        } else if (payload.entries) {
          setEntries(payload.entries);
          setTop3(payload.entries.slice(0, 3));
          setRest(payload.entries.slice(3));
          setStats(computeStats(payload.entries));
        }
        setLoading(false);
      }
    });
    
    return unsub;
  }, [isToday, dateStr]);

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
    cancelledRef.current = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await dataLayer.fetchDailyLeaderboard(dateStr);
        if (!cancelledRef.current) {
          if (data?.entries) {
            setEntries(data.entries);
            setTop3(data.top3 || data.entries.slice(0, 3));
            setRest(data.rest || data.entries.slice(3));
            setStats(data.stats || computeStats(data.entries));
          } else {
            setEntries([]);
            setTop3([]);
            setRest([]);
            setStats(computeStats([]));
          }
          setLoading(false);
        }
      } catch {
        if (!cancelledRef.current) {
          setEntries([]);
          setTop3([]);
          setRest([]);
          setStats(computeStats([]));
          setLoading(false);
        }
      }
    };

    load();

    return () => { cancelledRef.current = true; };
  }, [dateStr, isToday]);

  const finalEntries = isToday ? (appData.dailyEntries || []) : (entries || []);
  const finalTop3 = isToday ? (appData.dailyTop3 || []) : (top3 || []);
  const finalRest = isToday ? (appData.dailyRest || []) : (rest || []);
  const finalStats = isToday ? (appData.dailyStats || computeStats([])) : (stats || computeStats([]));
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

/* ═══════════════════════════════════════════════════
   ★ HOOK: useHistoricalLeaderboard — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useHistoricalLeaderboard(period) {
  const appData = useAppData();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const cachedData = appData.historicalLeaderboards?.[period];

  // ★ Subscribe to leaderboard updates for this period
  useEffect(() => {
    const unsub = eventBus.on(EVENT.LEADERBOARD_UPDATED, (payload) => {
      if (payload.period === period) {
        setLoading(false);
        setError(null);
      }
    });
    
    // Also listen for GOAT-specific events
    const unsub2 = period === 'goat' 
      ? eventBus.on(EVENT.GOAT_LEADERBOARD_UPDATED, () => {
          setLoading(false);
          setError(null);
        })
      : () => {};
    
    return () => {
      unsub();
      unsub2();
    };
  }, [period]);

  useEffect(() => {
    if (cachedData) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const safetyTimer = setTimeout(() => {
      if (!cancelled) {
        console.warn(`[useHistoricalLeaderboard] Timeout for "${period}" — showing stale/empty`);
        setLoading(false);
        setError('timeout');
      }
    }, TIMEOUT.HIST_LOAD_SAFETY);

    if (appData.loadHistoricalLeaderboard) {
      appData.loadHistoricalLeaderboard(period).catch((err) => {
        if (!cancelled) {
          console.warn(`[useHistoricalLeaderboard] Load failed for "${period}":`, err?.message);
          setLoading(false);
          setError('load_failed');
        }
      });
    } else {
      setLoading(false);
      setError('no_loader');
    }

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [period]);

  const data = appData.historicalLeaderboards?.[period] || cachedData;
  const entries = data?.entries || [];
  const stale = data?.stale ?? true;

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);
  const stats = useMemo(() => computeStats(entries), [entries]);

  return { entries, top3, rest, stats, loading, error, stale };
}

/* ═══════════════════════════════════════════════════
   ★ HOOK: useMyStats — Reactive via events
   ═══════════════════════════════════════════════════ */

export function useMyStats(uid, date) {
  const appData = useAppData();
  const [triggered, setTriggered] = useState(false);

  // ★ Subscribe to match resolved events for this user
  useEffect(() => {
    if (!uid) return;
    
    const unsub = eventBus.on(EVENT.MATCH_RESOLVED, (payload) => {
      if (payload.affectedUsers?.includes(uid)) {
        setTriggered(t => !t);
      }
    });
    
    return unsub;
  }, [uid]);

  useEffect(() => {
    if (uid && !triggered) {
      setTriggered(true);
      safeEnsureUser(appData, uid);
    }
  }, [uid, triggered, appData]);

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
      _loaded: false,
    };
  }

  return appData.userStats;
}

/* ═══════════════════════════════════════════════════
   ACTION: savePrediction — Emits events
   ═══════════════════════════════════════════════════ */

export async function savePrediction(uid, displayName, pred, h, a) {
  if (!db) return;
  const dateStr = pred.matchDate || todayStr();

  await setDoc(
    doc(db, PATHS.USER_PREDICTIONS, `${uid}_${pred.id}`),
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

  // Invalidate cache
  dataLayer.invalidate(CACHE_KEY.userPredictions(uid, dateStr));

  // Refresh via data layer
  try {
    await dataLayer.fetchUserPredictions(uid, dateStr);
  } catch (err) {
    console.warn('[savePrediction] Refresh failed:', err.message);
  }

  // ★ Emit event for reactive UI updates
  eventBus.emit(EVENT.USER_PREDICTION_SAVED, {
    uid,
    matchId: pred.matchId,
    predId: pred.id,
    dateStr,
    homeScore: h,
    awayScore: a,
  });
}

/* ═══════════════════════════════════════════════════
   ACTION: saveZokaVote — Emits events
   ═══════════════════════════════════════════════════ */

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

  dataLayer.invalidate(CACHE_KEY.zokaVotes(dateStr));

  // ★ Emit vote event
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote, dateStr });
}

/* ═══════════════════════════════════════════════════
   ACTION: removeZokaVote
   ═══════════════════════════════════════════════════ */

export async function removeZokaVote(uid, matchId, newVote) {
  if (!db) return;
  const dateStr = todayStr();

  const snap = await getDoc(doc(db, PATHS.ZOKA_VOTE_STATS, dateStr));
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
    doc(db, PATHS.ZOKA_VOTE_STATS, dateStr),
    { stats: { [matchId]: matchStats }, updatedAt: serverTimestamp() },
    { merge: true }
  );

  try { localStorage.setItem(key, JSON.stringify(existing)); } catch { /* ignore */ }
  dataLayer.invalidate(CACHE_KEY.zokaVotes(dateStr));

  // ★ Emit vote event
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote: newVote, dateStr });
}

/* ═══════════════════════════════════════════════════
   ADMIN EXPORTS
   ═══════════════════════════════════════════════════ */

export { resolveMatchForAllUsers };

export async function adminRefreshActivePredictions(dateStr) {
  dataLayer.invalidate(CACHE_KEY.activePredictions(dateStr));
  const data = await dataLayer.fetchActivePredictions(dateStr);
  return data;
}

// ★ Re-export event bus and events for use in components
export { eventBus, EVENT };