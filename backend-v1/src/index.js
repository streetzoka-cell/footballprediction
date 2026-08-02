// backend-v1/src/index.js

const env = require('./config/env');
const logger = require('./utils/logger');
const { initializeFirebase } = require('./config/firebase');
const { startScheduler } = require('./scheduler');
const RecoveryService = require('./services/RecoveryService');
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