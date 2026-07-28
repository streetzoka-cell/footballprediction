/**
 * Persistent circuit breaker for API endpoints.
 *
 * Problem this solves: the old in-memory `let xDisabled = false` flags reset
 * to false every time the process restarts, so a 403/404 endpoint gets
 * hammered again on every `node index.js`. This version stores the flags in
 * Firestore (system/circuitBreakers) so they survive restarts and are shared
 * across multiple instances, and resets automatically once per UTC day.
 */
const { getDb } = require('../config/firebase');
const logger = require('./logger');

const COLLECTION = 'system';
const DOC_ID = 'circuitBreakers';
const todayStr = () => new Date().toISOString().split('T')[0];

let cache = null; // { date: 'YYYY-MM-DD', flags: { predictions: true, odds: false, ... } }
let loadingPromise = null;

async function load() {
  if (cache && cache.date === todayStr()) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const db = getDb();
    const ref = db.collection(COLLECTION).doc(DOC_ID);
    let data = null;
    try {
      const snap = await ref.get();
      data = snap.exists ? snap.data() : null;
    } catch (err) {
      logger.error(`[CircuitBreaker] Load failed: ${err.message}. Defaulting to all-enabled for this process.`);
      cache = { date: todayStr(), flags: {} };
      loadingPromise = null;
      return cache;
    }

    if (data && data.date === todayStr()) {
      cache = { date: data.date, flags: data.flags || {} };
    } else {
      cache = { date: todayStr(), flags: {} };
      try {
        await ref.set(cache);
      } catch (err) {
        logger.error(`[CircuitBreaker] Reset write failed: ${err.message}`);
      }
      logger.info(`[CircuitBreaker] Reset for new day (${cache.date})`);
    }
    loadingPromise = null;
    return cache;
  })();

  return loadingPromise;
}

async function isDisabled(name) {
  const state = await load();
  return !!state.flags[name];
}

async function trip(name, reason = '') {
  const state = await load();
  if (state.flags[name]) return; // already tripped, don't re-log/re-write
  state.flags[name] = true;
  try {
    const db = getDb();
    await db.collection(COLLECTION).doc(DOC_ID).set(state, { merge: true });
  } catch (err) {
    logger.error(`[CircuitBreaker] Persist failed for ${name}: ${err.message}`);
  }
  logger.warn(`[CircuitBreaker] ${name} disabled${reason ? ` (${reason})` : ''} — persisted until next UTC day.`);
}

/** For ops visibility / admin endpoints */
async function getStatus() {
  const state = await load();
  return { date: state.date, flags: { ...state.flags } };
}

module.exports = { isDisabled, trip, getStatus };