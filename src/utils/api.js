// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/api.jsx
//
// ★ REFACTORED: All data reads now go through dataLayer
//   (direct Firestore single-document reads with 3-layer cache).
//
// This file now only contains:
// - Transform helpers (transformMatch, formatTime, etc.)
// - Favorites/preferences (localStorage + Firestore sync)
// - League colors, status constants
// - Live polling subscriptions (read from dataLayer, not REST API)
//
// The backend REST API is NO LONGER needed for reads.
// It still runs for the scheduler (writing data from external APIs).
// ═══════════════════════════════════════════════════════════════

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { dataLayer, todayStr, yesterdayStr, tomorrowStr } from './dataLayer';

/* ═══════════════════════════════════════════════════
   AUTH STATE TRACKING
   ═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   DEVICE ID & LOCAL STORAGE
   ═══════════════════════════════════════════════════ */
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
  } catch {
    return fallback;
  }
};

const lsSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full */ }
};

/* ═══════════════════════════════════════════════════
   FAVORITES & PREFERENCES
   ═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   LEAGUE COLORS
   ═══════════════════════════════════════════════════ */
const LEAGUE_COLORS = {
  39: '#3d195b', 140: '#ee8707', 135: '#024494', 78: '#d20515',
  61: '#091c3e', 2: '#001838', 3: '#ff6b00', 848: '#2d6a4f',
  1: '#1a3c6e', 4: '#003366', 5: '#004d99', 40: '#5c2d91',
  44: '#2d4a22', 45: '#1a1a2e', 143: '#c60b1e', 137: '#024494',
  81: '#d20515', 66: '#091c3e', 94: '#006600', 88: '#e63e21',
  203: '#c8102e', 50: '#003087', 253: '#0047AB', 262: '#006341',
  71: '#009C3B', 128: '#75AADB', 12: '#1D428A', 13: '#003399',
  14: '#cc0000', 34: '#008c45', 32: '#000000', 36: '#002395',
  49: '#00843d', 115: '#002868', 116: '#DD0000', 114: '#003DA5',
  119: '#00205B', 132: '#CE1126', 766: '#7B2D8B', 891: '#FF6600',
  33: '#00843D', 35: '#FEBE10', 37: '#003DA5', 38: '#00205B',
  41: '#009B3A', 42: '#FFD700', 43: '#006233', 60: '#7B2D8B',
  62: '#002868',
};

const getLeagueColor = (id) => LEAGUE_COLORS[id] || '#1e293b';

/* ═══════════════════════════════════════════════════
   STATUS CONSTANTS
   ═══════════════════════════════════════════════════ */
const FB_LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P'];
const FB_FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO'];
const FB_SCHEDULED_STATUSES = ['TBD', 'NS', 'SUSP', 'PST', 'CANC', 'INT'];

const BASKETBALL_LIVE_STATUSES = ['1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT'];
const BASKETBALL_FINISHED_STATUSES = ['FT', 'AOT', 'ABD'];
const BASKETBALL_SCHEDULED_STATUSES = ['NS', 'POST', 'CANC', 'SUSP'];

/* ═══════════════════════════════════════════════════
   BASKETBALL LEAGUE PRIORITY
   ═══════════════════════════════════════════════════ */
export const BASKETBALL_LEAGUE_PRIORITY = {
  12: 100, 13: 95, 44: 85, 34: 82, 36: 80, 32: 78, 33: 76,
  14: 72, 119: 70, 116: 68, 114: 66, 37: 64, 35: 62,
  132: 58, 49: 56, 115: 54, 766: 52, 891: 50,
  38: 45, 42: 43, 43: 41, 41: 40, 45: 38, 40: 36,
  62: 30, 60: 28, 61: 26,
};

export const getBasketballLeaguePriority = (leagueId) => {
  return BASKETBALL_LEAGUE_PRIORITY[Number(leagueId)] || 20;
};

/* ═══════════════════════════════════════════════════
   DATE / TIME HELPERS
   ═══════════════════════════════════════════════════ */
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

export function getTodayStr() { return todayStr(); }
export function getYesterdayStr() { return yesterdayStr(); }
export function getTomorrowStr() { return tomorrowStr(); }

function isInWindow(date) {
  return [yesterdayStr(), todayStr(), tomorrowStr()].includes(date);
}

export function isInRolloverWindow() {
  const now = new Date();
  const h = now.getUTCHours();
  const m = now.getUTCMinutes();
  return (h === 2 && m >= 55) || (h === 3 && m < 10);
}

/* ═══════════════════════════════════════════════════
   TRANSFORM HELPERS
   ═══════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════
   ★ FOOTBALL: Fetch fixtures via dataLayer (direct Firestore)
   ═══════════════════════════════════════════════════ */

