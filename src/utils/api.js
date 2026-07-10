// FILE: src/utils/api.jsx
//
// DATA LAYER — Reads from Firebase Firestore (populated by Node.js backend)
//
// Architecture:
//   Backend (24/7) → API-Football/Basketball → Firestore → This file → React components
//
// NO API keys needed in frontend.
// NO direct API calls from browser.
// Firestore IS the cache.
//
// Collections populated by backend:
//   yesterdayFixtures      ← Smart midnight rollover (00:05 AM, 0 API calls)
//   todayFixtures          ← Smart midnight rollover (00:05 AM, 0 API calls)
//   tomorrowFixtures       ← 1 API call/day at 3 AM
//   liveFixtures           ← live polling, updated every 2 min during matches
//   finishedFixtures       ← live→finished transitions + overnight recovery
//   teams                  ← extracted from tomorrow fetch
//   (same pattern for basketball*)
//
// ROLLOVER TIMELINE:
//   00:05 AM → First rollover attempt (tomorrow→today, today→yesterday)
//   00:20 AM → Retry if 00:05 failed (continues every 15 min until 02:50)
//   03:00 AM → Daily fetch for tomorrow's fixtures (1 API call)
//
// FRONTEND HANDLING:
//   The _readDayFixtures function has built-in fallback logic.
//   If "today" data isn't in todayFixtures (e.g., rollover delayed),
//   it scans tomorrowFixtures and yesterdayFixtures too.
//   Users see correct data even during the ~20 min rollover window.

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE TRACKING
   ═══════════════════════════════════════════════════════════════ */
let isUserAuthenticated = false;
let authReady = false;
const authWaiters = [];

if (auth) {
  auth.onAuthStateChanged((user) => {
    isUserAuthenticated = !!user;
    authReady = true;
    authWaiters.forEach((resolve) => resolve());
    authWaiters.length = 0;
  });
} else {
  authReady = true;
}

const waitForAuth = () => {
  if (authReady) return Promise.resolve();
  return new Promise((resolve) => authWaiters.push(resolve));
};

/* ═══════════════════════════════════════════════════════════════
   DEVICE ID & LOCAL STORAGE HELPERS
   ═══════════════════════════════════════════════════════════════ */
const getDeviceId = () => {
  let id = localStorage.getItem('fx_device_id');
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('fx_device_id', id);
  }
  return id;
};

const lsGet = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage full — silent */
  }
};

/* ═══════════════════════════════════════════════════════════════
   FAVORITES & PREFERENCES
   ═══════════════════════════════════════════════════════════════ */
export const getFavs = () => lsGet('fx_favs', []);

export const setFavs = (favs) => {
  lsSet('fx_favs', favs);
  pushToFb('favorites', favs);
};

export const getPrefs = () =>
  lsGet('fx_prefs', {
    sound: true,
    goals: true,
    cards: true,
    kickoff: true,
    lineups: true,
    notifications: false,
  });

export const setPrefs = (prefs) => {
  lsSet('fx_prefs', prefs);
  pushToFb('prefs', prefs);
};

export const addFav = (team) => {
  const favs = getFavs();
  if (!favs.find((t) => t.id === team.id)) {
    favs.unshift({ ...team, addedAt: Date.now() });
    setFavs(favs);
  }
};

export const removeFav = (id) => {
  setFavs(getFavs().filter((t) => t.id !== id));
};

export const isFav = (id) => getFavs().some((t) => t.id === id);

