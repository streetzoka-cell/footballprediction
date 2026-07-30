import { useQuery } from '@tanstack/react-query';
import { db } from '../utils/firebase';
import { collection, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { PATHS } from '../utils/constants';
import { getWeekStart, getMonthStart, todayStr } from '../utils/dates';

export function useActivePredictions(dateStr) {
  return useQuery({
    queryKey: ['activePredictions', dateStr],
    queryFn: async () => {
      if (!db || !dateStr) return [];
      
      // 1. Try fetching the fast snapshot document first
      const snap = await getDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr));
      if (snap.exists() && snap.data().predictions?.length > 0) {
        return snap.data().predictions;
      }
      
      // 2. Fallback to the collection if snapshot is missing
      const q = query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr));
      const qs = await getDocs(q);
      const preds = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      
      // 3. Repair the missing snapshot in the background so it loads fast next time
      if (preds.length > 0) {
        const cleanPreds = JSON.parse(JSON.stringify(preds));
        await setDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr), { predictions: cleanPreds, updatedAt: serverTimestamp() }, { merge: true });
      }
      
      return preds;
    },
    enabled: !!dateStr,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes garbage collection
  });
}

export function useUserPredictions(uid, dateStr) {
  return useQuery({
    queryKey: ['userPredictions', uid, dateStr],
    queryFn: async () => {
      if (!uid || !db || !dateStr) return {};
      const q = query(
        collection(db, PATHS.USER_PREDICTIONS), 
        where('userId', '==', uid), 
        where('matchDate', '==', dateStr)
      );
      const snap = await getDocs(q);
      const map = {};
      snap.docs.forEach(d => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      return map;
    },
    enabled: !!uid && !!dateStr,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useDailyLeaderboard(dateStr) {
  return useQuery({
    queryKey: ['dailyLeaderboard', dateStr],
    queryFn: async () => {
      if (!db || !dateStr) return null;
      const snap = await getDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!dateStr,
    staleTime: 60 * 1000,
  });
}

export function useZokaPicks(dateStr) {
  return useQuery({
    queryKey: ['zokaPicks', dateStr],
    queryFn: async () => {
      if (!db || !dateStr) return null;
      const snap = await getDoc(doc(db, PATHS.ZOKA_PICKS, dateStr));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!dateStr,
    staleTime: 30 * 1000,
  });
}

export function useZokaVotes(dateStr) {
  return useQuery({
    queryKey: ['zokaVotes', dateStr],
    queryFn: async () => {
      if (!db || !dateStr) return { stats: {} };
      const snap = await getDoc(doc(db, PATHS.ZOKA_VOTE_STATS, dateStr));
      return snap.exists() ? { stats: snap.data().stats || {} } : { stats: {} };
    },
    enabled: !!dateStr,
    staleTime: 30 * 1000,
  });
}

export function useUserPoints(uid) {
  return useQuery({
    queryKey: ['userPoints', uid],
    queryFn: async () => {
      if (!uid || !db) return null;
      const snap = await getDoc(doc(db, PATHS.USER_POINTS_TOTAL, uid));
      return snap.exists() ? snap.data() : null;
    },
    enabled: !!uid,
    staleTime: 60 * 1000,
  });
}

export function useWeeklyLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard', 'weekly'],
    queryFn: async () => {
      if (!db) return null;
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, `weekly_${getWeekStart()}`));
      return snap.exists() ? snap.data() : null;
    },
    staleTime: 60 * 1000,
  });
}

export function useMonthlyLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard', 'monthly'],
    queryFn: async () => {
      if (!db) return null;
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, `monthly_${getMonthStart()}`));
      return snap.exists() ? snap.data() : null;
    },
    staleTime: 60 * 1000,
  });
}

export function useGoatLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard', 'goat'],
    queryFn: async () => {
      if (!db) return null;
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'));
      return snap.exists() ? snap.data() : null;
    },
    staleTime: 60 * 1000,
  });
}