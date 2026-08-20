// backend-v1/src/scheduler/index.js
const schedulerEngine = require('./SchedulerEngine');
const liveJob = require('./jobs/liveJob');
const todayFixturesJob = require('./jobs/todayFixturesJob');
const upcomingFixturesJob = require('./jobs/upcomingFixturesJob');
const finishedFixturesJob = require('./jobs/finishedFixturesJob');
const standingsJob = require('./jobs/standingsJob');
const userPredictionSyncJob = require('./jobs/userPredictionSyncJob');
const leaderboardJob = require('./jobs/leaderboardJob');
const statsJob = require('./jobs/statsJob'); 
const predictionJob = require('./jobs/predictionJob'); // ★ NEW ML JOB
const MasterResultsJob = require('./jobs/MasterResultsJob'); // ★ NEW MASTER SYNC
const BackfillResultsJob = require('./jobs/BackfillResultsJob'); // ★ NEW 14-DAY BACKFILL

const { processQueue } = require('../services/QueueService');
const internetMonitor = require('../services/InternetMonitor');
const logger = require('../utils/logger');

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */5 * * *', 
  STANDINGS: '0 */6 * * *',
  PREDICTIONS: '0 4 * * *', // ★ NEW: Run ML generator at 4:00 AM UTC daily
  MASTER_RESULTS: '*/45 * * * *', // ★ NEW: Run master results sync every 45 mins
  BACKFILL_RESULTS: '50 23 * * *', // ★ NEW: Run 14-day backfill at 23:50 UTC (10 mins before reset)
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
  
  // ★ REGISTER ML PREDICTION JOB
  schedulerEngine.schedule('MLPredictions', CRON.PREDICTIONS, predictionJob.execute);

  // ★ REGISTER MASTER RESULTS SYNC JOB
  schedulerEngine.schedule('MasterResultsSync', CRON.MASTER_RESULTS, MasterResultsJob.execute);

  // ★ REGISTER 14-DAY BACKFILL JOB
  schedulerEngine.schedule('BackfillResultsJob', CRON.BACKFILL_RESULTS, BackfillResultsJob.execute);

  schedulerEngine.schedule('LeaderboardJob', leaderboardJob.schedule, leaderboardJob.execute);
  schedulerEngine.schedule('StatsJob', statsJob.schedule, statsJob.execute);

  schedulerEngine.startLivePolling(async () => {
    if (!internetMonitor.isOnline) {
      logger.info('[Scheduler] Live polling skipped (Internet Offline).');
      return 60000;
    }
    return liveJob.execute();
  });

  setInterval(() => {
    if (internetMonitor.isOnline) {
      processQueue().catch((e) => logger.error('[Scheduler] Queue processing failed', e));
    }
  }, 5 * 60 * 1000);

  setInterval(() => {
    if (internetMonitor.isOnline) {
      userPredictionSyncJob.execute(false).catch((e) => logger.error('[Scheduler] User prediction sync check failed', e));
    }
  }, USER_PREDICTION_SYNC_CHECK_MS);

  setTimeout(async () => {
    logger.info('[Scheduler] Firing initial startup sync...');
    try {
      await todayFixturesJob.execute();
      await upcomingFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await standingsJob.execute();
      await liveJob.execute();
      await leaderboardJob.execute(); 
      await statsJob.execute(); 
      
      // ★ RUN ON BOOT so we don't have to wait for the 45-min cron to get accurate scores
      await MasterResultsJob.execute(); 
      
      // ★ RUN ON BOOT so we don't have to wait until 4 AM for the first batch
      await predictionJob.execute(); 
      
      await processQueue();
      await userPredictionSyncJob.execute(false);
    } catch (err) {
      logger.error(`[Scheduler] Initial sync failed: ${err.message}`);
    }
  }, 5000);

  internetMonitor.on('restored', async () => {
    logger.info('[Scheduler] Catch-up sync triggered...');
    try {
      await todayFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await liveJob.execute();
      await leaderboardJob.execute(); 
      await statsJob.execute(); 
      
      // ★ RUN ON INTERNET RESTORE to immediately fetch missing scores after downtime
      await MasterResultsJob.execute();
      
      // ★ RUN ON INTERNET RESTORE in case we missed the 4 AM cron during downtime
      await predictionJob.execute();
      
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