// ═══════════════════════════════════════════════════════════════
// FILE: src/context/AppDataContext.jsx
// ═══════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dataLayer from '../utils/dataLayer';
import { todayStr } from '../utils/dates';

const AppDataContext = createContext(null);

function loadUserVotesFromStorage() {
  try {
    const stored = localStorage.getItem(`zoka_votes_${todayStr()}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

export function AppDataProvider({ children, userId, displayName }) {
  const mountedRef = useRef(true);
  // FIX: Removed pollTimerRef as we are removing redundant polling

  const [state, setState] = useState({
    zokaPicks: null,
    zokaVoteStats: {},

    activePredictions: [],
    scoreMap: new Map(),

    dailyLeaderboard: null,
    historicalLeaderboards: {},

    userPredictions: null,
    predictionResults: null,
    userPoints: null,
    _userDataLoaded: false,

    loading: true,
    error: null,
    lastUpdate: null,
    currentUserVotes: loadUserVotesFromStorage(),
  });

  const updateState = useCallback((updater) => {
    if (mountedRef.current) setState((prev) => updater(prev));
  }, []);

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
        zokaPicks,
        zokaVoteStats: zokaVotes?.stats || {},
        loading: false,
        lastUpdate: new Date(),
        error: null,
      }));
    } catch (err) {
      console.error('[AppData] Failed to load shared data:', err);
      updateState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  }, [updateState]);

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

  const ensureUserData = useCallback(async (uid) => {
    if (!uid || state._userDataLoaded) return;
    await loadUserData(uid || userId);
  }, [state._userDataLoaded, loadUserData, userId]);

  const loadHistoricalLeaderboard = useCallback(async (period) => {
    try {
      const data = await dataLayer.fetchHistoricalLeaderboard(period);
      updateState((prev) => ({
        ...prev,
        historicalLeaderboards: { ...prev.historicalLeaderboards, [period]: data },
      }));
    } catch (err) {
      console.error(`[AppData] Failed to load ${period} leaderboard:`, err);
    }
  }, [updateState]);

  useEffect(() => {
    mountedRef.current = true;
    loadSharedData();

    // FIX: Removed the 10-minute interval polling. 
    // api.jsx's visibility-based polling handles cache invalidation and triggers events automatically.

    return () => {
      mountedRef.current = false;
    };
  }, [loadSharedData]);

  useEffect(() => {
    if (!userId) {
      updateState((prev) => ({
        ...prev,
        userPredictions: null, predictionResults: null, userPoints: null, _userDataLoaded: false,
      }));
    }
  }, [userId, updateState]);

  const refresh = useCallback(async (options = {}) => {
    const { invalidateCache = false, userId: uid, includeUserData = false } = options;
    if (invalidateCache) dataLayer.clear();
    await loadSharedData();
    if (includeUserData && (uid || userId)) await loadUserData(uid || userId);
  }, [loadSharedData, loadUserData, userId]);

  const invalidate = useCallback((key) => dataLayer.invalidate(key), []);
  const invalidatePrefix = useCallback((prefix) => dataLayer.invalidatePrefix(prefix), []);

  const computed = useMemo(() => {
    const { dailyLeaderboard, userPoints, predictionResults, activePredictions, userPredictions, _userDataLoaded } = state;

    const dailyEntries = dailyLeaderboard?.entries || [];
    const dailyTop3 = dailyLeaderboard?.top3 || dailyEntries.slice(0, 3);
    const dailyRest = dailyLeaderboard?.rest || dailyEntries.slice(3);
    const dailyStats = dailyLeaderboard?.stats || { avg: '0.0', preds: 0, exact: 0, players: 0 };

    const myRank = userId ? dailyEntries.find((u) => u.uid === userId) || null : null;

    const myPredValues = userPredictions ? Object.values(userPredictions) : [];
    const predicted = myPredValues.length;
    const total = activePredictions.length;

    const userStats = {
      predicted, total, exact: 0, result: 0, miss: 0, points: 0,
      resolved: 0, accuracy: 0, todayExact: 0, todayResult: 0, todayMiss: 0, todayPoints: 0,
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

    if (predictionResults?.results) {
      const { results } = predictionResults;
      userStats.todayExact = results.filter((r) => r.resultType === 'exact').length;
      userStats.todayResult = results.filter((r) => r.resultType === 'result').length;
      userStats.todayMiss = results.filter((r) => r.resultType === 'miss').length;
      userStats.todayPoints = results.reduce((s, r) => s + (r.points || 0), 0);
    }

    const predCounts = dailyLeaderboard?.predCounts || {};
    const predDist = dailyLeaderboard?.predDist || {};

    return { dailyEntries, dailyTop3, dailyRest, dailyStats, myRank, userStats, predCounts, predDist };
  }, [state, userId]);

  const value = useMemo(() => ({
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
    ...computed,
    loading: state.loading,
    error: state.error,
    lastUpdate: state.lastUpdate,
    refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard, loadUserData, ensureUserData,
    dataLayer,
  }), [state, computed, refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard, loadUserData, ensureUserData]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

export default AppDataContext;