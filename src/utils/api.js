// ═══════════════════════════════════════════════════════════════════════════
// FILE: src/utils/api.jsx
//
// DATA LAYER — Reads from Node.js backend REST API (NOT Firestore directly)
//
// Architecture:
//   Backend (24/7) → API-Football/Basketball → Firestore → REST API → This file → React
//
// ★ BUDGET FIX: Previous version read Firestore directly from every client.
//   1,000 users × 6 collections × 10 polls/day = 60,000 Firestore reads/day
//   → EXHAUSTS 50K free plan limit
//
//   New version calls backend REST endpoints which have server-side caching.
//   1,000 users × same traffic = ~144 Firestore reads/day (99.8% reduction)
//
// NO API keys needed in frontend.
// NO direct Firestore collection reads for fixture data.
// Backend cache IS the buffer.
//
// Firestore is STILL used for:
//   - User favorites/preferences (per-user, ~2 reads/day)
//   - Auth state
//   These are negligible on the quota.
//
// ★ BACKEND-DOWN RESILIENCE: When backend is unreachable, stale cached data
//   is returned instead of empty arrays. Fixtures remain visible. Polling
//   automatically backs off to avoid hammering a dead server.
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

/* ═══════════════════════════════════════════════════════════════
   BACKEND API CONFIG
   ═══════════════════════════════════════════════════════════════ */
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3099';

/* ═══════════════════════════════════════════════════════════════
   FRONTEND IN-MEMORY CACHE
   ═══════════════════════════════════════════════════════════════
   Doubles as a second cache layer. Prevents duplicate fetches
   when multiple components request the same data simultaneously.

   Backend cache: 10-30s TTL (survives across all users)
   Frontend cache: 5-15s TTL (per-tab, instant response)

   ★ KEY CHANGE: Expired entries are NOT deleted immediately.
   They persist as "stale" data that can be returned when the
   backend is unreachable, preventing fixture wipeout.
   A periodic cleanup removes entries older than 10 minutes.
   ═══════════════════════════════════════════════════════════════ */
const _memCache = new Map();

/**
 * Get fresh (non-expired) cache entry.
 * Returns `undefined` if missing or expired.
 * Does NOT delete expired entries — they stay for stale fallback.
 */
function memGet(key, ttl) {
  const entry = _memCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > ttl) {
    // ★ DON'T DELETE — stale entry may be needed as fallback
    // when backend is unreachable.
    return undefined;
  }
  return entry.data;
}

/**
 * Get stale cache entry regardless of TTL.
 * Used only by apiFetch error handler as last-resort fallback.
 */
function memGetStale(key) {
  const entry = _memCache.get(key);
  return entry ? entry.data : undefined;
}

function memSet(key, data, ttl) {
  _memCache.set(key, { data, ts: Date.now(), ttl });
}

function memInvalidate(key) {
  _memCache.delete(key);
}

function memInvalidatePrefix(prefix) {
  for (const k of _memCache.keys()) {
    if (k.startsWith(prefix)) _memCache.delete(k);
  }
}

/* ═══════════════════════════════════════════════════════════════
   PERIODIC CACHE CLEANUP
   ═══════════════════════════════════════════════════════════════
   Since we no longer delete expired entries in memGet, we need
   periodic cleanup to prevent unbounded memory growth.
   Removes entries older than 10 minutes (stale beyond usefulness).
   ═══════════════════════════════════════════════════════════════ */
const STALE_MAX_AGE = 10 * 60 * 1000; // 10 minutes

if (typeof globalThis !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of _memCache.entries()) {
      if (now - entry.ts > STALE_MAX_AGE) {
        _memCache.delete(key);
      }
    }
  }, 60_000); // Check every minute
}

/* ═══════════════════════════════════════════════════════════════
   BACKEND HEALTH TRACKING
   ═══════════════════════════════════════════════════════════════
   Tracks whether the backend is reachable. Used by:
   - Polling subscriptions to back off when backend is down
   - Optional UI indicator ("offline" badge)
   ═══════════════════════════════════════════════════════════════ */
