/*
 * finishedFixtures.js
 * Pure processor — NO API calls. NO Firestore reads.
 *
 * Processes raw fixture data passed in from:
 *   1. Daily fixtures service (yesterday's FT fixtures via process())
 *   2. Live polling service (fixtures that just went FT via normalize() + repo)
 *
 * Zero API cost. Zero read cost.
 * Filter → deduplicate → normalize → batch write with merge.
 *
 * WHY NO READS:
 *   Previous version called getFinishedFixture() for every fixture
 *   to check if it changed. On a day with 50 finished games, that's
 *   50 Firestore reads — wasted budget. batchWrite with merge:true
 *   handles this: existing docs get merged, new docs get created.
 *   Overwriting unchanged fields with identical values costs nothing
 *   extra in a batch write.
 */

const { FINISHED_STATUSES } = require("../config/constants");
const logger = require("../utils/logger");

class FinishedFixturesProcessor {
  /**
   * @param {FixturesRepository} fixturesRepo
   */
  constructor(fixturesRepo) {
    if (!fixturesRepo) {
      throw new Error("FixturesRepository is required.");
    }
    this.repo = fixturesRepo;
  }

  // ==========================================================
  // PUBLIC
  // ==========================================================

  /**
   * Process raw API fixtures — filter FT, deduplicate, normalize, write.
   *
   * Produces FLAT docs (id at top level, fields as siblings).
   * This matches the format that firebase.js batchWrite expects:
   *   colRef.doc(String(doc.id))
   *   batch.set(ref, doc, { merge: true })
   *
   * @param {Array} rawFixtures - Raw fixture objects from API response
   * @returns {{ total: number, writes: number, duration: number }}
   */
  async process(rawFixtures) {
    const startTime = Date.now();

    if (!Array.isArray(rawFixtures) || rawFixtures.length === 0) {
      return { total: 0, writes: 0, duration: 0 };
    }

    // ── Filter to finished statuses only ──
    const finished = rawFixtures.filter((f) =>
      FINISHED_STATUSES.includes(f.fixture?.status?.short)
    );

    if (finished.length === 0) {
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    // ── Deduplicate by ID ──
    // Same fixture can arrive from multiple sources:
    //   - yesterday's daily fetch
    //   - live → finished transition
    const unique = this._deduplicate(finished);

    logger.info(
      `[FootballFT] Processing ${unique.length} finished fixtures`
    );

    // ── Normalize to flat docs ──
    const docs = unique.map((f) => this.normalize(f));

    // ── Batch write with merge — no reads needed ──
    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertFinished(docs);
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[FootballFT] ${writes}/${unique.length} written (${duration} ms)`
    );

    return {
      total: unique.length,
      writes,
      duration,
    };
  }

  /**
   * Normalize a raw football fixture into a finished document.
   *
   * Public so other services can call it directly when they
   * want to handle the batch write themselves.
   *
   * Returns a FLAT doc — id is a top-level field, not nested.
   */
  normalize(fixture) {
    const f = fixture.fixture;
    const l = fixture.league;
    const t = fixture.teams;
    const g = fixture.goals;
    const s = fixture.score;

    return {
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
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

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