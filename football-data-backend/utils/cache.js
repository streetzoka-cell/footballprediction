const { db } = require('../config/firebase');
const logger = require('./logger');

const BATCH_SIZE = 500;

function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'boolean') return obj;
  if (typeof obj === 'number') return Number.isNaN(obj) ? 0 : obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  if (typeof obj === 'object' && obj.constructor === Object) {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (obj[k] !== undefined) out[k] = sanitize(obj[k]);
    }
    return out;
  }
  return null;
}

async function getCollection(name) {
  try {
    const s = await db.collection(name).get();
    if (s.empty) return [];
    return s.docs.map(d => ({ id: d.id, data: d.data() }));
  } catch (e) { logger.error('[CACHE] getCollection(' + name + ') ' + e.message); return []; }
}

async function getDocument(name, id) {
  try {
    const d = await db.collection(name).doc(id).get();
    return d.exists ? d.data() : null;
  } catch (e) { logger.error('[CACHE] getDocument(' + name + '/' + id + ') ' + e.message); return null; }
}

async function setDocument(name, id, data) {
  try { await db.collection(name).doc(id).set(sanitize(data)); }
  catch (e) { logger.error('[CACHE] setDocument(' + name + '/' + id + ') ' + e.message); throw e; }
}

async function batchSet(name, docs) {
  if (!docs.length) return;
  try {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const chunk = docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const item of chunk) {
        batch.set(db.collection(name).doc(String(item.id)), sanitize(item.data));
      }
      await batch.commit();
    }
    logger.debug('[CACHE] batchSet(' + name + ') - ' + docs.length + ' docs');
  } catch (e) { logger.error('[CACHE] batchSet(' + name + ') ' + e.message); throw e; }
}

async function clearCollection(name) {
  try {
    const s = await db.collection(name).get();
    if (s.empty) return;
    for (let i = 0; i < s.docs.length; i += BATCH_SIZE) {
      const chunk = s.docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
    }
    logger.debug('[CACHE] clearCollection(' + name + ') - ' + s.size + ' removed');
  } catch (e) { logger.error('[CACHE] clearCollection(' + name + ') ' + e.message); throw e; }
}

async function replaceCollection(name, docs) {
  await clearCollection(name);
  if (docs.length) await batchSet(name, docs);
}

async function getLastUpdated(type) { return getDocument('lastUpdated', type); }
async function setLastUpdated(type, details) { await setDocument('lastUpdated', type, Object.assign({ timestamp: new Date().toISOString() }, details || {})); }

module.exports = { getCollection, getDocument, setDocument, batchSet, clearCollection, replaceCollection, getLastUpdated, setLastUpdated, sanitize };
