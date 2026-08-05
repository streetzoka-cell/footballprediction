// backend-v1/src/index.js

const env = require('./config/env');
const logger = require('./utils/logger');
const { initializeFirebase } = require('./config/firebase');
const { startScheduler } = require('./scheduler');
const RecoveryService = require('./services/RecoveryService');
const UserPredictionStore = require('./services/UserPredictionStore');
const QueueService = require('./services/QueueService');
const app = require('./server');

async function bootstrap() {
  try {
    logger.info('========================================');
    logger.info('  ZOKASCORE Backend v1 Booting Up...   ');
    logger.info('========================================');

    // 1. Initialize Firebase
    initializeFirebase();

    // 2. Run recovery/startup checks
    const recoveryStatus = await RecoveryService.runStartupChecks();

    logger.info(
      `[Boot] Recovery status: ` +
      `queuePending=${recoveryStatus.queue.pending}, ` +
      `walFiles=${recoveryStatus.userPredictions.walFiles}, ` +
      `featuredSnapshots=${recoveryStatus.snapshots.featuredFiles}, ` +
      `zokaSnapshots=${recoveryStatus.snapshots.zokaFiles}`
    );

    // 3. Start Schedulers
    startScheduler();

    // 4. Start Express Server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server listening on port ${env.PORT}`);
      logger.info('🛡️  Active Provider Engine:');
      logger.info('   Live Scores : iSports → API-Football');
      logger.info('   Fixtures    : iSports → API-Football');
      logger.info('   Results     : iSports → API-Football');
      logger.info('   Leagues     : iSports → SportsDB');
      logger.info('   Standings   : Football-Data → API-Football');
      logger.info('   Teams       : API-Football → Football-Data');
      logger.info('   Media/Logos : SportsDB');
      logger.info('========================================');
    });

    // Prevent Cloudflare http2 stream closed errors
    server.keepAliveTimeout = 120 * 1000;
    server.headersTimeout = 125 * 1000;

    // 5. Graceful Shutdown Handlers (Prevents data loss in WAL/Queue)
    const shutdown = async (signal) => {
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

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

bootstrap();