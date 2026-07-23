// ═══════════════════════════════════════════════════════════════
// FILE: src/utils/dataLayer.js
// ═══════════════════════════════════════════════════════════════

import { db, auth, footballDb } from './firebase';
import { collection, query, where, doc, limit, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { SPORT, TTL, TIMEOUT, PATHS, CACHE_KEY, getSnapshotDocId, getRefDocId } from './constants';
import { eventBus, EVENT } from './eventBus';
import { todayStr, getWeekStart, getMonthStart } from './dates';

function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class LocalCache {
  constructor(prefix = 'fxdl') { this._prefix = prefix; this._cleanupInterval = null; }
  _key(key) { return `${this._prefix}:${key}`; }
  get(key, ttlMs) { try { const r = localStorage.getItem(this._key(key)); if (!r) return undefined; const e = JSON.parse(r); return Date.now() - e.ts > (ttlMs ?? e.ttl) ? undefined : e.data; } catch { return undefined; } }
  getWithGrace(key, ttlMs, graceMs) { try { const r = localStorage.getItem(this._key(key)); if (!r) return undefined; const e = JSON.parse(r); const age = Date.now() - e.ts; if (age > (ttlMs ?? e.ttl) + (graceMs ?? 30000)) { localStorage.removeItem(this._key(key)); return undefined; } return { data: e.data, stale: age > (ttlMs ?? e.ttl), age }; } catch { return undefined; } }
  set(key, data, ttlMs) { try { localStorage.setItem(this._key(key), JSON.stringify({ data, ts: Date.now(), ttl: ttlMs })); } catch { this._cleanup(); try { localStorage.setItem(this._key(key), JSON.stringify({ data, ts: Date.now(), ttl: ttlMs })); } catch {} } }
  delete(key) { try { localStorage.removeItem(this._key(key)); } catch {} }
  deletePrefix(prefix) { const p = this._key(prefix); const d = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(p)) d.push(k); } d.forEach(k => { try { localStorage.removeItem(k); } catch {} }); }
  _cleanup() { const n = Date.now(); const p = this._prefix + ':'; const d = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(p)) { try { const e = JSON.parse(localStorage.getItem(k)); if (n - e.ts > e.ttl * 2) d.push(k); } catch { d.push(k); } } } d.forEach(k => { try { localStorage.removeItem(k); } catch {} }); }
  startPeriodicCleanup(i = 60000) { if (this._cleanupInterval) return; this._cleanupInterval = setInterval(() => this._cleanup(), i); }
  stopPeriodicCleanup() { if (this._cleanupInterval) { clearInterval(this._cleanupInterval); this._cleanupInterval = null; } }
}

