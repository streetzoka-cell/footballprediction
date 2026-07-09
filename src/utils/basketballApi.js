// FILE: src/basketballApi.js
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";

/* ═══════════════════════════════════════════════════════════════
   BASKETBALL — QUOTA TRACKING
   ═══════════════════════════════════════════════════════════════ */
const BB_QUOTA_KEY = 'fx_bb_daily_quota';
const BB_QUOTA_LIMIT = 100;
const BB_RESERVE = 8;
const BB_HARD_STOP = 3;

const getQuotaRaw = () => {
  try {
    const item = localStorage.getItem(BB_QUOTA_KEY);
    return item ? JSON.parse(item) : { date: '', count: 0 };
  } catch (e) { return { date: '', count: 0 }; }
};

const trackRequest = () => {
  const today = new Date().toISOString().split('T')[0];
  const q = getQuotaRaw();
  if (q.date !== today) {
    localStorage.setItem(BB_QUOTA_KEY, JSON.stringify({ date: today, count: 1 }));
    return 1;
  }
  q.count++;
  localStorage.setItem(BB_QUOTA_KEY, JSON.stringify(q));
  return q.count;
};

const canMakeRequest = (priority = 'normal') => {
  const q = getQuotaRaw();
  const today = new Date().toISOString().split('T')[0];
  if (q.date !== today) return true;
  const reserve = priority === 'high' ? 2 : priority === 'low' ? BB_RESERVE + 5 : BB_RESERVE;
  return q.count < (BB_QUOTA_LIMIT - reserve);
};

export const getBasketballQuotaStatus = () => {
  const q = getQuotaRaw();
  const today = new Date().toISOString().split('T')[0];
  const isToday = q.date === today;
  const used = isToday ? q.count : 0;
  return {
    used, limit: BB_QUOTA_LIMIT, remaining: Math.max(0, BB_QUOTA_LIMIT - used),
    percent: Math.round((used / BB_QUOTA_LIMIT) * 100), date: q.date, isToday,
    blocked: used >= (BB_QUOTA_LIMIT - BB_RESERVE),
    hardBlocked: used >= (BB_QUOTA_LIMIT - BB_HARD_STOP),
  };
};

/* ═══════════════════════════════════════════════════════════════
   IN-FLIGHT DEDUPLICATION
   ═══════════════════════════════════════════════════════════════ */
const inFlight = new Map();
const dedupFetch = (key, fetcher) => {
  if (inFlight.has(key)) return inFlight.get(key);
  const promise = fetcher().finally(() => { inFlight.delete(key); });
  inFlight.set(key, promise);
  return promise;
};

/* ═══════════════════════════════════════════════════════════════
   API CONFIG & FETCH
   ═══════════════════════════════════════════════════════════════ */
const API_KEY = import.meta.env.VITE_API_BASKETBALL_KEY || import.meta.env.VITE_API_FOOTBALL_KEY;
const API_BASE = import.meta.env.VITE_API_BASKETBALL_BASE || 'https://v1.basketball.api-sports.io';
const FETCH_TIMEOUT = 12000;
const MAX_RETRIES = 2;

