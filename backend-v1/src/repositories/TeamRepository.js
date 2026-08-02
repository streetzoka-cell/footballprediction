const { getDb, withTTL } = require('../config/firebase');
const { COLLECTIONS, TTL } = require('../config/constants');

async function upsert(team) {
  const db = getDb();

  await db
    .collection(COLLECTIONS.TEAMS)
    .doc(String(team.id))
    .set(withTTL(team, TTL.TEAMS), { merge: true });
}

async function get(id) {
  const db = getDb();

  const snap = await db.collection(COLLECTIONS.TEAMS).doc(String(id)).get();

  return snap.exists ? snap.data() : null;
}

async function getByLeague(leagueId) {
  const db = getDb();

  const snap = await db
    .collection(COLLECTIONS.TEAMS)
    .where('leagueId', '==', String(leagueId))
    .get();

  return snap.docs.map((d) => d.data());
}

module.exports = {
  upsert,
  get,
  getByLeague,
};