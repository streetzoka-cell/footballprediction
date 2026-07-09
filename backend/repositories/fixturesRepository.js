/*
 * fixturesRepository.js
 * Firestore repository for football fixtures.
 * Added getAll methods for 3-day rollover (0 API cost reads).
 */

const { COLLECTIONS } = require("../config/constants");
const {
  replaceCollection,
  clearCollection,
  batchWrite,
  getDb,
} = require("../config/firebase");

class FixturesRepository {

  // ==========================================================
  // DAILY SNAPSHOTS — full replacement
  // ==========================================================

  async replaceYesterday(docs) {
    return replaceCollection(COLLECTIONS.YESTERDAY_FIXTURES, docs);
  }

  async replaceToday(docs) {
    return replaceCollection(COLLECTIONS.TODAY_FIXTURES, docs);
  }

  async replaceTomorrow(docs) {
    return replaceCollection(COLLECTIONS.TOMORROW_FIXTURES, docs);
  }

  // ==========================================================
  // READ — used by daily service for 3-day rollover
  // Firestore reads only — 0 API-Football cost
  // ==========================================================

  /**
   * Read all docs from tomorrowFixtures.
   * Called once per day during rollover before we overwrite it.
   */
  async getAllTomorrow() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.TOMORROW_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  /**
   * Read all docs from todayFixtures.
   * Called once per day during rollover.
   */
  async getAllToday() {
    const database = getDb();
    const snapshot = await database
      .collection(COLLECTIONS.TODAY_FIXTURES)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  // ==========================================================
  // LIVE FIXTURES — full replacement
  // ==========================================================

  async replaceLive(docs) {
    return replaceCollection(COLLECTIONS.LIVE_FIXTURES, docs);
  }

  async clearLive() {
    return clearCollection(COLLECTIONS.LIVE_FIXTURES);
  }

  // ==========================================================
  // FINISHED FIXTURES — merge upsert
  // ==========================================================

  async batchUpsertFinished(docs) {
    return batchWrite(COLLECTIONS.FINISHED_FIXTURES, docs);
  }
}

module.exports = FixturesRepository;