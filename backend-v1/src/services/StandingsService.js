// backend-v1/src/services/StandingsService.js
const ApiFootballAdapter = require('../providers/ApiFootballAdapter');
const FootballDataAdapter = require('../providers/FootballDataAdapter');
const QuotaManager = require('./QuotaManager');
const StaticFilePublisher = require('./StaticFilePublisher');
const logger = require('../utils/logger');
const { CURRENT_SEASON } = require('../config/constants');

const LEAGUES_TO_SYNC = [
  { id: 39,  name: 'Premier League' },
  { id: 140, name: 'La Liga' },
  { id: 135, name: 'Serie A' },
  { id: 78,  name: 'Bundesliga' },
  { id: 61,  name: 'Ligue 1' },
  { id: 2,   name: 'UEFA Champions League' },
  { id: 3,   name: 'UEFA Europa League' },
].map((l) => ({ ...l, season: CURRENT_SEASON }));

/* Map both provider row shapes to ONE canonical row shape */
function mapRow(r) {
  if (r?.team && 'points' in r && r.all) {                    // API-Football & football-data rows
    return {
      rank: r.rank ?? r.position,
      teamId: r.team.id,
      teamName: r.team.name,
      played: r.all.played ?? r.playedGames,
      won: r.all.win ?? r.won,
      drawn: r.all.draw ?? r.draw,
      lost: r.all.lose ?? r.lost,
      goalsFor: r.all.goals?.for ?? r.goalsFor,
      goalsAgainst: r.all.goals?.against ?? r.goalsAgainst,
      goalDiff: r.goalsDiff ?? r.goalDifference,
      points: r.points,
      form: r.form || null,
    };
  }
  return r; // already canonical / unknown — pass through
}

function container(id, name, season, rows) {
  return {
    leagueId: String(id),
    leagueName: name,
    season,
    code: String(id),
    updatedAt: new Date().toISOString(),
    rows,
  };
}

/*
 * Normalize whatever the adapter returned into container+rows.
 * Handles every shape seen in production:
 *  A) API-Football container:  { league: { standings: [[rows]] } }
 *  B) HTTP envelope:           { response: [ { league: {...} } ] }
 *  C) football-data table objs:[ { type:'TOTAL', table:[rows] } ]
 *  D) football-data competition:{ id:'PL', standings: [[rows]] }   ← the one from the logs
 *  E) plain arrays:            { rows: [...] } / { table: [...] }
 */
function normalizeLeagueStandings(raw, meta) {
  if (!raw) return null;

  /* B) unwrap provider HTTP envelopes */
  let inner = raw;
  if (Array.isArray(raw?.response)) inner = raw.response[0] ?? null;
  else if (Array.isArray(raw?.data?.response)) inner = raw.data.response[0] ?? null;
  else if (raw?.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) inner = raw.data;

  for (const candidate of [raw, inner]) {
    if (!candidate || typeof candidate !== 'object') continue;

    // A) API-Football container
    if (candidate.league?.standings) {
      return container(meta.id, meta.name, meta.season, candidate.league.standings.flat().map(mapRow));
    }

    const tables = Array.isArray(candidate) ? candidate : candidate.standings;
    if (Array.isArray(tables)) {
      // C) objects with .table
      const tableObj = tables.find((t) => t?.table);
      if (tableObj?.table) {
        return container(meta.id, meta.name, meta.season, tableObj.table.map(mapRow));
      }

      // D) ★ nested array-of-arrays whose rows carry rank/position directly
      //    ({ id:'PL', standings: [[ {rank, team, points, all:{...}} ]] })
      const flattened = tables.flat();
      if (flattened[0] && (flattened[0].rank !== undefined || flattened[0].position !== undefined)) {
        return container(meta.id, meta.name, meta.season, flattened.map(mapRow));
      }
    }

    // E) plain arrays
    if (Array.isArray(candidate.rows)) return container(meta.id, meta.name, meta.season, candidate.rows.map(mapRow));
    if (Array.isArray(candidate.table)) return container(meta.id, meta.name, meta.season, candidate.table.map(mapRow));
  }

  /* Diagnostic — one run tells us exactly what arrived */
  logger.warn(
    `[StandingsService] Unrecognized standings shape for ${meta.name}: ` +
    JSON.stringify(raw).slice(0, 300)
  );
  return null;
}

async function syncStandings(force = false) {
  logger.info(`[StandingsService] Syncing standings for ${LEAGUES_TO_SYNC.length} leagues (season ${CURRENT_SEASON})`);
  let ok = 0, fail = 0;
  const allStandings = [];

  for (const league of LEAGUES_TO_SYNC) {
    try {
      let standings = null;

      // 1. FootballData first (free) — skipped when force=true (job override)
      if (!force) {
        try {
          standings = await FootballDataAdapter.getStandings(league.id, league.season);
        } catch (fdErr) {
          logger.warn(`[StandingsService] FootballData failed for ${league.name}: ${fdErr.message}`);
        }
      }

      // 2. Fallback: API-Football (budgeted)
      if (!standings && QuotaManager.canUseFallback()) {
        logger.info(`[StandingsService] Using API-Football for ${league.name}.`);
        standings = await ApiFootballAdapter.getStandings(league.id, league.season);
        if (standings) QuotaManager.recordFallbackCall();
      } else if (!standings && !QuotaManager.canUseFallback()) {
        logger.warn(`[StandingsService] Skipping ${league.name} — fallback budget exhausted.`);
      }

      const normalized = normalizeLeagueStandings(standings, league);
      if (normalized) {
        allStandings.push(normalized);
        ok++;
      } else {
        fail++;
      }
    } catch (err) {
      logger.error(`[StandingsService] Error processing ${league.name}: ${err.message}`);
      fail++;
    }
  }

  await StaticFilePublisher.publishJSON('standings.json', {
    success: true,
    data: allStandings,
    count: allStandings.length,
    updatedAt: new Date().toISOString(),
  });

  logger.info(`[StandingsService] ✓ Standings: ${ok} ok, ${fail} fail`);
  return { ok, fail };
}

// normalizeLeagueStandings exported so the shape can be self-tested
// without touching providers or PM2.
module.exports = { syncStandings, normalizeLeagueStandings };