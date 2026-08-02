// footballprediction/backend-v1/src/routes/v1/admin/leaderboards.js

const express = require('express');
const router = express.Router();
const { rebuildDailyLeaderboard } = require('../../../scheduler/jobs/resolvePredictionsJob');

router.post('/rebuild/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { dateStr } = req.body;

    if (period === 'daily' && dateStr) {
      await rebuildDailyLeaderboard(dateStr);
      return res.status(200).json({ success: true, message: `Daily leaderboard rebuilt for ${dateStr}` });
    }
    
    return res.status(400).json({ error: 'Invalid period or missing dateStr' });
  } catch (err) {
    console.error('[AdminRoute] Rebuild error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
