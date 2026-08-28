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
  if (r?.team && 'points' in r && r.all) {                    // API-Football
    return {
      rank: r.rank,
      teamId: r.team.id,
      teamName: r.team.name,
      played: r.all.played,
      won: r.all.win,
      drawn: r.all.draw,
      lost: r.all.lose,
      goalsFor: r.all.goals?.for,
      goalsAgainst: r.all.goals?.against,
      goalDiff: r.goalsDiff,
      points: r.points,
      form: r.form || null,
    };
  }
  if (r?.team && 'playedGames' in r) {                        // football-data.org
    return {
      rank: r.position,
      teamId: r.team.id,
      teamName: r.team.name,
      played: r.playedGames,
      won: r.won,
      drawn: r.draw,
      lost: r.lost,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDiff: r.goalDifference,
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

/* Normalize whatever the adapter returned into our container+rows shape.
   Unknown shapes are rejected instead of published as garbage. */
function normalizeLeagueStandings(raw, meta) {
  if (!raw) return null;

  if (raw.league?.standings) {                                 // API-Football container
    return container(meta.id, meta.name, meta.season, raw.league.standings.flat().map(mapRow));
  }

  const tables = Array.isArray(raw) ? raw : raw.standings;     // football-data.org
  if (Array.isArray(tables)) {
    const total = tables.find((t) => t.type === 'TOTAL') || tables[0];
    if (total?.table) return container(meta.id, meta.name, meta.season, total.table.map(mapRow));
    if (tables[0] && (tables[0].rank !== undefined || tables[0].position !== undefined)) {
      return container(meta.id, meta.name, meta.season, tables.map(mapRow));
    }
  }

  if (Array.isArray(raw.rows)) return container(meta.id, meta.name, meta.season, raw.rows.map(mapRow));
  if (Array.isArray(raw.table)) return container(meta.id, meta.name, meta.season, raw.table.map(mapRow));

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

module.exports = { syncStandings };