// ═══════════════════════════════════════════════════════════════
// FILE: src/context/AppDataContext.jsx
// ═══════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dataLayer from '../utils/dataLayer';
import { todayStr } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { CACHE_KEY } from '../utils/constants';

const AppDataContext = createContext(null);

// ★ FIX: Added calcPoints helper to resolve local fallback calculations
function calcPoints(predHome, predAway, actualHome, actualAway) {
  if (predHome == null || predAway == null || actualHome == null || actualAway == null) {
    return { points: 0, type: 'miss' };
  }
  if (predHome === actualHome && predAway === actualAway) {
    return { points: 8, type: 'exact' };
  }
  const predDiff = predHome - predAway;
  const actualDiff = actualHome - actualAway;
  if (
    (predDiff > 0 && actualDiff > 0) ||
    (predDiff < 0 && actualDiff < 0) ||
    (predDiff === 0 && actualDiff === 0)
  ) {
    if (predDiff === actualDiff) return { points: 5, type: 'result' };
    return { points: 3, type: 'result' };
  }
  return { points: 0, type: 'miss' };
}

function loadUserVotesFromStorage() {
  try {
    const stored = localStorage.getItem(`zoka_votes_${todayStr()}`);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

// ★ Default empty stats to avoid conditional rendering issues
const EMPTY_STATS = {
  predicted: 0, total: 0, exact: 0, result: 0, miss: 0,
  points: 0, resolved: 0, accuracy: 0,
  todayExact: 0, todayResult: 0, todayMiss: 0, todayPoints: 0,
  _loaded: false,
};

export function AppDataProvider({ children, userId, displayName }) {
  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

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

  // ═══════════════════════════════════════════════════
  // ★ SHARED DATA LOADER (not user-specific)
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // ★ USER DATA LOADER (specific to logged-in user)
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // ★ ENSURE USER DATA (lazy load, once only)
  // ═══════════════════════════════════════════════════
  const ensureUserData = useCallback(async (uid) => {
    if (!uid) return;
    // Use functional setState to check current value without stale closure
    let needsLoad = false;
    setState((prev) => {
      if (!prev._userDataLoaded) needsLoad = true;
      return prev; // Don't change state, just read
    });
    if (needsLoad) {
      await loadUserData(uid);
    }
  }, [loadUserData]);

  // ═══════════════════════════════════════════════════
  // ★ REFRESH USER DATA (force reload, bypasses _userDataLoaded check)
  // This is the KEY FIX - used when we know data has changed
  // ═══════════════════════════════════════════════════
  const refreshUserData = useCallback(async (uid) => {
    const effectiveUid = uid || userIdRef.current;
    if (!effectiveUid) return;
    
    // Invalidate caches first to ensure fresh fetch
    const today = todayStr();
    dataLayer.invalidate(CACHE_KEY.userPoints(effectiveUid));
    dataLayer.invalidate(CACHE_KEY.predictionResults(effectiveUid, today));
    dataLayer.invalidate(CACHE_KEY.userPredictions(effectiveUid, today));
    
    // Then reload
    await loadUserData(effectiveUid);
  }, [loadUserData]);

  // ═══════════════════════════════════════════════════
  // ★ REAL-TIME EVENT LISTENERS
  // This is the KEY FIX - context now reacts to events
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    const unsubs = [];

    // ★ When a match is resolved and user is affected, refresh their data
    unsubs.push(
      eventBus.on(EVENT.MATCH_RESOLVED, (payload) => {
        const uid = userIdRef.current;
        if (uid && payload.affectedUsers?.includes(uid)) {
          // Don't await - let it update state asynchronously
          refreshUserData(uid);
        }
        
        // Also refresh leaderboard if it's today's match
        if (payload.dateStr === todayStr()) {
          dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(todayStr()));
          loadSharedData();
        }
      })
    );

    // ★ When user saves a prediction, refresh their predictions
    unsubs.push(
      eventBus.on(EVENT.USER_PREDICTION_SAVED, (payload) => {
        const uid = userIdRef.current;
        if (uid && payload.uid === uid) {
          refreshUserData(uid);
        }
      })
    );

    // ★ When daily leaderboard updates (from other sources)
    unsubs.push(
      eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (payload) => {
        if (!payload.dateStr || payload.dateStr === todayStr()) {
          dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(todayStr()));
          dataLayer.fetchDailyLeaderboard(todayStr()).then((leaderboard) => {
            updateState((prev) => ({
              ...prev,
              dailyLeaderboard: leaderboard,
            }));
          }).catch(() => { /* ignore */ });
        }
      })
    );

    // ★ When zoka vote is cast, update vote stats
    unsubs.push(
      eventBus.on(EVENT.ZOKA_VOTE_CAST, () => {
        dataLayer.invalidate(CACHE_KEY.zokaVotes(todayStr()));
        dataLayer.fetchZokaVotes(todayStr()).then((data) => {
          updateState((prev) => ({
            ...prev,
            zokaVoteStats: data?.stats || {},
          }));
        }).catch(() => { /* ignore */ });
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [refreshUserData, loadSharedData, updateState]);

  // ═══════════════════════════════════════════════════
  // ★ INITIAL LOAD
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    mountedRef.current = true;
    loadSharedData();
    return () => { mountedRef.current = false; };
  }, [loadSharedData]);

  // ═══════════════════════════════════════════════════
  // ★ HANDLE USER SIGN IN/OUT
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // ★ HISTORICAL LEADERBOARD LOADER
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // ★ PUBLIC REFRESH/INVALIDATE
  // ═══════════════════════════════════════════════════
  const refresh = useCallback(async (options = {}) => {
    const { invalidateCache = false, userId: uid, includeUserData = false } = options;
    if (invalidateCache) dataLayer.clear();
    await loadSharedData();
    if (includeUserData && (uid || userId)) {
      await refreshUserData(uid || userId);
    }
  }, [loadSharedData, refreshUserData, userId]);

  const invalidate = useCallback((key) => dataLayer.invalidate(key), []);
  const invalidatePrefix = useCallback((prefix) => dataLayer.invalidatePrefix(prefix), []);

  // ═══════════════════════════════════════════════════
  // ★ COMPUTED VALUES (reactive to state changes)
  // ═══════════════════════════════════════════════════
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

    // ★ Build userStats - separate all-time vs today
    const userStats = {
      predicted,
      total,
      // All-time stats from userPoints
      exact: 0,
      result: 0,
      miss: 0,
      points: 0,
      resolved: 0,
      accuracy: 0,
      // Today's stats from predictionResults
      todayExact: 0,
      todayResult: 0,
      todayMiss: 0,
      todayPoints: 0,
      todayResolved: 0,
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

    // ★ Calculate today's stats from predictionResults, with local fallback for instant FT updates
    if (predictionResults?.results) {
      const { results } = predictionResults;
      userStats.todayExact = results.filter((r) => r.resultType === 'exact').length;
      userStats.todayResult = results.filter((r) => r.resultType === 'result').length;
      userStats.todayMiss = results.filter((r) => r.resultType === 'miss').length;
      userStats.todayPoints = results.reduce((s, r) => s + (r.points || 0), 0);
      userStats.todayResolved = userStats.todayExact + userStats.todayResult + userStats.todayMiss;
    }

    // ★ FIX: Local Fallback. If a match is FT but not yet in prediction_results (Admin delay), calculate locally for instant points
    if (activePredictions && userPredictions) {
      const scoreMap = new Map();
      activePredictions.forEach(p => {
        if (p.status === 'finished' && p.homeScore != null) {
          scoreMap.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
        }
      });

      Object.values(userPredictions).forEach(p => {
        const actual = scoreMap.get(String(p.matchId));
        // Check if it's already resolved in backend to avoid double counting
        const isResolvedInBackend = predictionResults?.results?.some(r => String(r.matchId) === String(p.matchId));
        
        if (actual && !isResolvedInBackend) {
          const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
          userStats.todayPoints += r.points;
          if (r.type === 'exact') userStats.todayExact++;
          else if (r.type === 'result') userStats.todayResult++;
          else userStats.todayMiss++;
          userStats.todayResolved++;
        }
      });
    }

    return {
      dailyTop3,
      dailyRest,
      dailyStats,
      myRank,
      userStats,
      predicted,
      total
    };
  }, [state, userId]);

  // ═══════════════════════════════════════════════════
  // ★ CONTEXT VALUE
  // ═══════════════════════════════════════════════════
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
    // ★ Expose refreshUserData for components that need it
    refreshUserData,
    refresh,
    invalidate,
    invalidatePrefix,
    loadHistoricalLeaderboard,
    loadUserData,
    ensureUserData,
    dataLayer,
  }), [state, computed, refreshUserData, refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard, loadUserData, ensureUserData]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

export { EMPTY_STATS };
export default AppDataContext;