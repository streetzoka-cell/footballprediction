const { COLLECTIONS, TTL } = require('../config/constants');
const { smartWrite, getDb } = require('../config/firebase');

class PlayersRepository {
  async upsertPlayer(playerId, data) {
    return smartWrite(COLLECTIONS.PLAYERS, String(playerId), data, TTL.PLAYERS);
  }

  async getPlayer(playerId) {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.PLAYERS).doc(String(playerId)).get();
    return snap.exists ? snap.data() : null;
  }
}

module.exports = new PlayersRepository();