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
//   yesterdayFixtures      ← Rollover at 3 AM (0 API calls — pure Firestore move)
//   todayFixtures          ← Rollover at 3 AM (0 API calls — pure Firestore move)
//   tomorrowFixtures       ← 1 API call/day at 3 AM
//   liveFixtures           ← live polling, updated every 5 min during matches
//   finishedFixtures       ← live->finished transitions + rollover FT recovery
//   teams                  ← extracted from tomorrow fetch
//   (same pattern for basketball*)
//
// BACKEND TIMELINE:
//   Startup      -> Live check (1 API call per sport)
//   Every 5 min  -> Live poll if games active (up to 20 football, 10 basketball/day)
//   Every 30 min -> Live poll if no games (idle check)
//   03:00 AM UTC -> Rollover (tomorrow->today, today->yesterday) + fetch new tomorrow
//
// FRONTEND HANDLING:
//   The _readDayFixtures function has built-in fallback logic.
//   If data isn't in the expected collection (e.g., during 3 AM transition),
//   it scans all 3 collections to find it by date.
//   Users see correct data even during the brief rollover window.

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
  39: '#3d195b',
  140: '#ee8707',
  135: '#024494',
  78: '#d20515',
  61: '#091c3e',
  2: '#001838',
  3: '#ff6b00',
  848: '#2d6a4f',
  1: '#1a3c6e',
  4: '#003366',
  5: '#004d99',
  40: '#5c2d91',
  44: '#2d4a22',
  45: '#1a1a2e',
  143: '#c60b1e',
  137: '#024494',
  81: '#d20515',
  66: '#091c3e',
  94: '#006600',
  88: '#e63e21',
  203: '#c8102e',
  50: '#003087',
  253: '#0047AB',
  262: '#006341',
  71: '#009C3B',
  128: '#75AADB',
  12: '#1D428A',
  13: '#003399',
  14: '#cc0000',
  44: '#ffd700',
  34: '#008c45',
  32: '#000000',
  36: '#002395',
  49: '#00843d',
  115: '#002868',
  116: '#DD0000',
  114: '#003DA5',
  119: '#00205B',
  132: '#CE1126',
  766: '#7B2D8B',
  891: '#FF6600',
  33: '#00843D',
  35: '#FEBE10',
  37: '#003DA5',
  38: '#00205B',
  40: '#CE1126',
  41: '#009B3A',
  42: '#FFD700',
  43: '#006233',
  45: '#003087',
  60: '#7B2D8B',
  61: '#FF6600',
  62: '#002868',
};

const getLeagueColor = (id) => LEAGUE_COLORS[id] || '#1e293b';

/* ═══════════════════════════════════════════════════════════════
   STATUS CONSTANTS
   ═══════════════════════════════════════════════════════════════ */
const FB_LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P'];
const FB_FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO'];
const FB_SCHEDULED_STATUSES = ['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT'];

const BASKETBALL_LIVE_STATUSES = [
  '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT',
];
const BASKETBALL_FINISHED_STATUSES = ['FT', 'AOT', 'ABD'];
const BASKETBALL_SCHEDULED_STATUSES = ['NS', 'POST', 'CANC', 'SUSP'];

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL LEAGUE PRIORITY
   ═══════════════════════════════════════════════════════════════ */
export const BASKETBALL_LEAGUE_PRIORITY = {
  12: 100, 13: 95, 44: 85, 34: 82, 36: 80, 32: 78, 33: 76,
  14: 72, 119: 70, 116: 68, 114: 66, 37: 64, 35: 62,
  132: 58, 49: 56, 115: 54, 766: 52, 891: 50,
  38: 45, 42: 43, 43: 41, 41: 40, 45: 38, 40: 36,
  62: 30, 60: 28, 61: 26,
};

export const getBasketballLeaguePriority = (leagueId) => {
  const id = Number(leagueId);
  return BASKETBALL_LEAGUE_PRIORITY[id] || 20;
};

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

