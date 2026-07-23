// ═══════════════════════════════════════════════════════════════
// FILE: src/context/AppDataContext.jsx
// ═══════════════════════════════════════════════════════════════

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dataLayer from '../utils/dataLayer';
import { todayStr } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { CACHE_KEY, calcPoints } from '../utils/constants';
import { useAuth } from '../context/AuthContext';

const AppDataContext = createContext(null);

function loadUserVotesFromStorage() {
  try { const stored = localStorage.getItem(`zoka_votes_${todayStr()}`); if (stored) return JSON.parse(stored); } catch { /* ignore */ }
  return {};
}

const EMPTY_STATS = { predicted: 0, total: 0, exact: 0, result: 0, miss: 0, points: 0, resolved: 0, accuracy: 0, todayExact: 0, todayResult: 0, todayMiss: 0, todayPoints: 0, _loaded: false };

export function AppDataProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.uid;
  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [state, setState] = useState({
    zokaPicks: null, zokaVoteStats: {}, activePredictions: [], scoreMap: new Map(),
    dailyLeaderboard: null, historicalLeaderboards: {}, userPredictions: null,
    predictionResults: null, userPoints: null, _userDataLoaded: false,
    loading: true, error: null, lastUpdate: null, currentUserVotes: loadUserVotesFromStorage(),
  });

  const updateState = useCallback((updater) => { if (mountedRef.current) setState((prev) => updater(prev)); }, []);

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
        error: null 
      }));
    } catch (err) { 
      console.error('[AppData] Shared load failed:', err); 
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
        dataLayer.fetchUserPoints(uid)
      ]);
      updateState((prev) => ({ 
        ...prev, 
        userPredictions: predictions || {}, 
        predictionResults: results || { results: [], resultMap: {} }, 
        userPoints: points, 
        _userDataLoaded: true 
      }));
    } catch (err) { 
      console.error('[AppData] User load failed:', err); 
      updateState((prev) => ({ 
        ...prev, 
        userPredictions: {}, 
        predictionResults: { results: [], resultMap: {} }, 
        userPoints: null, 
        _userDataLoaded: true 
      })); 
    }
  }, [updateState]);

  const ensureUserData = useCallback(async (uid) => { 
    if (!uid) return; 
    let needsLoad = false; 
    setState((prev) => { if (!prev._userDataLoaded) needsLoad = true; return prev; }); 
    if (needsLoad) await loadUserData(uid); 
  }, [loadUserData]);

  const refreshUserData = useCallback(async (uid, dateStr) => {
    const effectiveUid = uid || userIdRef.current; 
    if (!effectiveUid) return; 
    const date = dateStr || todayStr();
    dataLayer.invalidate(CACHE_KEY.userPoints(effectiveUid)); 
    dataLayer.invalidate(CACHE_KEY.predictionResults(effectiveUid, date)); 
    dataLayer.invalidate(CACHE_KEY.userPredictions(effectiveUid, date));
    await loadUserData(effectiveUid);
  }, [loadUserData]);

  useEffect(() => {
    const unsubs = [];
    unsubs.push(eventBus.on(EVENT.MATCH_RESOLVED, (p) => { 
      const uid = userIdRef.current; 
      if (uid && p.affectedUsers?.includes(uid)) refreshUserData(uid, p.dateStr); 
      if (p.dateStr === todayStr()) { 
        dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(todayStr())); 
        loadSharedData(); 
      } 
    }));
    
    // ★ FIX: Properly invalidate cache for the specific date the prediction was saved for
    unsubs.push(eventBus.on(EVENT.USER_PREDICTION_SAVED, (p) => { 
      const uid = userIdRef.current; 
      if (uid && p.uid === uid) {
        refreshUserData(uid, p.dateStr);
      } 
    }));
    
    unsubs.push(eventBus.on(EVENT.DAILY_LEADERBOARD_UPDATED, (p) => { 
      if (!p.dateStr || p.dateStr === todayStr()) { 
        dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(todayStr())); 
        dataLayer.fetchDailyLeaderboard(todayStr()).then((lb) => updateState((prev) => ({ ...prev, dailyLeaderboard: lb }))).catch(() => {}); 
      } 
    }));
    unsubs.push(eventBus.on(EVENT.ZOKA_VOTE_CAST, () => { 
      dataLayer.invalidate(CACHE_KEY.zokaVotes(todayStr())); 
      dataLayer.fetchZokaVotes(todayStr()).then((d) => updateState((prev) => ({ ...prev, zokaVoteStats: d?.stats || {} }))).catch(() => {}); 
    }));
    return () => unsubs.forEach((u) => u());
  }, [refreshUserData, loadSharedData, updateState]);

  useEffect(() => { 
    mountedRef.current = true; 
    // ★ FIX: Invalidate ALL relevant caches on load to bypass PWA/localStorage and force fresh Firestore read
    dataLayer.invalidatePrefix('snap:ft:');
    dataLayer.invalidatePrefix('snap:bb:');
    const today = todayStr();
    dataLayer.invalidate(CACHE_KEY.activePredictions(today));
    dataLayer.invalidate(CACHE_KEY.dailyLeaderboard(today));
    dataLayer.invalidate(CACHE_KEY.zokaPicks(today));
    
    loadSharedData(); 
    return () => { mountedRef.current = false; }; 
  }, [loadSharedData]);

  useEffect(() => {
    if (!userId) { 
      updateState((prev) => ({ ...prev, userPredictions: null, predictionResults: null, userPoints: null, _userDataLoaded: false })); 
    } else { 
      ensureUserData(userId); 
    }
  }, [userId, ensureUserData, updateState]);

  const loadHistoricalLeaderboard = useCallback(async (period) => {
    try { 
      const data = await dataLayer.fetchHistoricalLeaderboard(period); 
      updateState((prev) => ({ ...prev, historicalLeaderboards: { ...prev.historicalLeaderboards, [period]: data } })); 
    } catch (err) { 
      console.error(`[AppData] Hist LB failed:`, err); 
    }
  }, [updateState]);

  const refresh = useCallback(async (options = {}) => { 
    const { invalidateCache = false, userId: uid, includeUserData = false } = options; 
    if (invalidateCache) dataLayer.clear(); 
    await loadSharedData(); 
    if (includeUserData && (uid || userId)) await refreshUserData(uid || userId); 
  }, [loadSharedData, refreshUserData, userId]);
  
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
    const userStats = { ...EMPTY_STATS, predicted, total, _loaded: _userDataLoaded };
    
    if (userPoints) { 
      userStats.exact = userPoints.exactCount || 0; 
      userStats.result = userPoints.resultCount || 0; 
      userStats.miss = userPoints.missCount || 0; 
      userStats.points = userPoints.totalPoints || 0; 
      userStats.resolved = userStats.exact + userStats.result + userStats.miss; 
      userStats.accuracy = userStats.resolved > 0 ? Math.round(((userStats.exact + userStats.result) / userStats.resolved) * 100) : 0; 
    }
    if (predictionResults?.results) { 
      const { results } = predictionResults; 
      userStats.todayExact = results.filter((r) => r.resultType === 'exact').length; 
      userStats.todayResult = results.filter((r) => r.resultType === 'result').length; 
      userStats.todayMiss = results.filter((r) => r.resultType === 'miss').length; 
      userStats.todayPoints = results.reduce((s, r) => s + (r.points || 0), 0); 
      userStats.todayResolved = userStats.todayExact + userStats.todayResult + userStats.todayMiss; 
    }
    
    if (activePredictions && userPredictions) {
      const scoreMap = new Map(); 
      activePredictions.forEach(p => { 
        if (p.status === 'finished' && p.homeScore != null) scoreMap.set(String(p.matchId), { h: p.homeScore, a: p.awayScore }); 
      });
      Object.values(userPredictions).forEach(p => {
        const actual = scoreMap.get(String(p.matchId));
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
    return { dailyTop3, dailyRest, dailyStats, myRank, userStats, predicted, total };
  }, [state, userId]);

  const value = useMemo(() => ({ 
    ...state, ...computed, refreshUserData, refresh, invalidate, invalidatePrefix, loadHistoricalLeaderboard, loadUserData, ensureUserData, dataLayer 
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