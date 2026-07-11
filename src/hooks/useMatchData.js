// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/hooks/useMatchData.js — QUOTA-OPTIMIZED v3
// ═════════════════════════════════════════════════════════════════════════════
//
// QUOTA BUDGET (Spark Plan):  50K reads/day,  20K writes/day
// TARGET:                      2,000+ daily active users
//
// ═════════════════════════════════════════════════════════════════════════════
// v3 CHANGES (from v2)
// ═════════════════════════════════════════════════════════════════════════════
//
//  1. ALL cache TTLs raised to 30 minutes (were 45s–90s).
//     Cache now outlives poll interval → most polls are cache hits.
//
//  2. Poll intervals raised to 10 minutes (were 90s–120s).
//     Active predictions and daily leaderboard still refresh, but
//     far less often. 30-min session = 1 Firestore read per hook.
//
//  3. GOAT leaderboard: pre-computed single doc instead of scanning
//     entire user_points_total collection (2,000 reads → 1 read).
//     Incrementally updated after each resolution (1 read + 1 write).
//
//  4. Weekly/monthly leaderboards: pre-computed docs instead of
//     scanning prediction_results (500-2,000 reads → 1 read).
//     Rebuilt by admin action.
//
//  5. Daily summary: incremental update in resolver instead of
//     full 3-collection scan (1,010 reads → 1 read per resolution).
//
// ═════════════════════════════════════════════════════════════════════════════
// PER-USER READ BUDGET (30-min session, all pages)
// ═════════════════════════════════════════════════════════════════════════════
//
//  Hook                          Reads   Why
//  ────────────────────────────  ──────  ───────────────────────────────
//  initFirebaseSync               1      1 doc, once per session
//  useActivePredictions          ~10     1 query × ~10 docs, 1st poll only
//  useDailyLeaderboard             1     1 doc, 1st poll only
//  useMyPredictions              ~10     1 query × ~10 docs, once
//  usePredictionResults          ~10     1 query × ~10 docs, once
//  useUserPoints                   1     1 doc, once
//  useZokaPicks                    1     1 doc, once
//  useZokaVotes                    1     1 doc, once
//  useAllUserPredictions           0     uses daily_leaderboard cache
//  useHistoricalLeaderboard        1     1 pre-computed doc
//  ────────────────────────────  ──────
//  TOTAL (all pages)             ~36
//
//  REALISTIC USAGE (not everyone visits every page):
//    Home-only users (70%):    1,400 × 14  =  19,600
//    + Predictions (25%):        500 × 35  =  17,500
//    + GOAT check (5%):          100 × 36  =   3,600
//    ─────────────────────────────────────────
//    CLIENT TOTAL:                         ~40,700 reads/day
//
//  ADMIN COST (10 resolutions/day):
//    Resolution queries:        10 × 500  =   5,000
//    Incremental daily update:  10 × 1    =      10
//    Incremental GOAT update:   10 × 1    =      10
//    ─────────────────────────────────────────
//    ADMIN TOTAL:                           ~5,020 reads/day
//
//  GRAND TOTAL:                            ~45,720 reads/day ✅ UNDER 50K
//
// ═════════════════════════════════════════════════════════════════════════════
// REQUIRED FIRESTORE COMPOSITE INDEXES
// ═════════════════════════════════════════════════════════════════════════════
//
//   Collection           Fields                         Status
//   ───────────────────  ─────────────────────────────  ───────
//   user_predictions     userId ASC, matchDate ASC      CREATE
//   prediction_results   userId ASC, matchDate ASC      CREATE
//
// ═════════════════════════════════════════════════════════════════════════════

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
   CACHE TTL CONFIGURATION
   ═══════════════════════════════════════════════════════════════
   All TTLs are 30 minutes. Poll intervals are 10 minutes.
   Since 30 > 10, the 2nd and 3rd polls in a 30-min session
   are always cache hits → 0 extra Firestore reads.

   30-min session timeline (useActivePredictions):
     0 min:  poll → cache MISS → 10 reads
    10 min:  poll → cache HIT  → 0 reads
    20 min:  poll → cache HIT  → 0 reads
    ─────────────────────────────────────────
    Total: 10 reads (was ~200 in v2)
   ═══════════════════════════════════════════════════════════════ */