const fetchWithRetry = async (endpoint, retries = MAX_RETRIES, priority = 'normal') => {
  if (!API_KEY) throw new Error('MISSING_KEY');
  if (!canMakeRequest(priority)) throw new Error('QUOTA_EXCEEDED');

  const url = `${API_BASE}${endpoint}`;
  let lastErr;

  for (let i = 0; i <= retries; i++) {
    if (i === 0) trackRequest();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    try {
      const res = await fetch(url, {
        headers: { 'x-apisports-key': API_KEY },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status === 429) { const e = new Error('RATE_LIMITED'); e.status = 429; throw e; }
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;
      if (err.name === 'AbortError') console.warn(`[BB-API] Timed out: ${url}`);
      else if (err.message !== 'RATE_LIMITED') console.warn(`[BB-API] Attempt ${i + 1}:`, err.message);
      if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
};

/* ═══════════════════════════════════════════════════════════════
   LIVE POLL INTERVALS
   ═══════════════════════════════════════════════════════════════ */
export const BB_POLL_ACTIVE  = 90_000;
export const BB_POLL_IDLE    = 300_000;
export const BB_POLL_BLOCKED = 600_000;

export const getBasketballPollInterval = (hasLiveGames) => {
  const q = getBasketballQuotaStatus();
  if (q.hardBlocked) return BB_POLL_BLOCKED;
  if (q.blocked) return BB_POLL_BLOCKED;
  return hasLiveGames ? BB_POLL_ACTIVE : BB_POLL_IDLE;
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUE COLORS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
const LEAGUE_COLORS = {
  12: '#1D428A', 23: '#EE4435', 33: '#00843D', 34: '#002395', 35: '#FEBE10',
  36: '#DD0000', 37: '#003DA5', 38: '#00205B', 40: '#CE1126', 41: '#009B3A',
  42: '#FFD700', 43: '#006233', 44: '#C8102E', 45: '#003087', 60: '#7B2D8B',
  61: '#FF6600', 62: '#002868',
};
const getLeagueColor = (id) => LEAGUE_COLORS[id] || '#1e293b';

const BB_LIVE_STATUSES = ['1Q', '2Q', '3Q', '4Q', 'OT', 'HT'];
const BB_FINISHED_STATUSES = ['FT', 'AOT'];
const BB_SCHEDULED_STATUSES = ['NS', 'SUSP', 'POST', 'CANC'];

export const formatTime = (dateStr) => {
  if (!dateStr) return '--:--';
  return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

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
export const isDateBlocked = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);
  
  const diffMs = checkDate - today;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  // Block dates more than 1 day in the past or more than 7 days ahead
  return diffDays < -1 || diffDays > 7;
};
export const transformGame = (g) => {
  const status = g.status || {};
  const statusShort = status.short || '';
  const teams = g.teams || {};
  const scores = g.scores || {};
  const league = g.league || {};
  const homeScores = scores.home || {};
  const awayScores = scores.away || {};

  return {
    id: String(g.id), date: g.date, kickoff: formatTime(g.date), timestamp: g.timestamp || null,
    homeTeam: { id: String(teams.home?.id || ''), name: teams.home?.name || 'TBD', logo: teams.home?.logo || null, code: teams.home?.code || '' },
    awayTeam: { id: String(teams.away?.id || ''), name: teams.away?.name || 'TBD', logo: teams.away?.logo || null, code: teams.away?.code || '' },
    homeId: String(teams.home?.id || ''), awayId: String(teams.away?.id || ''),
    scores: {
      home: { q1: homeScores.quarter_1 ?? null, q2: homeScores.quarter_2 ?? null, q3: homeScores.quarter_3 ?? null, q4: homeScores.quarter_4 ?? null, ot: homeScores.over_time ?? null, total: homeScores.total ?? null },
      away: { q1: awayScores.quarter_1 ?? null, q2: awayScores.quarter_2 ?? null, q3: awayScores.quarter_3 ?? null, q4: awayScores.quarter_4 ?? null, ot: awayScores.over_time ?? null, total: awayScores.total ?? null },
    },
    homeTotal: homeScores.total ?? null, awayTotal: awayScores.total ?? null,
    league: { id: String(league.id || ''), name: league.name || 'Other', country: league.country || '', logo: league.logo || null, type: league.type || 'League', season: league.season || null, color: getLeagueColor(league.id) },
    leagueKey: String(league.id || 'OTHER'), leagueCountry: league.country || '',
    status: statusShort, rawStatus: statusShort, statusLong: status.long || '',
    isLive: BB_LIVE_STATUSES.includes(statusShort), isFinished: BB_FINISHED_STATUSES.includes(statusShort),
    isScheduled: BB_SCHEDULED_STATUSES.includes(statusShort), minute: g.timer?.display || null,
    venue: g.arena?.name || null,
  };
};

/* ═══════════════════════════════════════════════════════════════
   LOCAL CACHE
   ═══════════════════════════════════════════════════════════════ */
const CACHE_PREFIX = 'fbb_games_';
const CACHE_META = 'fbb_cache_meta';
const FINISHED_TTL = 30 * 24 * 60 * 60 * 1000;
const LIVE_TTL = 5 * 60 * 1000;
const cacheKey = (date) => `${CACHE_PREFIX}${date}`;

const normalizeCachedGame = (g) => {
  if (!g || typeof g !== 'object') return null;
  return {
    ...g, id: g.id || String(g.game?.id || ''),
    homeTeam: { id: g.homeId || g.homeTeam?.id || '', name: g.homeTeam?.name || 'TBD', logo: g.homeTeam?.logo ?? null, code: g.homeTeam?.code || '' },
    awayTeam: { id: g.awayId || g.awayTeam?.id || '', name: g.awayTeam?.name || 'TBD', logo: g.awayTeam?.logo ?? null, code: g.awayTeam?.code || '' },
    homeId: g.homeId || g.homeTeam?.id || '', awayId: g.awayId || g.awayTeam?.id || '',
    scores: g.scores || { home: { q1: null, q2: null, q3: null, q4: null, ot: null, total: null }, away: { q1: null, q2: null, q3: null, q4: null, ot: null, total: null } },
    homeTotal: g.homeTotal ?? g.scores?.home?.total ?? null, awayTotal: g.awayTotal ?? g.scores?.away?.total ?? null,
    league: { id: g.league?.id || '0', name: g.league?.name || 'Other', country: g.league?.country || '', logo: g.league?.logo ?? null, type: g.league?.type || 'League', season: g.league?.season ?? null, color: g.league?.color || getLeagueColor(Number(g.league?.id) || 0) },
    leagueKey: g.leagueKey || String(g.league?.id || 'OTHER'), leagueCountry: g.leagueCountry || g.league?.country || '',
    kickoff: g.kickoff || formatTime(g.date), status: g.status || g.rawStatus || '', rawStatus: g.rawStatus || g.status || '',
    isLive: g.isLive ?? BB_LIVE_STATUSES.includes(g.status || g.rawStatus || ''),
    isFinished: g.isFinished ?? BB_FINISHED_STATUSES.includes(g.status || g.rawStatus || ''),
    isScheduled: g.isScheduled ?? BB_SCHEDULED_STATUSES.includes(g.status || g.rawStatus || ''),
    minute: g.minute ?? null, venue: g.venue ?? null,
  };
};

const normalizeGames = (games) => !Array.isArray(games) ? [] : games.map(normalizeCachedGame).filter(Boolean);

const getCached = (date) => {
  try {
    const raw = localStorage.getItem(cacheKey(date));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.cachedAt > (data.allFinished ? FINISHED_TTL : LIVE_TTL)) { localStorage.removeItem(cacheKey(date)); return null; }
    data.games = normalizeGames(data.games);
    return data;
  } catch (e) { return null; }
};

const getStaleCached = (date) => {
  try {
    const raw = localStorage.getItem(cacheKey(date));
    if (!raw) return null;
    const data = JSON.parse(raw);
    data.games = normalizeGames(data.games);
    return data;
  } catch (e) { return null; }
};

const saveToCache = (date, games) => {
  const allFinished = games.length > 0 && games.every(g => g.isFinished);
  try {
    localStorage.setItem(cacheKey(date), JSON.stringify({ games, cachedAt: Date.now(), allFinished }));
    const meta = JSON.parse(localStorage.getItem(CACHE_META) || '{}');
    meta[date] = { count: games.length, allFinished, ts: Date.now() };
    localStorage.setItem(CACHE_META, JSON.stringify(meta));
  } catch (e) { try { localStorage.removeItem(CACHE_META); } catch (err) {} }
};

/* ═══════════════════════════════════════════════════════════════
   FIRESTORE SHARED CACHE
   ═══════════════════════════════════════════════════════════════ */
const FS_COLL = 'basketball_cache';

const saveToFirestore = async (date, games, allFinished) => {
  if (!db) return;
  try {
    await setDoc(doc(db, FS_COLL, date), {
      games, fetchedAt: Date.now(), allFinished: !!allFinished, gameCount: games.length,
    });
  } catch (e) { console.warn('[BB-FS] Save failed:', e); }
};

const loadFromFirestore = async (date) => {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, FS_COLL, date));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!data.games?.length) return null;
    const age = Date.now() - (data.fetchedAt || 0);
    return {
      games: normalizeGames(data.games),
      allFinished: data.allFinished,
      fetchedAt: data.fetchedAt,
      stale: !data.allFinished && age > LIVE_TTL,
    };
  } catch (e) { return null; }
};

