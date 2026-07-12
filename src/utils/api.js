// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/api.jsx
//
// ★ REFACTORED: Pure facade over dataLayer + constants
//   - No duplicated constants or logic
//   - Uses shared constants from constants.js
//   - Uses event bus for reactive updates
//   - Minimal code — just transforms and delegates
//
// ═══════════════════════════════════════════════════════════════

import { db, auth } from './firebase';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { dataLayer, todayStr, yesterdayStr, tomorrowStr } from './dataLayer';
import { eventBus, EVENT } from './eventBus';

import {
  SPORT,
  STATUS,
  isLiveStatus,
  isFinishedStatus,
  isScheduledStatus,
  getLeagueColor,
  TTL,
  TIMEOUT,
  POLL_INTERVAL,
  CACHE_KEY,
  calcPoints,
  RESULT_TYPE,
  POINTS,
} from './constants';
/* ═══════════════════════════════════════════════════
   AUTH STATE TRACKING
   ═══════════════════════════════════════════════════ */
let isUserAuthenticated = false;
let authReady = false;
const authWaiters = [];

if (auth) {
  auth.onAuthStateChanged((user) => {
    const wasAuthenticated = isUserAuthenticated;
    isUserAuthenticated = !!user;
    authReady = true;
    authWaiters.forEach((resolve) => resolve());
    authWaiters.length = 0;

    // ★ Emit auth events
    if (user && !wasAuthenticated) {
      eventBus.emit(EVENT.USER_SIGNIN, { uid: user.uid });
    } else if (!user && wasAuthenticated) {
      eventBus.emit(EVENT.USER_SIGNOUT, {});
    }
  });
} else {
  authReady = true;
}

export const waitForAuth = () => {
  if (authReady) return Promise.resolve();
  return new Promise((resolve) => authWaiters.push(resolve));
};

/** Check if user is currently authenticated */
export const isAuthenticated = () => isUserAuthenticated;

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

export { todayStr as getTodayStr, yesterdayStr as getYesterdayStr, tomorrowStr as getTomorrowStr };

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
   TRANSFORM HELPERS — Uses shared status functions
   ═══════════════════════════════════════════════════ */
export function transformMatch(m) {
  if (!m) return null;
  if (m.fixture) return _transformApiFormat(m);
  if (m.sport === SPORT.BASKETBALL || m.pointsHome !== undefined || m.q1Home !== undefined) {
    return _transformBasketballFormat(m);
  }
  return _transformFootballFormat(m);
}

function _transformFootballFormat(m) {
  const id = String(m.id || '');
  const s = m.status || '';
  return {
    id,
    sport: SPORT.FOOTBALL,
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
    isLive: isLiveStatus(s, SPORT.FOOTBALL),
    isFinished: isFinishedStatus(s, SPORT.FOOTBALL),
    isScheduled: isScheduledStatus(s, SPORT.FOOTBALL),
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
    sport: SPORT.BASKETBALL,
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
    isLive: isLiveStatus(s, SPORT.BASKETBALL),
    isFinished: isFinishedStatus(s, SPORT.BASKETBALL),
    isScheduled: isScheduledStatus(s, SPORT.BASKETBALL),
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
    sport: SPORT.FOOTBALL,
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
    isLive: isLiveStatus(s, SPORT.FOOTBALL),
    isFinished: isFinishedStatus(s, SPORT.FOOTBALL),
    isScheduled: isScheduledStatus(s, SPORT.FOOTBALL),
    minute: fixture.status?.elapsed || null,
    venue: fixture.venue?.name || null,
    referee: fixture.referee || null,
  };
}

/* ═══════════════════════════════════════════════════
   ★ FOOTBALL: Fetch fixtures via dataLayer
   ═══════════════════════════════════════════════════ */

