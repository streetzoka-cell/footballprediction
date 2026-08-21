// frontend/src/hooks/useFixtures.js
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo, useState, useEffect } from 'react';
import { footballApi } from '../services/footballApi';
import { normalizeMatch, applySmartMinute } from '../engine/matchEngine';
import { todayStr, yesterdayStr, tomorrowStr } from '../utils/dates';

const cleanName = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase()
    .replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

// ★ How long after a successful fetch we still trust the data as "fresh"
// enough to let the clock-based FT fallback in matchEngine act on it.
// Wider than the refetch interval so a single missed poll doesn't count
// as an outage, but tight enough that a real network drop is caught fast.
const DATA_FRESHNESS_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

// 1-second local ticker hook to update match minutes without API polling
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
  // Tick the clock every second locally
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

      // Merge raw data only. Do NOT normalize here, so we can normalize every second locally.
      fixtures.forEach(m => map.set(String(m.id), m));

      finished.forEach(m => {
        const existing = findExisting(m);
        if (existing) {
          map.set(String(existing.id), { ...existing, ...m, id: existing.id });
        } else {
          map.set(String(m.id), m);
        }
      });

      // ★ FIX: live.json is the real-time source of truth. If a match shows
      // up in THIS fetch cycle's live response, the provider is telling us
      // it's in progress right now — full stop. Previously, a match that had
      // been (incorrectly, or prematurely) tagged isFinished by the results
      // endpoint would permanently block any further live updates, because
      // of an `if (existing.display?.isFinished && !m.display?.isFinished)
      // return;` guard here. That let a single bad/early "finished" entry
      // freeze a match's score and status for the rest of the session, even
      // while live.json kept reporting it as active (2H, correct score,
      // ticking minute). A live entry always overrides a "finished" tag from
      // the results feed now — the results endpoint is authoritative only
      // for matches that have actually dropped out of live.json.
      live.forEach(m => {
        const existing = findExisting(m);
        if (existing && existing.dateStr === m.dateStr) {
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

  // ★ Freshness is about the FETCH, not any single match's fields — the raw
  // API payload doesn't reliably carry a per-match "last updated" time, so
  // we derive it from react-query's own bookkeeping: when did we last get
  // a successful response, and are we currently in an error state.
  const isDataFresh =
    !query.isError &&
    !!query.dataUpdatedAt &&
    (now - query.dataUpdatedAt) < DATA_FRESHNESS_WINDOW_MS;

  // Normalize + tick data locally every second based on `now`
  const normalizedData = useMemo(() => {
    if (!query.data) return [];
    const HIDE_OLD_MS = 24 * 60 * 60 * 1000;

    return query.data
      .map(m => normalizeMatch(m, true, now, isDataFresh))
      .filter(Boolean)
      .map(m => applySmartMinute(m, now)) // ★ ticks the minute every second, with kickoff-based fallback
      .filter(m => {
        if (m.isHidden) return false;
        // ★ Only apply the "too old, hide it" cutoff when data is fresh —
        // during an outage we don't want matches vanishing from the list
        // just because the clock ran past a threshold while we were blind.
        if (m.timestamp && isDataFresh) {
          const elapsed = now - (m.timestamp * 1000);
          if (elapsed > HIDE_OLD_MS && !m.isFinished) return false;
        }
        return true;
      });
  }, [query.data, now, isDataFresh]);

  return {
    ...query,
    data: normalizedData,
    isLiveDataStale: !isDataFresh,
  };
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

  const isDataFresh =
    !query.isError &&
    !!query.dataUpdatedAt &&
    (now - query.dataUpdatedAt) < DATA_FRESHNESS_WINDOW_MS;

  const normalizedData = useMemo(() => {
    return (query.data || [])
      .map((m) => normalizeMatch(m, true, now, isDataFresh))
      .filter(Boolean)
      .map((m) => applySmartMinute(m, now)) // ★ ticks the minute every second, with kickoff-based fallback
      .filter((m) => m.isLive && !m.isFinished && !m.isHidden);
  }, [query.data, now, isDataFresh]);

  return {
    ...query,
    data: normalizedData,
    isLiveDataStale: !isDataFresh,
  };
}

export function useFinishedMatches(dateStr, sport = 'football') {
  return useQuery({
    queryKey: ['results', dateStr, sport],
    queryFn: async () => {
      const res = await footballApi.getFinished(sport, dateStr);
      // Data straight from the results endpoint is authoritative and not
      // subject to the live clock-drift problem, so it's always "fresh".
      return (res?.data || []).map(m => normalizeMatch(m, true, Date.now(), true)).filter(Boolean);
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
// Hook that merges Fixtures with ML Predictions
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