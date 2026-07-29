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
      const [fixRes, liveRes, finRes] = await Promise.all([
        footballApi.getFixtures(dateStr, sport),
        footballApi.getLive(sport),
        footballApi.getFinished(sport, dateStr)
      ]);
      
      const fixtures = fixRes?.data || [];
      const live = liveRes?.data || [];
      const finished = finRes?.data || [];
      
      const map = new Map();
      // 1. Base scheduled fixtures
      fixtures.forEach(m => map.set(String(m.id), m));
      // 2. Overwrite with finished matches (has final scores)
      finished.forEach(m => map.set(String(m.id), m));
      // 3. Overwrite with live matches (has live scores)
      live.forEach(m => {
        const existing = map.get(String(m.id));
        if (existing) map.set(String(m.id), { ...existing, ...m });
        else if (m.dateStr === dateStr) map.set(String(m.id), m);
      });
      
      return Array.from(map.values()).map(m => normalizeMatch(m, true, Date.now())).filter(Boolean);
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) {
        return 30000; // Poll every 30s for today/yesterday/tomorrow
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