// backend-v1/src/scheduler/index.js
const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const { processQueue } = require('../services/QueueService');
const internetMonitor = require('../services/InternetMonitor'); // ★ NEW
const logger = require('../utils/logger');

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */2 * * *',
  STANDINGS: '0 */6 * * *',
};

function startScheduler() {
  logger.info('[Scheduler] Initializing cron jobs...');

  schedulerEngine.schedule('TodayFixtures', CRON.TODAY_FIXTURES, todayFixturesJob.execute);
  schedulerEngine.schedule('UpcomingFixtures', CRON.TOMORROW_FIXTURES, upcomingFixturesJob.execute);
  schedulerEngine.schedule('FinishedFixtures', CRON.FINISHED_FIXTURES, () => finishedFixturesJob.execute(false));
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);

  schedulerEngine.startLivePolling(async () => {
    // ★ Pause live polling if offline
    if (!internetMonitor.isOnline) {
      logger.info('[Scheduler] Live polling skipped (Internet Offline).');
      return 60000; // Check again in 60s
    }
    return liveJob.execute();
  });

  setInterval(() => {
    if (internetMonitor.isOnline) processQueue().catch(e => logger.error('[Scheduler] Queue processing failed', e));
  }, 5 * 60 * 1000);

  setTimeout(async () => {
    logger.info('[Scheduler] Firing initial startup sync...');
    try {
      await todayFixturesJob.execute();
      await upcomingFixturesJob.execute();
      await finishedFixturesJob.execute(true); 
      await standingsJob.execute();
      await liveJob.execute();
      await processQueue();
    } catch (err) {
      logger.error(`[Scheduler] Initial sync failed: ${err.message}`);
    }
  }, 5000);

  // ★ AUTO CATCH-UP: The second internet returns, run all jobs immediately!
  internetMonitor.on('restored', async () => {
    logger.info('[Scheduler] 🚀 Catch-up sync triggered...');
    try {
      await todayFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await liveJob.execute();
    } catch (err) {
      logger.error(`[Scheduler] Catch-up sync failed: ${err.message}`);
    }
  });

  internetMonitor.start(); // Start monitoring
  logger.info('[Scheduler] All cron jobs registered and live polling started.');
}

module.exports = { startScheduler, engine: schedulerEngine };