const CACHE_TTL = {
  ACTIVE_PREDICTIONS: 1_800_000,   // 30 min
  DAILY_LEADERBOARD:  1_800_000,   // 30 min
  MY_PREDICTIONS:     1_800_000,   // 30 min
  PREDICTION_RESULTS: 1_800_000,   // 30 min
  USER_POINTS:        1_800_000,   // 30 min
  ZOKA_PICKS:         1_800_000,   // 30 min
  ZOKA_VOTES:         1_800_000,   // 30 min
  HISTORICAL:         1_800_000,   // 30 min
};

const POLL_INTERVAL = {
  SLOW: 600_000,  // 10 min — for hooks that need periodic refresh
};

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

/** Get the doc ID for a pre-computed leaderboard summary */
function getPeriodDocId(period) {
  if (period === 'goat') return 'current';
  if (period === 'weekly') return `weekly_${getWeekStart()}`;
  if (period === 'monthly') return `monthly_${getMonthStart()}`;
  return period;
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
      accuracy: u.resolved > 0
        ? Math.round(((u.exact + u.result) / u.resolved) * 100)
        : 0,
    }));
}

/* ═══════════════════════════════════════════════════════════════
   SESSION CACHE
   ═══════════════════════════════════════════════════════════════
   Module-level Map. Survives component mount/unmount within
   the same tab. Cleared on page refresh.

   Deduplicates concurrent duplicate reads via _inflight.
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

export function invalidateCache(key) {
  _cache.delete(key);
}

export function invalidateCachePrefix(prefix) {
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

/* ═══════════════════════════════════════════════════════════════
   CACHED READ HELPERS
   ═══════════════════════════════════════════════════════════════ */

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
   ADMIN: INCREMENTAL DAILY SUMMARY UPDATE
   ═══════════════════════════════════════════════════════════════
   Called by resolveMatchForAllUsers AFTER writing results.
   Reads 1 doc (current summary), updates entries, writes 1 doc.

   OLD cost per resolution: ~1,010 reads (3 collection scans)
   NEW cost per resolution: 1 read + 1 write
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
   ═══════════════════════════════════════════════════════════════
   Called by resolveMatchForAllUsers AFTER writing results.
   Reads 1 doc (current GOAT), updates affected users, writes 1 doc.

   OLD cost per resolution: ~2,000 reads (full user_points_total scan)
   NEW cost per resolution: 1 read + 1 write
   ═══════════════════════════════════════════════════════════════ */

