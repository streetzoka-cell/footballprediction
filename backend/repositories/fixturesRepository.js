const { COLLECTIONS, TTL } = require('../config/constants');
const { smartBatchWrite, clearCollection, getDb } = require('../config/firebase');

class FixturesRepository {
  async upsertFixtures(matches, dateStr) {
    const tagged = matches.map(m => ({ ...m, date: dateStr || m.date?.split('T')[0] }));
    return smartBatchWrite(COLLECTIONS.FIXTURES, tagged, TTL.FIXTURES);
  }

  async getByDate(dateStr) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.FIXTURES).where('date', '==', dateStr).get();
    return snap.docs.map(d => d.data());
  }

  async getLive() {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.LIVE_FIXTURES).get();
    return snap.docs.map(d => d.data());
  }

  async replaceLive(matches) {
    await clearCollection(COLLECTIONS.LIVE_FIXTURES);
    if (!matches.length) return { written: 0 };
    return smartBatchWrite(COLLECTIONS.LIVE_FIXTURES, matches, TTL.LIVE_FIXTURES);
  }

  async getResults(dateStr) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.RESULTS).where('date', '==', dateStr).get();
    return snap.docs.map(d => d.data());
  }

  async upsertResults(matches, dateStr) {
    const tagged = matches.map(m => ({ ...m, date: dateStr || m.date?.split('T')[0] }));
    return smartBatchWrite(COLLECTIONS.RESULTS, tagged, TTL.RESULTS);
  }
}

module.exports = new FixturesRepository();