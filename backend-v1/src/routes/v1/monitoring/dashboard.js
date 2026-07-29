// backend-v1/src/routes/v1/monitoring/dashboard.js
const express = require('express');
const router = express.Router();
const ProviderManager = require('../../../providers/ProviderManager');
const memoryCache = require('../../../cache/MemoryCache');
const logger = require('../../../utils/logger');
const QuotaManager = require('../../../services/QuotaManager'); // ★ NEW IMPORT
const { getLogs } = require('../../../utils/logStore');

// --- LIVE LOG INTERCEPTOR ---
const recentLogs = [];
const MAX_LOGS = 150;

logger.on('log', (info) => {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  recentLogs.push(`[${timestamp}] ${info.level.toUpperCase()}: ${info.message}`);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();
});

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
  const quota = QuotaManager.getStats(); // ★ GET QUOTA STATS
  
  res.json({
    totalRequests: global.requestCount || 0,
    errorCount: global.errorCount || 0,
    cacheHits: cacheStats.hits || 0,
    cacheMisses: cacheStats.misses || 0,
    activeProvider: ProviderManager.getActiveProviderName(),
    quota: quota // ★ ADD TO RESPONSE
  });
});

// Live Logs for the Terminal
router.get('/logs', (req, res) => {
  res.json({ logs: getLogs() });
});

module.exports = router;