/**
 * Batch-load multiple dates from Firestore in ONE read.
 * Returns Map<dateStr, { games, allFinished, stale, fetchedAt }>
 */
const batchLoadFromFirestore = async (dates) => {
  const result = new Map();
  if (!db || !dates.length) return result;
  try {
    const snap = await getDocs(collection(db, FS_COLL));
    snap.forEach(d => {
      if (dates.includes(d.id)) {
        const data = d.data();
        if (data.games?.length) {
          const age = Date.now() - (data.fetchedAt || 0);
          result.set(d.id, {
            games: normalizeGames(data.games),
            allFinished: data.allFinished,
            fetchedAt: data.fetchedAt,
            stale: !data.allFinished && age > LIVE_TTL,
          });
        }
      }
    });
  } catch (e) { console.warn('[BB-FS] Batch load failed:', e); }
  return result;
};

export const loadBasketballFromAnyCache = async (date) => {
  const local = getStaleCached(date);
  if (local?.games?.length > 0) {
    return { games: local.games, source: 'local', stale: !local.allFinished && (Date.now() - local.cachedAt) > LIVE_TTL, allFinished: local.allFinished };
  }
  const fs = await loadFromFirestore(date);
  if (fs?.games?.length > 0) {
    saveToCache(date, fs.games);
    return { games: fs.games, source: 'firestore', stale: fs.stale, allFinished: fs.allFinished };
  }
  return null;
};