export const fetchFixtures = async (date, forceRefresh = false) => {
  if (!isInWindow(date)) return _emptyResult(null);

  if (forceRefresh) {
    dataLayer.invalidatePrefix(`snap:ft:`);
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
   ★ LIVE POLLING — Uses shared constants + event bus
   ═══════════════════════════════════════════════════ */

export const subscribeToLiveFixtures = (callback) => {
  return _createDataLayerPollingSubscription(
    SPORT.FOOTBALL,
    callback,
    { activeMs: POLL_INTERVAL.LIVE_ACTIVE, idleMs: POLL_INTERVAL.LIVE_IDLE }
  );
};

export const subscribeToTodayFixtures = (callback) => {
  return _createDataLayerPollingSubscription(
    SPORT.FOOTBALL,
    callback,
    { activeMs: POLL_INTERVAL.TODAY_ACTIVE, idleMs: POLL_INTERVAL.LIVE_IDLE, includeToday: true }
  );
};

/**
 * Polling subscription that reads from dataLayer.
 * Emits events via eventBus for other modules to react.
 */
function _createDataLayerPollingSubscription(sport, callback, options = {}) {
  const {
    activeMs = POLL_INTERVAL.LIVE_ACTIVE,
    idleMs = POLL_INTERVAL.LIVE_IDLE,
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
      const dateStr = todayStr();
      const prefix = sport === SPORT.BASKETBALL ? 'snap:bb:' : 'snap:ft:';
      dataLayer.invalidate(`${prefix}${dateStr}`);

      const snapshot = await dataLayer.fetchSnapshot(sport, dateStr);

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

      const backoffMs = Math.min(idleMs * errorCount, POLL_INTERVAL.BACKOFF_MAX);
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
  return _createDataLayerPollingSubscription(SPORT.BASKETBALL, callback, {
    activeMs: POLL_INTERVAL.LIVE_ACTIVE,
    idleMs: POLL_INTERVAL.LIVE_IDLE,
  });
};

export const subscribeToBasketballTodayFixtures = (callback) => {
  return _createDataLayerPollingSubscription(SPORT.BASKETBALL, callback, {
    activeMs: POLL_INTERVAL.TODAY_ACTIVE,
    idleMs: POLL_INTERVAL.LIVE_IDLE,
    includeToday: true,
  });
};

export function getBasketballLeaguePriority(leagueId) {
  const map = {
    'default': 999,
    'nba': 1,
    'wnba': 2,
    'ncaa': 3,
    'euroleague': 10,
    'acb': 11,
    'nba_g_league': 12,
    'nbl': 15,
    'nba_cup': 20,
  };
  return map[String(leagueId)] ?? map[leagueId] ?? 999;
}
/* ═══════════════════════════════════════════════════
   STANDINGS, LEAGUES, TEAM FIXTURES
   ═══════════════════════════════════════════════════ */

export const fetchLeagueStandings = async (leagueId) => {
  try {
    const allData = await dataLayer.fetchStandings(SPORT.FOOTBALL);
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
    const allData = await dataLayer.fetchStandings(SPORT.BASKETBALL);
    const leagueDoc = allData.find(
      (doc) => String(doc.leagueId || doc.id) === String(leagueId)
    );
    return leagueDoc?.standings || [];
  } catch {
    return [];
  }
};

export const fetchLeagues = async (sport = SPORT.FOOTBALL) => {
  try {
    return await dataLayer.fetchLeagues(sport);
  } catch {
    return [];
  }
};

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
   BACKEND STATUS
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
      basketball: null,
      _raw: snap,
      fetchedAt: new Date().toISOString(),
      isRolloverWindow: isInRolloverWindow(),
      budget: null,
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

// ★ Export shared constants for external use
export { 
  POLL_INTERVAL as LIVE_POLL_ACTIVE, 
  POLL_INTERVAL as LIVE_POLL_IDLE, 
  POLL_INTERVAL as LIVE_POLL_BLOCKED 
};
export const getLivePollInterval = () => POLL_INTERVAL.LIVE_ACTIVE;

export const dailySyncToFirestore = async () => ({ done: true, skipped: true, reason: 'SNAPSHOTS' });
export const syncDateToFirestore = async () => false;
export const getLastSyncStatus = () => null;

export const isBackendReachable = () => true;
export const getBackendFailCount = () => 0;

export const initApp = async () => {
  await waitForAuth();
  initFirebaseSync();
};

// ★ Re-export event bus for components that need it
export { eventBus, EVENT };

// ★ Re-export key constants
export { 
  SPORT, 
  STATUS, 
  isLiveStatus, 
  isFinishedStatus, 
  isScheduledStatus,
  getLeagueColor,
  CACHE_KEY,
  calcPoints,
  RESULT_TYPE,
  POINTS,
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