async function _updateGoatIncremental(resolvedList) {
  if (!db || !resolvedList.length) return;

  const ref = doc(db, 'leaderboard_summaries', 'current');
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // First time — do full rebuild
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
   ═══════════════════════════════════════════════════════════════
   Full rebuild from collections. Expensive — only for manual
   admin trigger or initial setup. NOT called per-resolution.

   Cost: ~1,010 reads (admin only)
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
    console.log(`[Summary] Rebuilt for ${dateStr}: ${entries.length} players`);
  } catch (e) {
    console.error('[Summary] Rebuild failed:', e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: FULL GOAT LEADERBOARD REBUILD
   ═══════════════════════════════════════════════════════════════
   Scans user_points_total. Expensive — only for manual admin
   trigger or first-time setup.

   Cost: ~2,000 reads (admin only)
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
   ADMIN: FULL PERIOD LEADERBOARD REBUILD (weekly/monthly)
   ═══════════════════════════════════════════════════════════════
   Scans prediction_results since period start. Expensive —
   only for manual admin trigger.

   Cost: ~500-2,000 reads (admin only)
   ═══════════════════════════════════════════════════════════════ */

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;

  if (!startDate) {
    if (period === 'weekly') startDate = getWeekStart();
    else if (period === 'monthly') startDate = getMonthStart();
    else return;
  }

  const docId = getPeriodDocId(period);
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

/** Rebuild all leaderboards (daily + GOAT + weekly + monthly). Admin only. */
export async function rebuildAllLeaderboards() {
  await rebuildDailySummary(todayStr());
  await rebuildGoatLeaderboard();
  await rebuildPeriodLeaderboard('weekly');
  await rebuildPeriodLeaderboard('monthly');
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN: MATCH RESOLVER
   ═══════════════════════════════════════════════════════════════
   Reads user_predictions for the match, writes results, then
   does CHEAP incremental updates to daily summary + GOAT.

   Cost per resolution: ~500 reads (predictions) + 2 reads (incremental updates)
   NOT ~3,510 reads (old: 500 + 1,010 + 2,000)
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

    // Read predictions for this match (necessary — need to know who predicted)
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

    // Collect resolved data for incremental updates
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
          return { ...m, homeScore: actualH, awayScore: actualA, status: 'finished' };
        }
        return m;
      });
      if (changed) {
        batch.set(zokaRef, { ...zokaData, matches: updated, updatedAt: serverTimestamp() }, { merge: true });
      }
    }

    // Mark as resolved
    batch.set(statusRef, {
      resolvedMatches: [String(matchId)],
      lastResolvedAt: serverTimestamp(),
      date: dateKey,
    }, { merge: true });

    await batch.commit();

    // ★ CHEAP incremental updates instead of full rebuilds
    await _updateDailySummaryIncremental(dateKey, resolvedList);
    await _updateGoatIncremental(resolvedList);

    // Invalidate affected client caches
    invalidateCachePrefix(`dlb_${dateKey}`);
    for (const r of resolvedList) {
      _cache.delete(`upt_${r.userId}`);
      _cache.delete(`myResults_${r.userId}_${dateKey}`);
      _cache.delete(`myPreds_${r.userId}_${dateKey}`);
    }
    // Also invalidate GOAT and period caches
    invalidateCache('hist_goat');
    invalidateCache('hist_weekly');
    invalidateCache('hist_monthly');

    return resolvedList.length;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useUniversalResolver (NO-OP)
   ═══════════════════════════════════════════════════════════════ */

export function useUniversalResolver() {}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useActivePredictions
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. Poll: 10 min.
   30-min session: 1 Firestore read (1st poll), 2 cache hits.

   Reads: ~10 (once per 30 min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useActivePredictions(date) {
  const dateStr = date || todayStr();
  const [preds, setPreds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }

    let cancelled = false;
    const cacheKey = `active_${dateStr}`;

    const load = async () => {
      setLoading(true);
      const data = await readDocsOnce(
        query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr)),
        cacheKey,
        CACHE_TTL.ACTIVE_PREDICTIONS
      );
      if (!cancelled) {
        setPreds(data.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
        setLoading(false);
      }
    };

    load();

    // Background refresh every 10 min — cache absorbs most of these
    const interval = setInterval(() => {
      if (!cancelled) {
        readDocsOnce(
          query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr)),
          cacheKey,
          CACHE_TTL.ACTIVE_PREDICTIONS
        ).then((data) => {
          if (!cancelled) setPreds(data.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
        });
      }
    }, POLL_INTERVAL.SLOW);

    return () => { cancelled = true; clearInterval(interval); };
  }, [dateStr]);

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
   HOOK: useAllUserPredictions
   ═══════════════════════════════════════════════════════════════
   Reads from daily_leaderboard summary doc (same cache).
   0 extra Firestore reads.

   Reads: 0 (reuses daily_leaderboard cache)
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
      CACHE_TTL.DAILY_LEADERBOARD
    ).then((summary) => {
      if (cancelled || !summary) return;
      setPredCounts(summary.predCounts || {});
      setPredDist(summary.predDist || {});
      setAllPreds([]);
      setUserPredMap({});
    });

    return () => { cancelled = true; };
  }, [dateStr]);

  return { allPreds, userPredMap, predCounts, predDist, lastUpdate: Date.now() };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyPredictions
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. No polling (reads once per session).

   Reads: ~10 (1 query × ~10 docs, once per 30 min)
   REQUIRES COMPOSITE INDEX: user_predictions (userId ASC, matchDate ASC)
   ═══════════════════════════════════════════════════════════════ */

