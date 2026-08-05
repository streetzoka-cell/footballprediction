// backend-v1/src/routes/admin/ranking.js

const express = require('express');
const router = express.Router();

const adminAuth = require('../../../middleware/adminAuth');
const LeaderboardEngine = require('../../../services/LeaderboardEngine');
const RankingEngine = require('../../../services/RankingEngine');
const finishedFixturesJob = require('../../../scheduler/jobs/finishedFixturesJob');
const logger = require('../../../utils/logger');

router.use(adminAuth);

// In-memory flag to prevent concurrent fixture refresh jobs
let fixturesRefreshRunning = false;

const todayStr = () => new Date().toISOString().split('T')[0];

/**
 * Resolve finished match
 * Applies prediction points, user totals, and daily leaderboard.
 * Does NOT rebuild: weekly, monthly, GOAT.
 */
router.post('/resolve', async (req, res, next) => {
  try {
    const result = await RankingEngine.resolveMatch(req.body || {});
    
    logger.info(`[ADMIN] Match resolve requested: ${req.body?.matchId}`);

    return res.status(200).json({
      success: true,
      resolved: result.resolved,
      message: result.alreadyResolved 
        ? 'Match already processed.' 
        : 'Match resolved successfully.',
      result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Manual rebuild controller
 * Supported periods: /daily, /weekly, /monthly, /goat, /fixtures, /all
 */
router.post('/rebuild/:period', async (req, res, next) => {
  try {
    const period = String(req.params.period || '').trim().toLowerCase();
    const dateStr = String(req.body?.dateStr || '').trim();

    // 1. FIXTURES REFRESH (Runs async to prevent Cloudflare timeouts)
    if (period === 'fixtures') {
      if (fixturesRefreshRunning) {
        return res.status(409).json({
          success: true,
          message: 'Fixtures refresh already running.'
        });
      }

      fixturesRefreshRunning = true;

      // Respond immediately to prevent gateway timeouts
      res.status(202).json({
        success: true,
        message: 'Fixtures refresh started in background.'
      });

      finishedFixturesJob.execute(true)
        .catch(err => {
          logger.error(`[ADMIN] Finished fixtures refresh failed: ${err.message}`);
        })
        .finally(() => {
          fixturesRefreshRunning = false;
        });

      return;
    }

    // 2. DAILY LEADERBOARD
    if (period === 'daily') {
      const result = await LeaderboardEngine.rebuildDailyLeaderboard(dateStr || todayStr());
      logger.info('[ADMIN] Daily leaderboard rebuilt');
      
      return res.status(200).json({
        success: true,
        result
      });
    }

    // 3. PERIOD LEADERBOARDS (weekly, monthly, goat)
    if (['weekly', 'monthly', 'goat'].includes(period)) {
      const result = await LeaderboardEngine.rebuildPeriod(period, dateStr);
      logger.info(`[ADMIN] ${period} leaderboard rebuilt`);
      
      return res.status(200).json({
        success: true,
        result
      });
    }

    // 4. FULL REBUILD (Expensive operation - use carefully)
    if (period === 'all') {
      logger.warn('[ADMIN] Full leaderboard rebuild started');

      const date = dateStr || todayStr();

      // Executed sequentially to avoid overwhelming the database
      const daily = await LeaderboardEngine.rebuildDailyLeaderboard(date);
      const weekly = await LeaderboardEngine.rebuildPeriod('weekly');
      const monthly = await LeaderboardEngine.rebuildPeriod('monthly');
      const goat = await LeaderboardEngine.rebuildPeriod('goat');

      logger.info('[ADMIN] Full leaderboard rebuild completed');

      return res.status(200).json({
        success: true,
        result: {
          daily,
          weekly,
          monthly,
          goat
        }
      });
    }

    // Fallback for invalid periods
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PERIOD',
        message: 'Invalid rebuild period. Valid options: fixtures, daily, weekly, monthly, goat, all.'
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;