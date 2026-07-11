// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/context/AppDataContext.jsx
// APP DATA PROVIDER — Updated for direct Firestore + lazy user data
//
// ★ KEY CHANGE: User-specific data (predictions, results, points)
//   is NO LONGER loaded on app startup. It's loaded lazily when
//   the user navigates to a page that needs it (Profile, Predictions).
//
//   This saves ~21 Firestore reads per authenticated user on every
//   app visit. With 2,000 users, that's 42,000 reads/day saved.
// ═════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dataLayer, { todayStr } from '../utils/dataLayer';

const AppDataContext = createContext(null);

function loadUserVotesFromStorage() {
  const today = todayStr();
  try {
    const stored = localStorage.getItem(`zoka_votes_${today}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

export function AppDataProvider({ children, userId, displayName }) {
  const mountedRef = useRef(true);
  const pollTimerRef = useRef(null);

  // ─── State ──────────────────────────────────────────────
  const [state, setState] = useState({
    // Shared data (loaded once on app startup)
    activePredictions: [],
    scoreMap: new Map(),
    dailyLeaderboard: null,
    zokaPicks: null,
    zokaVoteStats: {},

    // Historical leaderboards (loaded on-demand)
    historicalLeaderboards: {},

    // ★ User-specific data — starts EMPTY, loaded lazily
    userPredictions: null,       // null = not yet loaded, {} = loaded but empty
    predictionResults: null,     // null = not yet loaded
    userPoints: null,            // null = not yet loaded
    _userDataLoaded: false,      // Flag to track if user data has been loaded

    // UI state
    loading: true,
    error: null,
    lastUpdate: null,
    currentUserVotes: loadUserVotesFromStorage(),
  });

  const updateState = useCallback((updater) => {
    if (mountedRef.current) {
      setState((prev) => updater(prev));
    }
  }, []);

  // ─── Load Shared Data (on app startup) ──────────────────
  const loadSharedData = useCallback(async () => {
    const today = todayStr();

    try {
      const [predictions, leaderboard, zokaPicks, zokaVotes] = await Promise.all([
        dataLayer.fetchActivePredictions(today),
        dataLayer.fetchDailyLeaderboard(today),
        dataLayer.fetchZokaPicks(today),
        dataLayer.fetchZokaVotes(today),
      ]);

      updateState((prev) => ({
        ...prev,
        activePredictions: predictions || [],
        scoreMap: dataLayer.getScoreMap(predictions),
        dailyLeaderboard: leaderboard,
        zokaPicks: zokaPicks,
        zokaVoteStats: zokaVotes?.stats || {},
        loading: false,
        lastUpdate: new Date(),
        error: null,
      }));
    } catch (err) {
      console.error('[AppData] Failed to load shared data:', err);
      updateState((prev) => ({
        ...prev,
        loading: false,
        error: err.message,
      }));
    }
  }, [updateState]);

  // ─── ★ Load User Data (LAZY — called on demand) ─────────
  const loadUserData = useCallback(async (uid) => {
    if (!uid) return;

    const today = todayStr();

    try {
      const [predictions, results, points] = await Promise.all([
        dataLayer.fetchUserPredictions(uid, today),
        dataLayer.fetchPredictionResults(uid, today),
        dataLayer.fetchUserPoints(uid),
      ]);

      updateState((prev) => ({
        ...prev,
        userPredictions: predictions || {},
        predictionResults: results || { results: [], resultMap: {} },
        userPoints: points,
        _userDataLoaded: true,
      }));
    } catch (err) {
      console.error('[AppData] Failed to load user data:', err);
      updateState((prev) => ({
        ...prev,
        userPredictions: {},
        predictionResults: { results: [], resultMap: {} },
        userPoints: null,
        _userDataLoaded: true,
      }));
    }
  }, [updateState]);

  // ─── ★ ensureUserData — Call this before rendering user data ─
  // Pages that need user data call this. It only fetches once.
  const ensureUserData = useCallback(async (uid) => {
    if (!uid) return;
    if (state._userDataLoaded) return;
    await loadUserData(uid || userId);
  }, [state._userDataLoaded, loadUserData, userId]);

  // ─── Load Historical Leaderboard (on-demand) ───────────
  const loadHistoricalLeaderboard = useCallback(async (period) => {
    try {
      const data = await dataLayer.fetchHistoricalLeaderboard(period);
      updateState((prev) => ({
        ...prev,
        historicalLeaderboards: {
          ...prev.historicalLeaderboards,
          [period]: data,
        },
      }));
    } catch (err) {
      console.error(`[AppData] Failed to load ${period} leaderboard:`, err);
    }
  }, [updateState]);

  // ─── Initial Load + Polling (shared data only) ──────────
  useEffect(() => {
    mountedRef.current = true;
    loadSharedData();

    // Poll every 10 minutes — only invalidates memory cache.
    // localStorage still serves as fallback, so this is essentially free.
    pollTimerRef.current = setInterval(() => {
      const today = todayStr();
      // Only invalidate memory cache (not localStorage)
      // This forces a fresh check against localStorage/Firestore
      dataLayer.invalidate(`active:${today}`);
      dataLayer.invalidate(`dlb:${today}`);
      dataLayer.invalidate(`zoka:${today}`);
      dataLayer.invalidate(`zokaVotes:${today}`);
      loadSharedData();
    }, 10 * 60 * 1000);

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [loadSharedData]);

  // ─── ★ DO NOT auto-load user data on userId change ─────
  // User data is loaded lazily by pages that need it.
  // This is the KEY optimization for staying under 50K reads.
  //
  // When user logs out, reset user data state:
  useEffect(() => {
    if (!userId) {
      updateState((prev) => ({
        ...prev,
        userPredictions: null,
        predictionResults: null,
        userPoints: null,
        _userDataLoaded: false,
      }));
    }
  }, [userId, updateState]);

  // ─── Refresh Function ──────────────────────────────────
  const refresh = useCallback(async (options = {}) => {
    const { invalidateCache = false, userId: uid, includeUserData = false } = options;

    if (invalidateCache) {
      dataLayer.clear();
    }

    await loadSharedData();

    if (includeUserData && (uid || userId)) {
      await loadUserData(uid || userId);
    }
  }, [loadSharedData, loadUserData, userId]);

  // ─── Invalidate Specific Cache ──────────────────────────
  const invalidate = useCallback((key) => {
    dataLayer.invalidate(key);
  }, []);

  const invalidatePrefix = useCallback((prefix) => {
    dataLayer.invalidatePrefix(prefix);
  }, []);

  // ─── Computed Values ────────────────────────────────────
  const computed = useMemo(() => {
    const { dailyLeaderboard, userPoints, predictionResults, activePredictions, userPredictions, _userDataLoaded } = state;

    // Daily leaderboard
    const dailyEntries = dailyLeaderboard?.entries || [];
    const dailyTop3 = dailyLeaderboard?.top3 || dailyEntries.slice(0, 3);
    const dailyRest = dailyLeaderboard?.rest || dailyEntries.slice(3);
    const dailyStats = dailyLeaderboard?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };

    // User's rank
    const myRank = userId
      ? dailyEntries.find((u) => u.uid === userId) || null
      : null;

    // User stats — safe even when data isn't loaded yet
    const myPredValues = userPredictions ? Object.values(userPredictions) : [];
    const predicted = myPredValues.length;
    const total = activePredictions.length;

    const userStats = {
      predicted,
      total,
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
      _loaded: _userDataLoaded,
    };

    if (userPoints) {
      userStats.exact = userPoints.exactCount || 0;
      userStats.result = userPoints.resultCount || 0;
      userStats.miss = userPoints.missCount || 0;
      userStats.points = userPoints.totalPoints || 0;
      userStats.resolved = userStats.exact + userStats.result + userStats.miss;
      userStats.accuracy = userStats.resolved > 0
        ? Math.round(((userStats.exact + userStats.result) / userStats.resolved) * 100)
        : 0;
    }

    if (predictionResults && predictionResults.results) {
      const { results } = predictionResults;
      userStats.todayExact = results.filter((r) => r.resultType === 'exact').length;
      userStats.todayResult = results.filter((r) => r.resultType === 'result').length;
      userStats.todayMiss = results.filter((r) => r.resultType === 'miss').length;
      userStats.todayPoints = results.reduce((s, r) => s + (r.points || 0), 0);
    }

    // Prediction distribution
    const predCounts = dailyLeaderboard?.predCounts || {};
    const predDist = dailyLeaderboard?.predDist || {};

    return {
      dailyEntries,
      dailyTop3,
      dailyRest,
      dailyStats,
      myRank,
      userStats,
      predCounts,
      predDist,
    };
  }, [state, userId]);

  // ─── Context Value (memoized) ───────────────────────────
  const value = useMemo(() => ({
    // Raw state
    activePredictions: state.activePredictions,
    scoreMap: state.scoreMap,
    dailyLeaderboard: state.dailyLeaderboard,
    zokaPicks: state.zokaPicks,
    zokaVoteStats: state.zokaVoteStats,
    historicalLeaderboards: state.historicalLeaderboards,
    userPredictions: state.userPredictions || {},
    predictionResults: state.predictionResults || { results: [], resultMap: {} },
    userPoints: state.userPoints,
    currentUserVotes: state.currentUserVotes,

    // Computed
    ...computed,

    // UI
    loading: state.loading,
    error: state.error,
    lastUpdate: state.lastUpdate,

    // Actions
    refresh,
    invalidate,
    invalidatePrefix,
    loadHistoricalLeaderboard,
    loadUserData,
    ensureUserData,

    // Data layer
    dataLayer,
  }), [state, computed, refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard, loadUserData, ensureUserData]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return ctx;
}

export default AppDataContext;