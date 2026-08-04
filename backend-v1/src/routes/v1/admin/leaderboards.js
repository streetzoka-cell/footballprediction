const express = require('express');
const router = express.Router();

const adminAuth = require('../../../middleware/adminAuth');
const LeaderboardEngine = require('../../../services/LeaderboardEngine');
const RankingEngine = require('../../../services/RankingEngine');
const finishedFixturesJob = require('../../../scheduler/jobs/finishedFixturesJob'); // ★ FIX: Correct path (../../../)

router.use(adminAuth);

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

router.post('/resolve', async (req, res, next) => {
  try {
    const result = await RankingEngine.resolveMatch(req.body || {});
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

router.post('/rebuild/:period', async (req, res, next) => {
  try {
    const period = String(req.params.period || '').trim();
    const dateStr = String(req.body?.dateStr || '').trim();

    // ★ NEW: Handle Fixtures Rebuild in the background to avoid Cloudflare timeout
    if (period === 'fixtures') {
      // Respond immediately so Cloudflare doesn't cancel the request
      res.json({ success: true, message: 'Refresh triggered in background.' });
      
      // Run the job in the background
      finishedFixturesJob.execute(true).catch(err => {
        console.error('[Admin Background] Finished fixtures refresh failed:', err.message);
      });
      return;
    }

    if (period === 'daily') {
      const result = await LeaderboardEngine.rebuildDailyLeaderboard(dateStr || todayStr());
      return res.json({ success: true, result });
    }

    if (period === 'weekly' || period === 'monthly' || period === 'goat') {
      const result = await LeaderboardEngine.rebuildPeriod(period, dateStr);
      return res.json({ success: true, result });
    }

    if (period === 'all') {
      const date = dateStr || todayStr();
      const daily = await LeaderboardEngine.rebuildDailyLeaderboard(date);
      const weekly = await LeaderboardEngine.rebuildPeriod('weekly');
      const monthly = await LeaderboardEngine.rebuildPeriod('monthly');
      const goat = await LeaderboardEngine.rebuildPeriod('goat');
      return res.json({ success: true, result: { daily, weekly, monthly, goat } });
    }

    return res.status(400).json({ success: false, error: { code: 'INVALID_PERIOD', message: 'Invalid period' } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;