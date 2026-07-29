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
    app.listen(env.PORT, () => {
      logger.info(`🚀 Server listening on port ${env.PORT}`);
      logger.info(`🛡️ Active Data Provider: ${env.DATA_PROVIDER}`);
      logger.info('========================================');
    });
    
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