const pushToFb = async (key, value) => {
  if (!db) return;
  await waitForAuth();
  try {
    await setDoc(
      doc(db, 'users', getDeviceId()),
      { [key]: value, updatedAt: serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    console.warn('[Firestore] Push failed:', err.message);
  }
};

export const initFirebaseSync = async () => {
  if (!db) return;
  await waitForAuth();
  try {
    const snap = await getDoc(doc(db, 'users', getDeviceId()));
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.favorites?.length > getFavs().length)
      lsSet('fx_favs', data.favorites);
    if (data.prefs) lsSet('fx_prefs', data.prefs);
  } catch (err) {
    console.warn('[Firestore] Sync read failed:', err.message);
  }
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUE COLORS
   ═══════════════════════════════════════════════════════════════ */
const LEAGUE_COLORS = {
  // Football — Top 5
  39: '#3d195b', // Premier League
  140: '#ee8707', // La Liga
  135: '#024494', // Serie A
  78: '#d20515', // Bundesliga
  61: '#091c3e', // Ligue 1
  // Football — UEFA
  2: '#001838', // Champions League
  3: '#ff6b00', // Europa League
  848: '#2d6a4f', // Conference League
  // Football — International
  1: '#1a3c6e', // World Cup
  4: '#003366', // Euro Championship
  5: '#004d99', // Nations League
  // Football — Domestic Cups
  40: '#5c2d91', // Championship
  44: '#2d4a22', // FA Cup
  45: '#1a1a2e', // League Cup
  143: '#c60b1e', // Copa del Rey
  137: '#024494', // Coppa Italia
  81: '#d20515', // DFB Pokal
  66: '#091c3e', // Coupe de France
  // Football — Secondary
  94: '#006600', // Primeira Liga
  88: '#e63e21', // Eredivisie
  203: '#c8102e', // Süper Lig
  50: '#003087', // Premiership (Scotland)
  // Basketball
  12: '#c8102e', // NBA
  13: '#003399', // EuroLeague
  14: '#cc0000', // EuroCup
  44: '#ffd700', // Liga ACB
  34: '#008c45', // LBA
  32: '#000000', // BBL
  36: ' #002395', // LNB Pro A
  49: '#00843d', // NBL

// Summer leagues
  253: '#0047AB', // MLS — blue
  262: '#006341', // Liga MX — green
  71:  '#009C3B', // Brazil Serie A — green
  128: '#75AADB', // Argentina Primera — light blue
};


const getLeagueColor = (id) => LEAGUE_COLORS[id] || '#1e293b';

/* ═══════════════════════════════════════════════════════════════
   STATUS CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const FB_LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P'];
const FB_FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO'];
const FB_SCHEDULED_STATUSES = ['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT'];

const BASKETBALL_LIVE_STATUSES = [
  '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT',
];
const BASKETBALL_FINISHED_STATUSES = ['FT', 'ABD'];
const BASKETBALL_SCHEDULED_STATUSES = ['NS', 'POSTP', 'CANC', 'SUSP'];

/* ═══════════════════════════════════════════════════════════════
   DATE / TIME HELPERS
   ═══════════════════════════════════════════════════════════════ */
export const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function getDateRange(days = 7, startOffset = 0) {
  const dates = [];
  const today = new Date();
  for (let i = startOffset; i < startOffset + days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push({
      date: d.toISOString().split('T')[0],
      day: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      num: d.getDate(),
      month: d.toLocaleDateString('en-GB', { month: 'short' }),
      isToday: i === 0,
    });
  }
  return dates;
}

export function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

export function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

export function getTomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Check if a date falls within the 3-day window the backend populates */
function isInWindow(date) {
  const d = date || '';
  return (
    d === getYesterdayStr() || d === getTodayStr() || d === getTomorrowStr()
  );
}

/**
 * Check if we're in the "waiting for rollover" window (00:00 - 00:20 AM).
 * During this time, data might be transitioning between collections.
 * The fallback logic in _readDayFixtures handles this transparently,
 * but this function lets the UI show a subtle "updating..." indicator.
 */
export function isInRolloverWindow() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  // Between 00:00 and 00:25 UTC
  return utcHour === 0 && utcMinute < 25;
}

/* ═══════════════════════════════════════════════════════════════
   COLLECTION NAMES — must match backend/config/constants.js
   ═══════════════════════════════════════════════════════════════ */
const COLL = {
  // Football
  LIVE: 'liveFixtures',
  YESTERDAY: 'yesterdayFixtures',
  TODAY: 'todayFixtures',
  TOMORROW: 'tomorrowFixtures',
  FINISHED: 'finishedFixtures',
  STANDINGS: 'standings',
  LEAGUES: 'leagues',
  TEAMS: 'teams',

  // Basketball
  BASKETBALL_LIVE: 'basketballLiveFixtures',
  BASKETBALL_YESTERDAY: 'basketballYesterdayFixtures',
  BASKETBALL_TODAY: 'basketballTodayFixtures',
  BASKETBALL_TOMORROW: 'basketballTomorrowFixtures',
  BASKETBALL_FINISHED: 'basketballFinishedFixtures',
  BASKETBALL_STANDINGS: 'basketballStandings',
  BASKETBALL_LEAGUES: 'basketballLeagues',
  BASKETBALL_TEAMS: 'basketballTeams',

  // Backend meta
  META: 'meta',
};

/* ═══════════════════════════════════════════════════════════════
   TRANSFORM: Backend doc → Frontend match object
   Detects sport from doc shape and delegates.
   ═══════════════════════════════════════════════════════════════ */
export function transformMatch(m) {
  if (!m) return null;
  // Legacy cached data had nested fixture/teams/goals structure
  if (m.fixture) return _transformApiFormat(m);
  // Basketball: detected by sport field or basketball-specific fields
  if (
    m.sport === 'basketball' ||
    m.pointsHome !== undefined ||
    m.q1Home !== undefined
  ) {
    return _transformBasketballFormat(m);
  }
  // Football: default
  return _transformFootballFormat(m);
}

// ── Football ──
function _transformFootballFormat(m) {
  const id = String(m.id || '');
  const s = m.status || '';
  return {
    id,
    sport: 'football',
    date: m.date || null,
    kickoff: formatTime(m.date),
    timestamp: m.timestamp || null,
    homeTeam: {
      id: String(m.homeTeamId || ''),
      name: m.homeTeamName || 'TBD',
      abbr: '',
      color: '#333',
    },
    awayTeam: {
      id: String(m.awayTeamId || ''),
      name: m.awayTeamName || 'TBD',
      abbr: '',
      color: '#333',
    },
    homeId: String(m.homeTeamId || ''),
    awayId: String(m.awayTeamId || ''),
    homeLogo: m.homeTeamLogo || null,
    awayLogo: m.awayTeamLogo || null,
    league: {
      id: String(m.leagueId || ''),
      name: m.leagueName || 'Other',
      color: getLeagueColor(m.leagueId),
      emblem: m.leagueLogo || null,
      country: m.leagueCountry || '',
      flag: m.leagueFlag || null,
      type: 'League',
      season: m.season || null,
      round: m.round || null,
    },
    leagueKey: String(m.leagueId || 'OTHER'),
    leagueCountry: m.leagueCountry || '',
    status: s,
    rawStatus: s,
    statusLong: m.statusLong || '',
    homeScore: m.goalsHome ?? null,
    awayScore: m.goalsAway ?? null,
    score: {
      home: m.goalsHome ?? null,
      away: m.goalsAway ?? null,
      halfTime: {
        home: m.scoreHalftimeHome ?? null,
        away: m.scoreHalftimeAway ?? null,
      },
      fullTime: {
        home: m.scoreFulltimeHome ?? m.goalsHome ?? null,
        away: m.scoreFulltimeAway ?? m.goalsAway ?? null,
      },
      extraTime: {
        home: m.scoreExtratimeHome ?? null,
        away: m.scoreExtratimeAway ?? null,
      },
      penalties: {
        home: m.scorePenaltyHome ?? null,
        away: m.scorePenaltyAway ?? null,
      },
    },
    isLive: FB_LIVE_STATUSES.includes(s),
    isFinished: FB_FINISHED_STATUSES.includes(s),
    isScheduled: FB_SCHEDULED_STATUSES.includes(s),
    minute: m.elapsed ?? null,
    venue: null,
    referee: m.referee || null,
  };
}

// ── Basketball ──
function _transformBasketballFormat(m) {
  const id = String(m.id || '');
  const s = m.status || '';
  return {
    id,
    sport: 'basketball',
    date: m.date || null,
    kickoff: formatTime(m.date),
    timestamp: m.timestamp || null,
    homeTeam: {
      id: String(m.homeTeamId || ''),
      name: m.homeTeamName || 'TBD',
      abbr: '',
      color: '#333',
    },
    awayTeam: {
      id: String(m.awayTeamId || ''),
      name: m.awayTeamName || 'TBD',
      abbr: '',
      color: '#333',
    },
    homeId: String(m.homeTeamId || ''),
    awayId: String(m.awayTeamId || ''),
    homeLogo: m.homeTeamLogo || null,
    awayLogo: m.awayTeamLogo || null,
    league: {
      id: String(m.leagueId || ''),
      name: m.leagueName || 'Other',
      color: getLeagueColor(m.leagueId),
      emblem: m.leagueLogo || null,
      country: m.leagueCountry || '',
      flag: null,
      type: 'League',
      season: m.season || null,
      round: null,
    },
    leagueKey: String(m.leagueId || 'OTHER'),
    leagueCountry: m.leagueCountry || '',
    status: s,
    rawStatus: s,
    statusLong: m.statusLong || '',
    homeScore: m.pointsHome ?? null,
    awayScore: m.pointsAway ?? null,
    score: {
      home: m.pointsHome ?? null,
      away: m.pointsAway ?? null,
      halfTime: null,
      fullTime: {
        home: m.pointsHome ?? null,
        away: m.pointsAway ?? null,
      },
      extraTime: null,
      penalties: null,
      q1: { home: m.q1Home ?? null, away: m.q1Away ?? null },
      q2: { home: m.q2Home ?? null, away: m.q2Away ?? null },
      q3: { home: m.q3Home ?? null, away: m.q3Away ?? null },
      q4: { home: m.q4Home ?? null, away: m.q4Away ?? null },
      ot: { home: m.otHome ?? null, away: m.otAway ?? null },
    },
    isLive: BASKETBALL_LIVE_STATUSES.includes(s),
    isFinished: BASKETBALL_FINISHED_STATUSES.includes(s),
    isScheduled: BASKETBALL_SCHEDULED_STATUSES.includes(s),
    minute: m.currentPeriod ?? null,
    venue: null,
    referee: null,
  };
}

// ── Legacy API format (backward compat for any cached data) ──
function _transformApiFormat(m) {
  const fixture = m.fixture || {};
  const teams = m.teams || {};
  const goals = m.goals || {};
  const score = m.score || {};
  const league = m.league || {};
  const homeId = String(teams.home?.id || '');
  const awayId = String(teams.away?.id || '');
  const s = fixture.status?.short || '';
  return {
    id: String(fixture.id),
    date: fixture.date,
    kickoff: formatTime(fixture.date),
    timestamp: fixture.timestamp || null,
    sport: 'football',
    homeTeam: {
      id: homeId,
      name: teams.home?.name || 'TBD',
      abbr: teams.home?.code || '',
      color: '#333',
    },
    awayTeam: {
      id: awayId,
      name: teams.away?.name || 'TBD',
      abbr: teams.away?.code || '',
      color: '#333',
    },
    homeId,
    awayId,
    homeLogo: teams.home?.logo || null,
    awayLogo: teams.away?.logo || null,
    league: {
      id: String(league.id || ''),
      name: league.name || 'Other',
      color: getLeagueColor(league.id),
      emblem: league.logo || null,
      country: league.country || '',
      flag: league.flag || null,
      type: league.type || 'League',
      season: league.season || null,
      round: league.round || null,
    },
    leagueKey: String(league.id || 'OTHER'),
    leagueCountry: league.country || '',
    status: s,
    rawStatus: s,
    statusLong: fixture.status?.long || '',
    homeScore: goals.home,
    awayScore: goals.away,
    score: {
      home: goals.home,
      away: goals.away,
      halfTime: {
        home: score.halftime?.home ?? null,
        away: score.halftime?.away ?? null,
      },
      fullTime: {
        home: score.fulltime?.home ?? goals.home,
        away: score.fulltime?.away ?? goals.away,
      },
      extraTime: {
        home: score.extratime?.home ?? null,
        away: score.extratime?.away ?? null,
      },
      penalties: {
        home: score.penalty?.home ?? null,
        away: score.penalty?.away ?? null,
      },
    },
    isLive: FB_LIVE_STATUSES.includes(s),
    isFinished: FB_FINISHED_STATUSES.includes(s),
    isScheduled: FB_SCHEDULED_STATUSES.includes(s),
    minute: fixture.status?.elapsed || null,
    venue: fixture.venue?.name || null,
    referee: fixture.referee || null,
  };
}

/* ═══════════════════════════════════════════════════════════════
   INTERNAL: Read collection → transform → return matches
   ═══════════════════════════════════════════════════════════════ */
async function _readCollection(collName) {
  if (!db) return [];
  const snap = await getDocs(collection(db, collName));
  return snap.docs.map((d) => transformMatch(d.data()));
}

function _emptyResult(error = null) {
  return {
    matches: [],
    error,
    fromCache: true,
    isStale: false,
    forceFailed: false,
    cacheSource: 'backend',
    allFinished: false,
    isRolloverWindow: isInRolloverWindow(),
  };
}

/* ═══════════════════════════════════════════════════════════════
   INTERNAL: Read fixtures for a specific date
   ═══════════════════════════════════════════════════════════════
   SMART FALLBACK LOGIC:
   
   With the new midnight rollover system (00:05 AM with 15-min
   retries), data transitions happen quickly. But this function
   handles ALL edge cases:
   
   1. NORMAL (99% of requests):
      Primary collection has the right data → return immediately.
      No extra reads.
   
   2. MIDNIGHT TRANSITION (00:00 - 00:20 AM):
      Calendar date changed but rollover hasn't run yet.
      "Today's" data is still in tomorrowFixtures.
      Fallback scans all 3 collections → finds it.
   
   3. SERVER DOWNTIME:
      Server was down for multiple days.
      Old docs have wrong dates (e.g., tomorrowFixtures has
      yesterday's date). The date filter catches this.
   
   4. ROLLOVER FAILURE:
      If rollover failed completely and 3 AM fetch also failed,
      the fallback still tries to find data anywhere.
   ═══════════════════════════════════════════════════════════════ */
async function _readDayFixtures(yesterdayColl, todayColl, tomorrowColl, date) {
  const yesterdayStr = getYesterdayStr();
  const tomorrowStr = getTomorrowStr();

  // Pick the most likely collection based on date
  let primaryColl = todayColl;
  if (date === yesterdayStr) primaryColl = yesterdayColl;
  else if (date === tomorrowStr) primaryColl = tomorrowColl;

  // Read primary collection
  const primary = await _readCollection(primaryColl);
  const filtered = primary.filter((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    return md === date;
  });

  // If we got results, return immediately (99% of requests)
  if (filtered.length > 0) return filtered;

  // SMART FALLBACK:
  // Scan all 3 collections to find data for this date.
  // This handles:
  //   - Midnight transition (data in wrong collection)
  //   - Server downtime (rollover skipped)
  //   - Partial failures (one collection empty)
  const all = await Promise.all([
    _readCollection(yesterdayColl),
    _readCollection(todayColl),
    _readCollection(tomorrowColl),
  ]);

  return all
    .flat()
    .filter((m) => {
      const md = m.date ? m.date.split('T')[0] : '';
      return md === date;
    });
}

/* ═══════════════════════════════════════════════════════════════
   FOOTBALL: Fetch by day
   ═══════════════════════════════════════════════════════════════ */
export const fetchFixtures = async (date, forceRefresh = false) => {
  if (!db) return _emptyResult('NO_DB');
  await waitForAuth();

  // Backend only populates 3-day window — anything outside = empty
  if (!isInWindow(date)) {
    return _emptyResult(null);
  }

  try {
    const matches = await _readDayFixtures(
      COLL.YESTERDAY,
      COLL.TODAY,
      COLL.TOMORROW,
      date
    );

    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'backend',
      allFinished:
        matches.length > 0 && matches.every((m) => m.isFinished),
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] fetchFixtures error:', err.message);
    return _emptyResult('NETWORK');
  }
};

