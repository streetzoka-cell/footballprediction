// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/api.jsx
// ★ RESTORED: Uses daily snapshot listener to avoid DB permission errors.
// ★ KEPT: 3-day UTC window fetch for true global timezone support.
// ═══════════════════════════════════════════════════════════════

import { db, auth } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { dataLayer } from './dataLayer';
import { todayStr, yesterdayStr, tomorrowStr, getLocalDateFromUtc, formatTime, isInRolloverWindow } from './dates';
import { eventBus, EVENT } from './eventBus';
import {
  SPORT, isLiveStatus, isFinishedStatus, isScheduledStatus,
  getLeagueColor, POLL_INTERVAL, CACHE_KEY, calcPoints, RESULT_TYPE, POINTS,
} from './constants';

export { todayStr, yesterdayStr, tomorrowStr, eventBus, EVENT, SPORT, isLiveStatus, isFinishedStatus, isScheduledStatus, getLeagueColor, CACHE_KEY, calcPoints, RESULT_TYPE, POINTS, dataLayer };

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
    if (user && !wasAuthenticated) eventBus.emit(EVENT.USER_SIGNIN, { uid: user.uid });
    else if (!user && wasAuthenticated) eventBus.emit(EVENT.USER_SIGNOUT, {});
  });
} else { authReady = true; }

export const waitForAuth = () => authReady ? Promise.resolve() : new Promise((resolve) => authWaiters.push(resolve));
export const isAuthenticated = () => isUserAuthenticated;