/* ═══════════════════════════════════════════════════════════════
   SILENT BACKGROUND REFRESH
   Fire-and-forget: updates caches without blocking the UI.
   Deduped so 10 components requesting the same date = 1 API call.
   ═══════════════════════════════════════════════════════════════ */
const silentRefreshInFlight = new Set();

const silentRefresh = (date, priority = 'low') => {
  if (silentRefreshInFlight.has(date)) return;
  if (!API_KEY || !canMakeRequest(priority)) return;
  silentRefreshInFlight.add(date);

  fetchAndSave(date, priority)
    .then(ok => { if (ok) console.log(`[BB-Refresh] Updated: ${date}`); })
    .catch(() => {})
    .finally(() => { silentRefreshInFlight.delete(date); });
};

/* ═══════════════════════════════════════════════════════════════
   FETCH & SAVE (single date → local + Firebase)
   ═══════════════════════════════════════════════════════════════ */
const fetchAndSave = async (date, priority = 'low') => {
  try {
    const res = await fetchWithRetry(`/games?date=${date}&timezone=Europe/London`, 1, priority);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.errors && Object.keys(data.errors).length > 0) return false;
    const games = (data.response || []).map(transformGame);
    const allFinished = games.length > 0 && games.every(g => g.isFinished);
    saveToCache(date, games);
    await saveToFirestore(date, games, allFinished);
    return true;
  } catch (e) { return false; }
};

/* ═══════════════════════════════════════════════════════════════
   DAILY SYNC — AGGRESSIVE PRE-WARMING
   Strategy: One user's API call warms Firebase for 10,000 users.
   - Fetches today FIRST (what users see immediately)
   - Then fans out to -1 day through +5 days
   - Skips dates already fresh in Firebase
   - Stops immediately if quota is hard-blocked
   ═══════════════════════════════════════════════════════════════ */
const SYNC_KEY = 'fbb_last_sync';
const SYNC_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours (was 4)