function isInWindow(date) {
  const d = date || '';
  return (
    d === getYesterdayStr() || d === getTodayStr() || d === getTomorrowStr()
  );
}

/**
 * Check if we're in the 3 AM rollover window (02:55 - 03:10 UTC).
 * During this time, data might be transitioning between collections.
 * The fallback logic in _readDayFixtures handles this transparently.
 */
export function isInRolloverWindow() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  return (utcHour === 2 && utcMinute >= 55) || (utcHour === 3 && utcMinute < 10);
}

/* ═══════════════════════════════════════════════════════════════
   COLLECTION NAMES
   ═══════════════════════════════════════════════════════════════ */
const COLL = {
  LIVE: 'liveFixtures',
  YESTERDAY: 'yesterdayFixtures',
  TODAY: 'todayFixtures',
  TOMORROW: 'tomorrowFixtures',
  FINISHED: 'finishedFixtures',
  STANDINGS: 'standings',
  LEAGUES: 'leagues',
  TEAMS: 'teams',
  BASKETBALL_LIVE: 'basketballLiveFixtures',
  BASKETBALL_YESTERDAY: 'basketballYesterdayFixtures',
  BASKETBALL_TODAY: 'basketballTodayFixtures',
  BASKETBALL_TOMORROW: 'basketballTomorrowFixtures',
  BASKETBALL_FINISHED: 'basketballFinishedFixtures',
  BASKETBALL_STANDINGS: 'basketballStandings',
  BASKETBALL_LEAGUES: 'basketballLeagues',
  BASKETBALL_TEAMS: 'basketballTeams',
  META: 'meta',
};

/* ═══════════════════════════════════════════════════════════════
   TRANSFORM: Backend doc -> Frontend match object
   ═══════════════════════════════════════════════════════════════ */
export function transformMatch(m) {
  if (!m) return null;
  if (m.fixture) return _transformApiFormat(m);
  if (m.sport === 'basketball' || m.pointsHome !== undefined || m.q1Home !== undefined) {
    return _transformBasketballFormat(m);
  }
  return _transformFootballFormat(m);
}

function _transformFootballFormat(m) {
  const id = String(m.id || '');
  const s = m.status || '';
  return {
    id,
    sport: 'football',
    date: m.date || null,
    kickoff: formatTime(m.date),
    timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD', abbr: '', color: '#333' },
    awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD', abbr: '', color: '#333' },
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
      halfTime: { home: m.scoreHalftimeHome ?? null, away: m.scoreHalftimeAway ?? null },
      fullTime: { home: m.scoreFulltimeHome ?? m.goalsHome ?? null, away: m.scoreFulltimeAway ?? m.goalsAway ?? null },
      extraTime: { home: m.scoreExtratimeHome ?? null, away: m.scoreExtratimeAway ?? null },
      penalties: { home: m.scorePenaltyHome ?? null, away: m.scorePenaltyAway ?? null },
    },
    isLive: FB_LIVE_STATUSES.includes(s),
    isFinished: FB_FINISHED_STATUSES.includes(s),
    isScheduled: FB_SCHEDULED_STATUSES.includes(s),
    minute: m.elapsed ?? null,
    venue: null,
    referee: m.referee || null,
  };
}

