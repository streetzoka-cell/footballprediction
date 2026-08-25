import { useQuery } from '@tanstack/react-query';
import { useObservabilityStore } from '../store/useObservabilityStore';
import { adminFetchJSON } from '../services/adminApi';

const BACKEND_URL = "https://api.zokascore.xyz";

export function useSystemObservability() {
  const { apiMetrics, errorLogs, cacheHits, cacheMisses, clearLogs } = useObservabilityStore();
  const totalApiCalls = Object.values(apiMetrics).reduce((acc, m) => acc + m.count, 0);
  const totalApiFailures = Object.values(apiMetrics).reduce((acc, m) => acc + m.failures, 0);
  const totalCache = cacheHits + cacheMisses;
  return {
    apiMetrics, errorLogs,
    cacheHitRatio: totalCache ? Math.round((cacheHits / totalCache) * 100) : 0,
    apiSuccessRate: totalApiCalls ? Math.round(((totalApiCalls - totalApiFailures) / totalApiCalls) * 100) : 100,
    clearLogs,
  };
}

export function useAdminUsers(searchTerm) {
  return useQuery({
    queryKey: ['adminUsers', searchTerm],
    queryFn: async () => [], // TODO: backend /api/v1/admin/users
    staleTime: 60 * 1000,
    enabled: !!searchTerm,
  });
}

export function useAdminStaff() {
  return useQuery({
    queryKey: ['adminStaff'],
    queryFn: async () => [], // TODO: backend /api/v1/admin/staff
    staleTime: 60 * 1000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ['systemHealth'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/api/v1/health`);
      if (!res.ok) throw new Error('Health check failed');
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
      return res?.data || res || [];
    },
    refetchInterval: 10000,
    retry: 1,
  });
}

export function useAdminAnalytics() {
  return useQuery({
    queryKey: ['adminAnalytics'],
    queryFn: async () => {
      const res = await adminFetchJSON('/api/v1/monitoring/metrics');
      const stats = res?.data?.recovery?.queue || {};
      return { totalUsers: 0, totalPredictions: stats.syncedOps || 0 };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
