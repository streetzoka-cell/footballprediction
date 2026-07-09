/*
 * basketballFinishedFixtures.js
 * Pure processor — NO API calls. NO Firestore reads.
 *
 * Processes raw fixture data passed in from:
 *   1. Daily fixtures service (yesterday's FT fixtures via process())
 *   2. Daily fixtures service (backfill last 100 via normalize() + repo)
 *   3. Live polling service (fixtures that just went FT via normalize() + repo)
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

const { BASKETBALL_FINISHED_STATUSES } = require("../config/constants");
const logger = require("../utils/logger");

class BasketballFinishedFixturesProcessor {
  /**
   * @param {BasketballFixturesRepository} basketballFixturesRepository
   */
  constructor(basketballFixturesRepository) {
    if (!basketballFixturesRepository) {
      throw new Error("BasketballFixturesRepository is required.");
    }
    this.repo = basketballFixturesRepository;
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
   * It also matches what callers do when they bypass process()
   * and call normalize() directly:
   *   const ftDocs = raw.map(f => ftProcessor.normalize(f));
   *   repo.batchUpsertFinished(ftDocs);
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
      BASKETBALL_FINISHED_STATUSES.includes(f.status?.short)
    );

    if (finished.length === 0) {
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    // ── Deduplicate by ID ──
    // Same fixture can arrive from multiple sources:
    //   - yesterday's daily fetch
    //   - backfill from season data
    //   - live → finished transition
    const unique = this._deduplicate(finished);

    logger.info(
      `[BasketballFT] Processing ${unique.length} finished fixtures`
    );

    // ── Normalize to flat docs ──
    const docs = unique.map((f) => this.normalize(f));

    // ── Batch write with merge — no reads needed ──
    // merge:true means:
    //   - New doc → created
    //   - Existing doc → fields merged (unchanged fields stay identical)
    //   - No need to read first to check "did anything change?"
    let writes = 0;
    if (docs.length > 0) {
      writes = await this.repo.batchUpsertFinished(docs);
    }

    const duration = Date.now() - startTime;

    logger.info(
      `[BasketballFT] ${writes}/${unique.length} written (${duration} ms)`
    );

    return {
      total: unique.length,
      writes,
      duration,
    };
  }

  /**
   * Normalize a raw basketball fixture into a finished document.
   *
   * Public so other services can call it directly when they
   * want to handle the batch write themselves (e.g., daily
   * backfill passes normalize() output straight to repo).
   *
   * Returns a FLAT doc — id is a top-level field, not nested.
   * This is critical for firebase.js batchWrite which does:
   *   colRef.doc(String(doc.id))
   *   batch.set(ref, doc, { merge: true })
   *
   * If id were nested inside a `data` object, batchWrite would
   * try to use `undefined` as the document ID.
   */
  normalize(fixture) {
    const scores = fixture.scores || {};

    return {
      id: fixture.id,

      date: fixture.date,
      timestamp: fixture.timestamp,

      status: fixture.status?.short || "FT",
      statusLong: fixture.status?.long || "Finished",

      leagueId: fixture.league?.id,
      leagueName: fixture.league?.name,
      leagueCountry: fixture.league?.country,
      leagueLogo: fixture.league?.logo,
      season: fixture.league?.season,

      homeTeamId: fixture.teams?.home?.id,
      homeTeamName: fixture.teams?.home?.name,
      homeTeamLogo: fixture.teams?.home?.logo,

      awayTeamId: fixture.teams?.away?.id,
      awayTeamName: fixture.teams?.away?.name,
      awayTeamLogo: fixture.teams?.away?.logo,

      pointsHome: scores.home?.total ?? null,
      pointsAway: scores.away?.total ?? null,

      // Quarter breakdowns — preserved when coming from live
      // transitions, null when coming from daily non-live fetches
      q1Home: scores.home?.q1 ?? null,
      q1Away: scores.away?.q1 ?? null,
      q2Home: scores.home?.q2 ?? null,
      q2Away: scores.away?.q2 ?? null,
      q3Home: scores.home?.q3 ?? null,
      q3Away: scores.away?.q3 ?? null,
      q4Home: scores.home?.q4 ?? null,
      q4Away: scores.away?.q4 ?? null,

      otHome: scores.home?.ot ?? null,
      otAway: scores.away?.ot ?? null,

      sport: "basketball",
      _updatedAt: new Date().toISOString(),
    };
  }

  // ==========================================================
  // PRIVATE
  // ==========================================================

  _deduplicate(fixtures) {
    const seen = new Set();
    return fixtures.filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  }
}

module.exports = BasketballFinishedFixturesProcessor;