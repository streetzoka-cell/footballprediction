// backend-v1/src/routes/v1/monitoring/dashboard.js
const express = require('express');
const os = require('os');
const router = express.Router();

const ProviderManager = require('../../../providers/ProviderManager');
const memoryCache = require('../../../cache/MemoryCache');
const logger = require('../../../utils/logger');
const QuotaManager = require('../../../services/QuotaManager');
const QueueService = require('../../../services/QueueService');
const PredictionStore = require('../../../services/PredictionStore');
const UserPredictionStore = require('../../../services/UserPredictionStore');
const RecoveryService = require('../../../services/RecoveryService');
const schedulerEngine = require('../../../scheduler/SchedulerEngine');
const internetMonitor = require('../../../services/InternetMonitor');
const adminAuth = require('../../../middleware/adminAuth');
const { getLogs } = require('../../../utils/logStore');

const recentLogs = [];
const MAX_LOGS = 150;

logger.on('log', (info) => {
  const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
  recentLogs.push(`[${timestamp}] ${info.level.toUpperCase()}: ${info.message}`);
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.shift();
  }
});

/**
 * Public basic health/monitoring compatibility endpoint.
 */
router.get('/', async (req, res, next) => {
  try {
    let summary = {};

    if (typeof ProviderManager.getHealthSummary === 'function') {
      summary = await ProviderManager.getHealthSummary();
    } else {
      summary = {
        activeProvider: typeof ProviderManager.getActiveProviderName === 'function'
          ? ProviderManager.getActiveProviderName()
          : 'unknown',
        budgetRemaining: null,
        internet: internetMonitor.isOnline,
      };
    }

    const cacheStats = memoryCache.stats();

    res.json({
      status: summary.internet ? 'healthy' : 'degraded',
      provider: summary.activeProvider,
      activeProvider: summary.activeProvider,
      budgetRemaining: summary.budgetRemaining ?? null,
      quota: summary.quota || {}, // ★ Exposed here
      internet: summary.internet,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      memoryCache: cacheStats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin-only detailed metrics.
 */
router.get('/metrics', adminAuth, async (req, res, next) => {
  try {
    let providerSummary = {};

    if (typeof ProviderManager.getHealthSummary === 'function') {
      providerSummary = await ProviderManager.getHealthSummary();
    } else {
      providerSummary = {
        providers: await ProviderManager.getHealthStatus(),
        activeProvider: typeof ProviderManager.getActiveProviderName === 'function'
          ? ProviderManager.getActiveProviderName()
          : 'unknown',
        budgetRemaining: null,
        internet: internetMonitor.isOnline,
      };
    }

    const cacheStats = memoryCache.stats();
    const quota = QuotaManager.getStats();
    const queueStats = QueueService.getStats();
    const matchVoteStats = PredictionStore.stats();

    const userPredictionStats = typeof UserPredictionStore.getStats === 'function'
      ? UserPredictionStore.getStats()
      : {};

    const recoveryStatus = RecoveryService.getRecoveryStatus();
    const schedulerMetrics = schedulerEngine.getMetrics();

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        internet: providerSummary.internet ?? internetMonitor.isOnline,
        activeProvider: providerSummary.activeProvider || 'unknown',
        budgetRemaining: providerSummary.budgetRemaining ?? null,
        quota: providerSummary.quota || {}, // ★ Exposed here
        system: {
          platform: os.platform(),
          nodeVersion: process.version,
          cpuLoadAvg: os.loadavg(),
          memory: {
            totalMb: Math.round(os.totalmem() / 1024 / 1024),
            freeMb: Math.round(os.freemem() / 1024 / 1024),
            processRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          },
        },
        http: {
          totalRequests: global.requestCount || 0,
          errorCount: global.errorCount || 0,
        },
        cache: cacheStats,
        quotaManager: quota, // Renamed slightly to avoid clash with provider quota
        queue: queueStats,
        predictions: {
          matchVotes: matchVoteStats,
          userPredictions: userPredictionStats,
        },
        scheduler: schedulerMetrics,
        providers: providerSummary.providers || {},
        recovery: recoveryStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin-only logs.
 */
router.get('/logs', adminAuth, (req, res) => {
  const storedLogs = getLogs();

  res.json({
    success: true,
    data: {
      logs: storedLogs && storedLogs.length ? storedLogs : recentLogs,
    },
  });
});

module.exports = router;