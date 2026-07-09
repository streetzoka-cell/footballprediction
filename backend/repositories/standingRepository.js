/*
 * standingRepository.js
 * Firestore repository for football league standings.
 * One document per league containing the full table.
 * Updated weekly via batch upsert with merge — never
 * deletes standings for a league if a single API call fails.
 */

const { COLLECTIONS } = require("../config/constants");
const { batchWrite } = require("../config/firebase");

class StandingRepository {
  // No db param — batchWrite from firebase.js
  // handles the database instance internally

  /**
   * Batch upsert standings documents with merge.
   * Called weekly by the standings scheduler.
   */
  async batchUpsertStandings(docs) {
    return batchWrite(COLLECTIONS.STANDINGS, docs);
  }
}

module.exports = StandingRepository;