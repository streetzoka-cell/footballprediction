// backend-v1/src/routes/v1/leagues.js

const express = require('express');
const router = express.Router();

const localSnapshotRepo = require('../../repositories/LocalSnapshotRepository');
const { getLeagues, findLeague } = require('../../config/leagues');

/**
 * GET /api/v1/leagues
 */
router.get('/', async (req, res, next) => {
  try {
    const dynamicLeagues = await localSnapshotRepo.getLeaguesSnapshot();

    if (dynamicLeagues && dynamicLeagues.length > 0) {
      return res.json({
        data: dynamicLeagues,
        count: dynamicLeagues.length,
      });
    }

    const leagues = getLeagues();

    return res.json({
      data: leagues,
      count: leagues.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/leagues/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const league = findLeague(req.params.id);

    if (!league) {
      return res.status(404).json({
        data: null,
        error: 'League not found',
      });
    }

    return res.json({
      data: league,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;