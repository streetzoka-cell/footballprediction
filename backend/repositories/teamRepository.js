/*
 * teamRepository.js
 * Firestore repository for football team documents.
 * Teams are extracted from fixture data and upserted.
 * Append-only with merge — never delete existing teams
 * that aren't in the current batch.
 */

const { COLLECTIONS } = require("../config/constants");
const { batchWrite } = require("../config/firebase");
const logger = require("../utils/logger");

class TeamRepository {
  constructor() {
    // No db param needed — batchWrite from firebase.js
    // handles the database instance internally via getDb()
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  /**
   * Batch upsert team documents with merge.
   * Called when processing fixtures — extracts unique teams
   * and merges them into the teams collection.
   */
  async batchUpsertTeams(docs) {
    logger.info(
      `[TeamRepo] Upserting ${docs.length} teams`
    );

    return batchWrite(COLLECTIONS.TEAMS, docs);
  }
}

module.exports = TeamRepository;