export const fetchYesterdayFixtures = () => fetchFixtures(getYesterdayStr());
export const fetchTomorrowFixtures = () => fetchFixtures(getTomorrowStr());

/* ═══════════════════════════════════════════════════════════════
   FOOTBALL: Finished fixtures (results page)
   ═══════════════════════════════════════════════════════════════ */
export const fetchFinishedFixtures = async () => {
  if (!db) return [];
  try {
    const matches = await _readCollection(COLL.FINISHED);
    // Sort newest first
    return matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (err) {
    console.warn('[Data] fetchFinishedFixtures error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   FOOTBALL: Live scores (one-shot)
   ═══════════════════════════════════════════════════════════════ */
export const fetchLiveScores = async () => {
  if (!db) return { matches: [], error: 'NO_DB' };
  try {
    const matches = await _readCollection(COLL.LIVE);
    return { matches, error: null };
  } catch (err) {
    return { matches: [], error: 'NETWORK' };
  }
};

/* ═══════════════════════════════════════════════════════════════
   FOOTBALL: Real-time subscriptions
   ═══════════════════════════════════════════════════════════════
   These use Firestore onSnapshot — the browser receives
   updates INSTANTLY when the backend writes new live data.
   Zero polling. Zero API calls from the browser.
   ═══════════════════════════════════════════════════════════════ */
export const subscribeToLiveFixtures = (callback) => {
  if (!db) {
    setTimeout(
      () =>
        callback({
          matches: [],
          hasLive: false,
          liveCount: 0,
          error: 'NO_DB',
        }),
      0
    );
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.LIVE),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({
        matches,
        hasLive: matches.length > 0,
        liveCount: matches.length,
        error: null,
      });
    },
    (err) => {
      if (!active) return;
      callback({
        matches: [],
        hasLive: false,
        liveCount: 0,
        error: err.message,
      });
    }
  );
  return () => {
    active = false;
    unsub();
  };
};

export const subscribeToTodayFixtures = (callback) => {
  if (!db) {
    setTimeout(
      () => callback({ matches: [], error: 'NO_DB' }),
      0
    );
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.TODAY),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({ matches, error: null });
    },
    (err) => {
      if (!active) return;
      callback({ matches: [], error: err.message });
    }
  );
  return () => {
    active = false;
    unsub();
  };
};

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Fetch by day
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballFixtures = async (date) => {
  if (!db) return _emptyResult('NO_DB');
  await waitForAuth();

  if (!isInWindow(date)) {
    return _emptyResult(null);
  }

  try {
    const matches = await _readDayFixtures(
      COLL.BASKETBALL_YESTERDAY,
      COLL.BASKETBALL_TODAY,
      COLL.BASKETBALL_TOMORROW,
      date
    );

    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'backend',
      allFinished:
        matches.length > 0 && matches.every((m) => m.isFinished),
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] fetchBasketballFixtures error:', err.message);
    return _emptyResult('NETWORK');
  }
};

