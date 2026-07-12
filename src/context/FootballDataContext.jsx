import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { collection, getDocs, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { footballDb } from '../config/footballFirebase';

const FootballDataContext = createContext(null);

function getDateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

export function FootballDataProvider({ children }) {
  const [fixtures, setFixtures] = useState([]);
  const [liveMatches, setLiveMatches] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [standings, setStandings] = useState({});
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Check connection
  useEffect(() => {
    if (!footballDb) {
      console.error('[FootballData] footballDb is NULL — check VITE_FOOTBALL_FB_* env vars in your .env file');
      setLoading(false);
      return;
    }
    console.log('[FootballData] Connected to 2nd Firebase project');
    setDbReady(true);
  }, []);

  // Fetch fixtures for 14-day range (polling every 60s)
  useEffect(() => {
    if (!dbReady) return;

    const dateFrom = getDateStr(-7);
    const dateTo = getDateStr(7);
    let timer = null;

    async function fetchFixtures() {
      try {
        const q = query(
          collection(footballDb, 'fixtures'),
          where('date', '>=', dateFrom),
          where('date', '<=', dateTo)
        );
        const snap = await getDocs(q);
        if (mountedRef.current) {
          const data = snap.docs.map(d => d.data());
          setFixtures(data);
          console.log('[FootballData] Fixtures loaded:', data.length, 'matches');
        }
      } catch (e) {
        console.error('[FootballData] Fixtures fetch error:', e.message);
      }
    }

    fetchFixtures().then(() => {
      if (mountedRef.current) setLoading(false);
    });
    timer = setInterval(fetchFixtures, 60000);

    return () => { clearInterval(timer); };
  }, [dbReady]);

  // Real-time listener for live matches
  useEffect(() => {
    if (!dbReady) return;

    const unsub = onSnapshot(
      collection(footballDb, 'liveMatches'),
      (snap) => {
        if (mountedRef.current) {
          const data = snap.docs.map(d => d.data());
          setLiveMatches(data);
          if (data.length > 0) console.log('[FootballData] Live matches:', data.length);
        }
      },
      (e) => console.error('[FootballData] Live snapshot error:', e.message)
    );

    return () => unsub();
  }, [dbReady]);

  // Fetch competitions
  useEffect(() => {
    if (!dbReady) return;
    getDocs(collection(footballDb, 'competitions'))
      .then(snap => {
        if (mountedRef.current) {
          const data = snap.docs.map(d => d.data());
          setCompetitions(data);
          console.log('[FootballData] Competitions loaded:', data.length);
        }
      })
      .catch(e => console.error('[FootballData] Competitions error:', e.message));
  }, [dbReady]);

  // Fetch lastUpdated
  useEffect(() => {
    if (!dbReady) return;
    getDoc(doc(footballDb, 'lastUpdated', 'fixturesRange'))
      .then(snap => {
        if (snap.exists() && mountedRef.current) {
          setLastUpdated(snap.data().timestamp);
        }
      })
      .catch(() => {});
  }, [dbReady]);

  // Lazy fetch standings
  const getStandings = useCallback(async (code) => {
    if (!footballDb) return null;
    if (standings[code]) return standings[code];
    try {
      const snap = await getDoc(doc(footballDb, 'standings', code));
      if (snap.exists()) {
        const data = snap.data();
        setStandings(prev => ({ ...prev, [code]: data }));
        return data;
      }
    } catch (e) {
      console.error('[FootballData] Standings error:', e.message);
    }
    return null;
  }, [standings]);

  // Lazy fetch teams
  const getTeams = useCallback(async (code) => {
    if (!footballDb) return null;
    if (teams[code]) return teams[code];
    try {
      const snap = await getDoc(doc(footballDb, 'teams', code));
      if (snap.exists()) {
        const data = snap.data();
        setTeams(prev => ({ ...prev, [code]: data }));
        return data;
      }
    } catch (e) {
      console.error('[FootballData] Teams error:', e.message);
    }
    return null;
  }, [teams]);

  // Group fixtures by date
  const fixturesByDate = useCallback(() => {
    const groups = {};
    for (const f of fixtures) {
      if (!f.date) continue;
      if (!groups[f.date]) groups[f.date] = [];
      groups[f.date].push(f);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fixtures]);

  const value = {
    fixtures, liveMatches, competitions, standings, teams,
    loading, lastUpdated, dbReady,
    getStandings, getTeams, fixturesByDate,
  };

  return (
    <FootballDataContext.Provider value={value}>
      {children}
    </FootballDataContext.Provider>
  );
}

export function useFootballData() {
  const ctx = useContext(FootballDataContext);
  if (!ctx) throw new Error('useFootballData must be used within FootballDataProvider');
  return ctx;
}

export default FootballDataContext;
