import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { footballApi } from "../services/footballApi";
import { getLocalDateFromUtc } from "../utils/dates";

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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchFixtures = useCallback(async () => {
    try {
      const res = await footballApi.getFixtures();
      if (mountedRef.current) {
        setFixtures(res.data || []);
        if (res.lastUpdated) setLastUpdated(res.lastUpdated);
        setError(null);
      }
    } catch (e) {
      console.error("[FootballData] Fixtures error:", e.message);
      if (mountedRef.current) setError(prev => prev || "fixtures");
    }
  }, []);

  const fetchLive = useCallback(async () => {
    try {
      const res = await footballApi.getLive();
      if (mountedRef.current) setLiveMatches(res.data || []);
    } catch (e) {
      console.error("[FootballData] Live error:", e.message);
    }
  }, []);

  const fetchCompetitions = useCallback(async () => {
    try {
      const res = await footballApi.getCompetitions();
      if (mountedRef.current) setCompetitions(res.data || []);
    } catch (e) {
      console.error("[FootballData] Competitions error:", e.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      await Promise.all([fetchFixtures(), fetchLive(), fetchCompetitions()]);
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [fetchFixtures, fetchLive, fetchCompetitions]);

  useEffect(() => {
    const timer = setInterval(fetchFixtures, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchFixtures]);

  useEffect(() => {
    const timer = setInterval(fetchLive, 30000);
    return () => clearInterval(timer);
  }, [fetchLive]);

  const getStandings = useCallback(async (code) => {
    if (standings[code]) return standings[code];
    try {
      const res = await footballApi.getStandings(code);
      if (res.data) {
        const data = { standings: res.data, competitionCode: code, fetchedAt: res.lastUpdated };
        if (mountedRef.current) setStandings(prev => Object.assign({}, prev, { [code]: data }));
        return data;
      }
    } catch (e) {
      console.error("[FootballData] Standings error for " + code + ":", e.message);
    }
    return null;
  }, [standings]);

  const getTeams = useCallback(async (code) => {
    if (teams[code]) return teams[code];
    try {
      const res = await footballApi.getTeams(code);
      if (res.data) {
        const data = { teams: res.data, competitionCode: code, fetchedAt: res.lastUpdated };
        if (mountedRef.current) setTeams(prev => Object.assign({}, prev, { [code]: data }));
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
    refreshFixtures: fetchFixtures,
    refreshLive: fetchLive,
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
