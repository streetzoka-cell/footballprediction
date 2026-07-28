const { COLLECTIONS, TTL } = require('../config/constants');
const { smartWrite, getDb } = require('../config/firebase');

class MatchDetailsRepository {
  async upsertLineups(fixtureId, data) {
    return smartWrite(COLLECTIONS.LINEUPS, String(fixtureId), data, TTL.LINEUPS);
  }
  async getLineups(fixtureId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.LINEUPS).doc(String(fixtureId)).get();
    return snap.exists ? snap.data() : null;
  }

  async upsertStatistics(fixtureId, data) {
    return smartWrite(COLLECTIONS.STATISTICS, String(fixtureId), data, TTL.STATISTICS);
  }
  async getStatistics(fixtureId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.STATISTICS).doc(String(fixtureId)).get();
    return snap.exists ? snap.data() : null;
  }

  async upsertPredictions(fixtureId, data) {
    return smartWrite(COLLECTIONS.PREDICTIONS, String(fixtureId), data, TTL.PREDICTIONS);
  }
  async getPredictions(fixtureId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.PREDICTIONS).doc(String(fixtureId)).get();
    return snap.exists ? snap.data() : null;
  }

  async upsertOdds(fixtureId, data) {
    return smartWrite(COLLECTIONS.ODDS, String(fixtureId), data, TTL.ODDS);
  }
  async getOdds(fixtureId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.ODDS).doc(String(fixtureId)).get();
    return snap.exists ? snap.data() : null;
  }

  async upsertH2H(key, data) {
    // H2H uses the same TTL as Predictions (24h)
    return smartWrite(COLLECTIONS.PREDICTIONS, `h2h_${key}`, data, TTL.PREDICTIONS);
  }
  async getH2H(key) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.PREDICTIONS).doc(`h2h_${key}`).get();
    return snap.exists ? snap.data() : null;
  }
}

module.exports = new MatchDetailsRepository();