const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const videosJob = require('./jobs/videosJob');
const logger = require('../utils/logger');

// Cron patterns (UTC)
const CRON = {
  TODAY_FIXTURES: '5 0 * * *',    // 00:05 UTC
  TOMORROW_FIXTURES: '10 0 * * *', // 00:10 UTC
  YESTERDAY_RESULTS: '15 0 * * *', // 00:15 UTC
  STANDINGS: '0 */6 * * *',        // Every 6 hours
  VIDEOS: '0 * * * *',             // Every hour
};

function startScheduler() {
  logger.info('[Scheduler] Initializing cron jobs...');

  // Register Cron Jobs
  schedulerEngine.schedule('TodayFixtures', CRON.TODAY_FIXTURES, todayFixturesJob.execute);
  schedulerEngine.schedule('UpcomingFixtures', CRON.TOMORROW_FIXTURES, upcomingFixturesJob.execute);
  schedulerEngine.schedule('FinishedFixtures', CRON.YESTERDAY_RESULTS, finishedFixturesJob.execute);
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);
  schedulerEngine.schedule('Videos', CRON.VIDEOS, videosJob.execute);

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
      await videosJob.execute();
      await liveJob.execute();
    } catch (err) {
      logger.error('[Scheduler] Initial sync failed');
    }
  }, 5000);

  logger.info('[Scheduler] All cron jobs registered and live polling started.');
}

module.exports = { startScheduler, engine: schedulerEngine };