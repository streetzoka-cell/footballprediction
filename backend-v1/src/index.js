// backend-v1/src/index.js
const env = require('./config/env');
const logger = require('./utils/logger');

const { initializeFirebase } = require('./config/firebase');
const { startScheduler, engine: schedulerEngine } = require('./scheduler');

const RecoveryService = require('./services/RecoveryService');
const UserPredictionStore = require('./services/UserPredictionStore');
const QueueService = require('./services/QueueService');

const predictionJob = require('./scheduler/jobs/predictionJob');

const app = require('./server');

/*
 * ── ML prediction loop (SINGLE owner of predictionJob.execute) ──
 * - routed through schedulerEngine.runManually → same-name guard,
 *   metrics, and no overlap with anything else that might call it
 * - try/catch INSIDE the loop → one failure never kills the loop
 * - interval sanity-clamped → no NaN/undefined tight-loop hammering
 */
const PREDICTION_FALLBACK_INTERVAL_MS = 10 * 60 * 1000;
const PREDICTION_MIN_INTERVAL_MS = 60 * 1000;
const PREDICTION_MAX_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runPredictionLoop() {
  let interval = PREDICTION_FALLBACK_INTERVAL_MS;

  try {
    const result = await schedulerEngine.runManually('MLPredictions', predictionJob.execute);

    if (Number.isFinite(result)) {
      interval = result;
    } else if (Number.isFinite(result?.interval)) {
      interval = result.interval;
    } else if (result?.error) {
      logger.warn(`[PredictionLoop] Job reported error: ${result.error}`);
    }
  } catch (err) {
    logger.error(`[PredictionLoop] Execution failed: ${err.message}`);
  }

  interval = Math.min(
    Math.max(Number(interval) || PREDICTION_FALLBACK_INTERVAL_MS, PREDICTION_MIN_INTERVAL_MS),
    PREDICTION_MAX_INTERVAL_MS
  );

  setTimeout(runPredictionLoop, interval).unref?.();
}

async function bootstrap() {
  try {
    logger.info('========================================');
    logger.info('  ZOKASCORE Backend v1 Booting Up...   ');
    logger.info('========================================');

    initializeFirebase();

    const recoveryStatus = await RecoveryService.runStartupChecks();
    logger.info(
      `[Boot] Recovery status: ` +
      `queuePending=${recoveryStatus.queue.pending}, ` +
      `walFiles=${recoveryStatus.userPredictions.walFiles}, ` +
      `featuredSnapshots=${recoveryStatus.snapshots.featuredFiles}, ` +
      `zokaSnapshots=${recoveryStatus.snapshots.zokaFiles}`
    );

    startScheduler();

    // First prediction run at 30s: after startup-sync fixtures land,
    // so the first prediction pass actually has matches to work with.
    setTimeout(runPredictionLoop, 30 * 1000).unref?.();

    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server listening on port ${env.PORT}`);
      logger.info('🛡️  Active Provider Engine:');
      logger.info('   Live Scores : iSports → API-Football');
      logger.info('   Fixtures    : iSports → API-Football');
      logger.info('   Results     : iSports → API-Football (Phase 8 Archive Active)');
      logger.info('   Leagues     : iSports → SportsDB');
      logger.info('   Standings   : Football-Data → API-Football');
      logger.info('   Teams       : API-Football → Football-Data');
      logger.info('   Media/Logos : SportsDB');
      logger.info('🧠 AI Engine   : Zoka V2 (Model Lab & Intelligence API Active)');
      logger.info('========================================');
    });

    server.keepAliveTimeout = 120 * 1000;
    server.headersTimeout = 125 * 1000;

    let shuttingDown = false;

    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`\n[${signal}] Received. Shutting down gracefully...`);

      // ★ stop cron + live-poll timer BEFORE flushing, so nothing
      //   writes snapshots/predictions mid-flush
      schedulerEngine.stopAll();

      server.close(() => {
        logger.info('[Shutdown] HTTP server closed.');
      });

      try {
        logger.info('[Shutdown] Flushing WAL and Queue to Firestore...');
        await UserPredictionStore.processPendingSync(true);
        await QueueService.processQueue();
        logger.info('[Shutdown] Backup sync complete. Exiting.');
        process.exit(0);
      } catch (err) {
        logger.error(`[Shutdown] Failed to flush data: ${err.message}`);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.error(`Fatal boot error: ${err.stack}`);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

bootstrap();