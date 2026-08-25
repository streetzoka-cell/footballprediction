import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { footballApi } from '../services/footballApi';
import { normalizeMatch, applySmartMinute } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

const cleanName = (s) => String(s || '').toLowerCase().replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '').replace(/[^a-z0-9]/g, '').trim();
const FRESH_WINDOW = 3 * 60 * 1000;

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return now;
}

export function useHomeMatches() {
  return useQuery({
    queryKey: ['homeMatches'],
    queryFn: () => footballApi.getHomeData(),
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useFixtures(dateStr, sport = 'football') {
  const now = useNow(1000);
  const q = useQuery({
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
        for (const [, existing] of map.entries()) {
          const eh = cleanName(existing.homeTeamName || existing.homeTeam?.name);
          const ea = cleanName(existing.awayTeamName || existing.awayTeam?.name);
          if (homeKey && awayKey && eh === homeKey && ea === awayKey) return existing;
        }
        return null;
      };
      fixtures.forEach(m => map.set(String(m.id), m));
      finished.forEach(m => {
        const existing = findExisting(m);
        if (existing) map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        else map.set(String(m.id), m);
      });
      live.forEach(m => {
        const existing = findExisting(m);
        if (existing && existing.dateStr === m.dateStr) map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        else if (m.dateStr === dateStr) map.set(String(m.id), m);
      });
      return Array.from(map.values());
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => [todayStr(), yesterdayStr(), tomorrowStr()].includes(query.queryKey[1]) ? 30000 : false,
  });

  const isDataFresh = !q.isError && !!q.dataUpdatedAt && (now - q.dataUpdatedAt) < FRESH_WINDOW;
  const normalizedData = useMemo(() => {
    if (!q.data) return [];
    const HIDE_OLD = 24 * 60 * 60 * 1000;
    return q.data
      .map(m => normalizeMatch(m, true, now, isDataFresh))
      .filter(Boolean)
      .map(m => applySmartMinute(m, now))
      .filter(m => {
        if (m.isHidden) return false;
        if (m.timestamp && isDataFresh) {
          const elapsed = now - (m.timestamp * 1000);
          if (elapsed > HIDE_OLD && !m.isFinished) return false;
        }
        return true;
      });
  }, [q.data, now, isDataFresh]);

  return { ...q, data: normalizedData, isLiveDataStale: !isDataFresh };
}

export function useLiveMatches(sport = 'football') {
  const now = useNow(1000);
  const q = useQuery({
    queryKey: ['liveMatches', sport],
    queryFn: async () => (await footballApi.getLive(sport))?.data || [],
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
    staleTime: 15 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
  const isDataFresh = !q.isError && !!q.dataUpdatedAt && (now - q.dataUpdatedAt) < FRESH_WINDOW;
  const normalizedData = useMemo(() => (q.data || [])
    .map(m => normalizeMatch(m, true, now, isDataFresh))
    .filter(Boolean)
    .map(m => applySmartMinute(m, now))
    .filter(m => m.isLive && !m.isFinished && !m.isHidden), [q.data, now, isDataFresh]);
  return { ...q, data: normalizedData, isLiveDataStale: !isDataFresh };
}

export function useFinishedMatches(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['results', dateStr, sport],
    queryFn: async () => ((await footballApi.getFinished(sport, dateStr))?.data || []).map(m => normalizeMatch(m, true, Date.now(), true)).filter(Boolean),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

export function useStandings(leagueId) {
  return useQuery({
    queryKey: ['standings', leagueId],
    queryFn: async () => { if (!leagueId) return null; return (await footballApi.getStandings(leagueId))?.data || null; },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (c, e) => e?.message?.includes('404') ? false : c < 1,
  });
}

export function useTeams(leagueId) {
  return useQuery({
    queryKey: ['teams', leagueId],
    queryFn: async () => { if (!leagueId) return []; return (await footballApi.getTeams(leagueId))?.data || []; },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (c, e) => e?.message?.includes('404') ? false : c < 1,
  });
}

export function useFixturesWithPredictions(dateStr, sport = 'football') {
  const fixturesQuery = useFixtures(dateStr, sport);
  const predictionsQuery = useQuery({
    queryKey: ['mlPredictions', dateStr],
    queryFn: async () => {
      try {
        const res = await footballApi.getDailyPredictions(dateStr);
        const map = {};
        (res?.data || []).forEach(p => { map[String(p.matchId)] = p.markets; });
        return map;
      } catch { return {}; }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });
  const mergedData = useMemo(() => {
    if (!fixturesQuery.data) return [];
    const preds = predictionsQuery.data || {};
    return fixturesQuery.data.map(m => ({ ...m, mlPredictions: preds[String(m.id)] || null }));
  }, [fixturesQuery.data, predictionsQuery.data]);
  return { ...fixturesQuery, data: mergedData, isPredictionsLoading: predictionsQuery.isLoading };
}