let _backendOk = true;
let _backendConsecutiveFails = 0;
const BACKEND_FAIL_THRESHOLD = 2; // After 2 fails, consider backend down

/** Check if backend was recently reachable. For optional UI use. */
export function isBackendReachable() {
  return _backendOk;
}

/** Get count of consecutive backend failures. */
export function getBackendFailCount() {
  return _backendConsecutiveFails;
}

/* ═══════════════════════════════════════════════════════════════
   API FETCH HELPER
   ═══════════════════════════════════════════════════════════════
   ★ KEY CHANGE: On network error, returns stale cached data
   instead of empty fallback. This prevents fixtures from being
   wiped when the backend is temporarily unreachable.
   ═══════════════════════════════════════════════════════════════ */

async function apiFetch(path, options = {}) {
  const { ttl = 5000, cacheKey = null, fallback = [] } = options;

  const key = cacheKey || path;

  // Check fresh cache first (respects TTL)
  const cached = memGet(key, ttl);
  if (cached !== undefined) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    // Store in frontend cache
    memSet(key, data, ttl);

    // ★ Backend is healthy — reset fail counter
    _backendOk = true;
    _backendConsecutiveFails = 0;

    return data;
  } catch (err) {
    // ★ Track backend failure
    _backendConsecutiveFails++;
    if (_backendConsecutiveFails >= BACKEND_FAIL_THRESHOLD) {
      _backendOk = false;
    }

    // ★ FIRST: Try stale cache (ignores TTL — this is the key fix)
    // If we have ANY previous data for this key, return it.
    // This prevents fixtures from being wiped to [].
    const stale = memGetStale(key);
    if (stale !== undefined) {
      console.warn(`[API] Backend unreachable for ${path}, using stale cache (${_backendConsecutiveFails} consecutive fails)`);
      return stale;
    }

    // ★ SECOND: No stale data at all (first visit, backend never worked)
    // Return fallback only as absolute last resort
    console.warn(`[API] Backend unreachable for ${path}, no stale cache available`);
    if (Array.isArray(fallback)) return fallback;
    return fallback;
  }
}

/* ═══════════════════════════════════════════════════════════════
   AUTH STATE TRACKING (unchanged)
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
   DEVICE ID & LOCAL STORAGE HELPERS (unchanged)
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
   FAVORITES & PREFERENCES (unchanged — per-user Firestore writes)
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
   LEAGUE COLORS (unchanged)
   ═══════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════
   STATUS CONSTANTS (unchanged)
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
   BASKETBALL LEAGUE PRIORITY (unchanged)
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
   DATE / TIME HELPERS (unchanged)
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

export function isInRolloverWindow() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  return (utcHour === 2 && utcMinute >= 55) || (utcHour === 3 && utcMinute < 10);
}

/* ═══════════════════════════════════════════════════════════════
   API PATH MAP
   ═══════════════════════════════════════════════════════════════ */
const API_PATHS = {
  LIVE: '/api/fixtures/live',
  YESTERDAY: '/api/fixtures/yesterday',
  TODAY: '/api/fixtures/today',
  TOMORROW: '/api/fixtures/tomorrow',
  FINISHED: '/api/fixtures/finished',
  STANDINGS: '/api/standings',
  LEAGUES: '/api/leagues',
  TEAMS: '/api/teams',

  BASKETBALL_LIVE: '/api/basketball/live',
  BASKETBALL_YESTERDAY: '/api/basketball/yesterday',
  BASKETBALL_TODAY: '/api/basketball/today',
  BASKETBALL_TOMORROW: '/api/basketball/tomorrow',
  BASKETBALL_FINISHED: '/api/basketball/finished',
  BASKETBALL_STANDINGS: '/api/basketball/standings',
  BASKETBALL_LEAGUES: '/api/basketball/leagues',
  BASKETBALL_TEAMS: '/api/basketball/teams',

  HEALTH: '/health',
};

/* ═══════════════════════════════════════════════════════════════
   TRANSFORM HELPERS (unchanged)
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
   INTERNAL: Read from backend API
   ═══════════════════════════════════════════════════════════════ */
