// backend-v1/src/index.js
const env = require('./config/env');
const logger = require('./utils/logger');
const { initializeFirebase } = require('./config/firebase');
const { startScheduler } = require('./scheduler');
const app = require('./server');

async function bootstrap() {
  try {
    logger.info('========================================');
    logger.info('  ZOKASCORE Backend v1 Booting Up...   ');
    logger.info('========================================');
    
    // 1. Initialize Firebase
    initializeFirebase();
    
    // 2. Start Schedulers (Cron jobs & Live polling)
    startScheduler();
    
    // 3. Start Express Server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Server listening on port ${env.PORT}`);
      
      logger.info('🛡️ Active Provider Engine:');
      logger.info('   Live Scores : iSports → API-Football');
      logger.info('   Fixtures    : iSports → API-Football');
      logger.info('   Results     : iSports → API-Football');
      logger.info('   Leagues     : iSports → SportsDB');
      logger.info('   Standings   : Football-Data → API-Football');
      logger.info('   Teams       : API-Football → Football-Data');
      logger.info('   Media/Logos : SportsDB');
      logger.info('========================================');
    });

    // ★ FIX: Prevent Cloudflare http2 stream closed errors
    server.keepAliveTimeout = 120 * 1000; // 120 seconds
    server.headersTimeout = 125 * 1000;   // 125 seconds (must be slightly higher than keepAliveTimeout)
    
  } catch (err) {
    logger.error(`Fatal boot error: ${err.stack}`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

bootstrap();