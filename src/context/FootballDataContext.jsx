// src/context/FootballDataContext.jsx
import { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
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

  // ─── Fixtures: fetch for a specific date and merge ───
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

  // ─── Initial load: today +/- 7 days ───
    const fetchInitialFixtures = useCallback(async () => {
    const dates = [];
    for (let i = -14; i <= 14; i++) dates.push(getLocalDateStr(i)); // Changed to -14 / +14
  
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

  // ─── Refresh today's fixtures ───
  const refreshTodayFixtures = useCallback(async () => {
    const todayStr = getLocalDateStr(0);
    ffs.clearEntry('fx_' + todayStr);
    loadedDatesRef.current.delete(todayStr);
    await fetchFixturesForDate(todayStr, { force: true });
  }, [fetchFixturesForDate]);

  // ─── Load fixtures for a new date on demand ───
  const loadDateFixtures = useCallback(async (dateStr) => {
    if (loadedDatesRef.current.has(dateStr)) return;
    await fetchFixturesForDate(dateStr);
  }, [fetchFixturesForDate]);

  // ─── Live: onSnapshot (real-time, 1 doc) ───
  useEffect(() => {
    const unsubscribe = ffs.subscribeLive(
      (result) => {
        if (mountedRef.current) {
          setLiveMatches(result.data || []);
          if (result.lastUpdated) setLastUpdated(result.lastUpdated);
        }
      },
      (err) => {
        console.error("[FootballData] Live error:", err.message);
      }
    );
    return unsubscribe;
  }, []);

  // ─── Competitions ───
  const fetchCompetitions = useCallback(async () => {
    try {
      const res = await ffs.getCompetitions();
      if (mountedRef.current) setCompetitions(res.data || []);
    } catch (e) {
      console.error("[FootballData] Competitions error:", e.message);
    }
  }, []);

  // ─── Initial data load ───
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        await Promise.all([fetchInitialFixtures(), fetchCompetitions()]);
      } catch (e) {
        console.error("[FootballData] Init failed, but app will continue loading.", e.message);
        // We don't crash the app. We just log the error and move on.
      } finally {
        // ALWAYS stop loading, even if the football database failed.
        // This un-freezes your login page!
        if (!cancelled) setLoading(false); 
      }
    }
    init();
    return () => { cancelled = true; };
  }, [fetchInitialFixtures, fetchCompetitions]);

  // ─── Periodic refresh: fixtures every 5 min ───
  useEffect(() => {
    const timer = setInterval(refreshTodayFixtures, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [refreshTodayFixtures]);

  // ─── Standings (on demand, cached) ───
  const getStandings = useCallback(async (code) => {
    if (standings[code]) return standings[code];
    try {
      const res = await ffs.getStandings(code);
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

  // ─── Teams (on demand, cached) ───
  const getTeams = useCallback(async (code) => {
    if (teams[code]) return teams[code];
    try {
      const res = await ffs.getTeams(code);
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

  const fixturesByDate = useCallback(() => {
    const groups = {};
    for (const f of fixtures) {
      const localDate = getLocalDateFromUtc(f.utcDate);
      if (!localDate) continue;
      if (!groups[localDate]) groups[localDate] = [];
      groups[localDate].push(f);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fixtures]);

  const value = {
    fixtures,
    liveMatches,
    competitions,
    standings,
    teams,
    loading,
    lastUpdated,
    error,
    getStandings,
    getTeams,
    fixturesByDate,
    refreshFixtures: refreshTodayFixtures,
    refreshLive: () => {},
    loadDateFixtures,
  };

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