class DataLayer {
  constructor() {
    this._memory = new Map(); 
    this._locks = new Map(); 
    this._subscribers = new Map();
    this._local = new LocalCache(); 
    this._bgRefreshInProgress = new Set();
    this._local.startPeriodicCleanup();
    
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          ['myPreds:', 'myResults:', 'upt:'].forEach(p => this.invalidatePrefix(p));
        }
      });
    }
  }

  _memGet(k, t) { const e = this._memory.get(k); if (!e) return undefined; if (t > 0 && Date.now() - e.ts > t) { this._memory.delete(k); return undefined; } return e.data; }
  _memSet(k, d, t) { this._memory.set(k, { data: d, ts: Date.now(), ttl: t }); }

  async getOrSet(key, fetchFn, ttlMs, opts = {}) {
    let d = this._memGet(key, ttlMs); if (d !== undefined) return d;
    if (!opts.skipLocal) { 
      d = this._local.get(key, ttlMs); 
      if (d !== undefined) { this._memSet(key, d, ttlMs); return d; } 
      const s = this._local.getWithGrace(key, ttlMs, opts.graceMs); 
      if (s) { 
        this._memSet(key, s.data, ttlMs); 
        if (s.stale) this._bgRefresh(key, fetchFn, ttlMs, opts); 
        return s.data; 
      } 
    }
    const lock = this._locks.get(key); if (lock) { try { return await lock; } catch {} }
    const p = fetchFn().then(d => { this._memSet(key, d, ttlMs); if (!opts.skipLocal) this._local.set(key, d, ttlMs); this._notifySubs(key, d); if (opts.event) eventBus.emit(opts.event, typeof opts.eventPayload === 'function' ? opts.eventPayload(d) : (opts.eventPayload || { key })); return d; }).catch(e => { console.warn(`[DataLayer] ${key}:`, e.message); throw e; }).finally(() => { this._locks.delete(key); this._bgRefreshInProgress.delete(key); });
    this._locks.set(key, p); return p;
  }

  _bgRefresh(k, fn, t, o) { 
    if (this._bgRefreshInProgress.has(k) || this._locks.has(k)) return; 
    this._bgRefreshInProgress.add(k); 
    queueMicrotask(async () => { 
      try { 
        const d = await fn(); 
        this._memSet(k, d, t); 
        this._local.set(k, d, t); 
        this._notifySubs(k, d); 
        if (o.event) eventBus.emit(o.event, typeof o.eventPayload === 'function' ? o.eventPayload(d) : (o.eventPayload || { key, background: true })); 
      } catch {} 
      finally { this._bgRefreshInProgress.delete(k); } 
    }); 
  }
  
  subscribe(k, cb) { if (!this._subscribers.has(k)) this._subscribers.set(k, new Set()); this._subscribers.get(k).add(cb); return () => { const s = this._subscribers.get(k); if (s) { s.delete(cb); if (!s.size) this._subscribers.delete(k); } }; }
  _notifySubs(k, d) { const s = this._subscribers.get(k); if (!s) return; queueMicrotask(() => s.forEach(c => { try { c(d); } catch {} })); }
  invalidate(k) { this._memory.delete(k); this._local.delete(k); eventBus.emit(EVENT.CACHE_INVALIDATED, { key: k }); }
  invalidatePrefix(p) { const k = []; for (const key of this._memory.keys()) { if (key.startsWith(p)) { this._memory.delete(key); k.push(key); } } this._local.deletePrefix(p); eventBus.emit(EVENT.CACHE_INVALIDATED, { prefix: p, keys: k }); }
  clear() { this._memory.clear(); this._locks.clear(); this._local.deletePrefix(''); eventBus.emit(EVENT.CACHE_INVALIDATED, { cleared: true }); }
  getStats() { return { memoryCacheSize: this._memory.size, pendingLocks: this._locks.size, bgRefreshes: this._bgRefreshInProgress.size, subscribers: this._subscribers.size }; }

  subscribeFootballSnapshot(dateStr, cb) {
    if (!db) return () => {};
    const ref = doc(db, PATHS.FIXTURE_SNAPSHOTS, dateStr);
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      this._memSet(CACHE_KEY.snapshot(SPORT.FOOTBALL, dateStr), data, TTL.FIXTURE_SNAPSHOT);
      this._local.set(CACHE_KEY.snapshot(SPORT.FOOTBALL, dateStr), data, TTL.FIXTURE_SNAPSHOT);
      cb(data);
    }, (err) => console.error("Snapshot listener error:", err));
  }

  subscribeBasketballSnapshot(dateStr, cb) {
    if (!db) return () => {};
    const ref = doc(db, PATHS.FIXTURE_SNAPSHOTS, getSnapshotDocId(SPORT.BASKETBALL, dateStr));
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      this._memSet(CACHE_KEY.snapshot(SPORT.BASKETBALL, dateStr), data, TTL.FIXTURE_SNAPSHOT);
      this._local.set(CACHE_KEY.snapshot(SPORT.BASKETBALL, dateStr), data, TTL.FIXTURE_SNAPSHOT);
      cb(data);
    }, (err) => console.error("Snapshot listener error:", err));
  }

  // Global Live Listener (Timezone independent) - Uses footballDb!
  subscribeLiveFixtures(cb) {
    if (!footballDb) return () => {};
    const q = collection(footballDb, 'liveFixtures');
    return onSnapshot(q, (snap) => {
      const matches = snap.docs.map(d => d.data());
      cb(matches);
    }, (err) => console.error("Live listener error:", err));
  }

  async fetchFootballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.snapshot(SPORT.FOOTBALL, dateStr), async () => {
      if (!db) return null;
      const s = await withTimeout(getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, dateStr)), TIMEOUT.SNAPSHOT_READ, null);
      return s?.exists() ? s.data() : null;
    }, TTL.FIXTURE_SNAPSHOT, { event: EVENT.FOOTBALL_UPDATED, eventPayload: d => ({ sport: SPORT.FOOTBALL, dateStr, snapshot: d }) });
  }

  async fetchBasketballSnapshot(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.snapshot(SPORT.BASKETBALL, dateStr), async () => {
      if (!db) return null;
      const s = await withTimeout(getDoc(doc(db, PATHS.FIXTURE_SNAPSHOTS, getSnapshotDocId(SPORT.BASKETBALL, dateStr))), TIMEOUT.SNAPSHOT_READ, null);
      return s?.exists() ? s.data() : null;
    }, TTL.FIXTURE_SNAPSHOT, { event: EVENT.BASKETBALL_UPDATED, eventPayload: d => ({ sport: SPORT.BASKETBALL, dateStr, snapshot: d }) });
  }

  async fetchSnapshot(sport, dateStr) { return sport === SPORT.BASKETBALL ? this.fetchBasketballSnapshot(dateStr) : this.fetchFootballSnapshot(dateStr); }

  async fetchLeagues(sport = SPORT.FOOTBALL) {
    return this.getOrSet(CACHE_KEY.reference(getRefDocId('leagues', sport)), async () => { if (!db) return []; const s = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, getRefDocId('leagues', sport))), TIMEOUT.REFERENCE, null); return s?.exists() ? (s.data().data || []) : []; }, TTL.REFERENCE);
  }

  async fetchTeams(sport = SPORT.FOOTBALL) {
    return this.getOrSet(CACHE_KEY.reference(getRefDocId('teams', sport)), async () => { if (!db) return []; const s = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, getRefDocId('teams', sport))), TIMEOUT.REFERENCE, null); return s?.exists() ? (s.data().data || []) : []; }, TTL.REFERENCE);
  }

  async fetchStandings(sport = SPORT.FOOTBALL) {
    return this.getOrSet(CACHE_KEY.reference(getRefDocId('standings', sport)), async () => { if (!db) return []; const s = await withTimeout(getDoc(doc(db, PATHS.REFERENCE_DATA, getRefDocDocId('standings', sport))), TIMEOUT.REFERENCE, null); return s?.exists() ? (s.data().data || []) : []; }, TTL.REFERENCE);
  }

  async fetchZokaPicks(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.zokaPicks(dateStr), async () => { if (!db) return null; const s = await withTimeout(getDoc(doc(db, PATHS.ZOKA_PICKS, dateStr)), TIMEOUT.SNAPSHOT_READ, null); return s?.exists() ? s.data() : null; }, TTL.ZOKA_PICKS, { event: EVENT.ZOKA_PICKS_UPDATED, eventPayload: d => ({ dateStr, picks: d }) });
  }

  async fetchZokaVotes(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.zokaVotes(dateStr), async () => { if (!db) return { stats: {} }; const s = await withTimeout(getDoc(doc(db, PATHS.ZOKA_VOTE_STATS, dateStr)), TIMEOUT.SNAPSHOT_READ, null); return s?.exists() ? { stats: s.data()?.stats || {} } : { stats: {} }; }, TTL.ZOKA_VOTES);
  }

  async fetchActivePredictions(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.activePredictions(dateStr), async () => {
      if (!db) return [];
      const s = await withTimeout(getDoc(doc(db, PATHS.PREDICTION_SNAPSHOTS, dateStr)), TIMEOUT.SNAPSHOT_READ, null);
      if (s?.exists()) return s.data().predictions || [];
      const q = await withTimeout(getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr))), TIMEOUT.COLLECTION_QUERY, { docs: [] });
      return q?.docs ? q.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.priority || 0) - (a.priority || 0)) : [];
    }, TTL.ACTIVE_PREDICTIONS, { event: EVENT.PREDICTIONS_UPDATED, eventPayload: d => ({ dateStr, predictions: d }) });
  }

  async fetchUserPredictions(uid, dateStr) {
    if (!uid || !db) return {}; dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.userPredictions(uid, dateStr), async () => {
      let s = await withTimeout(getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '==', uid), where('matchDate', '==', dateStr))), TIMEOUT.USER_QUERY, null);
      if (!s || s.empty) s = await withTimeout(getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '==', uid), limit(500))), TIMEOUT.USER_QUERY, null);
      if (!s || s.empty) return {};
      const map = {}; s.docs.forEach(d => { const data = d.data(); if (data.matchDate && data.matchDate !== dateStr) return; const e = { id: d.id, ...data }; [d.id, data.predId, data.matchId].filter(Boolean).map(String).forEach(k => map[k] = e); }); return map;
    }, TTL.USER_DATA);
  }

  async fetchPredictionResults(uid, dateStr) {
    if (!uid || !db) return { results: [], resultMap: {} }; dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.predictionResults(uid, dateStr), async () => {
      let s = await withTimeout(getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('userId', '==', uid), where('matchDate', '==', dateStr))), TIMEOUT.USER_QUERY, null);
      if (!s || s.empty) s = await withTimeout(getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('userId', '==', uid), limit(500))), TIMEOUT.USER_QUERY, null);
      if (!s || s.empty) return { results: [], resultMap: {} };
      const results = [], map = {}; s.docs.forEach(d => { const data = d.data(); if (data.matchDate && data.matchDate !== dateStr) return; results.push({ id: d.id, ...data }); if (data.matchId) map[String(data.matchId)] = { id: d.id, ...data }; }); results.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0)); return { results, resultMap: map };
    }, TTL.USER_DATA);
  }

  async fetchUserPoints(uid) {
    if (!uid || !db) return null;
    return this.getOrSet(CACHE_KEY.userPoints(uid), async () => { const s = await withTimeout(getDoc(doc(db, PATHS.USER_POINTS_TOTAL, uid)), TIMEOUT.SNAPSHOT_READ, null); return s?.exists() ? s.data() : null; }, TTL.USER_DATA);
  }

  async fetchDailyLeaderboard(dateStr) {
    dateStr = dateStr || todayStr();
    return this.getOrSet(CACHE_KEY.dailyLeaderboard(dateStr), async () => { if (!db) return null; const s = await withTimeout(getDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr)), TIMEOUT.SNAPSHOT_READ, null); return s?.exists() ? s.data() : null; }, TTL.DAILY_LEADERBOARD, { event: EVENT.DAILY_LEADERBOARD_UPDATED, eventPayload: d => ({ dateStr, leaderboard: d }) });
  }

  async fetchHistoricalLeaderboard(period) {
    const docId = period === 'goat' ? 'current' : period === 'weekly' ? `weekly_${getWeekStart()}` : period === 'monthly' ? `monthly_${getMonthStart()}` : period;
    return this.getOrSet(CACHE_KEY.historical(period), async () => { if (!db) return { entries: [], stale: true }; const s = await withTimeout(getDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId)), TIMEOUT.SNAPSHOT_READ, null); if (!s?.exists()) return { entries: [], stale: true }; return { entries: s.data().entries || [], stale: false }; }, TTL.HISTORICAL, { event: EVENT.LEADERBOARD_UPDATED, eventPayload: d => ({ period, leaderboard: d }) });
  }

  getScoreMap(preds) { const m = new Map(); preds?.forEach(p => { if (p.status === 'finished' && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore }); }); return m; }

  onFixturesUpdated(s, cb) { return eventBus.on(s === SPORT.BASKETBALL ? EVENT.BASKETBALL_UPDATED : EVENT.FOOTBALL_UPDATED, cb); }
  onPredictionsUpdated(cb) { return eventBus.on(EVENT.PREDICTIONS_UPDATED, cb); }
  onLeaderboardUpdated(cb) { return eventBus.on(EVENT.LEADERBOARD_UPDATED, cb); }
  onCacheInvalidated(cb) { return eventBus.on(EVENT.CACHE_INVALIDATED, cb); }
}

export async function saveUserPrediction({ matchId, homeScore, awayScore, matchDate, extra = {} }) {
  const uid = auth.currentUser?.uid; if (!uid || !matchId) throw new Error('Not signed in');
  const docId = `${uid}_${String(matchId)}`;
  await setDoc(doc(db, PATHS.USER_PREDICTIONS, docId), { userId: uid, matchId: String(matchId), predId: docId, matchDate: matchDate || todayStr(), homeScore: Number(homeScore), awayScore: Number(awayScore), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra }, { merge: true });
}
export async function deleteUserPrediction(matchId) { const uid = auth.currentUser?.uid; if (!uid || !matchId) return; await deleteDoc(doc(db, PATHS.USER_PREDICTIONS, `${uid}_${String(matchId)}`)); }

export const dataLayer = new DataLayer();
export default dataLayer;