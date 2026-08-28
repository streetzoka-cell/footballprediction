// src/hooks/useFixtures.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { footballApi } from '../services/footballApi';
import { normalizeMatch, applySmartMinute } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

/* Fast: word-boundary-safe name key (old regex ate 'sc' inside words), computed ONCE per team */
function nameKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(fc|afc|cf|sc|club|team|reserves|ii)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function pairKey(m) {
  const home = nameKey(m.homeTeamName || m.homeTeam?.name);
  const away = nameKey(m.awayTeamName || m.awayTeam?.name);
  return home && away ? `${home}|${away}` : null;
}

/* Merge helper: id-first, then name-pair fallback via a precomputed index — O(n) not O(n²) */
function mergeSnapshots({ fixtures = [], live = [], finished = [], dateStr }) {
  const map = new Map();
  const pairIndex = new Map(); // pairKey -> canonical id

  const put = (m, override = false) => {
    if (!m) return;
    const id = String(m.id);
    const pk = pairKey(m);
    const existingId = map.has(id) ? id : pairIndex.get(pk);

    if (existingId && existingId !== id) {
      const existing = map.get(existingId);
      map.set(existingId, override ? { ...existing, ...m, id: existingId } : { ...m, ...existing, id: existingId });
      return;
    }

    if (map.has(id)) {
      map.set(id, override ? { ...map.get(id), ...m, id } : { ...m, ...map.get(id), id });
    } else {
      map.set(id, m);
      if (pk) pairIndex.set(pk, id);
    }
  };

  fixtures.forEach((m) => put(m, false));
  finished.forEach((m) => put(m, true)); // finished/live override fixtures (fresher status/score)
  live.forEach((m) => put(m, true));

  return Array.from(map.values());
}

const FRESH_WINDOW = 3 * 60 * 1000;

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useHomeMatches() {
  return useQuery({
    queryKey: ['homeMatches'],
    queryFn: () => footballApi.getHomeData(),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

/* ★ TOP 12 surface — the homepage section that must never be hidden */
export function useTopMatches(days = 1, date) {
  return useQuery({
    queryKey: ['topMatches', days, date],
    queryFn: () => footballApi.getTopMatches(days, date),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: 1,
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
        footballApi.getFinished(sport, dateStr),
      ]);
      return mergeSnapshots({
        fixtures: fixRes?.data || [],
        live: liveRes?.data || [],
        finished: finRes?.data || [],
        dateStr,
      });
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      [todayStr(), yesterdayStr(), tomorrowStr()].includes(query.queryKey[1]) ? 30000 : false,
  });

  const isDataFresh = !q.isError && !!q.dataUpdatedAt && now - q.dataUpdatedAt < FRESH_WINDOW;

  const normalizedData = useMemo(() => {
    if (!q.data) return [];
    const HIDE_OLD = 24 * 60 * 60 * 1000;
    return q.data
      .map((m) => normalizeMatch(m, true, now, isDataFresh))
      .filter(Boolean)
      .map((m) => applySmartMinute(m, now))
      .filter((m) => {
        if (m.isHidden) return false;
        if (m.timestamp && isDataFresh) {
          const elapsed = now - m.timestamp * 1000;
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
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: true,
    staleTime: 15 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const isDataFresh = !q.isError && !!q.dataUpdatedAt && now - q.dataUpdatedAt < FRESH_WINDOW;

  const normalizedData = useMemo(
    () =>
      (q.data || [])
        .map((m) => normalizeMatch(m, true, now, isDataFresh))
        .filter(Boolean)
        .map((m) => applySmartMinute(m, now))
        .filter((m) => m.isLive && !m.isFinished && !m.isHidden),
    [q.data, now, isDataFresh]
  );

  return { ...q, data: normalizedData, isLiveDataStale: !isDataFresh };
}

export function useFinishedMatches(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['results', dateStr, sport],
    queryFn: async () =>
      ((await footballApi.getFinished(sport, dateStr))?.data || [])
        .map((m) => normalizeMatch(m, true, Date.now(), true))
        .filter(Boolean),
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}

/* ★ Shape fixed: backend returns { data: { leagueId, leagueName, rows: [...] } } */
export function useStandings(leagueId) {
  return useQuery({
    queryKey: ['standings', leagueId],
    queryFn: async () => {
      if (!leagueId) return null;
      try {
        return (await footballApi.getStandings(leagueId))?.data || null;
      } catch (e) {
        if (e.notFound) return null; // league simply has no standings — don't retry
        throw e;
      }
    },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (failureCount, error) => (error?.notFound ? false : failureCount < 1),
  });
}

export function useTeams(leagueId) {
  return useQuery({
    queryKey: ['teams', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      try {
        return (await footballApi.getTeams(leagueId))?.data || [];
      } catch (e) {
        if (e.notFound) return [];
        throw e;
      }
    },
    enabled: !!leagueId,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: (failureCount, error) => (error?.notFound ? false : failureCount < 1),
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
        (res?.data || []).forEach((p) => { map[String(p.matchId)] = p.markets; });
        return map;
      } catch {
        return {};
      }
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const mergedData = useMemo(() => {
    if (!fixturesQuery.data) return [];
    const preds = predictionsQuery.data || {};
    return fixturesQuery.data.map((m) => ({ ...m, mlPredictions: preds[String(m.id)] || null }));
  }, [fixturesQuery.data, predictionsQuery.data]);

  return { ...fixturesQuery, data: mergedData, isPredictionsLoading: predictionsQuery.isLoading };
}