export const fetchFixtures = async (date, forceRefresh = false) => {
  if (!isInWindow(date)) return _emptyResult(null);

  if (forceRefresh) {
    dataLayer.invalidatePrefix('snap:ft:');
  }

  try {
    const snapshot = await dataLayer.fetchFootballSnapshot(date);

    if (!snapshot) return _emptyResult(null);

    const matches = _getMatchesForDate(snapshot, date);
    const allFinished = matches.length > 0 && matches.every((m) => m.isFinished);

    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'firestore',
      allFinished,
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] fetchFixtures error:', err.message);
    return _emptyResult('FIRESTORE');
  }
};

export const fetchYesterdayFixtures = () => fetchFixtures(yesterdayStr());
export const fetchTomorrowFixtures = () => fetchFixtures(tomorrowStr());

function _getMatchesForDate(snapshot, date) {
  const raw = [];
  const yd = yesterdayStr();
  const td = todayStr();
  const tm = tomorrowStr();

  if (date === yd) raw.push(...(snapshot.yesterday || []));
  else if (date === tm) raw.push(...(snapshot.tomorrow || []));
  else raw.push(...(snapshot.today || []));

  // Also include live and finished that match the date
  (snapshot.live || []).forEach((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    if (md === date) raw.push(m);
  });
  (snapshot.finished || []).forEach((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    if (md === date) raw.push(m);
  });

  return raw.map((d) => transformMatch(d));
}