function _transformBasketballFormat(m) {
  const id = String(m.id || '');
  const s = m.status || '';
  const periodMap = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4', 5: 'OT' };
  const minute = m.currentPeriod ? (periodMap[m.currentPeriod] || s) : (s || null);
  return {
    id,
    sport: 'basketball',
    date: m.date || null,
    kickoff: formatTime(m.date),
    timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD', abbr: '', color: '#333' },
    awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD', abbr: '', color: '#333' },
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
      fullTime: { home: m.pointsHome ?? null, away: m.pointsAway ?? null },
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
    minute,
    venue: null,
    referee: null,
  };
}

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
    homeTeam: { id: homeId, name: teams.home?.name || 'TBD', abbr: teams.home?.code || '', color: '#333' },
    awayTeam: { id: awayId, name: teams.away?.name || 'TBD', abbr: teams.away?.code || '', color: '#333' },
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
      halfTime: { home: score.halftime?.home ?? null, away: score.halftime?.away ?? null },
      fullTime: { home: score.fulltime?.home ?? goals.home, away: score.fulltime?.away ?? goals.away },
      extraTime: { home: score.extratime?.home ?? null, away: score.extratime?.away ?? null },
      penalties: { home: score.penalty?.home ?? null, away: score.penalty?.away ?? null },
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
   INTERNAL: Read collection -> transform -> return matches
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

   The backend does a single rollover at 3 AM UTC:
     tomorrowFixtures -> todayFixtures
     todayFixtures     -> yesterdayFixtures
     API fetch         -> tomorrowFixtures

   This function handles edge cases:

   1. NORMAL (99% of requests):
      Primary collection has the right data -> return immediately.

   2. 3 AM TRANSITION (02:55 - 03:10 UTC):
      Data is moving between collections. Fallback scans all 3
      collections to find matches for the requested date.

   3. SERVER DOWNTIME:
      Server was down during 3 AM. Old docs may be in the "wrong"
      collection by date. The date filter catches this.

   4. ROLLOVER FAILURE:
      If 3 AM run failed completely, fallback still tries to find
      data anywhere.
   ═══════════════════════════════════════════════════════════════ */
