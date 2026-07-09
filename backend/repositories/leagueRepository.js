/*
 * leagueRepository.js
 * Firestore repository for football league documents.
 * Leagues are replaced weekly — full clear + write.
 */

const { COLLECTIONS } = require("../config/constants");
const { replaceCollection } = require("../config/firebase");

class LeagueRepository {
  // No db param — replaceCollection from firebase.js
  // handles the database instance internally

  /**
   * Replace all league documents.
   * Called weekly by the leagues scheduler.
   */
  async replaceLeagues(docs) {
    return replaceCollection(COLLECTIONS.LEAGUES, docs);
  }
}

module.exports = LeagueRepository;