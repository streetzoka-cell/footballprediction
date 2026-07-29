const { getDb, withTTL } = require('../config/firebase');
const { COLLECTIONS, TTL } = require('../config/constants');

async function upsert(leagueId, data) {
  const db = getDb();
  await db.collection(COLLECTIONS.STANDINGS).doc(String(leagueId)).set(withTTL(data, TTL.STANDINGS), { merge: true });
}

async function get(leagueId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.STANDINGS).doc(String(leagueId)).get();
  return snap.exists ? snap.data() : null;
}

async function getAll() {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.STANDINGS).get();
  return snap.docs.map(d => d.data());
}

module.exports = { upsert, get, getAll };