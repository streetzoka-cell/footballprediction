/*
 * basketballFixturesRepository.js
 * Firestore repository for basketball fixtures.
 * Added getAll methods for 3-day rollover.
 */

const { COLLECTIONS } = require("../config/constants");
const {
  replaceCollection,
  clearCollection,
  batchWrite,
  getDb,
} = require("../config/firebase");

class BasketballFixturesRepository {

  // ==========================================================
  // DAILY SNAPSHOTS
  // ==========================================================

  async replaceYesterday(docs) {
    return replaceCollection(COLLECTIONS.BASKETBALL_YESTERDAY_FIXTURES, docs);
  }

  async replaceToday(docs) {
    return replaceCollection(COLLECTIONS.BASKETBALL_TODAY_FIXTURES, docs);
  }

  async replaceTomorrow(docs) {
    return replaceCollection(COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES, docs);
  }

  // ==========================================================
  // READ — for rollover (0 API cost)
  // ==========================================================

  async getAllTomorrow() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.BASKETBALL_TOMORROW_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async getAllToday() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.BASKETBALL_TODAY_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  // ==========================================================
  // LIVE FIXTURES
  // ==========================================================

  async replaceLive(docs) {
    return replaceCollection(COLLECTIONS.BASKETBALL_LIVE_FIXTURES, docs);
  }

  async clearLive() {
    return clearCollection(COLLECTIONS.BASKETBALL_LIVE_FIXTURES);
  }

  // ==========================================================
  // FINISHED FIXTURES
  // ==========================================================

  async batchUpsertFinished(docs) {
    return batchWrite(COLLECTIONS.BASKETBALL_FINISHED_FIXTURES, docs);
  }
}

module.exports = BasketballFixturesRepository;