const { FINISHED_STATUSES } = require("../config/constants");
const logger = require("../utils/logger");
const { calculateMatchScore, categorizeMatch } = require("./matchScoreEngine");

class FinishedFixturesProcessor {
  constructor(fixturesRepo) {
    if (!fixturesRepo) {
      throw new Error("FixturesRepository is required.");
    }
    this.repo = fixturesRepo;
  }

  async process(rawFixtures) {
    const startTime = Date.now();

    if (!Array.isArray(rawFixtures) || rawFixtures.length === 0) {
      return { total: 0, writes: 0, duration: 0 };
    }

    const finished = rawFixtures.filter((f) =>
      FINISHED_STATUSES.includes(f.fixture?.status?.short)
    );

    if (finished.length === 0) {
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    const unique = this._deduplicate(finished);

    logger.info(`[FootballFT] Processing ${unique.length} finished fixtures`);

    const docs = unique.map((f) => this.normalize(f));

    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertFinished(docs);
    }

    const duration = Date.now() - startTime;

    logger.info(`[FootballFT] ${writes}/${unique.length} written (${duration} ms)`);

    return {
      total: unique.length,
      writes,
      duration,
    };
  }

  normalize(fixture) {
    const f = fixture.fixture;
    const l = fixture.league;
    const t = fixture.teams;
    const g = fixture.goals;
    const s = fixture.score;

    const doc = {
      id: f.id,
      date: f.date,
      timestamp: f.timestamp,
      status: f.status.short,
      statusLong: f.status.long,
      elapsed: f.status.elapsed ?? null,
      leagueId: l.id,
      leagueName: l.name,
      leagueCountry: l.country,
      leagueLogo: l.logo,
      leagueFlag: l.flag ?? null,
      season: l.season,
      round: l.round,
      homeTeamId: t.home.id,
      homeTeamName: t.home.name,
      homeTeamLogo: t.home.logo,
      awayTeamId: t.away.id,
      awayTeamName: t.away.name,
      awayTeamLogo: t.away.logo,
      goalsHome: g.home,
      goalsAway: g.away,
      scoreHalftimeHome: s.halftime?.home ?? null,
      scoreHalftimeAway: s.halftime?.away ?? null,
      scoreFulltimeHome: s.fulltime?.home ?? null,
      scoreFulltimeAway: s.fulltime?.away ?? null,
      scoreExtratimeHome: s.extratime?.home ?? null,
      scoreExtratimeAway: s.extratime?.away ?? null,
      scorePenaltyHome: s.penalty?.home ?? null,
      scorePenaltyAway: s.penalty?.away ?? null,
      sport: "football",
      _updatedAt: new Date().toISOString(),
    };

    // Attach Intelligence
    doc.matchScore = calculateMatchScore(doc);
    doc.category = categorizeMatch(doc.matchScore);

    return doc;
  }

  _deduplicate(fixtures) {
    const seen = new Set();
    return fixtures.filter((f) => {
      const id = f.fixture.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
}

module.exports = FinishedFixturesProcessor;