export const basketballDailySync = async (daysAhead = 5) => {
  if (!API_KEY) return { done: false, skipped: true, reason: 'NO_KEY' };
  if (!db) return { done: false, skipped: true, reason: 'NO_DB' };
  if (getBasketballQuotaStatus().hardBlocked) return { done: false, skipped: true, reason: 'QUOTA_LOW' };

  const today = new Date().toISOString().split('T')[0];

  // Check cooldown — but allow first sync of the day to always run
  let last = null;
  try { last = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) {}
  if (last?.date === today && (Date.now() - last.at) < SYNC_COOLDOWN) {
    return { done: true, skipped: true, reason: 'COOLDOWN' };
  }

  // Build date list: today gets priority
  const datePool = [];
  for (let i = -1; i <= daysAhead; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    datePool.push(d.toISOString().split('T')[0]);
  }

  // Batch-check Firebase — skip dates that already have fresh data
  const fsCache = await batchLoadFromFirestore(datePool);
  const now = Date.now();
  const existingFresh = new Set();
  fsCache.forEach((data, dateStr) => {
    const age = now - (data.fetchedAt || 0);
    const ttl = data.allFinished ? FINISHED_TTL : LIVE_TTL;
    if (age <= ttl && data.games?.length > 0) existingFresh.add(dateStr);
  });

  // Sort: today first, then chronological
  const datesToFetch = datePool
    .filter(d => !existingFresh.has(d))
    .sort((a, b) => {
      if (a === today) return -1;
      if (b === today) return 1;
      return a.localeCompare(b);
    });

  const results = { synced: [], failed: [], skipped: datePool.filter(d => existingFresh.has(d)) };

  for (const dateStr of datesToFetch) {
    if (!canMakeRequest('low')) break;

    // Today gets higher priority
    const priority = dateStr === today ? 'normal' : 'low';
    const ok = await fetchAndSave(dateStr, priority);

    if (ok) results.synced.push(dateStr);
    else results.failed.push(dateStr);

    // Small delay between requests to be gentle
    if (datesToFetch.indexOf(dateStr) < datesToFetch.length - 1) {
      await new Promise(r => setTimeout(r, 800));
    }
  }

  localStorage.setItem(SYNC_KEY, JSON.stringify({ date: today, at: Date.now(), results }));
  return { done: true, skipped: false, results };
};

/**
 * Pre-warm local cache from Firebase on app load.
 * This is instant (no API calls) — just copies Firebase → localStorage
 * so the user sees matches immediately without any loading state.
 */
const prewarmLocalFromFirebase = async () => {
  if (!db) return;
  const today = new Date();
  const dates = [];
  for (let i = -1; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  try {
    const fsCache = await batchLoadFromFirestore(dates);
    let warmed = 0;
    fsCache.forEach((data, dateStr) => {
      if (data.games?.length > 0) {
        // Only write to local if we don't have it, or Firebase is newer
        const local = getStaleCached(dateStr);
        if (!local || (data.fetchedAt && local.cachedAt && data.fetchedAt > local.cachedAt)) {
          saveToCache(dateStr, data.games);
          warmed++;
        }
      }
    });
    if (warmed > 0) console.log(`[BB-PreWarm] ${warmed} dates copied from Firebase → localStorage`);
  } catch (e) {}
};

/**
 * Called once on app mount. Does two things in parallel:
 * 1. Instantly copies Firebase cache → localStorage (zero API cost)
 * 2. Background-syncs missing dates to Firebase (uses API quota)
 *
 * Result: User sees matches immediately. If data is missing,
 * the background sync fills it within seconds.
 */
export const initBasketball = () => {
  // Instant: copy Firebase → localStorage (no API calls)
  prewarmLocalFromFirebase();

  // Background: fetch missing dates → local + Firebase
  // Don't await — let UI render immediately
  basketballDailySync(5);
};

/**
 * Manual prewarm trigger — can be called from UI if needed
 * e.g. after user switches to basketball tab for the first time
 */
export const prewarmBasketballCache = async (daysAhead = 5) => {
  await prewarmLocalFromFirebase();
  return basketballDailySync(daysAhead);
};

export const getLastSyncStatus = () => {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)); } catch { return null; }
};

/* ═══════════════════════════════════════════════════════════════
   MAIN API CALLS — CACHE-FIRST WITH SILENT REFRESH
   Flow:
   1. Local cache hit → return instantly (silent refresh if stale)
   2. Firebase cache hit → return fast (silent refresh if stale)
   3. No cache → API call → save to both caches → return
   4. Error → fallback to any stale cache available
   
   For 10k users: Step 1 or 2 handles 99% of requests.
   Only ~5-10 API calls per day total (one per unique date).
   ═══════════════════════════════════════════════════════════════ */
