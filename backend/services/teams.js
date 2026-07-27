const logger = require("../utils/logger");
const snapshotWriter = require("./snapshotWriter");

class TeamsProcessor {
  constructor(teamRepository) {
    if (!teamRepository) {
      throw new Error("TeamRepository is required.");
    }
    this.repo = teamRepository;
  }

  async process(rawFixtures) {
    const startTime = Date.now();

    if (!Array.isArray(rawFixtures) || rawFixtures.length === 0) {
      return { total: 0, writes: 0, duration: 0 };
    }

    const teamsMap = new Map();

    for (const fixture of rawFixtures) {
      const teams = fixture.teams;
      if (!teams) continue;

      for (const side of ["home", "away"]) {
        const team = teams[side];
        if (!team?.id) continue;

        if (!teamsMap.has(team.id)) {
          teamsMap.set(team.id, this.normalize(team));
        }
      }
    }

    const docs = Array.from(teamsMap.values());

    if (docs.length === 0) {
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    logger.info(`[Teams] Extracted ${docs.length} unique teams from ${rawFixtures.length} fixtures`);

    const writes = await this.repo.batchUpsertTeams(docs);

    try {
      await snapshotWriter.writeReference("teams", "football", docs);
    } catch (err) {
      logger.error(`[Teams] Snapshot write failed: ${err.message}`);
    }

    const duration = Date.now() - startTime;

    logger.info(`[Teams] ${writes} writes (${duration} ms)`);

    return {
      total: docs.length,
      writes,
      duration,
    };
  }

  normalize(team) {
    return {
      id: team.id,
      name: team.name,
      logo: team.logo,
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