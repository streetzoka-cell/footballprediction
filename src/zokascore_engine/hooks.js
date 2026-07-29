// src/zokascore_engine/hooks.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { zokaApi } from './apiClient';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates'; // Reuse existing date utils

// Hook for Live Matches (Refreshes every 30s, 15s stale time)
export function useEngineLive() {
  return useQuery({
    queryKey: ['zoka:live'],
    queryFn: async () => (await zokaApi.getLive())?.data || [],
    refetchInterval: 30000, 
    staleTime: 15000,
    placeholderData: keepPreviousData,
  });
}

// Hook for Fixtures by Date (15 min cache)
export function useEngineFixtures(dateStr) {
  return useQuery({
    queryKey: ['zoka:fixtures', dateStr],
    queryFn: async () => (await zokaApi.getFixturesByDate(dateStr))?.data || [],
    staleTime: 15 * 60 * 1000, // 15 minutes
    placeholderData: keepPreviousData,
  });
}

// Hook for Results by Date (1 hour cache)
export function useEngineResults(dateStr) {
  return useQuery({
    queryKey: ['zoka:results', dateStr],
    queryFn: async () => (await zokaApi.getResultsByDate(dateStr))?.data || [],
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}

// Hook for Standings (1 hour cache)
export function useEngineStandings(leagueId) {
  return useQuery({
    queryKey: ['zoka:standings', leagueId],
    queryFn: async () => {
      const res = await zokaApi.getStandings();
      return (res?.data || []).find(l => String(l.id) === String(leagueId)) || null;
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
  });
}

// Hook for Team Details (7 day cache)
export function useEngineTeam(teamId) {
  return useQuery({
    queryKey: ['zoka:team', teamId],
    queryFn: async () => (await zokaApi.getTeam(teamId))?.data || null,
    enabled: !!teamId,
    staleTime: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Master Hook: Merges Yesterday, Today, Tomorrow, and Live into one clean array
export function useEngineGlobalMatches() {
  const { data: liveData } = useEngineLive();
  const { data: todayData } = useEngineFixtures(todayStr());
  const { data: yesterdayData } = useEngineFixtures(yesterdayStr());
  const { data: tomorrowData } = useEngineFixtures(tomorrowStr());

  return useQuery({
    queryKey: ['zoka:global', liveData, todayData, yesterdayData, tomorrowData],
    queryFn: () => {
      const map = new Map();
      const addOrUpdate = (m) => {
        if (m && m.id) map.set(String(m.id), m);
      };
      
      yesterdayData?.forEach(addOrUpdate);
      todayData?.forEach(addOrUpdate);
      tomorrowData?.forEach(addOrUpdate);
      
      // Live data overwrites everything else
      liveData?.forEach(addOrUpdate); 
      
      return Array.from(map.values());
    },
    enabled: !!liveData || !!todayData || !!yesterdayData || !!tomorrowData,
    staleTime: 15000,
  });
}