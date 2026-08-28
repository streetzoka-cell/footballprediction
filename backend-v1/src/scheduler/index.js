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
const MasterResultsJob = require('./jobs/MasterResultsJob');
const BackfillResultsJob = require('./jobs/BackfillResultsJob');

const { processQueue } = require('../services/QueueService');
const internetMonitor = require('../services/InternetMonitor');
const logger = require('../utils/logger');

// ★ predictionJob require REMOVED — the bootstrap loop in index.js is the
//   single owner of predictionJob.execute(). Registering it here too caused
//   concurrent duplicate runs.

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */5 * * *',
  STANDINGS: '0 */6 * * *',
  // MLPredictions intentionally NOT here — adaptive loop owns it (index.js)
  MASTER_RESULTS: '0 */3 * * *',
  BACKFILL_RESULTS: '50 23 * * *',
};

const USER_PREDICTION_SYNC_CHECK_MS = parseInt(
  process.env.USER_PREDICTION_SYNC_CHECK_MS || String(10 * 60 * 1000),
  10
);

/*
 * ★ Single live-job runner. EVERY caller (polling loop, startup sync,
 *   catch-up sync) goes through the same engine guard keyed 'LivePoll',
 *   so the live job can never run concurrently with itself. Previously
 *   the startup sync called liveJob.execute() raw while the polling
 *   loop ran it too — no overlap protection, no metrics.
 */
function runLiveJob() {
  return schedulerEngine.runManually('LivePoll', () => liveJob.execute());
}

async function runStartupSync() {
  logger.info('[Scheduler] Firing initial startup sync...');
  try {
    await todayFixturesJob.execute();
    await upcomingFixturesJob.execute();
    await finishedFixturesJob.execute(true);
    await standingsJob.execute();
    await runLiveJob();
    // Fresh deploys previously waited up to 3h with zero results
    await MasterResultsJob.execute();
    await leaderboardJob.execute();
    await statsJob.execute();
    await processQueue();
    await userPredictionSyncJob.execute(false);
    // Predictions intentionally NOT here — the bootstrap loop owns them
  } catch (err) {
    logger.error(`[Scheduler] Initial sync failed: ${err.message}`);
  }
}

function startScheduler() {
  logger.info('[Scheduler] Initializing cron jobs...');

  schedulerEngine.schedule('TodayFixtures', CRON.TODAY_FIXTURES, todayFixturesJob.execute);
  schedulerEngine.schedule('UpcomingFixtures', CRON.TOMORROW_FIXTURES, upcomingFixturesJob.execute);
  schedulerEngine.schedule('FinishedFixtures', CRON.FINISHED_FIXTURES, () => finishedFixturesJob.execute(false));
  schedulerEngine.schedule('Standings', CRON.STANDINGS, standingsJob.execute);
  schedulerEngine.schedule('MasterResultsJob', CRON.MASTER_RESULTS, MasterResultsJob.execute);
  schedulerEngine.schedule('BackfillResultsJob', CRON.BACKFILL_RESULTS, BackfillResultsJob.execute);
  schedulerEngine.schedule('LeaderboardJob', leaderboardJob.schedule, leaderboardJob.execute);
  schedulerEngine.schedule('StatsJob', statsJob.schedule, statsJob.execute);

  // Live polling loop (adaptive interval returned by liveJob.execute)
  schedulerEngine.startLivePolling(async () => {
    if (!internetMonitor.isOnline) {
      return 60000;
    }

    const result = await runLiveJob();

    if (result && result.skipped) {
      // Previous poll still running (overlapping a startup/catch-up sync) — re-check soon
      return 15000;
    }

    return Number.isFinite(result) ? result : 30000;
  });

  // Background tasks — ★ engine-owned, cleared by stopAll() on shutdown
  schedulerEngine.addBackgroundTask('QueueProcessing', 5 * 60 * 1000, async () => {
    if (internetMonitor.isOnline) {
      await processQueue();
    }
  });

  schedulerEngine.addBackgroundTask('UserPredictionSync', USER_PREDICTION_SYNC_CHECK_MS, async () => {
    if (internetMonitor.isOnline) {
      await userPredictionSyncJob.execute(false);
    }
  });

  // Startup sync (delayed so boot settles first)
  setTimeout(runStartupSync, 5000);

  // Internet restoration catch-up
  internetMonitor.on('restored', async () => {
    logger.info('[Scheduler] Catch-up sync triggered...');
    try {
      await todayFixturesJob.execute();
      await finishedFixturesJob.execute(true);
      await runLiveJob();
      await MasterResultsJob.execute();
      await leaderboardJob.execute();
      await statsJob.execute();
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