async function _readCollection(apiPath, ttl = 5000) {
  const rawDocs = await apiFetch(apiPath, { ttl, fallback: [] });
  return rawDocs.map((d) => transformMatch(d));
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
   ═══════════════════════════════════════════════════════════════ */
async function _readDayFixtures(yesterdayPath, todayPath, tomorrowPath, date) {
  const yesterdayStr = getYesterdayStr();
  const tomorrowStr = getTomorrowStr();

  let primaryPath = todayPath;
  if (date === yesterdayStr) primaryPath = yesterdayPath;
  else if (date === tomorrowStr) primaryPath = tomorrowPath;

  const ttl = (date === getTodayStr()) ? 5000 : 30000;
  const primary = await _readCollection(primaryPath, ttl);
  const filtered = primary.filter((m) => {
    const md = m.date ? m.date.split('T')[0] : '';
    return md === date;
  });

  if (filtered.length > 0) return filtered;

  // Fallback: check all 3 (cached on backend, so ~0 cost)
  const all = await Promise.all([
    _readCollection(yesterdayPath, 30000),
    _readCollection(todayPath, 5000),
    _readCollection(tomorrowPath, 30000),
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
  if (!isInWindow(date)) return _emptyResult(null);

  if (forceRefresh) {
    memInvalidatePrefix('/api/fixtures/');
  }

  try {
    const matches = await _readDayFixtures(
      API_PATHS.YESTERDAY,
      API_PATHS.TODAY,
      API_PATHS.TOMORROW,
      date
    );
    return {
      matches,
      error: null,
      fromCache: true,
      isStale: !_backendOk,
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
  try {
    const matches = await _readCollection(API_PATHS.FINISHED, 30000);
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
  try {
    const matches = await _readCollection(API_PATHS.LIVE, 5000);
    return { matches, error: null };
  } catch (err) {
    return { matches: [], error: err.message };
  }
};

/* ═══════════════════════════════════════════════════════════════
   ★ FOOTBALL: Real-time subscriptions (polling-based)
   ═══════════════════════════════════════════════════════════════
   ★ KEY CHANGE: When backend is down, uses slower polling interval
   to avoid hammering a dead server with 8s timeout requests.
   Stale data flows through naturally — callback receives same data,
   React bails out of re-render since state is identical.
   ═══════════════════════════════════════════════════════════════ */

export const subscribeToLiveFixtures = (callback) => {
  return _createPollingSubscription(
    API_PATHS.LIVE,
    callback,
    { activeMs: 10000, idleMs: 60000, errorMs: 30000 }
  );
};

export const subscribeToTodayFixtures = (callback) => {
  return _createPollingSubscription(
    API_PATHS.TODAY,
    callback,
    { activeMs: 30000, idleMs: 120000, errorMs: 30000, isLive: false }
  );
};

/**
 * Generic polling subscription factory.
 * Mimics onSnapshot API: calls callback immediately, then on interval.
 * Returns unsubscribe function.
 *
 * ★ When backend is unreachable (isBackendReachable() === false),
 *   uses errorMs interval instead of activeMs/idleMs to reduce
 *   wasted 8-second timeout requests.
 */
function _createPollingSubscription(path, callback, options = {}) {
  const {
    activeMs = 10000,
    idleMs = 60000,
    errorMs = 30000,
    isLive = true,
  } = options;

  let timer = null;
  let active = false;
  let currentMatches = [];
  let errorCount = 0;

  const poll = async () => {
    if (!active) return;

    try {
      const ttl = isLive ? 8000 : 25000;
      const rawDocs = await apiFetch(path, { ttl, fallback: [] });
      currentMatches = rawDocs.map((d) => transformMatch(d));
      errorCount = 0;

      const hasLive = isLive
        ? currentMatches.length > 0
        : currentMatches.some((m) => m.isLive);
      const liveCount = currentMatches.filter((m) => m.isLive).length;

      callback({
        matches: currentMatches,
        hasLive,
        liveCount,
        error: null,
      });

      // ★ Adaptive interval: fast when live, slow when idle,
      // even slower when backend is unreachable
      let nextMs;
      if (!_backendOk && errorCount === 0) {
        // Backend seems down but we got stale data (no error thrown)
        // Use error interval to back off
        nextMs = errorMs;
      } else {
        nextMs = hasLive ? activeMs : idleMs;
      }

      if (active) timer = setTimeout(poll, nextMs);

    } catch (err) {
      errorCount++;
      console.warn(`[Poll] ${path} error (${errorCount}):`, err.message);

      callback({
        matches: currentMatches, // Return last known data
        hasLive: false,
        liveCount: 0,
        error: err.message,
      });

      // Back off on errors
      const backoffMs = errorMs * Math.min(errorCount, 3);
      if (active) timer = setTimeout(poll, backoffMs);
    }
  };

  active = true;
  poll();

  return () => {
    active = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Fetch by day
   ═══════════════════════════════════════════════════════════════ */
export const fetchBasketballFixtures = async (date) => {
  if (!isInWindow(date)) return _emptyResult(null);

  try {
    const matches = await _readDayFixtures(
      API_PATHS.BASKETBALL_YESTERDAY,
      API_PATHS.BASKETBALL_TODAY,
      API_PATHS.BASKETBALL_TOMORROW,
      date
    );
    return {
      matches,
      error: null,
      fromCache: true,
      isStale: !_backendOk,
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
  try {
    const matches = await _readCollection(API_PATHS.BASKETBALL_FINISHED, 30000);
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
  try {
    const matches = await _readCollection(API_PATHS.BASKETBALL_LIVE, 5000);
    return { matches, error: null };
  } catch (err) {
    return { matches: [], error: err.message };
  }
};

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL: Real-time subscriptions (polling-based)
   ═══════════════════════════════════════════════════════════════ */
export const subscribeToBasketballLiveFixtures = (callback) => {
  return _createPollingSubscription(
    API_PATHS.BASKETBALL_LIVE,
    callback,
    { activeMs: 10000, idleMs: 60000, errorMs: 30000 }
  );
};

export const subscribeToBasketballTodayFixtures = (callback) => {
  return _createPollingSubscription(
    API_PATHS.BASKETBALL_TODAY,
    callback,
    { activeMs: 30000, idleMs: 120000, errorMs: 30000, isLive: false }
  );
};

/* ═══════════════════════════════════════════════════════════════
   STANDINGS (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagueStandings = async (leagueId) => {
  try {
    const allStandings = await apiFetch(API_PATHS.STANDINGS, {
      ttl: 600000,
      fallback: [],
    });
    const leagueDoc = allStandings.find(
      (doc) => String(doc.leagueId || doc.id) === String(leagueId)
    );
    return leagueDoc?.standings || [];
  } catch (err) {
    console.warn('[Data] Standings error:', err.message);
    return [];
  }
};

export const fetchBasketballLeagueStandings = async (leagueId) => {
  try {
    const allStandings = await apiFetch(API_PATHS.BASKETBALL_STANDINGS, {
      ttl: 600000,
      fallback: [],
    });
    const leagueDoc = allStandings.find(
      (doc) => String(doc.leagueId || doc.id) === String(leagueId)
    );
    return leagueDoc?.standings || [];
  } catch (err) {
    console.warn('[Data] Basketball standings error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUES (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export const fetchLeagues = async (sport = 'football') => {
  try {
    const path = sport === 'basketball' ? API_PATHS.BASKETBALL_LEAGUES : API_PATHS.LEAGUES;
    return await apiFetch(path, { ttl: 600000, fallback: [] });
  } catch (err) {
    console.warn('[Data] Leagues error:', err.message);
    return [];
  }
};

/* ═══════════════════════════════════════════════════════════════
   TEAM FIXTURES (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export const fetchTeamFixtures = async (teamId) => {
  try {
    const [yesterday, today, tomorrow, finished, live] = await Promise.all([
      _readCollection(API_PATHS.YESTERDAY, 30000),
      _readCollection(API_PATHS.TODAY, 5000),
      _readCollection(API_PATHS.TOMORROW, 30000),
      _readCollection(API_PATHS.FINISHED, 30000),
      _readCollection(API_PATHS.LIVE, 5000),
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
  try {
    const [yesterday, today, tomorrow, finished, live] = await Promise.all([
      _readCollection(API_PATHS.BASKETBALL_YESTERDAY, 30000),
      _readCollection(API_PATHS.BASKETBALL_TODAY, 5000),
      _readCollection(API_PATHS.BASKETBALL_TOMORROW, 30000),
      _readCollection(API_PATHS.BASKETBALL_FINISHED, 30000),
      _readCollection(API_PATHS.BASKETBALL_LIVE, 5000),
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
   BACKEND STATUS (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export const fetchBackendStatus = async () => {
  try {
    const health = await apiFetch(API_PATHS.HEALTH, {
      ttl: 30000,
      fallback: null,
    });

    if (!health) return null;

    const jobs = health.scheduler?.jobs || {};

    const parseJobStatus = (job) => {
      if (!job) return { status: 'unknown', fetchedAt: null };
      const result = job.lastResult || {};
      const todayStr = getTodayStr();
      const fetchDone = job.lastSync
        ? job.lastSync.startsWith(todayStr)
        : false;
      return {
        status: job.status === 'success' && fetchDone ? 'complete' : 'pending',
        fetchedAt: job.lastSync || null,
        rolloverYesterday: result.rolloverYesterday ?? null,
        rolloverToday: result.rolloverToday ?? null,
        recoveredFT: result.recoveredFT ?? null,
        fetchTotal: result.total ?? null,
        fetchWrites: result.writes ?? null,
        lastDailyFetchDate: job.lastSync ? job.lastSync.split('T')[0] : null,
        lastTomorrowDate: null,
        fetchDone,
      };
    };

    return {
      football: parseJobStatus(jobs.footballDailyFixtures),
      basketball: parseJobStatus(jobs.basketballDailyFixtures),
      _raw: { football: jobs.footballDailyFixtures, basketball: jobs.basketballDailyFixtures },
      fetchedAt: new Date().toISOString(),
      isRolloverWindow: isInRolloverWindow(),
      budget: health.budget || null,
    };
  } catch (err) {
    console.warn('[Data] Backend status error:', err.message);
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

/* ═══════════════════════════════════════════════════════════════
   MATCH DETAILS (stubs)
   ═══════════════════════════════════════════════════════════════ */
export const fetchMatchEvents = async () => ({ events: [], error: null, fromCache: 'backend' });
export const fetchMatchLineups = async () => ({ lineups: [], error: null, fromCache: 'backend' });
export const fetchMatchStatistics = async () => ({ statistics: [], error: null, fromCache: 'backend' });

/* ═══════════════════════════════════════════════════════════════
   CACHE COMPATIBILITY (unchanged)
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
export const clearAllCache = () => {
  _memCache.clear();
};

/* ═══════════════════════════════════════════════════════════════
   QUOTA COMPATIBILITY (unchanged)
   ═══════════════════════════════════════════════════════════════ */
export const getQuotaStatus = () => ({
  used: 0, limit: 99999, remaining: 99999,
  percent: 0, date: '', isToday: false,
  blocked: false, hardBlocked: false,
});

export const LIVE_POLL_ACTIVE = 10000;
export const LIVE_POLL_IDLE = 60000;
export const LIVE_POLL_BLOCKED = 600000;
export const getLivePollInterval = () => LIVE_POLL_ACTIVE;

/* ═══════════════════════════════════════════════════════════════
   SYNC COMPATIBILITY (no-ops)
   ═══════════════════════════════════════════════════════════════ */
export const dailySyncToFirestore = async () => ({ done: true, skipped: true, reason: 'BACKEND' });
export const syncDateToFirestore = async () => false;
export const getLastSyncStatus = () => null;

export const initApp = async () => {
  await waitForAuth();
  initFirebaseSync();
};