async function _readDayFixtures(yesterdayColl, todayColl, tomorrowColl, date) {
  const yesterdayStr = getYesterdayStr();
  const tomorrowStr = getTomorrowStr();

  let primaryColl = todayColl;
  if (date === yesterdayStr) primaryColl = yesterdayColl;
  else if (date === tomorrowStr) primaryColl = tomorrowColl;

  const primary = await _readCollection(primaryColl);
  const filtered = primary.filter((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    return md === date;
  });

  if (filtered.length > 0) return filtered;

  const all = await Promise.all([
    _readCollection(yesterdayColl),
    _readCollection(todayColl),
    _readCollection(tomorrowColl),
  ]);

  return all.flat().filter((m) => {
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
  if (!isInWindow(date)) return _emptyResult(null);
  try {
    const matches = await _readDayFixtures(COLL.YESTERDAY, COLL.TODAY, COLL.TOMORROW, date);
    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'backend',
      allFinished: matches.length > 0 && matches.every((m) => m.isFinished),
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
   FOOTBALL: Finished fixtures
   ═══════════════════════════════════════════════════════════════ */
export const fetchFinishedFixtures = async () => {
  if (!db) return [];
  try {
    const matches = await _readCollection(COLL.FINISHED);
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
   ═══════════════════════════════════════════════════════════════ */
export const subscribeToLiveFixtures = (callback) => {
  if (!db) {
    setTimeout(() => callback({ matches: [], hasLive: false, liveCount: 0, error: 'NO_DB' }), 0);
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.LIVE),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({ matches, hasLive: matches.length > 0, liveCount: matches.length, error: null });
    },
    (err) => {
      if (!active) return;
      callback({ matches: [], hasLive: false, liveCount: 0, error: err.message });
    }
  );
  return () => { active = false; unsub(); };
};

export const subscribeToTodayFixtures = (callback) => {
  if (!db) {
    setTimeout(() => callback({ matches: [], error: 'NO_DB' }), 0);
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
      callback({ matches, error: err.message });
    }
  );
  return () => { active = false; unsub(); };
};

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Fetch by day
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballFixtures = async (date) => {
  if (!db) return _emptyResult('NO_DB');
  await waitForAuth();
  if (!isInWindow(date)) return _emptyResult(null);
  try {
    const matches = await _readDayFixtures(COLL.BASKETBALL_YESTERDAY, COLL.BASKETBALL_TODAY, COLL.BASKETBALL_TOMORROW, date);
    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'backend',
      allFinished: matches.length > 0 && matches.every((m) => m.isFinished),
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] fetchBasketballFixtures error:', err.message);
    return _emptyResult('NETWORK');
  }
};

export const fetchBasketballYesterdayFixtures = () => fetchBasketballFixtures(getYesterdayStr());
export const fetchBasketballTomorrowFixtures = () => fetchBasketballFixtures(getTomorrowStr());

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Finished fixtures
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballFinishedFixtures = async () => {
  if (!db) return [];
  try {
    const matches = await _readCollection(COLL.BASKETBALL_FINISHED);
    return matches.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (err) {
    console.warn('[Data] fetchBasketballFinishedFixtures error:', err.message);
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
    setTimeout(() => callback({ matches: [], hasLive: false, liveCount: 0, error: 'NO_DB' }), 0);
    return () => {};
  }
  let active = true;
  const unsub = onSnapshot(
    collection(db, COLL.BASKETBALL_LIVE),
    (snap) => {
      if (!active) return;
      const matches = snap.docs.map((d) => transformMatch(d.data()));
      callback({ matches, hasLive: matches.length > 0, liveCount: matches.length, error: null });
    },
    (err) => {
      if (!active) return;
      callback({ matches: [], hasLive: false, liveCount: 0, error: err.message });
    }
  );
  return () => { active = false; unsub(); };
};

export const subscribeToBasketballTodayFixtures = (callback) => {
  if (!db) {
    setTimeout(() => callback({ matches: [], error: 'NO_DB' }), 0);
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
      callback({ matches, error: err.message });
    }
  );
  return () => { active = false; unsub(); };
};

/* ═══════════════════════════════════════════════════════════════
   STANDINGS
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagueStandings = async (leagueId) => {
  if (!db) return [];
  try {
    const snap = await getDoc(doc(db, COLL.STANDINGS, String(leagueId)));
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
    const snap = await getDoc(doc(db, COLL.BASKETBALL_STANDINGS, String(leagueId)));
    if (!snap.exists()) return [];
    return snap.data().standings || [];
  } catch (err) {
    console.warn('[Data] Basketball standings error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUES
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagues = async (sport = 'football') => {
  if (!db) return [];
  try {
    const collName = sport === 'basketball' ? COLL.BASKETBALL_LEAGUES : COLL.LEAGUES;
    const snap = await getDocs(collection(db, collName));
    return snap.docs.map((d) => d.data());
  } catch (err) {
    console.warn('[Data] Leagues error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   TEAM FIXTURES — Search across ALL collections
   ═══════════════════════════════════════════════════════════════ */
export const fetchTeamFixtures = async (teamId) => {
  if (!db) return [];
  try {
    const [yesterday, today, tomorrow, finished, live] = await Promise.all([
      _readCollection(COLL.YESTERDAY),
      _readCollection(COLL.TODAY),
      _readCollection(COLL.TOMORROW),
      _readCollection(COLL.FINISHED),
      _readCollection(COLL.LIVE),
    ]);
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
    const [yesterday, today, tomorrow, finished, live] = await Promise.all([
      _readCollection(COLL.BASKETBALL_YESTERDAY),
      _readCollection(COLL.BASKETBALL_TODAY),
      _readCollection(COLL.BASKETBALL_TOMORROW),
      _readCollection(COLL.BASKETBALL_FINISHED),
      _readCollection(COLL.BASKETBALL_LIVE),
    ]);
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
   ═══════════════════════════════════════════════════════════════
   The backend writes these fields to meta/footballScheduler
   and meta/basketballScheduler:
     - lastDailyFetchDate: "2026-07-10" (the date when run() completed)
     - lastTomorrowDate:   "2026-07-11" (which date was fetched)
     - verifiedAt:         ISO timestamp
     - fetchTotal:         number of fixtures fetched
     - fetchWrites:        number written to Firestore
     - rolloverYesterday:  count moved to yesterday
     - rolloverToday:      count moved to today
     - recoveredFT:        count of finished games recovered
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

    const parseSportStatus = (raw) => {
      if (!raw) return { status: 'unknown', fetchedAt: null };

      const todayStr = getTodayStr();
      const fetchDone = raw.lastDailyFetchDate === todayStr;

      return {
        status: fetchDone ? 'complete' : 'pending',
        fetchedAt: raw.verifiedAt || null,
        rolloverYesterday: raw.rolloverYesterday ?? null,
        rolloverToday: raw.rolloverToday ?? null,
        recoveredFT: raw.recoveredFT ?? null,
        fetchTotal: raw.fetchTotal ?? null,
        fetchWrites: raw.fetchWrites ?? null,
        lastDailyFetchDate: raw.lastDailyFetchDate || null,
        lastTomorrowDate: raw.lastTomorrowDate || null,
        fetchDone,
      };
    };

    return {
      football: parseSportStatus(footballRaw),
      basketball: parseSportStatus(basketballRaw),
      _raw: { football: footballRaw, basketball: basketballRaw },
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
 */
export const getSyncStatusMessage = (status) => {
  if (!status) return 'Unknown';

  if (status.status === 'pending') {
    return isInRolloverWindow() ? 'Updating...' : 'Waiting for daily sync';
  }

  if (status.fetchedAt) {
    try {
      const d = new Date(status.fetchedAt);
      return `Updated at ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Updated';
    }
  }

  return 'Updated';
};

/* ═══════════════════════════════════════════════════════════════
   MATCH DETAILS (stubs — not fetched on free plan)
   ═══════════════════════════════════════════════════════════════ */
export const fetchMatchEvents = async () => ({ events: [], error: null, fromCache: 'backend' });
export const fetchMatchLineups = async () => ({ lineups: [], error: null, fromCache: 'backend' });
export const fetchMatchStatistics = async () => ({ statistics: [], error: null, fromCache: 'backend' });

/* ═══════════════════════════════════════════════════════════════
   CACHE COMPATIBILITY (no-ops — Firestore IS the cache)
   ═══════════════════════════════════════════════════════════════ */
export const loadFixturesFromAnyCache = async (date) => {
  const res = await fetchFixtures(date);
  return res.matches.length > 0
    ? { matches: res.matches, source: 'backend', stale: false, allFinished: res.allFinished }
    : null;
};

export const loadCachedFixtures = () => null;
export const getCachedDatesSync = () => [];
export const getCombinedCachedDates = async () => [];
export const getCacheStatus = () => null;
export const getCacheStats = () => ({ dates: 0, total: 0, finished: 0, cachedDates: [] });
export const clearAllCache = () => {};

/* ═══════════════════════════════════════════════════════════════
   QUOTA COMPATIBILITY (no API calls from browser = no quota)
   ═══════════════════════════════════════════════════════════════ */
export const getQuotaStatus = () => ({
  used: 0, limit: 99999, remaining: 99999, percent: 0, date: '', isToday: false, blocked: false, hardBlocked: false,
});

export const LIVE_POLL_ACTIVE = 60000;
export const LIVE_POLL_IDLE = 300000;
export const LIVE_POLL_BLOCKED = 600000;
export const getLivePollInterval = () => LIVE_POLL_ACTIVE;

/* ═══════════════════════════════════════════════════════════════
   SYNC COMPATIBILITY (no-ops — backend handles all syncing)
   ═══════════════════════════════════════════════════════════════ */
export const dailySyncToFirestore = async () => ({ done: true, skipped: true, reason: 'BACKEND' });
export const syncDateToFirestore = async () => false;
export const getLastSyncStatus = () => null;

export const initApp = async () => {
  await waitForAuth();
  initFirebaseSync();
};