const env = require('./config/env');
const logger = require('./utils/logger');

const {
  initializeFirebase,
} = require('./config/firebase');

const {
  startScheduler,
} = require('./scheduler');

const RecoveryService = require('./services/RecoveryService');
const UserPredictionStore = require('./services/UserPredictionStore');
const QueueService = require('./services/QueueService');

// ★ NEW ML PREDICTION JOB
const predictionJob = require('./scheduler/jobs/predictionJob');

const app = require('./server');

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

    // ★ START ML PREDICTION GENERATOR LOOP
    async function runPredictionJobLoop() {
      const interval = await predictionJob.execute();
      setTimeout(runPredictionJobLoop, interval);
    }
    runPredictionJobLoop();

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