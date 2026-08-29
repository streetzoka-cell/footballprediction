import { useQuery } from '@tanstack/react-query';
import { db } from '../utils/firebase';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { PATHS } from '../utils/constants';
import { getWeekStart, getMonthStart, todayStr } from '../utils/dates';
import { footballApi } from '../services/footballApi';

async function readFeaturedMatches(dateStr) {
  try {
    const res = await footballApi.getFeatured(dateStr);
    const backendMatches = res?.matches || res?.data || [];
    if (Array.isArray(backendMatches) && backendMatches.length > 0) return backendMatches;
  } catch (err) {
    console.warn('[useActivePredictions] Backend read failed, falling back to Firebase:', err.message);
  }

  if (!db || !dateStr) return [];
  const snap = await getDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr));
  if (snap.exists() && snap.data().predictions?.length > 0) return snap.data().predictions;

  const q = query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr));
  const qs = await getDocs(q);
  return qs.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

async function readZokaPicks(dateStr) {
  try {
    const res = await footballApi.getZokaPicks(dateStr);
    if (res?.published && res?.picks) return res.picks;
  } catch (err) {
    console.warn('[useZokaPicks] Backend read failed, falling back to Firebase:', err.message);
  }

  if (!db || !dateStr) return null;
  const snap = await getDoc(doc(db, PATHS.ZOKA_PICKS, dateStr));
  return snap.exists() ? snap.data() : null;
}

export function useActivePredictions(dateStr) {
  return useQuery({
    queryKey: ['activePredictions', dateStr],
    queryFn: () => readFeaturedMatches(dateStr),
    enabled: !!dateStr,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useUserPredictions(uid, dateStr) {
  return useQuery({
    queryKey: ['userPredictions', uid, dateStr],
    queryFn: async () => {
  if (!uid || !dateStr) return {};
  try {
    const res = await footballApi.getUserPredictions(dateStr);
    const backendMap = res?.data || {};
    if (backendMap && Object.keys(backendMap).length > 0) {
      // ★ Defensive dual-keying: the backend may key by predId
      //   (uid_matchId) while components look up by matchId — register
      //   the entry under BOTH keys so neither lookup misses.
      const map = {};
      Object.entries(backendMap).forEach(([key, entry]) => {
        map[key] = entry;
        const mid = entry?.matchId ?? entry?.match_id;
        if (mid && String(mid) !== String(key)) {
          map[String(mid)] = { ...entry, id: key };
        }
      });
      return map;
    }
  } catch (err) {
    console.warn('[useUserPredictions] Backend read failed, falling back to Firebase:', err.message);
  }

  if (!db) return {};
  const q = query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '==', uid), where('matchDate', '==', dateStr));
  const snap = await getDocs(q);
  const map = {};
  snap.docs.forEach((d) => { map[d.id] = { id: d.id, ...d.data() }; });
  return map;
},


    enabled: !!uid && !!dateStr,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useZokaPicks(dateStr) {
  return useQuery({
    queryKey: ['zokaPicks', dateStr],
    queryFn: () => readZokaPicks(dateStr),
    enabled: !!dateStr,
    staleTime: 2 * 60 * 1000,
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
    staleTime: 2 * 60 * 1000,
  });
}

export function useDailyLeaderboard(dateStr) {
  return useQuery({
    queryKey: ['dailyLeaderboard', dateStr],
    queryFn: async () => {
      if (!dateStr) return null;
      try {
        const backend = await footballApi.getDailyLeaderboard(dateStr);
        if (backend && Array.isArray(backend.entries)) {
          return {
            entries: backend.entries,
            stats: {
              players: Number(backend.stats?.players ?? backend.entries.length),
              preds: Number(backend.stats?.preds ?? 0),
            },
          };
        }
      } catch (err) {
        console.warn('[useDailyLeaderboard] Backend read failed, falling back to Firebase:', err.message);
      }

      if (!db) return { entries: [], stats: { players: 0 } };
      const colRef = collection(db, 'daily_leaderboard', dateStr, 'users');
      const q = query(colRef, orderBy('points', 'desc'), limit(100));
      const snap = await getDocs(q);
      if (snap.empty) return { entries: [], stats: { players: 0 } };

      const entries = snap.docs.map((doc, i) => ({
        ...doc.data(),
        uid: doc.id,
        rank: i + 1,
        accuracy: doc.data().predictions > 0 ? Math.round(((doc.data().exact + doc.data().result) / doc.data().predictions) * 100) : 0,
      }));
      return { entries, stats: { players: entries.length } };
    },
    enabled: !!dateStr,
    staleTime: 2 * 60 * 1000,
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
      try {
        const backend = await footballApi.getLeaderboardSummary('weekly');
        if (backend && Array.isArray(backend.entries)) return backend;
      } catch (err) {
        console.warn('[useWeeklyLeaderboard] Backend read failed, falling back to Firebase:', err.message);
      }
      if (!db) return { entries: [], stats: { players: 0 } };
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, `weekly_${getWeekStart()}`));
      return snap.exists() ? snap.data() : { entries: [], stats: { players: 0 } };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMonthlyLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard', 'monthly'],
    queryFn: async () => {
      try {
        const backend = await footballApi.getLeaderboardSummary('monthly');
        if (backend && Array.isArray(backend.entries)) return backend;
      } catch (err) {
        console.warn('[useMonthlyLeaderboard] Backend read failed, falling back to Firebase:', err.message);
      }
      if (!db) return { entries: [], stats: { players: 0 } };
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, `monthly_${getMonthStart()}`));
      return snap.exists() ? snap.data() : { entries: [], stats: { players: 0 } };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useGoatLeaderboard() {
  return useQuery({
    queryKey: ['leaderboard', 'goat'],
    queryFn: async () => {
      try {
        const backend = await footballApi.getLeaderboardSummary('goat');
        if (backend && Array.isArray(backend.entries)) return backend;
      } catch (err) {
        console.warn('[useGoatLeaderboard] Backend read failed, falling back to Firebase:', err.message);
      }
      if (!db) return { entries: [], stats: { players: 0 } };
      const snap = await getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'));
      return snap.exists() ? snap.data() : { entries: [], stats: { players: 0 } };
    },
    staleTime: 10 * 60 * 1000,
  });
}
export function usePublishedPickGroups(dateStr) {
  return useQuery({
    queryKey: ['publishedPickGroups', dateStr],
    queryFn: async () => {
      try {
        const res = await footballApi.getPublishedPickGroups(dateStr);
        // ★ 404s arrive disguised as { data: [], notFound: true } — not a payload
        if (!res || res.notFound || Array.isArray(res.data) || !res.data) return null;
        if (!res.data.groups || Object.keys(res.data.groups).length === 0) return null;
        return res.data;
      } catch { return null; }
    },
    enabled: !!dateStr,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}