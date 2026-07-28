const { COLLECTIONS, TTL } = require('../config/constants');
const { smartWrite, getDb } = require('../config/firebase');

class TopScorersRepository {
  async upsert(leagueId, scorers, leagueMeta = {}) {
    return smartWrite(COLLECTIONS.TOP_SCORERS, String(leagueId), {
      id: String(leagueId),
      league: leagueMeta,
      scorers,
    }, TTL.TOP_SCORERS);
  }

  async getByLeague(leagueId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.TOP_SCORERS).doc(String(leagueId)).get();
    return snap.exists ? snap.data() : null;
  }

  async getAll() {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.TOP_SCORERS).get();
    return snap.docs.map(d => d.data());
  }
}

module.exports = new TopScorersRepository();