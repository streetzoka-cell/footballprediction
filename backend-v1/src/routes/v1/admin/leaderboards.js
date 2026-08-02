// backend-v1/src/routes/v1/admin/leaderboards.js

const express = require('express');
const router = express.Router();

const adminAuth = require('../../../middleware/adminAuth');
const LeaderboardEngine = require('../../../services/LeaderboardEngine');
const RankingEngine = require('../../../services/RankingEngine');

router.use(adminAuth);

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * POST /api/v1/admin/leaderboards/resolve
 *
 * Body:
 * {
 *   "matchId": "123",
 *   "homeScore": 2,
 *   "awayScore": 1,
 *   "matchDate": "2026-08-02"
 * }
 */
router.post('/resolve', async (req, res, next) => {
  try {
    const result = await RankingEngine.resolveMatch(req.body || {});

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/leaderboards/rebuild/:period
 *
 * period = daily | weekly | monthly | goat | all
 */
router.post('/rebuild/:period', async (req, res, next) => {
  try {
    const period = String(req.params.period || '').trim();
    const dateStr = String(req.body?.dateStr || '').trim();

    if (period === 'daily') {
      const result = await LeaderboardEngine.rebuildDailyLeaderboard(
        dateStr || todayStr()
      );

      return res.json({
        success: true,
        result,
      });
    }

    if (period === 'weekly' || period === 'monthly' || period === 'goat') {
      const result = await LeaderboardEngine.rebuildPeriod(period, dateStr);

      return res.json({
        success: true,
        result,
      });
    }

    if (period === 'all') {
      const date = dateStr || todayStr();

      const daily = await LeaderboardEngine.rebuildDailyLeaderboard(date);
      const weekly = await LeaderboardEngine.rebuildPeriod('weekly');
      const monthly = await LeaderboardEngine.rebuildPeriod('monthly');
      const goat = await LeaderboardEngine.rebuildPeriod('goat');

      return res.json({
        success: true,
        result: {
          daily,
          weekly,
          monthly,
          goat,
        },
      });
    }

    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PERIOD',
        message: 'Invalid period',
        details: [],
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;