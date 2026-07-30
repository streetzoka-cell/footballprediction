const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const { processQueue } = require('../services/QueueService'); // ★ NEW IMPORT
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
  schedulerEngine.schedule('FinishedFixtures', CRON.FINISHED_FIXTURES, finishedFixturesJob.execute);
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);

  schedulerEngine.startLivePolling(async () => {
    return liveJob.execute();
  });

  // ★ NEW: Process Firebase Queue every 5 minutes
  setInterval(() => {
    processQueue().catch(e => logger.error('[Scheduler] Queue processing failed', e));
  }, 5 * 60 * 1000);

  setTimeout(async () => {
    logger.info('[Scheduler] Firing initial startup sync...');
    try {
      await todayFixturesJob.execute();
      await upcomingFixturesJob.execute();
      await finishedFixturesJob.execute();
      await standingsJob.execute();
      await liveJob.execute();
      await processQueue(); // Process queue on startup too
    } catch (err) {
      logger.error('[Scheduler] Initial sync failed');
    }
  }, 5000);

  logger.info('[Scheduler] All cron jobs registered and live polling started.');
}

module.exports = { startScheduler, engine: schedulerEngine };