const express = require('express');
const router = express.Router();
const ProviderManager = require('../../../providers/ProviderManager');
const memoryCache = require('../../../cache/MemoryCache');

router.get('/', async (req, res, next) => {
  try {
    const providerHealth = await ProviderManager.getHealthStatus();
    const cacheStats = memoryCache.stats();
    
    res.json({
      activeProvider: ProviderManager.getActiveProviderName(),
      providerHealth,
      memoryCache: cacheStats,
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (err) { next(err); }
});

module.exports = router;