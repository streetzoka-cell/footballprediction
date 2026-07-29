// src/hooks/useAdmin.js
import { useQuery } from '@tanstack/react-query';
import { db } from '../utils/firebase';
import { collection, getDocs, query, where, orderBy, limit as limitQ } from 'firebase/firestore';
import { useObservabilityStore } from '../store/useObservabilityStore';

const BACKEND_URL = "https://api.zokascore.xyz";

export function useSystemObservability() {
  const { apiMetrics, errorLogs, cacheHits, cacheMisses } = useObservabilityStore();
  const totalApiCalls = Object.values(apiMetrics).reduce((acc, m) => acc + m.count, 0);
  const totalApiFailures = Object.values(apiMetrics).reduce((acc, m) => acc + m.failures, 0);
  const totalCacheCalls = cacheHits + cacheMisses;
  return {
    apiMetrics, errorLogs,
    cacheHitRatio: totalCacheCalls > 0 ? Math.round((cacheHits / totalCacheCalls) * 100) : 0,
    apiSuccessRate: totalApiCalls > 0 ? Math.round(((totalApiCalls - totalApiFailures) / totalApiCalls) * 100) : 100,
    clearLogs: useObservabilityStore((state) => state.clearLogs),
  };
}

export function useAdminUsers(searchTerm) {
  return useQuery({
    queryKey: ['adminUsers', searchTerm],
    queryFn: async () => {
      if (!db) return [];
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limitQ(50));
      const snap = await getDocs(q);
      let users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        users = users.filter(u => 
          (u.displayName || '').toLowerCase().includes(s) || 
          (u.email || '').toLowerCase().includes(s) ||
          (u.id || '').toLowerCase().includes(s)
        );
      }
      return users;
    },
    staleTime: 60 * 1000,
  });
}

export function useAdminStaff() {
  return useQuery({
    queryKey: ['adminStaff'],
    queryFn: async () => {
      if (!db) return [];
      const q = query(collection(db, 'users'), where('role', 'in', ['admin', 'staff']));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.role === 'admin' ? 0 : 1) - (b.role === 'admin' ? 0 : 1));
    },
    staleTime: 60 * 1000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['systemHealth'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/api/v1/health`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    refetchInterval: 15000,
    retry: 1,
  });
}

export function useBackendLogs() {
  return useQuery({
    queryKey: ['backendLogs'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/api/v1/monitoring`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });
}

export function useAdminAnalytics() {
  return useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      if (!db) return { totalUsers: 0, totalPredictions: 0 };
      const userSnap = await getDocs(collection(db, 'users'));
      const predSnap = await getDocs(collection(db, 'predictions_history'));
      return { totalUsers: userSnap.size, totalPredictions: predSnap.size };
    },
    staleTime: 5 * 60 * 1000,
  });
}