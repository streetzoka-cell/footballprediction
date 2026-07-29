// backend-v1/src/scheduler/index.js
const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const logger = require('../utils/logger');

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */2 * * *', // ★ Runs every 2 hours (12 calls/day max)
  STANDINGS: '0 */6 * * *',
};

function startScheduler() {
  logger.info('[Scheduler] Initializing cron jobs...');

  schedulerEngine.schedule('TodayFixtures', CRON.TODAY_FIXTURES, todayFixturesJob.execute);
  schedulerEngine.schedule('UpcomingFixtures', CRON.TOMORROW_FIXTURES, upcomingFixturesJob.execute);
  schedulerEngine.schedule('FinishedFixtures', CRON.FINISHED_FIXTURES, finishedFixturesJob.execute);
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);

  // Start Adaptive Live Polling
  schedulerEngine.startLivePolling(async () => {
    return liveJob.execute();
  });

  // Initial fire on startup (delayed by 5s to let DB connect)
  setTimeout(async () => {
    logger.info('[Scheduler] Firing initial startup sync...');
    try {
      await todayFixturesJob.execute();
      await upcomingFixturesJob.execute();
      await finishedFixturesJob.execute();
      await standingsJob.execute();
      await liveJob.execute();
    } catch (err) {
      logger.error('[Scheduler] Initial sync failed');
    }
  }, 5000);

  logger.info('[Scheduler] All cron jobs registered and live polling started.');
}

module.exports = { startScheduler, engine: schedulerEngine };