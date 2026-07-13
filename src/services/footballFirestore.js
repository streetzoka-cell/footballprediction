// src/services/footballFirestore.js
import {
  collection, doc, getDoc, onSnapshot,
} from 'firebase/firestore';
import { footballDb } from '../config/footballFirebase';

// Collection names (must match backend's frontendSync.COL)
const COL = {
  FIXTURES: 'fd_fixtures',
  LIVE: 'fd_live',
  COMPETITIONS: 'fd_competitions',
  STANDINGS: 'fd_standings',
  TEAMS: 'fd_teams',
};

// ─── In-memory cache with TTL ───
class FSCache {
  constructor() { this.store = new Map(); }
  get(key, ttlMs) {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() - e.ts > ttlMs) { this.store.delete(key); return null; }
    return e.data;
  }
  set(key, data) { this.store.set(key, { data, ts: Date.now() }); }
  del(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
const memCache = new FSCache();

// ─── localStorage persistence (survives page refresh) ───
function getLocal(key, ttlMs) {
  try {
    const raw = localStorage.getItem('ffs_' + key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (Date.now() - p.ts > ttlMs) { localStorage.removeItem('ffs_' + key); return null; }
    return p.data;
  } catch { return null; }
}

function setLocal(key, data) {
  try { localStorage.setItem('ffs_' + key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

// ─── TTLs (conservative to save quota) ───
const TTL = {
  FIXTURES: 3 * 60 * 1000,       // 3 min
  COMPETITIONS: 30 * 60 * 1000,   // 30 min
  STANDINGS: 5 * 60 * 1000,       // 5 min
  TEAMS: 10 * 60 * 1000,          // 10 min
};

// Helper: extract Firestore Timestamp to ISO string
function tsToISO(val) {
  if (!val) return null;
  if (val.toDate) return val.toDate().toISOString();
  if (typeof val === 'string') return val;
  return null;
}

// ─── FIXTURES ───
// 1 document read per date. e.g., fd_fixtures/2025-07-15

export async function getFixtures(dateStr, { force = false } = {}) {
  const cacheKey = 'fx_' + dateStr;

  if (!force) {
    const mem = memCache.get(cacheKey, TTL.FIXTURES);
    if (mem) return mem;
    const local = getLocal(cacheKey, TTL.FIXTURES);
    if (local) { memCache.set(cacheKey, local); return local; }
  }

  if (!footballDb) throw new Error('Firestore not initialized');

  const snap = await getDoc(doc(footballDb, COL.FIXTURES, dateStr));
  const result = snap.exists()
    ? { data: snap.data().matches || [], lastUpdated: tsToISO(snap.data().updatedAt) }
    : { data: [], lastUpdated: null };

  memCache.set(cacheKey, result);
  setLocal(cacheKey, result);
  return result;
}

// Batch fetch multiple dates (for initial load window)
export async function getFixturesForDates(dateStrs, { force = false } = {}) {
  if (!footballDb) throw new Error('Firestore not initialized');

  const results = {};
  const uncached = [];

  for (const d of dateStrs) {
    const cacheKey = 'fx_' + d;
    if (!force) {
      const mem = memCache.get(cacheKey, TTL.FIXTURES);
      if (mem) { results[d] = mem; continue; }
      const local = getLocal(cacheKey, TTL.FIXTURES);
      if (local) { memCache.set(cacheKey, local); results[d] = local; continue; }
    }
    uncached.push(d);
  }

  if (uncached.length > 0) {
    const promises = uncached.map(d =>
      getDoc(doc(footballDb, COL.FIXTURES, d))
        .then(snap => {
          const r = snap.exists()
            ? { data: snap.data().matches || [], lastUpdated: tsToISO(snap.data().updatedAt) }
            : { data: [], lastUpdated: null };
          const k = 'fx_' + d;
          memCache.set(k, r);
          setLocal(k, r);
          results[d] = r;
        })
        .catch(() => { results[d] = { data: [], lastUpdated: null }; })
    );
    await Promise.all(promises);
  }

  return results;
}

// ─── LIVE ───
// onSnapshot on 1 document: fd_live/current
// Returns unsubscribe function.
// Each backend write that changes data = 1 read per connected client.
// The backend's hash-check skips unchanged writes, so reads only happen on real changes.

let _liveUnsub = null;

export function subscribeLive(callback, onError) {
  if (!footballDb) {
    onError?.(new Error('Firestore not initialized'));
    return () => {};
  }

  // Unsubscribe previous if any
  if (_liveUnsub) _liveUnsub();

  _liveUnsub = onSnapshot(
    doc(footballDb, COL.LIVE, 'current'),
    (snap) => {
      const raw = snap.data();
      const result = {
        data: raw?.matches || [],
        lastUpdated: tsToISO(raw?.updatedAt),
      };
      callback(result);
    },
    (err) => {
      console.error('[FootballFirestore] Live snapshot error:', err.message);
      onError?.(err);
    }
  );

  return () => {
    if (_liveUnsub) { _liveUnsub(); _liveUnsub = null; }
  };
}

// Manual get (for polling fallback or initial fetch)
export async function getLive() {
  const cacheKey = 'live';
  const mem = memCache.get(cacheKey, 30 * 1000);
  if (mem) return mem;

  if (!footballDb) throw new Error('Firestore not initialized');

  const snap = await getDoc(doc(footballDb, COL.LIVE, 'current'));
  const raw = snap.data();
  const result = {
    data: raw?.matches || [],
    lastUpdated: tsToISO(raw?.updatedAt),
  };
  memCache.set(cacheKey, result);
  return result;
}

// ─── COMPETITIONS ───
// 1 document: fd_competitions/all

export async function getCompetitions({ force = false } = {}) {
  const cacheKey = 'comps';

  if (!force) {
    const mem = memCache.get(cacheKey, TTL.COMPETITIONS);
    if (mem) return mem;
    const local = getLocal(cacheKey, TTL.COMPETITIONS);
    if (local) { memCache.set(cacheKey, local); return local; }
  }

  if (!footballDb) throw new Error('Firestore not initialized');

  const snap = await getDoc(doc(footballDb, COL.COMPETITIONS, 'all'));
  const raw = snap.data();
  const result = {
    data: raw?.competitions || [],
    lastUpdated: tsToISO(raw?.updatedAt),
  };
  memCache.set(cacheKey, result);
  setLocal(cacheKey, result);
  return result;
}

// ─── STANDINGS ───
// 1 document per competition: fd_standings/PL

export async function getStandings(code, { force = false } = {}) {
  const cacheKey = 'st_' + code;

  if (!force) {
    const mem = memCache.get(cacheKey, TTL.STANDINGS);
    if (mem) return mem;
    const local = getLocal(cacheKey, TTL.STANDINGS);
    if (local) { memCache.set(cacheKey, local); return local; }
  }

  if (!footballDb) throw new Error('Firestore not initialized');

  const snap = await getDoc(doc(footballDb, COL.STANDINGS, code));
  if (!snap.exists()) return { data: null, lastUpdated: null };

  const raw = snap.data();
  const result = {
    data: raw.standings || [],
    lastUpdated: tsToISO(raw.updatedAt),
  };
  memCache.set(cacheKey, result);
  setLocal(cacheKey, result);
  return result;
}

// ─── TEAMS ───
// 1 document per competition: fd_teams/PL

export async function getTeams(code, { force = false } = {}) {
  const cacheKey = 'tm_' + code;

  if (!force) {
    const mem = memCache.get(cacheKey, TTL.TEAMS);
    if (mem) return mem;
    const local = getLocal(cacheKey, TTL.TEAMS);
    if (local) { memCache.set(cacheKey, local); return local; }
  }

  if (!footballDb) throw new Error('Firestore not initialized');

  const snap = await getDoc(doc(footballDb, COL.TEAMS, code));
  if (!snap.exists()) return { data: null, lastUpdated: null };

  const raw = snap.data();
  const result = {
    data: raw.teams || [],
    lastUpdated: tsToISO(raw.updatedAt),
  };
  memCache.set(cacheKey, result);
  setLocal(cacheKey, result);
  return result;
}

// ─── UTILITIES ───

export function clearEntry(cacheKey) {
  memCache.del(cacheKey);
  try { localStorage.removeItem('ffs_' + cacheKey); } catch {}
}

export function clearAllCache() {
  memCache.clear();
  // Clear only our keys from localStorage
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ffs_')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch {}
}