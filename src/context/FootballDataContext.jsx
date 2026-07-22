import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as ffs from "../services/footballFirestore";
import { getLocalDateFromUtc, getLocalDateStr } from "../utils/dates";

const FootballDataContext = createContext(null);

export function FootballDataProvider({ children }) {
  const [fixtures, setFixtures] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [standings, setStandings] = useState({});
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);
  const loadedDatesRef = useRef(new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchFixturesForDate = useCallback(async (dateStr, { force = false } = {}) => {
    if (!force && loadedDatesRef.current.has(dateStr)) return;
    try {
      const res = await ffs.getFixtures(dateStr, { force });
      if (mountedRef.current) {
        setFixtures(prev => {
          const without = prev.filter(m => getLocalDateFromUtc(m.utcDate) !== dateStr);
          return [...without, ...(res.data || [])];
        });
        if (res.lastUpdated) setLastUpdated(res.lastUpdated);
        loadedDatesRef.current.add(dateStr);
        setError(null);
      }
    } catch (e) {
      console.error("[FootballData] Fixtures error for " + dateStr + ":", e.message);
      if (mountedRef.current) setError(prev => prev || "fixtures");
    }
  }, []);

  const fetchInitialFixtures = useCallback(async () => {
    const dates = [];
    for (let i = -14; i <= 14; i++) dates.push(getLocalDateStr(i));
    try {
      const results = await ffs.getFixturesForDates(dates);
      if (mountedRef.current) {
        const allMatches = [];
        for (const d of dates) {
          const r = results[d];
          if (r?.data) {
            allMatches.push(...r.data);
            loadedDatesRef.current.add(d);
          }
        }
        setFixtures(allMatches);
        setError(null);
      }
    } catch (e) {
      console.error("[FootballData] Initial fixtures error:", e.message);
      if (mountedRef.current) setError("fixtures");
    }
  }, []);

  const refreshTodayFixtures = useCallback(async () => {
    const todayStr = getLocalDateStr(0);
    ffs.clearEntry('fx_' + todayStr);
    loadedDatesRef.current.delete(todayStr);
    await fetchFixturesForDate(todayStr, { force: true });
  }, [fetchFixturesForDate]);

  const loadDateFixtures = useCallback(async (dateStr) => {
    if (loadedDatesRef.current.has(dateStr)) return;
    await fetchFixturesForDate(dateStr);
  }, [fetchFixturesForDate]);

  useEffect(() => {
    const unsubscribe = ffs.subscribeLive(
      (result) => {
        if (mountedRef.current) {
          setLiveMatches(result.data || []);
          if (result.lastUpdated) setLastUpdated(result.lastUpdated);
        }
      },
      (err) => console.error("[FootballData] Live error:", err.message)
    );
    return unsubscribe;
  }, []);

  const fetchCompetitions = useCallback(async () => {
    try {
      const res = await ffs.getCompetitions();
      if (mountedRef.current) setCompetitions(res.data || []);
    } catch (e) {
      console.error("[FootballData] Competitions error:", e.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await Promise.all([fetchInitialFixtures(), fetchCompetitions()]);
      } catch (e) {
        console.error("[FootballData] Init failed:", e.message);
      } finally {
        if (!cancelled) setLoading(false); 
      }
    }
    init();
    return () => { cancelled = true; };
  }, [fetchInitialFixtures, fetchCompetitions]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) refreshTodayFixtures();
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshTodayFixtures]);

  const getStandings = useCallback(async (code, force = false) => {
    if (!force && standings[code]) return standings[code];
    try {
      const res = await ffs.getStandings(code, { force });
      if (res.data) {
        const data = { standings: res.data, competitionCode: code, fetchedAt: res.lastUpdated };
        if (mountedRef.current) setStandings(prev => ({ ...prev, [code]: data }));
        return data;
      }
    } catch (e) {
      console.error("[FootballData] Standings error for " + code + ":", e.message);
    }
    return null;
  }, [standings]);

  const getTeams = useCallback(async (code, force = false) => {
    if (!force && teams[code]) return teams[code];
    try {
      const res = await ffs.getTeams(code, { force });
      if (res.data) {
        const data = { teams: res.data, competitionCode: code, fetchedAt: res.lastUpdated };
        if (mountedRef.current) setTeams(prev => ({ ...prev, [code]: data }));
        return data;
      }
    } catch (e) {
      console.error("[FootballData] Teams error for " + code + ":", e.message);
    }
    return null;
  }, [teams]);

  const fixturesByDate = useMemo(() => {
    const groups = {};
    for (const f of fixtures) {
      const localDate = getLocalDateFromUtc(f.utcDate);
      if (!localDate) continue;
      if (!groups[localDate]) groups[localDate] = [];
      groups[localDate].push(f);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fixtures]);

  const value = useMemo(() => ({
    fixtures, liveMatches, competitions, standings, teams, loading, lastUpdated, error,
    getStandings, getTeams, fixturesByDate, refreshFixtures: refreshTodayFixtures, refreshLive: () => {}, loadDateFixtures,
  }), [fixtures, liveMatches, competitions, standings, teams, loading, lastUpdated, error, getStandings, getTeams, fixturesByDate, refreshTodayFixtures, loadDateFixtures]);

  return (
    <FootballDataContext.Provider value={value}>
      {children}
    </FootballDataContext.Provider>
  );
}

export function useFootballData() {
  const ctx = useContext(FootballDataContext);
  if (!ctx) throw new Error("useFootballData must be used within FootballDataProvider");
  return ctx;
}

export default FootballDataContext;