export const fetchFinishedFixtures = async () => {
  try {
    const snapshot = await dataLayer.fetchFootballSnapshot(todayStr());
    if (!snapshot) return [];
    return (snapshot.finished || []).map((d) => transformMatch(d))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
};

export const fetchLiveScores = async () => {
  try {
    const snapshot = await dataLayer.fetchFootballSnapshot(todayStr());
    if (!snapshot) return { matches: [], error: null };
    return {
      matches: (snapshot.live || []).map((d) => transformMatch(d)),
      error: null,
    };
  } catch (err) {
    return { matches: [], error: err.message };
  }
};

/* ═══════════════════════════════════════════════════
   ★ FOOTBALL: Live polling — reads from dataLayer cache
   ═══════════════════════════════════════════════════
   ★ No backend REST calls. Reads from dataLayer's
     in-memory/localStorage cache. Only hits Firestore
     when cache is expired (1 read per 5-30 min per browser).
   ═══════════════════════════════════════════════════ */

export const subscribeToLiveFixtures = (callback) => {
  return _createDataLayerPollingSubscription(
    'football',
    callback,
    { activeMs: 30000, idleMs: 300000 }
  );
};

export const subscribeToTodayFixtures = (callback) => {
  return _createDataLayerPollingSubscription(
    'football',
    callback,
    { activeMs: 60000, idleMs: 300000, includeToday: true }
  );
};

/**
 * Polling subscription that reads from dataLayer (not REST API).
 * dataLayer's cache means most polls are 0-cost (memory or localStorage hit).
 * Only 1 Firestore read per cache expiry per browser.
 */
function _createDataLayerPollingSubscription(sport, callback, options = {}) {
  const {
    activeMs = 30000,
    idleMs = 300000,
    includeToday = false,
  } = options;

  let timer = null;
  let active = false;
  let currentMatches = [];
  let errorCount = 0;

  const onVisibilityChange = () => {
    if (document.hidden && timer) {
      clearTimeout(timer);
      timer = null;
    } else if (!document.hidden && active && !timer) {
      timer = setTimeout(poll, activeMs);
    }
  };

  const poll = async () => {
    if (!active) return;
    if (document.hidden) {
      timer = setTimeout(poll, idleMs);
      return;
    }

    try {
      // Invalidate memory cache to force a fresh check
      // (localStorage still serves as fallback if Firestore is slow)
      const dateStr = todayStr();
      dataLayer.invalidate(`snap:${sport === 'basketball' ? 'bb' : 'ft'}:${dateStr}`);

      let snapshot;
      if (sport === 'basketball') {
        snapshot = await dataLayer.fetchBasketballSnapshot(dateStr);
      } else {
        snapshot = await dataLayer.fetchFootballSnapshot(dateStr);
      }

      errorCount = 0;

      const liveMatches = (snapshot?.live || []).map((d) => transformMatch(d));

      let allMatches = liveMatches;
      if (includeToday) {
        const todayMatches = (snapshot?.today || []).map((d) => transformMatch(d));
        allMatches = [...liveMatches, ...todayMatches];
      }

      currentMatches = allMatches;
      const hasLive = liveMatches.length > 0;
      const liveCount = liveMatches.length;

      callback({
        matches: allMatches,
        hasLive,
        liveCount,
        error: null,
      });

      const nextMs = hasLive ? activeMs : idleMs;
      if (active) timer = setTimeout(poll, nextMs);

    } catch (err) {
      errorCount++;
      console.warn(`[Poll] ${sport} error (${errorCount}):`, err.message);

      callback({
        matches: currentMatches,
        hasLive: false,
        liveCount: 0,
        error: err.message,
      });

      const backoffMs = idleMs * Math.min(errorCount, 5);
      if (active) timer = setTimeout(poll, backoffMs);
    }
  };

  active = true;
  document.addEventListener('visibilitychange', onVisibilityChange);
  poll();

  return () => {
    active = false;
    if (timer) { clearTimeout(timer); timer = null; }
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/* ═══════════════════════════════════════════════════
   ★ BASKETBALL: Fetch fixtures via dataLayer
   ═══════════════════════════════════════════════════ */

export const fetchBasketballFixtures = async (date) => {
  if (!isInWindow(date)) return _emptyResult(null);

  try {
    const snapshot = await dataLayer.fetchBasketballSnapshot(date);

    if (!snapshot) return _emptyResult(null);

    const matches = _getBasketballMatchesForDate(snapshot, date);
    const allFinished = matches.length > 0 && matches.every((m) => m.isFinished);

    return {
      matches,
      error: null,
      fromCache: true,
      isStale: false,
      forceFailed: false,
      cacheSource: 'firestore',
      allFinished,
      isRolloverWindow: isInRolloverWindow(),
    };
  } catch (err) {
    console.warn('[Data] fetchBasketballFixtures error:', err.message);
    return _emptyResult('FIRESTORE');
  }
};

export const fetchBasketballYesterdayFixtures = () => fetchBasketballFixtures(yesterdayStr());
export const fetchBasketballTomorrowFixtures = () => fetchBasketballFixtures(tomorrowStr());

function _getBasketballMatchesForDate(snapshot, date) {
  const raw = [];
  const yd = yesterdayStr();
  const tm = tomorrowStr();

  if (date === yd) raw.push(...(snapshot.yesterday || []));
  else if (date === tm) raw.push(...(snapshot.tomorrow || []));
  else raw.push(...(snapshot.today || []));

  (snapshot.live || []).forEach((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    if (md === date) raw.push(m);
  });
  (snapshot.finished || []).forEach((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    if (md === date) raw.push(m);
  });

  return raw.map((d) => transformMatch(d));
}

export const fetchBasketballFinishedFixtures = async () => {
  try {
    const snapshot = await dataLayer.fetchBasketballSnapshot(todayStr());
    if (!snapshot) return [];
    return (snapshot.finished || []).map((d) => transformMatch(d))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch {
    return [];
  }
};

export const fetchBasketballLiveScores = async () => {
  try {
    const snapshot = await dataLayer.fetchBasketballSnapshot(todayStr());
    if (!snapshot) return { matches: [], error: null };
    return {
      matches: (snapshot.live || []).map((d) => transformMatch(d)),
      error: null,
    };
  } catch (err) {
    return { matches: [], error: err.message };
  }
};

export const subscribeToBasketballLiveFixtures = (callback) => {
  return _createDataLayerPollingSubscription('basketball', callback, {
    activeMs: 30000,
    idleMs: 300000,
  });
};

export const subscribeToBasketballTodayFixtures = (callback) => {
  return _createDataLayerPollingSubscription('basketball', callback, {
    activeMs: 60000,
    idleMs: 300000,
    includeToday: true,
  });
};

/* ═══════════════════════════════════════════════════
   STANDINGS (via dataLayer single-doc reads)
   ═══════════════════════════════════════════════════ */

export const fetchLeagueStandings = async (leagueId) => {
  try {
    const allData = await dataLayer.fetchStandings('football');
    const leagueDoc = allData.find(
      (doc) => String(doc.leagueId || doc.id) === String(leagueId)
    );
    return leagueDoc?.standings || [];
  } catch {
    return [];
  }
};

export const fetchBasketballLeagueStandings = async (leagueId) => {
  try {
    const allData = await dataLayer.fetchStandings('basketball');
    const leagueDoc = allData.find(
      (doc) => String(doc.leagueId || doc.id) === String(leagueId)
    );
    return leagueDoc?.standings || [];
  } catch {
    return [];
  }
};

/* ═══════════════════════════════════════════════════
   LEAGUES (via dataLayer single-doc reads)
   ═══════════════════════════════════════════════════ */

export const fetchLeagues = async (sport = 'football') => {
  try {
    return await dataLayer.fetchLeagues(sport);
  } catch {
    return [];
  }
};

/* ═══════════════════════════════════════════════════
   TEAM FIXTURES (from cached snapshot)
   ═══════════════════════════════════════════════════ */

export const fetchTeamFixtures = async (teamId) => {
  try {
    const [ySnap, tSnap, tmSnap] = await Promise.all([
      dataLayer.fetchFootballSnapshot(yesterdayStr()),
      dataLayer.fetchFootballSnapshot(todayStr()),
      dataLayer.fetchFootballSnapshot(tomorrowStr()),
    ]);

    const tid = String(teamId);
    const allRaw = [
      ...(ySnap?.yesterday || []),
      ...(tSnap?.today || []),
      ...(tSnap?.live || []),
      ...(tSnap?.finished || []),
      ...(tmSnap?.tomorrow || []),
    ];

    return allRaw
      .filter((m) => String(m.homeTeamId) === tid || String(m.awayTeamId) === tid)
      .map((d) => transformMatch(d))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
  } catch {
    return [];
  }
};

export const fetchBasketballTeamFixtures = async (teamId) => {
  try {
    const [ySnap, tSnap, tmSnap] = await Promise.all([
      dataLayer.fetchBasketballSnapshot(yesterdayStr()),
      dataLayer.fetchBasketballSnapshot(todayStr()),
      dataLayer.fetchBasketballSnapshot(tomorrowStr()),
    ]);

    const tid = String(teamId);
    const allRaw = [
      ...(ySnap?.yesterday || []),
      ...(tSnap?.today || []),
      ...(tSnap?.live || []),
      ...(tSnap?.finished || []),
      ...(tmSnap?.tomorrow || []),
    ];

    return allRaw
      .filter((m) => String(m.homeTeamId) === tid || String(m.awayTeamId) === tid)
      .map((d) => transformMatch(d))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 10);
  } catch {
    return [];
  }
};

/* ═══════════════════════════════════════════════════
   BACKEND STATUS (now reads from snapshot metadata)
   ═══════════════════════════════════════════════════ */

export const fetchBackendStatus = async () => {
  try {
    const snap = await dataLayer.fetchFootballSnapshot(todayStr());
    if (!snap) return null;

    const updatedAt = snap.updatedAt;
    const fetchDone = updatedAt?.startsWith(todayStr()) ?? false;

    return {
      football: {
        status: fetchDone ? 'complete' : 'pending',
        fetchedAt: updatedAt || null,
        fetchDone,
        lastDailyFetchDate: updatedAt ? updatedAt.split('T')[0] : null,
      },
      basketball: null, // Would need basketball snapshot check too
      _raw: snap,
      fetchedAt: new Date().toISOString(),
      isRolloverWindow: isInRolloverWindow(),
      budget: null, // No longer tracking API budget on frontend
    };
  } catch {
    return null;
  }
};

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

/* ═══════════════════════════════════════════════════
   STUBS / COMPATIBILITY
   ═══════════════════════════════════════════════════ */

export const fetchMatchEvents = async () => ({ events: [], error: null, fromCache: 'firestore' });
export const fetchMatchLineups = async () => ({ lineups: [], error: null, fromCache: 'firestore' });
export const fetchMatchStatistics = async () => ({ statistics: [], error: null, fromCache: 'firestore' });

export const loadFixturesFromAnyCache = async (date) => {
  const res = await fetchFixtures(date);
  return res.matches.length > 0
    ? { matches: res.matches, source: 'firestore', stale: false, allFinished: res.allFinished }
    : null;
};

export const loadCachedFixtures = () => null;
export const getCachedDatesSync = () => [];
export const getCombinedCachedDates = async () => [];
export const getCacheStatus = () => null;
export const getCacheStats = () => {
  const stats = dataLayer.getStats();
  return { dates: 0, total: 0, finished: 0, cachedDates: [], ...stats };
};

export const clearAllCache = () => dataLayer.clear();

export const getQuotaStatus = () => ({
  used: 0, limit: 99999, remaining: 99999,
  percent: 0, date: '', isToday: false,
  blocked: false, hardBlocked: false,
});

export const LIVE_POLL_ACTIVE = 30000;
export const LIVE_POLL_IDLE = 300000;
export const LIVE_POLL_BLOCKED = 600000;
export const getLivePollInterval = () => LIVE_POLL_ACTIVE;

export const dailySyncToFirestore = async () => ({ done: true, skipped: true, reason: 'SNAPSHOTS' });
export const syncDateToFirestore = async () => false;
export const getLastSyncStatus = () => null;

export const isBackendReachable = () => true;
export const getBackendFailCount = () => 0;

export const initApp = async () => {
  await waitForAuth();
  initFirebaseSync();
};

/* ═══════════════════════════════════════════════════
   INTERNAL HELPERS
   ═══════════════════════════════════════════════════ */

function _emptyResult(error = null) {
  return {
    matches: [],
    error,
    fromCache: true,
    isStale: false,
    forceFailed: false,
    cacheSource: 'firestore',
    allFinished: false,
    isRolloverWindow: isInRolloverWindow(),
  };
}