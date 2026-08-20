// frontend/src/hooks/useFixtures.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { footballApi } from '../services/footballApi';
import { normalizeMatch } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

const cleanName = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase()
    .replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

// ★ NEW: 1-second local ticker hook to update match minutes without API polling
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

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
  // ★ Tick the clock every second locally!
  const now = useNow(1000);

  const query = useQuery({
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

      const findExisting = (match) => {
        const byId = map.get(String(match.id));
        if (byId) return byId;

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

      // Merge raw data only. Do NOT normalize here, so we can normalize every second locally!
      fixtures.forEach(m => map.set(String(m.id), m));

      finished.forEach(m => {
        const existing = findExisting(m);
        if (existing) {
          map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        } else {
          map.set(String(m.id), m);
        }
      });

      live.forEach(m => {
        const existing = findExisting(m);
        if (existing && existing.dateStr === m.dateStr) {
          if (existing.display?.isFinished && !m.display?.isFinished) return;
          map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        } else if (m.dateStr === dateStr) {
          map.set(String(m.id), m);
        }
      });

      return Array.from(map.values());
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const date = query.queryKey[1];
      if ([todayStr(), yesterdayStr(), tomorrowStr()].includes(date)) return 30000;
      return false;
    }
  });

  // ★ Normalize data locally every second based on `now`
  const normalizedData = useMemo(() => {
    if (!query.data) return [];
    const HIDE_OLD_MS = 24 * 60 * 60 * 1000;

    return query.data
      .map(m => normalizeMatch(m, true, now))
      .filter(Boolean)
      .filter(m => {
        if (m.isHidden) return false;
        if (m.timestamp) {
          const elapsed = now - (m.timestamp * 1000);
          if (elapsed > HIDE_OLD_MS && !m.isFinished) return false;
        }
        return true;
      });
  }, [query.data, now]);

  return { ...query, data: normalizedData };
}

export function useLiveMatches(sport = 'football') {
  const now = useNow(1000);

  const query = useQuery({
    queryKey: ['liveMatches', sport],
    queryFn: async () => {
      const res = await footballApi.getLive(sport);
      return res?.data || [];
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 15 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const normalizedData = useMemo(() => {
    return (query.data || [])
      .map((m) => normalizeMatch(m, true, now))
      .filter(Boolean)
      .filter((m) => m.isLive && !m.isFinished && !m.isHidden);
  }, [query.data, now]);

  return { ...query, data: normalizedData };
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
    retry: (failureCount, error) => {
      if (error?.message?.includes('Not Found') || error?.message?.includes('404')) return false;
      return failureCount < 1;
    },
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
    retry: (failureCount, error) => {
      if (error?.message?.includes('Not Found') || error?.message?.includes('404')) return false;
      return failureCount < 1;
    },
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
    retry: (failureCount, error) => {
      if (error?.message?.includes('Not Found') || error?.message?.includes('404')) return false;
      return failureCount < 1;
    },
  });
}

// ============================================================
// ★ NEW: Hook that merges Fixtures with ML Predictions
// ============================================================
export function useFixturesWithPredictions(dateStr, sport = 'football') {
  const fixturesQuery = useFixtures(dateStr, sport);

  const predictionsQuery = useQuery({
    queryKey: ['mlPredictions', dateStr],
    queryFn: async () => {
      try {
        const res = await footballApi.getDailyPredictions(dateStr);
        const predMap = {};
        (res?.data || []).forEach(p => {
          predMap[String(p.matchId)] = p.markets;
        });
        return predMap;
      } catch (err) {
        return {};
      }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
  });

  const mergedData = useMemo(() => {
    if (!fixturesQuery.data) return [];
    const preds = predictionsQuery.data || {};
    
    return fixturesQuery.data.map(match => ({
      ...match,
      mlPredictions: preds[String(match.id)] || null
    }));
  }, [fixturesQuery.data, predictionsQuery.data]);

  return {
    ...fixturesQuery,
    data: mergedData,
    isPredictionsLoading: predictionsQuery.isLoading
  };
}