/*
 * teams.js
 * Extracts team data from fixture responses.
 * Zero API calls — teams come from fixture data.
 *
 * OLD: Fetched teams per league (8 API calls)
 *     → expensive for data that rarely changes
 *
 * NEW: Pure processor — receives raw fixtures,
 *     extracts home/away teams, upserts with merge.
 *     Called by daily fixtures service after fetching.
 *
 * Teams accumulate over time as fixtures are processed.
 * Venue data not available from fixtures — if needed later,
 * add a lightweight weekly venue-only sync.
 */

const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class TeamsProcessor {
  constructor(teamRepository) {
    if (!teamRepository) {
      throw new Error("TeamRepository is required.");
    }
    this.repo = teamRepository;
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  /**
   * Extract teams from raw fixture data and upsert.
   * @param {Array} rawFixtures - Raw fixture objects from API response
   * @returns {{ total: number, writes: number, duration: number }}
   */
  async process(rawFixtures) {
    const startTime = Date.now();

    if (!Array.isArray(rawFixtures) || rawFixtures.length === 0) {
      return { total: 0, writes: 0, duration: 0 };
    }

    // Extract unique teams from fixtures
    const teamsMap = new Map();

    for (const fixture of rawFixtures) {
      const teams = fixture.teams;
      if (!teams) continue;

      for (const side of ["home", "away"]) {
        const team = teams[side];
        if (!team?.id) continue;

        // Only add if not already seen
        if (!teamsMap.has(team.id)) {
          teamsMap.set(team.id, this.normalize(team));
        }
      }
    }

    const docs = Array.from(teamsMap.values());

    if (docs.length === 0) {
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    logger.info(
      `[Teams] Extracted ${docs.length} unique teams from ${rawFixtures.length} fixtures`
    );

    // Batch upsert with merge
    // No diffing needed — data is simple (name, logo)
    // and merge handles idempotency efficiently
    const writes = await this.repo.batchUpsertTeams(docs);

    // ── Write reference snapshot for frontend ──
    try {
      await snapshotWriter.writeReference("teams", "football", docs);
    } catch (err) {
      logger.error(`[Teams] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[Teams] ${writes} writes (${duration} ms)`
    );

    return {
      total: docs.length,
      writes,
      duration,
    };
  }

  // ==========================================================
  // NORMALIZE
  // ==========================================================

  /**
   * Normalize a team object from a fixture response.
   * Light shape — venue data requires separate /teams endpoint
   * which we don't call to save budget.
   */
  normalize(team) {
    return {
      id: team.id,

      name: team.name,
      logo: team.logo,

      // Venue fields — null placeholders
      // Populate these with a weekly venue sync if needed
      venueName: null,
      venueAddress: null,
      venueCity: null,
      venueCapacity: null,
      venueSurface: null,
      venueImage: null,

      _updatedAt: new Date().toISOString(),
    };
  }
}

module.exports = TeamsProcessor;