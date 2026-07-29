const express = require('express');
const router = express.Router();
const ProviderManager = require('../../../providers/ProviderManager');
const memoryCache = require('../../../cache/MemoryCache');
const { getLogs } = require('../../../utils/logStore'); // ★ NEW IMPORT

router.get('/', async (req, res, next) => {
  try {
    const providerHealth = await ProviderManager.getHealthStatus();
    const cacheStats = memoryCache.stats();
    
    res.json({
      status: 'healthy',
      provider: ProviderManager.getActiveProviderName(),
      budgetRemaining: providerHealth?.budgetRemaining ?? 'N/A',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      memoryCache: cacheStats
    });
  } catch (err) { next(err); }
});

// Metrics for the Hacker Dashboard
router.get('/metrics', (req, res) => {
  const cacheStats = memoryCache.stats();
  
  res.json({
    totalRequests: global.requestCount || 0,
    errorCount: global.errorCount || 0,
    cacheHits: cacheStats.hits || 0,
    cacheMisses: cacheStats.misses || 0,
    activeProvider: ProviderManager.getActiveProviderName()
  });
});

// Live Logs for the Terminal
router.get('/logs', (req, res) => {
  res.json({ logs: getLogs() });
});

module.exports = router;