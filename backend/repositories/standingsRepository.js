const { COLLECTIONS, TTL } = require('../config/constants');
const { smartWrite, getDb } = require('../config/firebase');

class StandingsRepository {
  async upsert(leagueId, leagueData) {
    return smartWrite(COLLECTIONS.STANDINGS, String(leagueId), {
      id: String(leagueId),
      ...leagueData,
    }, TTL.STANDINGS);
  }

  async getByLeague(leagueId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.STANDINGS).doc(String(leagueId)).get();
    return snap.exists ? snap.data() : null;
  }

  async getAll() {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.STANDINGS).get();
    return snap.docs.map(d => d.data());
  }
}

module.exports = new StandingsRepository();