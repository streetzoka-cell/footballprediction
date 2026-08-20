// backend-v1/src/routes/v1/standings.js
const express = require('express');
const router = express.Router();

const localSnapshotRepo = require('../../repositories/LocalSnapshotRepository');

function matchesLeague(standing, queryId) {
  if (!standing) return false;

  const candidates = [
    String(standing.id || '').toLowerCase(),
    String(standing.leagueId || '').toLowerCase(),
    String(standing.competitionId || '').toLowerCase(),
    String(standing.code || '').toLowerCase()
  ].filter(Boolean);

  return candidates.includes(String(queryId).toLowerCase());
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

    // Safe lookup without relying on missing config functions
    const match = standings.find((standing) => matchesLeague(standing, leagueQuery));

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