const fallback = async (date, errFlag) => {
  const local = getStaleCached(date);
  if (local?.games?.length > 0) {
    return { games: local.games, error: errFlag, fromCache: true, stale: true, allFinished: local.allFinished, cacheSource: 'local-stale' };
  }
  const fs = await loadFromFirestore(date);
  if (fs?.games?.length > 0) {
    saveToCache(date, fs.games);
    return { games: fs.games, error: errFlag, fromCache: true, stale: true, allFinished: fs.allFinished, cacheSource: 'firestore-stale' };
  }
  return { games: [], error: errFlag || 'NO_DATA', fromCache: false };
};

export const fetchBasketballGames = async (date, forceRefresh = false) => {
  const formattedDate = date || new Date().toISOString().split('T')[0];

  // ── NO KEY: try cache only ──
  if (!API_KEY) {
    const c = await loadBasketballFromAnyCache(formattedDate);
    return c
      ? { games: c.games, error: 'NO_KEY', fromCache: true, stale: c.stale, allFinished: c.allFinished, cacheSource: c.source }
      : { games: [], error: 'NO_KEY', fromCache: false };
  }

  // ── STEP 1: Local cache (synchronous, instant) ──
  if (!forceRefresh) {
    const local = getStaleCached(formattedDate);
    if (local?.games?.length > 0) {
      const isStale = !local.allFinished && (Date.now() - local.cachedAt) > LIVE_TTL;
      if (isStale) {
        // Return what we have, refresh in background
        silentRefresh(formattedDate, 'low');
      }
      return {
        games: local.games,
        error: null,
        fromCache: true,
        stale: isStale,
        allFinished: local.allFinished,
        cacheSource: 'local',
        refreshing: isStale,
      };
    }
  }

  // ── STEP 2: Firebase cache (one doc read, very fast) ──
  if (!forceRefresh) {
    const fs = await loadFromFirestore(formattedDate);
    if (fs?.games?.length > 0) {
      saveToCache(formattedDate, fs.games);
      if (fs.stale) {
        silentRefresh(formattedDate, 'low');
      }
      return {
        games: fs.games,
        error: null,
        fromCache: true,
        stale: fs.stale,
        allFinished: fs.allFinished,
        cacheSource: fs.stale ? 'firestore-stale' : 'firestore',
        refreshing: fs.stale,
      };
    }
  }

  // ── STEP 3: API call (deduped, quota-gated) ──
  try {
    const { games, allFinished } = await dedupFetch(`bb_${formattedDate}`, async () => {
      const res = await fetchWithRetry(`/games?date=${formattedDate}&timezone=Europe/London`, MAX_RETRIES, 'normal');
      if (res.status === 429) { const e = new Error('RATE_LIMITED'); e.status = 429; throw e; }
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.errors && Object.keys(data.errors).length > 0) {
        const msg = Object.values(data.errors).join(', ');
        if (msg.includes('request limit')) { const e = new Error('RATE_LIMITED'); e.status = 429; throw e; }
        throw new Error(msg);
      }
      const games = (data.response || []).map(transformGame);
      return { games, allFinished: games.length > 0 && games.every(g => g.isFinished) };
    });

    // Save for the next 9,999 users
    saveToCache(formattedDate, games);
    saveToFirestore(formattedDate, games, allFinished);

    return { games, error: null, fromCache: false, allFinished };
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') return await fallback(formattedDate, 'QUOTA_EXCEEDED');
    if (err.status === 429) return await fallback(formattedDate, 'RATE_LIMITED');
    console.error('[BB-API] Fetch failed:', err.message);
    return await fallback(formattedDate, 'NETWORK');
  }
};

export const fetchBasketballLive = async () => {
  if (!API_KEY) return { games: [], error: 'NO_KEY' };
  if (!canMakeRequest('normal')) return { games: [], error: 'QUOTA_THROTTLED' };
  try {
    const res = await fetchWithRetry(`/games?live=all`, 1, 'normal');
    if (res.status === 429) return { games: [], error: 'RATE_LIMITED' };
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return { games: (data.response || []).map(transformGame), error: null };
  } catch (err) {
    if (err.message === 'QUOTA_EXCEEDED') return { games: [], error: 'QUOTA_THROTTLED' };
    console.error('[BB-API] Live failed:', err.message);
    return { games: [], error: 'NETWORK' };
  }
};