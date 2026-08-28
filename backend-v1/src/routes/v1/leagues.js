// backend-v1/src/routes/v1/leagues.js
const express = require('express');
const router = express.Router();
const repo = require('../../repositories/LocalSnapshotRepository');

// GET /api/v1/leagues
router.get('/', async (req, res, next) => {
  try {
    const leagues = await repo.getLeaguesSnapshot();

    if (!leagues || leagues.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Leagues snapshot not available',
        hint: 'public_data/leagues.json missing or empty — run the leagues sync job',
      });
    }

    return res.json({ success: true, data: leagues, count: leagues.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/leagues/:id
router.get('/:id', async (req, res, next) => {
  try {
    const leagues = (await repo.getLeaguesSnapshot()) || [];
    const q = String(req.params.id).toLowerCase();

    const match = leagues.find((l) =>
      [l.id, l.leagueId, l.code, l.slug]
        .some((v) => v != null && String(v).toLowerCase() === q)
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'League not found',
        id: req.params.id,
        available: leagues.map((l) => l.leagueId ?? l.id).slice(0, 50),
      });
    }

    return res.json({ success: true, data: match });
  } catch (err) {
    next(err);
  }
});

module.exports = router;