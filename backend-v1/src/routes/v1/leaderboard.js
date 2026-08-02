// backend-v1/src/routes/v1/leaderboard.js

const express = require('express');
const router = express.Router();

const LeaderboardEngine = require('../../services/LeaderboardEngine');

/**
 * GET /api/v1/leaderboard/daily/:date
 */
router.get('/daily/:date', async (req, res, next) => {
  try {
    const date = String(req.params.date || '').trim();

    const data = await LeaderboardEngine.getDailyLeaderboard(date);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/leaderboard/summary/:period
 *
 * period = weekly | monthly | goat
 */
router.get('/summary/:period', async (req, res, next) => {
  try {
    const period = String(req.params.period || '').trim();

    const data = await LeaderboardEngine.getSummary(period);

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;