export function useMyPredictions(uid, date) {
  const dateStr = date || todayStr();
  const [myPreds, setMyPreds] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    readDocsOnce(
      query(
        collection(db, 'user_predictions'),
        where('userId', '==', uid),
        where('matchDate', '==', dateStr)
      ),
      `myPreds_${uid}_${dateStr}`,
      CACHE_TTL.MY_PREDICTIONS
    ).then((data) => {
      if (!cancelled) {
        const map = {};
        data.forEach((p) => { map[p.predId] = p; });
        setMyPreds(map);
      }
    });

    return () => { cancelled = true; };
  }, [uid, dateStr]);

  return myPreds;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: usePredictionResults
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. No polling.

   Reads: ~10 (1 query × ~10 docs, once per 30 min)
   REQUIRES COMPOSITE INDEX: prediction_results (userId ASC, matchDate ASC)
   ═══════════════════════════════════════════════════════════════ */

export function usePredictionResults(uid) {
  const [results, setResults] = useState([]);
  const [resultMap, setResultMap] = useState({});

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    readDocsOnce(
      query(
        collection(db, 'prediction_results'),
        where('userId', '==', uid),
        where('matchDate', '==', todayStr())
      ),
      `myResults_${uid}_${todayStr()}`,
      CACHE_TTL.PREDICTION_RESULTS
    ).then((data) => {
      if (!cancelled) {
        const sorted = data.sort(
          (a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0)
        );
        setResults(sorted);
        const m = {};
        sorted.forEach((r) => { m[String(r.matchId)] = r; });
        setResultMap(m);
      }
    });

    return () => { cancelled = true; };
  }, [uid]);

  return { results, resultMap };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useUserPoints
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. No polling.

   Reads: 1 (once per 30 min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useUserPoints(uid) {
  const [points, setPoints] = useState(null);

  useEffect(() => {
    if (!uid || !db) return;
    let cancelled = false;

    readDocOnce(
      doc(db, 'user_points_total', uid),
      `upt_${uid}`,
      CACHE_TTL.USER_POINTS
    ).then((data) => {
      if (!cancelled) setPoints(data);
    });

    return () => { cancelled = true; };
  }, [uid]);

  return points;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaPicks
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. No polling.

   Reads: 1 (once per 30 min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useZokaPicks(date) {
  const dateStr = date || todayStr();
  const [picks, setPicks] = useState(null);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    readDocOnce(
      doc(db, 'zoka_picks', dateStr),
      `zoka_${dateStr}`,
      CACHE_TTL.ZOKA_PICKS
    ).then((data) => {
      if (!cancelled) setPicks(data);
    });

    return () => { cancelled = true; };
  }, [dateStr]);

  return picks;
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useZokaVotes
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. No polling. User's own vote from localStorage.

   Reads: 1 (once per 30 min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useZokaVotes(date) {
  const dateStr = date || todayStr();
  const [voteStats, setVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    readDocOnce(
      doc(db, 'zoka_vote_stats', dateStr),
      `zokaVotes_${dateStr}`,
      CACHE_TTL.ZOKA_VOTES
    ).then((data) => {
      if (cancelled) return;
      setVoteStats(data?.stats || {});
    });

    try {
      const stored = localStorage.getItem(`zoka_votes_${dateStr}`);
      if (stored) setUserVotes(JSON.parse(stored));
    } catch { /* ignore */ }

    return () => { cancelled = true; };
  }, [dateStr]);

  return { votes: [], voteStats, userVotes };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useDailyLeaderboard
   ═══════════════════════════════════════════════════════════════
   Cache: 30 min. Poll: 10 min.
   30-min session: 1 Firestore read, 2 cache hits.

   Reads: 1 (once per 30 min per session)
   ═══════════════════════════════════════════════════════════════ */

export function useDailyLeaderboard(date) {
  const dateStr = date || todayStr();
  const [entries, setEntries] = useState([]);
  const [top3, setTop3] = useState([]);
  const [rest, setRest] = useState([]);
  const [stats, setStats] = useState({ avg: '0.0', preds: 0, exact: 0, players: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    const cacheKey = `dlb_${dateStr}`;

    const load = async () => {
      setLoading(true);
      const data = await readDocOnce(
        doc(db, 'daily_leaderboard', dateStr),
        cacheKey,
        CACHE_TTL.DAILY_LEADERBOARD
      );
      if (cancelled) return;

      if (data?.entries) {
        setEntries(data.entries);
        setTop3(data.top3 || data.entries.slice(0, 3));
        setRest(data.rest || data.entries.slice(3));
        setStats(data.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 });
      } else {
        setEntries([]); setTop3([]); setRest([]);
        setStats({ avg: '0.0', preds: 0, exact: 0, players: 0 });
      }
      setLoading(false);
    };

    load();

    const interval = setInterval(() => {
      if (!cancelled) {
        readDocOnce(
          doc(db, 'daily_leaderboard', dateStr),
          cacheKey,
          CACHE_TTL.DAILY_LEADERBOARD
        ).then((data) => {
          if (cancelled || !data) return;
          setEntries(data.entries || []);
          setTop3(data.top3 || []);
          setRest(data.rest || []);
          setStats(data.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 });
        });
      }
    }, POLL_INTERVAL.SLOW);

    return () => { cancelled = true; clearInterval(interval); };
  }, [dateStr]);

  return { entries, top3, rest, stats, loading, isLive: false };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useHistoricalLeaderboard (weekly/monthly/goat)
   ═══════════════════════════════════════════════════════════════
   ★ v3 FIX: Reads from pre-computed summary doc instead of
   scanning entire collection.

   GOAT:     was ~2,000 reads → now 1 read
   Weekly:   was ~500-2,000 reads → now 1 read
   Monthly:  was ~500-2,000 reads → now 1 read

   Cache: 30 min. No polling.

   If pre-computed doc doesn't exist yet, returns empty with
   a `stale` flag. Admin needs to run rebuildGoatLeaderboard()
   or rebuildPeriodLeaderboard() at least once.
   ═══════════════════════════════════════════════════════════════ */

export function useHistoricalLeaderboard(period) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const docId = getPeriodDocId(period);
        const cacheKey = `hist_${period}`;

        const data = await readDocOnce(
          doc(db, 'leaderboard_summaries', docId),
          cacheKey,
          CACHE_TTL.HISTORICAL
        );

        if (cancelled) return;

        if (data?.entries) {
          setEntries(data.entries);
          setStale(false);
        } else {
          // No pre-computed doc yet — admin needs to rebuild
          setEntries([]);
          setStale(true);
        }
      } catch (err) {
        if (err.code === 'permission-denied') setError('permissions');
        else setError(err.message);
      }

      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [period]);

  const top3 = useMemo(() => entries.slice(0, 3), [entries]);
  const rest = useMemo(() => entries.slice(3), [entries]);

  const stats = useMemo(() => computeStats(entries), [entries]);

  return { entries, top3, rest, stats, loading, error, stale };
}

/* ═══════════════════════════════════════════════════════════════
   HOOK: useMyStats
   ═══════════════════════════════════════════════════════════════
   Combines cached hooks. 0 extra reads.
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
        predicted, total, exact, result, miss,
        points: pts, resolved,
        accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
        todayExact: Object.values(resultMap).filter((r) => r.resultType === 'exact').length,
        todayResult: Object.values(resultMap).filter((r) => r.resultType === 'result').length,
        todayMiss: Object.values(resultMap).filter((r) => r.resultType === 'miss').length,
        todayPoints: Object.values(resultMap).reduce((s, r) => s + (r.points || 0), 0),
      };
    }

    let exact = 0, result = 0, miss = 0, pts = 0, resolved = 0;
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
      predicted, total, exact, result, miss,
      points: pts, resolved,
      accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
      todayExact: exact, todayResult: result, todayMiss: miss, todayPoints: pts,
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

  invalidateCache(`myPreds_${uid}_${dateStr}`);
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
  const data = await readDocsOnce(
    query(collection(db, 'active_predictions'), where('matchDate', '==', dateStr)),
    `active_${dateStr}`,
    0
  );
  return data.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}