const getDeviceId = () => { let id = localStorage.getItem('fx_device_id'); if (!id) { id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`; localStorage.setItem('fx_device_id', id); } return id; };
const lsGet = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } };
const lsSet = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

export const getFavs = () => lsGet('fx_favs', []);
export const setFavs = (favs) => { lsSet('fx_favs', favs); pushToFb('favorites', favs); };
export const getPrefs = () => lsGet('fx_prefs', { sound: true, goals: true, cards: true, kickoff: true, lineups: true, notifications: false });
export const setPrefs = (prefs) => { lsSet('fx_prefs', prefs); pushToFb('prefs', prefs); };
export const addFav = (team) => { const favs = getFavs(); if (!favs.find((t) => t.id === team.id)) { favs.unshift({ ...team, addedAt: Date.now() }); setFavs(favs); } };
export const removeFav = (id) => setFavs(getFavs().filter((t) => t.id !== id));
export const isFav = (id) => getFavs().some((t) => t.id === id);

const getUserId = () => auth?.currentUser ? auth.currentUser.uid : getDeviceId();
const pushToFb = async (key, value) => { if (!db) return; await waitForAuth(); try { await setDoc(doc(db, 'users', getUserId()), { [key]: value, updatedAt: serverTimestamp() }, { merge: true }); } catch {} };

export const initFirebaseSync = async () => { if (!db) return; await waitForAuth(); try { const snap = await getDoc(doc(db, 'users', getUserId())); if (!snap.exists()) return; const data = snap.data(); if (data.favorites?.length > getFavs().length) lsSet('fx_favs', data.favorites); if (data.prefs) lsSet('fx_prefs', data.prefs); } catch {} };

export function transformMatch(m) {
  if (!m) return null;
  if (m.sport === SPORT.BASKETBALL || m.pointsHome !== undefined || m.q1Home !== undefined) return transformBasketball(m);
  return transformFootball(m);
}

function transformFootball(m) {
  const id = String(m.id || ''), s = m.status || '';
  return {
    id, sport: SPORT.FOOTBALL, date: m.date || null, kickoff: formatTime(m.date), timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD' }, awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD' },
    homeId: String(m.homeTeamId || ''), awayId: String(m.awayTeamId || ''), homeLogo: m.homeTeamLogo || null, awayLogo: m.awayTeamLogo || null,
    league: { id: String(m.leagueId || ''), name: m.leagueName || 'Other', color: getLeagueColor(m.leagueId), emblem: m.leagueLogo || null, country: m.leagueCountry || '', flag: m.leagueFlag || null, season: m.season || null, round: m.round || null },
    leagueKey: String(m.leagueId || 'OTHER'), leagueCountry: m.leagueCountry || '', status: s, rawStatus: s, statusLong: m.statusLong || '',
    homeScore: m.goalsHome ?? null, awayScore: m.goalsAway ?? null,
    score: { home: m.goalsHome ?? null, away: m.goalsAway ?? null, halfTime: { home: m.scoreHalftimeHome ?? null, away: m.scoreHalftimeAway ?? null }, fullTime: { home: m.scoreFulltimeHome ?? m.goalsHome ?? null, away: m.scoreFulltimeAway ?? m.goalsAway ?? null }, extraTime: { home: m.scoreExtratimeHome ?? null, away: m.scoreExtratimeAway ?? null }, penalties: { home: m.scorePenaltyHome ?? null, away: m.scorePenaltyAway ?? null } },
    isLive: isLiveStatus(s, SPORT.FOOTBALL), isFinished: isFinishedStatus(s, SPORT.FOOTBALL), isScheduled: isScheduledStatus(s, SPORT.FOOTBALL),
    minute: m.elapsed ?? null, venue: null, referee: null,
  };
}

function transformBasketball(m) {
  const id = String(m.id || ''), s = m.status || '', periodMap = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4', 5: 'OT' }, minute = m.currentPeriod ? (periodMap[m.currentPeriod] || s) : (s || null);
  return {
    id, sport: SPORT.BASKETBALL, date: m.date || null, kickoff: formatTime(m.date), timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD' }, awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD' },
    homeId: String(m.homeTeamId || ''), awayId: String(m.awayTeamId || ''), homeLogo: m.homeTeamLogo || null, awayLogo: m.awayTeamLogo || null,
    league: { id: String(m.leagueId || ''), name: m.leagueName || 'Other', color: getLeagueColor(m.leagueId), emblem: m.leagueLogo || null, country: m.leagueCountry || '', flag: null, season: m.season || null, round: null },
    leagueKey: String(m.leagueId || 'OTHER'), leagueCountry: m.leagueCountry || '', status: s, rawStatus: s, statusLong: m.statusLong || '',
    homeScore: m.pointsHome ?? null, awayScore: m.pointsAway ?? null,
    score: { home: m.pointsHome ?? null, away: m.pointsAway ?? null, halfTime: null, fullTime: { home: m.pointsHome ?? null, away: m.pointsAway ?? null }, extraTime: null, penalties: null, q1: { home: m.q1Home ?? null, away: m.q1Away ?? null }, q2: { home: m.q2Home ?? null, away: m.q2Away ?? null }, q3: { home: m.q3Home ?? null, away: m.q3Away ?? null }, q4: { home: m.q4Home ?? null, away: m.q4Away ?? null }, ot: { home: m.otHome ?? null, away: m.otAway ?? null } },
    isLive: isLiveStatus(s, SPORT.BASKETBALL), isFinished: isFinishedStatus(s, SPORT.BASKETBALL), isScheduled: isScheduledStatus(s, SPORT.BASKETBALL),
    minute, venue: null, referee: null,
  };
}

function extractMatches(snapshot) {
  if (!snapshot) return { matches: [], live: [], finished: [] };
  const live = (snapshot.live || []).map(transformMatch);
  const finished = (snapshot.finished || []).map(transformMatch);
  const scheduled = (snapshot.matches || []).map(transformMatch);
  const seenIds = new Set();
  const matches = [...live, ...finished, ...scheduled].filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });
  return { matches, live, finished };
}

function emptyResult(error = null) { return { matches: [], live: [], finished: [], error, updatedAt: null, isRolloverWindow: isInRolloverWindow() }; }

export async function fetchFixtures(dateStr, { forceRefresh = false } = {}) {
  if (forceRefresh) dataLayer.invalidatePrefix(`snap:ft:`);
  try {
    // ★ TIMEZONE FIX: Fetch 3 UTC dates to cover all local timezone boundaries
    const localDate = new Date(dateStr + "T12:00:00Z");
    const d1 = new Date(localDate.getTime() - 86400000).toISOString().split("T")[0];
    const d2 = dateStr;
    const d3 = new Date(localDate.getTime() + 86400000).toISOString().split("T")[0];
    
    const [s1, s2, s3] = await Promise.all([
      dataLayer.fetchFootballSnapshot(d1),
      dataLayer.fetchFootballSnapshot(d2),
      dataLayer.fetchFootballSnapshot(d3)
    ]);
    
    const allMatches = [
      ...(s1?.matches || []), ...(s1?.live || []), ...(s1?.finished || []),
      ...(s2?.matches || []), ...(s2?.live || []), ...(s2?.finished || []),
      ...(s3?.matches || []), ...(s3?.live || []), ...(s3?.finished || [])
    ];
    
    // Deduplicate
    const seen = new Set();
    const unique = allMatches.filter(m => {
      const id = String(m.id || m.matchId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    
    // Filter strictly by user's Local Date
    const filtered = unique.filter(m => getLocalDateFromUtc(m.date) === dateStr);
    
    // Transform matches so the frontend UI can read them properly
    const transformed = filtered.map(transformMatch).filter(Boolean);
    
    return { matches: transformed, live: [], finished: [], updatedAt: s2?.updatedAt || s1?.updatedAt || s3?.updatedAt, error: null, isRolloverWindow: isInRolloverWindow() };
  } catch (err) { return emptyResult(err.message); }
}

export const fetchYesterdayFixtures = () => fetchFixtures(yesterdayStr());
export const fetchTomorrowFixtures = () => fetchFixtures(tomorrowStr());
export async function fetchFinishedFixtures() { try { const snapshot = await dataLayer.fetchFootballSnapshot(todayStr()); return snapshot ? (snapshot.finished || []).map(transformMatch).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : []; } catch { return []; } }
export async function fetchLiveScores() { try { const snapshot = await dataLayer.fetchFootballSnapshot(todayStr()); return snapshot ? { matches: (snapshot.live || []).map(transformMatch), error: null } : { matches: [], error: null }; } catch (err) { return { matches: [], error: err.message }; } }

// ★ RESTORED: Uses daily snapshot listener to avoid DB permission errors.
// ★ UPGRADED: Accepts dateStr so it works for Yesterday/Today/Tomorrow tabs!
export function subscribeToLiveFixtures(dateStr, callback) {
  return dataLayer.subscribeFootballSnapshot(dateStr, (snapshot) => {
    if (!snapshot) return callback({ matches: [], live: [], finished: [], hasLive: false, liveCount: 0, error: null });
    const result = extractMatches(snapshot);
    callback({ matches: result.live, live: result.live, finished: result.finished, hasLive: result.live.length > 0, liveCount: result.live.length, error: null });
  });
}

export function subscribeToTodayFixtures(callback) {
  const dateStr = todayStr();
  return dataLayer.subscribeFootballSnapshot(dateStr, (snapshot) => {
    if (!snapshot) return callback({ matches: [], live: [], finished: [], hasLive: false, liveCount: 0, error: null });
    const result = extractMatches(snapshot);
    callback({ matches: result.matches, live: result.live, finished: result.finished, hasLive: result.live.length > 0, liveCount: result.live.length, error: null });
  });
}

export async function fetchBasketballFixtures(dateStr, { forceRefresh = false } = {}) { if (forceRefresh) dataLayer.invalidatePrefix(`snap:bb:${dateStr}`); try { const snapshot = await dataLayer.fetchBasketballSnapshot(dateStr); if (!snapshot) return emptyResult(null); const result = extractMatches(snapshot); return { ...result, updatedAt: snapshot.updatedAt, error: null, isRolloverWindow: isInRolloverWindow() }; } catch (err) { return emptyResult(err.message); } }
export const fetchBasketballYesterdayFixtures = () => fetchBasketballFixtures(yesterdayStr());
export const fetchBasketballTomorrowFixtures = () => fetchBasketballFixtures(tomorrowStr());
export async function fetchBasketballFinishedFixtures() { try { const s = await dataLayer.fetchBasketballSnapshot(todayStr()); return s ? (s.finished || []).map(transformMatch).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)) : []; } catch { return []; } }
export async function fetchBasketballLiveScores() { try { const s = await dataLayer.fetchBasketballSnapshot(todayStr()); return s ? { matches: (s.live || []).map(transformMatch), error: null } : { matches: [], error: null }; } catch (err) { return { matches: [], error: err.message }; } }

export function subscribeToBasketballLiveFixtures(cb) {
  const dateStr = todayStr();
  return dataLayer.subscribeBasketballSnapshot(dateStr, (snapshot) => {
    if (!snapshot) return cb({ matches: [], live: [], finished: [], hasLive: false, liveCount: 0, error: null });
    const result = extractMatches(snapshot);
    cb({ matches: result.live, live: result.live, finished: result.finished, hasLive: result.live.length > 0, liveCount: result.live.length, error: null });
  });
}

export function subscribeToBasketballTodayFixtures(cb) {
  const dateStr = todayStr();
  return dataLayer.subscribeBasketballSnapshot(dateStr, (snapshot) => {
    if (!snapshot) return cb({ matches: [], live: [], finished: [], hasLive: false, liveCount: 0, error: null });
    const result = extractMatches(snapshot);
    cb({ matches: result.matches, live: result.live, finished: result.finished, hasLive: result.live.length > 0, liveCount: result.live.length, error: null });
  });
}

export const fetchLeagues = (sport = SPORT.FOOTBALL) => dataLayer.fetchLeagues(sport);
export async function fetchLeagueStandings(leagueId) { try { const all = await dataLayer.fetchStandings(SPORT.FOOTBALL); return all.find(d => String(d.leagueId || d.id) === String(leagueId))?.standings || []; } catch { return []; } }
export async function fetchBasketballLeagueStandings(leagueId) { try { const all = await dataLayer.fetchStandings(SPORT.BASKETBALL); return all.find(d => String(d.leagueId || d.id) === String(leagueId))?.standings || []; } catch { return []; } }
export async function fetchTeamFixtures(teamId) { try { const [y, t, tm] = await Promise.all([fetchFixtures(yesterdayStr()), fetchFixtures(todayStr()), fetchFixtures(tomorrowStr())]); return [...(y.matches||[]), ...(t.matches||[]), ...(tm.matches||[])].filter(m => String(m.homeId) === String(teamId) || String(m.awayId) === String(teamId)).sort((a, b) => (b.timestamp||0) - (a.timestamp||0)).slice(0, 10); } catch { return []; } }
export async function fetchBasketballTeamFixtures(teamId) { try { const [y, t, tm] = await Promise.all([fetchBasketballFixtures(yesterdayStr()), fetchBasketballFixtures(todayStr()), fetchBasketballFixtures(tomorrowStr())]); return [...(y.matches||[]), ...(t.matches||[]), ...(tm.matches||[])].filter(m => String(m.homeId) === String(teamId) || String(m.awayId) === String(teamId)).sort((a, b) => (b.timestamp||0) - (a.timestamp||0)).slice(0, 10); } catch { return []; } }

export const fetchMatchEvents = async () => ({ events: [], error: null });
export const fetchMatchLineups = async () => ({ lineups: [], error: null });
export const fetchMatchStatistics = async () => ({ statistics: [], error: null });
export const getCacheStats = () => dataLayer.getStats();
export const clearAllCache = () => dataLayer.clear();
export const getLivePollInterval = () => POLL_INTERVAL.LIVE_ACTIVE;
export const isBackendReachable = () => true;
export const initApp = async () => { await waitForAuth(); initFirebaseSync(); };