export const fetchBasketballYesterdayFixtures = () =>
  fetchBasketballFixtures(getYesterdayStr());
export const fetchBasketballTomorrowFixtures = () =>
  fetchBasketballFixtures(getTomorrowStr());

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Finished fixtures (results page)
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballFinishedFixtures = async () => {
  if (!db) return [];
  try {
    const matches = await _readCollection(COLL.BASKETBALL_FINISHED);
    return matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (err) {
    console.warn(
      '[Data] fetchBasketballFinishedFixtures error:',
      err.message
    );
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Live scores (one-shot)
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballLiveScores = async () => {
  if (!db) return { matches: [], error: 'NO_DB' };
  try {
    const matches = await _readCollection(COLL.BASKETBALL_LIVE);
    return { matches, error: null };
  } catch (err) {
    return { matches: [], error: 'NETWORK' };
  }
};

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Real-time subscriptions
   ═══════════════════════════════════════════════════════════════ */
export const subscribeToBasketballLiveFixtures = (callback) => {
  if (!db) {
    setTimeout(
      () =>
        callback({
          matches: [],
          hasLive: false,
          liveCount: 0,
          error: 'NO_DB',
        }),
      0
    );
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.BASKETBALL_LIVE),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({
        matches,
        hasLive: matches.length > 0,
        liveCount: matches.length,
        error: null,
      });
    },
    (err) => {
      if (!active) return;
      callback({
        matches: [],
        hasLive: false,
        liveCount: 0,
        error: err.message,
      });
    }
  );
  return () => {
    active = false;
    unsub();
  };
};

export const subscribeToBasketballTodayFixtures = (callback) => {
  if (!db) {
    setTimeout(
      () => callback({ matches: [], error: 'NO_DB' }),
      0
    );
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.BASKETBALL_TODAY),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({ matches, error: null });
    },
    (err) => {
      if (!active) return;
      callback({ matches: [], error: err.message });
    }
  );
  return () => {
    active = false;
    unsub();
  };
};

