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
const step50Job = require('./jobs/step50Job');                                 // roadmap #1 — live preds track snapshots
const predictionGroupsService = require('../services/PredictionGroupsService'); // FT auto-mark + curated republish
const pickGroupsArchive = require('../services/PickGroupsArchiveService');      // ★ permanent history archive

const { processQueue } = require('../services/QueueService');
const internetMonitor = require('../services/InternetMonitor');
const logger = require('../utils/logger');
const { getDateOffset } = require('../config/constants');

// predictionJob intentionally NOT required here — the bootstrap loop in
// index.js is the single owner (adaptive interval, no cron duplication).

const CRON = {
  TODAY_FIXTURES: '5 0 * * *',
  TOMORROW_FIXTURES: '10 0 * * *',
  FINISHED_FIXTURES: '0 */5 * * *',
  STANDINGS: '0 */6 * * *',
  MASTER_RESULTS: '0 */3 * * *',
  BACKFILL_RESULTS: '50 23 * * *',
};

const USER_PREDICTION_SYNC_CHECK_MS = parseInt(
  process.env.USER_PREDICTION_SYNC_CHECK_MS || String(10 * 60 * 1000),
  10
);

// Roadmap #1: Step 50 every 10–15 min. step50Job self-guards against
// overlap with the daily pipeline (internal lock + MIN_GAP_MS).
// Set STEP50_REFRESH=off to disable without a code change.
const STEP50_REFRESH_MS = parseInt(process.env.STEP50_REFRESH_MS || String(15 * 60 * 1000), 10);
const STEP50_ENABLED = process.env.STEP50_REFRESH !== 'off';

// FT auto-mark interval: published pick groups re-resolve against
// results/<date>.json every 10 min so the app surface shows ✅/❌
// as FTs land. Self-gating: no-op until the admin publishes once.
const CURATED_REFRESH_MS = parseInt(process.env.CURATED_REFRESH_MS || String(10 * 60 * 1000), 10);

/*
 * ★ Single live-job runner. EVERY caller (polling loop, startup sync,
 *   catch-up sync) goes through the same engine guard keyed 'LivePoll',
 *   so the live job can never run concurrently with itself.
 */
function runLiveJob() {
  return schedulerEngine.runManually('LivePoll', () => liveJob.execute());
}

/*
 * ★ FT auto-mark + permanent archive for one day pair (today + yesterday).
 * - republishCurated: re-resolves the published app file against fresh
 *   results (no-op when nothing published for that date)
 * - archiveDay: rolls the day into prediction_groups_archive/<date>.json
 *   + Firestore copy (idempotent, flips final:true when fully settled)
 */
async function refreshCuratedAndArchive(dateStr) {
  try {
    await predictionGroupsService.republishCurated(dateStr);
  } catch (err) {
    logger.warn(`[Scheduler] Curated refresh failed for ${dateStr}: ${err.message}`);
  }
  try {
    await pickGroupsArchive.archiveDay(dateStr);
  } catch (err) {
    logger.warn(`[Scheduler] Archive failed for ${dateStr}: ${err.message}`);
  }
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
    // ★ pick up FTs that landed while we were down (no-op if nothing published)
    await refreshCuratedAndArchive(getDateOffset(0));
    await refreshCuratedAndArchive(getDateOffset(-1));
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

  // Background tasks — engine-owned, cleared by stopAll() on shutdown
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

  // pick_groups.json + live predictions refresh (Step 50, idempotent ~100s)
  if (STEP50_ENABLED) {
    schedulerEngine.addBackgroundTask('Step50Refresh', STEP50_REFRESH_MS, () => step50Job.execute());
  }

  // ★ FT auto-mark + permanent archive:
  //   every 10 min, re-resolve published curated groups against fresh
  //   results (✅ WON / ❌ LOST appear without manual action) and roll
  //   the day into the permanent archive. Yesterday covers day rollover
  //   (late finishers after midnight finalize into a FINAL archive).
  schedulerEngine.addBackgroundTask('CuratedGroupsRefresh', CURATED_REFRESH_MS, async () => {
    if (internetMonitor.isOnline) {
      await refreshCuratedAndArchive(getDateOffset(0));
      await refreshCuratedAndArchive(getDateOffset(-1));
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
      // ★ FTs that landed during the outage get marked + archived immediately
      await refreshCuratedAndArchive(getDateOffset(0));
      await refreshCuratedAndArchive(getDateOffset(-1));
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