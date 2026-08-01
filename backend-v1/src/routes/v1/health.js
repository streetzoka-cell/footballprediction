// backend-v1/src/routes/v1/health.js
const express = require('express');
const router = express.Router();
const ProviderManager = require('../../providers/ProviderManager');
const internetMonitor = require('../../services/InternetMonitor'); // ★ NEW

router.get('/', async (req, res) => {
  try {
    const providerHealth = await ProviderManager.getHealthStatus();
    
    res.json({
      status: 'healthy',
      internet: internetMonitor.isOnline,
      providers: providerHealth,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

module.exports = router;