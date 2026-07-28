import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

/**
 * ★ NEW: Fetches categorized home page data (Live, Featured, Upcoming).
 */
export function useHomeMatches() {
  return useQuery({
    queryKey: ['homeMatches'],
    queryFn: async () => {
      return await footballApi.getHomeData();
    },
    refetchInterval: 60000, 
    staleTime: 30 * 1000, 
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1, 
  });
}

/**
 * Fetches fixtures for a specific date with automatic caching and background refresh.
 */
export function useFixtures(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['fixtures', dateStr, sport],
    queryFn: async () => {
      const res = await footballApi.getFixtures(dateStr, sport);
      // ★ FIX: Safely extract array whether it's nested in `data` or returned directly
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) {
        return 45000; 
      }
      return false; 
    }
  });
}

/**
 * Fetches live matches with high-frequency polling.
 */
export function useLiveMatches(sport = 'football') {
  return useQuery({
    queryKey: ['liveMatches', sport],
    queryFn: async () => {
      const res = await footballApi.getLive(sport);
      return Array.isArray(res) ? res : (res.data || []);
    },
    refetchInterval: 45000, 
    staleTime: 30 * 1000, 
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}

/**
 * Fetches competition list.
 */
export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      const res = await footballApi.getCompetitions();
      return Array.isArray(res) ? res : (res.data || []);
    },
    staleTime: 24 * 60 * 60 * 1000, 
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

/**
 * ★ NEW: Fetches Standings for a specific league code.
 */
export function useStandings(code) {
  return useQuery({
    queryKey: ['standings', code],
    queryFn: async () => {
      if (!code) return null;
      const res = await footballApi.getStandings(code);
      // API returns { data: [...], lastUpdated: ... }
      return res.data || []; 
    },
    enabled: !!code,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours offline cache
    retry: 1,
  });
}

/**
 * ★ NEW: Fetches Teams for a specific league code.
 */
export function useTeams(code) {
  return useQuery({
    queryKey: ['teams', code],
    queryFn: async () => {
      if (!code) return [];
      const res = await footballApi.getTeams(code);
      // API returns { data: [...], lastUpdated: ... }
      return res.data || [];
    },
    enabled: !!code,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours offline cache
    retry: 1,
  });
}