// src/hooks/useFixtures.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { footballApi } from '../services/footballApi';
import { normalizeMatch } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

// ★ Helper to clean team names for cross-provider deduplication
const cleanName = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase()
    .replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

export function useHomeMatches() {
  return useQuery({
    queryKey: ['homeMatches'],
    queryFn: async () => {
      const res = await footballApi.getHomeData();
      return res; 
    },
    refetchInterval: 60000, 
    staleTime: 30000,
    refetchOnWindowFocus: true,
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
      
      // Helper to find if a match already exists in the map by ID OR by cleaned team names
      const findExisting = (match) => {
        // 1. Try exact ID match first
        const byId = map.get(String(match.id));
        if (byId) return byId;

        // 2. Try team name match (strips FC, SC, etc.)
        const homeKey = cleanName(match.homeTeamName || match.homeTeam?.name);
        const awayKey = cleanName(match.awayTeamName || match.awayTeam?.name);
        
        for (let [id, existing] of map.entries()) {
          const existHome = cleanName(existing.homeTeamName || existing.homeTeam?.name);
          const existAway = cleanName(existing.awayTeamName || existing.awayTeam?.name);
          if (homeKey && awayKey && existHome === homeKey && existAway === awayKey) {
            return existing;
          }
        }
        return null;
      };

      // 1. Add all scheduled fixtures
      fixtures.forEach(m => map.set(String(m.id), m));
      
      // 2. Merge finished matches
      finished.forEach(m => {
        const existing = findExisting(m);
        if (existing) {
          // Overwrite with finished data, but keep the original ID to maintain React keys
          map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        } else {
          map.set(String(m.id), m);
        }
      });
      
      // 3. Merge live matches
      live.forEach(m => {
        const existing = findExisting(m);
        
        // Don't overwrite a finished match with a live one (safety check)
        if (existing && existing.display?.isFinished && !m.display?.isFinished) {
          return;
        }
        
        if (existing) {
          // Merge live data into the existing fixture, keeping original ID
          map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        } else if (m.dateStr === dateStr) {
          map.set(String(m.id), m);
        }
      });
      
      return Array.from(map.values()).map(m => normalizeMatch(m, true, Date.now())).filter(Boolean);
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) {
        return 30000; // Poll every 30s
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
    refetchIntervalInBackground: true, 
    staleTime: 15 * 1000, 
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchOnWindowFocus: true,
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
    refetchOnWindowFocus: true,
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