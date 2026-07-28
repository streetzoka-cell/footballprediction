const { COLLECTIONS, TTL } = require('../config/constants');
const { smartWrite, getDb } = require('../config/firebase');

class TeamsRepository {
  async upsertTeam(teamId, data) {
    return smartWrite(COLLECTIONS.TEAMS, String(teamId), data, TTL.TEAMS);
  }

  async getTeam(teamId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.TEAMS).doc(String(teamId)).get();
    return snap.exists ? snap.data() : null;
  }
}

module.exports = new TeamsRepository();