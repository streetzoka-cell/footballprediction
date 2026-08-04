const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const userPredictionSyncJob = require('./jobs/userPredictionSyncJob');
const leaderboardJob = require('./jobs/leaderboardJob');
const statsJob = require('./jobs/statsJob'); // ★ NEW IMPORT

const { processQueue } = require('../services/QueueService');
const internetMonitor = require('../services/InternetMonitor');
const logger = require('../utils/logger');

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */2 * * *',
  STANDINGS: '0 */6 * * *',
};

const USER_PREDICTION_SYNC_CHECK_MS = parseInt(
  process.env.USER_PREDICTION_SYNC_CHECK_MS || String(10 * 60 * 1000),
  10
);

function startScheduler() {
  logger.info('[Scheduler] Initializing cron jobs...');

  schedulerEngine.schedule('TodayFixtures', CRON.TODAY_FIXTURES, todayFixturesJob.execute);
  schedulerEngine.schedule('UpcomingFixtures', CRON.TOMORROW_FIXTURES, upcomingFixturesJob.execute);
  schedulerEngine.schedule('FinishedFixtures', CRON.FINISHED_FIXTURES, () => finishedFixturesJob.execute(false));
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);
  
  schedulerEngine.schedule('LeaderboardJob', leaderboardJob.schedule, leaderboardJob.execute);
  
  // ★ NEW: Register Stats Job
  schedulerEngine.schedule('StatsJob', statsJob.schedule, statsJob.execute);

  schedulerEngine.startLivePolling(async () => {
    if (!internetMonitor.isOnline) {
      logger.info('[Scheduler] Live polling skipped (Internet Offline).');
      return 60000;
    }
    return liveJob.execute();
  });

  // Generic queue processor
  setInterval(() => {
    if (internetMonitor.isOnline) {
      processQueue().catch((e) => logger.error('[Scheduler] Queue processing failed', e));
    }
  }, 5 * 60 * 1000);

  // User prediction batch sync checker
  setInterval(() => {
    if (internetMonitor.isOnline) {
      userPredictionSyncJob.execute(false).catch((e) => logger.error('[Scheduler] User prediction sync check failed', e));
    }
  }, USER_PREDICTION_SYNC_CHECK_MS);

  // Startup sync
  setTimeout(async () => {
    logger.info('[Scheduler] Firing initial startup sync...');
    try {
      await todayFixturesJob.execute();
      await upcomingFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await standingsJob.execute();
      await liveJob.execute();
      await leaderboardJob.execute(); 
      await statsJob.execute(); // ★ NEW: Run on startup
      await processQueue();
      await userPredictionSyncJob.execute(false);
    } catch (err) {
      logger.error(`[Scheduler] Initial sync failed: ${err.message}`);
    }
  }, 5000);

  // Catch-up when internet returns
  internetMonitor.on('restored', async () => {
    logger.info('[Scheduler] Catch-up sync triggered...');
    try {
      await todayFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await liveJob.execute();
      await leaderboardJob.execute(); 
      await statsJob.execute(); // ★ NEW: Run on reconnect
      await processQueue();
      await userPredictionSyncJob.execute(false);
    } catch (err) {
      logger.error(`[Scheduler] Catch-up sync failed: ${err.message}`);
    }
  });

  internetMonitor.start();
  logger.info('[Scheduler] All cron jobs registered and live polling started.');
}

module.exports = {
  startScheduler,
  engine: schedulerEngine,
};