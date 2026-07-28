// src/hooks/useFixtures.js
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
      const res = await footballApi.getHomeData();
      return res; // Backend returns { live: [], featured: [], upcoming: [] }
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
      // ★ FIX: Backend returns { data: [...], date: "...", count: ... }
      return res?.data || [];
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      // Poll faster for today/tomorrow/yesterday as matches can go live
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) {
        return 60000; // 60 seconds
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
      return res?.data || [];
    },
    refetchInterval: 30000, // 30 seconds (Backend handles the Goal API polling, this just reads our cache)
    staleTime: 15 * 1000, 
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}

/**
 * Fetches finished results for a specific date.
 */
export function useFinishedMatches(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['results', dateStr, sport],
    queryFn: async () => {
      const res = await footballApi.getFinished(sport, dateStr);
      return res?.data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}

/**
 * Fetches Standings for a specific league ID.
 */
export function useStandings(leagueId) {
  return useQuery({
    queryKey: ['standings', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const res = await footballApi.getStandings(leagueId);
      return res?.data || null;
    },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

/**
 * Fetches Top Scorers for a specific league ID.
 */
export function useTopScorers(leagueId) {
  return useQuery({
    queryKey: ['topScorers', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const res = await footballApi.getTopScorers(leagueId);
      return res?.data || null;
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

/**
 * Fetches competition list.
 * (If you still use this, though V2 relies on the new leagues config)
 */
export function useCompetitions() {
  return useQuery({
    queryKey: ['competitions'],
    queryFn: async () => {
      // Fallback to fetching all teams/leagues if needed, or remove if unused
      return [];
    },
    staleTime: 24 * 60 * 60 * 1000, 
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

/**
 * ★ NEW: Fetches Teams for a specific league ID.
 */
export function useTeams(leagueId) {
  return useQuery({
    queryKey: ['teams', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const res = await footballApi.getTeams(leagueId);
      return res?.data || [];
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}