/* ═══════════════════════════════════════════════════════════════
   STANDINGS
   Returns empty on free plan (cron disabled).
   Ready for when you upgrade — no code changes needed.
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagueStandings = async (leagueId) => {
  if (!db) return [];
  try {
    const snap = await getDoc(
      doc(db, COLL.STANDINGS, String(leagueId))
    );
    if (!snap.exists()) return [];
    return snap.data().standings || [];
  } catch (err) {
    console.warn('[Data] Standings error:', err.message);
    return [];
  }
};

export const fetchBasketballLeagueStandings = async (leagueId) => {
  if (!db) return [];
  try {
    const snap = await getDoc(
      doc(db, COLL.BASKETBALL_STANDINGS, String(leagueId))
    );
    if (!snap.exists()) return [];
    return snap.data().standings || [];
  } catch (err) {
    console.warn('[Data] Basketball standings error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUES
   Returns empty on free plan (cron disabled).
   Ready for when you upgrade.
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagues = async (sport = 'football') => {
  if (!db) return [];
  try {
    const collName =
      sport === 'basketball' ? COLL.BASKETBALL_LEAGUES : COLL.LEAGUES;
    const snap = await getDocs(collection(db, collName));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn('[Data] Leagues error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   TEAM FIXTURES — Search across ALL collections
   Includes LIVE so a team playing right now shows up.
   ═══════════════════════════════════════════════════════════════ */
