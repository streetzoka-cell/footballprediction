// src/hooks/useFixtures.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';
import { normalizeMatch } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

export function useHomeMatches() {
  return useQuery({
    queryKey: ['homeMatches'],
    queryFn: async () => {
      const res = await footballApi.getHomeData();
      return res; 
    },
    refetchInterval: 60000, 
    staleTime: 30000,
  });
}

export function useFixtures(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['fixtures', dateStr, sport],
    queryFn: async () => {
      const res = await footballApi.getFixtures(dateStr, sport);
      return (res?.data || []).map(m => normalizeMatch(m, true, Date.now())).filter(Boolean);
    },
    placeholderData: keepPreviousData,
    staleTime: 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) {
        return 60000; 
      }
      return false; 
    }
  });
}

export function useLiveMatches(sport = 'football') {
  return useQuery({
    queryKey: ['liveMatches', sport],
    queryFn: async () => {
      const res = await footballApi.getLive(sport);
      return (res?.data || []).map(m => normalizeMatch(m, true, Date.now())).filter(Boolean);
    },
    refetchInterval: 30000, 
    staleTime: 15 * 1000, 
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}

export function useFinishedMatches(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['results', dateStr, sport],
    queryFn: async () => {
      const res = await footballApi.getFinished(sport, dateStr);
      return (res?.data || []).map(m => normalizeMatch(m, true, Date.now())).filter(Boolean);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });
}

export function useStandings(leagueId) {
  return useQuery({
    queryKey: ['standings', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const res = await footballApi.getStandings(leagueId);
      return res?.data || null;
    },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

export function useTopScorers(leagueId) {
  return useQuery({
    queryKey: ['topScorers', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      const res = await footballApi.getTopScorers(leagueId);
      return res?.data || null;
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}

export function useTeams(leagueId) {
  return useQuery({
    queryKey: ['teams', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const res = await footballApi.getTeams(leagueId);
      return res?.data || [];
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24, 
    retry: 1,
  });
}