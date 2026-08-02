const { getDb, withTTL } = require('../config/firebase');
const { COLLECTIONS, TTL } = require('../config/constants');

async function getLineups(fixtureId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.LINEUPS).doc(String(fixtureId)).get();
  return snap.exists ? snap.data() : null;
}

async function upsertLineups(fixtureId, data) {
  const db = getDb();
  await db
    .collection(COLLECTIONS.LINEUPS)
    .doc(String(fixtureId))
    .set(withTTL(data, TTL.LINEUPS), { merge: true });
}

async function getStatistics(fixtureId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.STATISTICS).doc(String(fixtureId)).get();
  return snap.exists ? snap.data() : null;
}

async function upsertStatistics(fixtureId, data) {
  const db = getDb();
  await db
    .collection(COLLECTIONS.STATISTICS)
    .doc(String(fixtureId))
    .set(withTTL(data, TTL.STATISTICS), { merge: true });
}

async function getPredictions(fixtureId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.PREDICTIONS).doc(String(fixtureId)).get();
  return snap.exists ? snap.data() : null;
}

async function upsertPredictions(fixtureId, data) {
  const db = getDb();
  await db
    .collection(COLLECTIONS.PREDICTIONS)
    .doc(String(fixtureId))
    .set(withTTL(data, TTL.PREDICTIONS), { merge: true });
}

async function getOdds(fixtureId) {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.ODDS).doc(String(fixtureId)).get();
  return snap.exists ? snap.data() : null;
}

async function upsertOdds(fixtureId, data) {
  const db = getDb();
  await db
    .collection(COLLECTIONS.ODDS)
    .doc(String(fixtureId))
    .set(withTTL(data, TTL.ODDS), { merge: true });
}

async function getH2H(key) {
  const db = getDb();
  const snap = await db.collection('head_to_head').doc(key).get();
  return snap.exists ? snap.data() : null;
}

async function upsertH2H(key, data) {
  const db = getDb();
  await db
    .collection('head_to_head')
    .doc(key)
    .set(withTTL({ id: key, matches: data }, 24 * 3600), { merge: true });
}

module.exports = {
  getLineups,
  upsertLineups,
  getStatistics,
  upsertStatistics,
  getPredictions,
  upsertPredictions,
  getOdds,
  upsertOdds,
  getH2H,
  upsertH2H,
};