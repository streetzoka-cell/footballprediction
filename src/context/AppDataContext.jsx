// ═════════════════════════════════════════════════════════════════════════════
// FILE: src/context/AppDataContext.jsx
// APP DATA PROVIDER
//
// Loads shared data ONCE and distributes it via React Context.
// Navigation between pages reuses the same shared state.
//
// DATA LOADED:
// - Active predictions (today)
// - Daily leaderboard (today)
// - Zoka picks (today)
// - Zoka vote stats (today)
// - User predictions (if authenticated)
// - Prediction results (if authenticated)
// - User points (if authenticated)
//
// NOT LOADED (lazy, on-demand):
// - Historical leaderboards (GOAT, weekly, monthly)
// - Different date's data (admin page)
//
// LIVE FIXTURES:
// These come from the backend REST API (not Firestore).
// Pages that need live fixtures use subscribeToLiveFixtures() from api.jsx.
// ═════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dataLayer, { todayStr } from '../utils/dataLayer';

const AppDataContext = createContext(null);

// ═══════════════════════════════════════════════════════════════
// HELPER: Load user votes from localStorage
// ═══════════════════════════════════════════════════════════════

function loadUserVotesFromStorage() {
  const today = todayStr();
  try {
    const stored = localStorage.getItem(`zoka_votes_${today}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER COMPONENT
// ═══════════════════════════════════════════════════════════════

export function AppDataProvider({ children, userId, displayName }) {
  const mountedRef = useRef(true);
  const pollTimerRef = useRef(null);

  // ─── State ──────────────────────────────────────────────
  const [state, setState] = useState({
    // Shared data (loaded once, cached)
    activePredictions: [],
    scoreMap: new Map(),
    dailyLeaderboard: null,
    zokaPicks: null,
    zokaVoteStats: {},

    // Historical leaderboards (loaded on-demand)
    historicalLeaderboards: {},

    // User-specific data (loaded when user is authenticated)
    userPredictions: {},
    predictionResults: { results: [], resultMap: {} },
    userPoints: null,

    // UI state
    loading: true,
    error: null,
    lastUpdate: null,
    currentUserVotes: loadUserVotesFromStorage(),
  });

  // ─── Safe State Update ──────────────────────────────────
  const updateState = useCallback((updater) => {
    if (mountedRef.current) {
      setState((prev) => updater(prev));
    }
  }, []);

  // ─── Load Shared Data ───────────────────────────────────
  const loadSharedData = useCallback(async () => {
    const today = todayStr();

    try {
      // Fetch all shared data in parallel (deduplicated by dataLayer)
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

  // ─── Load User Data ─────────────────────────────────────
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
      }));
    } catch (err) {
      console.error('[AppData] Failed to load user data:', err);
    }
  }, [updateState]);

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

  // ─── Initial Load + Polling ─────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Load shared data immediately
    loadSharedData();

    // Start polling every 10 minutes (cache will absorb most polls)
    pollTimerRef.current = setInterval(() => {
      // Invalidate cache to force fresh fetch
      const today = todayStr();
      dataLayer.invalidate(`active_${today}`);
      dataLayer.invalidate(`dlb_${today}`);
      dataLayer.invalidate(`zoka_${today}`);
      dataLayer.invalidate(`zokaVotes_${today}`);
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

  // ─── Load User Data When User Changes ───────────────────
  useEffect(() => {
    if (userId) {
      loadUserData(userId);
    } else {
      updateState((prev) => ({
        ...prev,
        userPredictions: {},
        predictionResults: { results: [], resultMap: {} },
        userPoints: null,
      }));
    }
  }, [userId, loadUserData, updateState]);

  // ─── Refresh Function ──────────────────────────────────
  const refresh = useCallback(async (options = {}) => {
    const { invalidateCache = false, userId: uid } = options;

    if (invalidateCache) {
      dataLayer.clear();
    }

    await loadSharedData();

    if (uid || userId) {
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
    const { dailyLeaderboard, userPoints, predictionResults, activePredictions, userPredictions } = state;

    // Daily leaderboard
    const dailyEntries = dailyLeaderboard?.entries || [];
    const dailyTop3 = dailyLeaderboard?.top3 || dailyEntries.slice(0, 3);
    const dailyRest = dailyLeaderboard?.rest || dailyEntries.slice(3);
    const dailyStats = dailyLeaderboard?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };

    // User's rank
    const myRank = userId
      ? dailyEntries.find((u) => u.uid === userId) || null
      : null;

    // User stats
    const myPredValues = Object.values(userPredictions);
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

    const { results, resultMap } = predictionResults;
    userStats.todayExact = results.filter((r) => r.resultType === 'exact').length;
    userStats.todayResult = results.filter((r) => r.resultType === 'result').length;
    userStats.todayMiss = results.filter((r) => r.resultType === 'miss').length;
    userStats.todayPoints = results.reduce((s, r) => s + (r.points || 0), 0);

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
    userPredictions: state.userPredictions,
    predictionResults: state.predictionResults,
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

    // Data layer (for advanced usage)
    dataLayer,
  }), [state, computed, refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return ctx;
}

export default AppDataContext;