export const fetchTeamFixtures = async (teamId) => {
  if (!db) return [];
  try {
    const [yesterday, today, tomorrow, finished, live] = await Promise.all(
      [
        _readCollection(COLL.YESTERDAY),
        _readCollection(COLL.TODAY),
        _readCollection(COLL.TOMORROW),
        _readCollection(COLL.FINISHED),
        _readCollection(COLL.LIVE),
      ]
    );

    const tid = String(teamId);
    return [...yesterday, ...today, ...tomorrow, ...finished, ...live]
      .filter((m) => m.homeId === tid || m.awayId === tid)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
  } catch {
    return [];
  }
};

export const fetchBasketballTeamFixtures = async (teamId) => {
  if (!db) return [];
  try {
    const [yesterday, today, tomorrow, finished, live] = await Promise.all(
      [
        _readCollection(COLL.BASKETBALL_YESTERDAY),
        _readCollection(COLL.BASKETBALL_TODAY),
        _readCollection(COLL.BASKETBALL_TOMORROW),
        _readCollection(COLL.BASKETBALL_FINISHED),
        _readCollection(COLL.BASKETBALL_LIVE),
      ]
    );

    const tid = String(teamId);
    return [...yesterday, ...today, ...tomorrow, ...finished, ...live]
      .filter((m) => m.homeId === tid || m.awayId === tid)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
  } catch {
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   BACKEND STATUS — Read meta docs
   Shows when the backend last synced, rollover status, etc.
   
   Returns parsed, user-friendly data:
   - rolloverAt: When the midnight rollover happened
   - fetchedAt: When tomorrow's fixtures were fetched
   - rolloverStatus: 'complete' | 'pending' | 'unknown'
   ═══════════════════════════════════════════════════════════════ */
export const fetchBackendStatus = async () => {
  if (!db) return null;
  try {
    const [footballSnap, basketballSnap] = await Promise.all([
      getDoc(doc(db, COLL.META, 'footballScheduler')),
      getDoc(doc(db, COLL.META, 'basketballScheduler')),
    ]);

    const footballRaw = footballSnap.exists() ? footballSnap.data() : null;
    const basketballRaw = basketballSnap.exists() ? basketballSnap.data() : null;

    // Parse rollover status for a sport
    const parseSportStatus = (raw) => {
      if (!raw) return { status: 'unknown', rolloverAt: null, fetchedAt: null };
      
      const todayStr = getTodayStr();
      const rolloverDone = raw.lastRolloverDate === todayStr;
      const fetchDone = raw.lastDailyFetchDate === todayStr;

      return {
        status: rolloverDone ? 'complete' : 'pending',
        rolloverAt: raw.rolloverAt || null,
        fetchedAt: raw.fetchedAt || null,
        rolloverYesterday: raw.rolloverYesterday ?? null,
        rolloverToday: raw.rolloverToday ?? null,
        recoveredFT: raw.recoveredFT ?? null,
        fetchTotal: raw.fetchTotal ?? null,
        fetchWrites: raw.fetchWrites ?? null,
        lastRolloverDate: raw.lastRolloverDate || null,
        lastDailyFetchDate: raw.lastDailyFetchDate || null,
        lastTomorrowDate: raw.lastTomorrowDate || null,
      };
    };

    return {
      football: parseSportStatus(footballRaw),
      basketball: parseSportStatus(basketballRaw),
      // Raw data for debugging
      _raw: {
        football: footballRaw,
        basketball: basketballRaw,
      },
      fetchedAt: new Date().toISOString(),
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] Backend status error:', err.message);
    return null;
  }
};

/**
 * Get a human-readable status message for the UI.
 * Examples:
 *   "Updated at 00:05 AM"
 *   "Rollover pending..."
 *   "Updated at 3:00 AM"
 */
export const getSyncStatusMessage = (status) => {
  if (!status) return 'Unknown';
  
  if (status.status === 'pending') {
    return isInRolloverWindow() 
      ? 'Updating...' 
      : 'Rollover pending';
  }
  
  if (status.rolloverAt) {
    try {
      const d = new Date(status.rolloverAt);
      return `Updated at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Updated';
    }
  }
  
  return 'Updated';
};

/* ═══════════════════════════════════════════════════════════════
   MATCH DETAILS (not fetched by backend on free plan — stubs)
   These return empty so the UI renders a clean "unavailable"
   state instead of crashing or showing a loading spinner.
   ═══════════════════════════════════════════════════════════════ */
export const fetchMatchEvents = async () => ({
  events: [],
  error: null,
  fromCache: 'backend',
});

export const fetchMatchLineups = async () => ({
  lineups: [],
  error: null,
  fromCache: 'backend',
});

export const fetchMatchStatistics = async () => ({
  statistics: [],
  error: null,
  fromCache: 'backend',
});

/* ═══════════════════════════════════════════════════════════════
   CACHE COMPATIBILITY (no-ops — Firestore IS the cache)
   Kept so any component that imports these doesn't break.
   ═══════════════════════════════════════════════════════════════ */
export const loadFixturesFromAnyCache = async (date) => {
  const res = await fetchFixtures(date);
  return res.matches.length > 0
    ? {
        matches: res.matches,
        source: 'backend',
        stale: false,
        allFinished: res.allFinished,
      }
    : null;
};

export const loadCachedFixtures = () => null;
export const getCachedDatesSync = () => [];
export const getCombinedCachedDates = async () => [];
export const getCacheStatus = () => null;
export const getCacheStats = () => ({
  dates: 0,
  total: 0,
  finished: 0,
  cachedDates: [],
});
export const clearAllCache = () => {};

/* ═══════════════════════════════════════════════════════════════
   QUOTA COMPATIBILITY (no API calls from browser = no quota)
   ═══════════════════════════════════════════════════════════════ */
export const getQuotaStatus = () => ({
  used: 0,
  limit: 99999,
  remaining: 99999,
  percent: 0,
  date: '',
  isToday: false,
  blocked: false,
  hardBlocked: false,
});

export const LIVE_POLL_ACTIVE = 60_000;
export const LIVE_POLL_IDLE = 300_000;
export const LIVE_POLL_BLOCKED = 600_000;
export const getLivePollInterval = () => LIVE_POLL_ACTIVE;

/* ═══════════════════════════════════════════════════════════════
   SYNC COMPATIBILITY (no-ops — backend handles all syncing)
   ═══════════════════════════════════════════════════════════════ */
export const dailySyncToFirestore = async () => ({
  done: true,
  skipped: true,
  reason: 'BACKEND',
});

export const syncDateToFirestore = async () => false;
export const getLastSyncStatus = () => null;

export const initApp = async () => {
  await waitForAuth();
  initFirebaseSync();
};