// backend-v1/src/routes/v1/standings.js

const express = require('express');
const router = express.Router();

const localSnapshotRepo = require('../../repositories/LocalSnapshotRepository');
const { findLeague, getLeagueAliases } = require('../../config/leagues');

function matchesLeague(standing, identifiers) {
  if (!standing) return false;

  const candidates = [
    standing.id,
    standing.leagueId,
    standing.competitionId,
    standing.code,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return identifiers.some((id) =>
    candidates.includes(String(id).toLowerCase())
  );
}

/**
 * GET /api/v1/standings
 * GET /api/v1/standings?league=39
 */
router.get('/', async (req, res, next) => {
  try {
    const standings = await localSnapshotRepo.getStandingsSnapshot();
    const leagueQuery = req.query.league || req.query.leagueId;

    if (!leagueQuery) {
      return res.json({
        data: standings,
        count: standings.length,
      });
    }

    const league = findLeague(leagueQuery);
    const identifiers = league
      ? getLeagueAliases(league.id)
      : [String(leagueQuery)];

    const match = standings.find((standing) =>
      matchesLeague(standing, identifiers)
    );

    if (!match) {
      return res.status(404).json({
        data: null,
        error: 'Standings not found for this league',
      });
    }

    return res.json({
      data: match,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/standings/overview
 */
router.get('/overview', async (req, res, next) => {
  try {
    const standings = await localSnapshotRepo.getStandingsSnapshot();

    return res.json({
      data: standings,
      count: standings.length,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;