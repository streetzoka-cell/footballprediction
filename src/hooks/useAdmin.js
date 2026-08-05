// src/hooks/useAdmin.js
import { useQuery } from '@tanstack/react-query';
import { useObservabilityStore } from '../store/useObservabilityStore';
import { adminFetchJSON } from '../services/adminApi';

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
      // In the future, you can add an endpoint like /api/v1/admin/users
      // For now, returning empty array to prevent Firestore SDK usage.
      return [];
    },
    staleTime: 60 * 1000,
  });
}

export function useAdminStaff() {
  return useQuery({
    queryKey: ['adminStaff'],
    queryFn: async () => {
      return [];
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
      const res = await adminFetchJSON('/api/v1/monitoring/logs');
      return res?.data || res;
    },
    refetchInterval: 10000,
    retry: 1,
  });
}

export function useAdminAnalytics() {
  return useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      // Read stats from the backend metrics endpoint
      const res = await adminFetchJSON('/api/v1/monitoring/metrics');
      const stats = res?.data?.recovery?.queue || {};
      
      return { 
        totalUsers: 0, // Can be populated from /metrics if you add it there
        totalPredictions: stats.syncedOps || 0 
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}