// backend-v1/src/routes/v1/health.js

const express = require('express');
const router = express.Router();

const ProviderManager = require('../../providers/ProviderManager');

router.get('/', async (req, res) => {
  try {
    const summary = await ProviderManager.getHealthSummary();

    res.json({
      status: summary.internet ? 'healthy' : 'degraded',
      internet: summary.internet,
      activeProvider: summary.activeProvider,
      budgetRemaining: summary.budgetRemaining,
      providers: summary.providers,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: 'unhealthy',
      error: err.message,
    });
  }
});

module.exports = router;