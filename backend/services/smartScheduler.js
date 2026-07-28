const { SCHEDULER, LIVE_POLLING, COLLECTIONS, LEAGUES, STATUS, API, getDateOffset, formatDate } = require('../config/constants');
const goalApi = require('../config/goalApiAdapter');
const livescoreApi = require('../config/livescoreApiAdapter');
const { getRemainingRequests, getLiveRequestsToday } = require('../config/api');
const fixturesRepo = require('../repositories/fixturesRepository');
const standingsRepo = require('../repositories/standingsRepository');
const topScorersRepo = require('../repositories/topScorersRepository');
const matchDetailsRepo = require('../repositories/matchDetailsRepository');
const videosRepo = require('../repositories/videosRepository');
const cacheInfoRepo = require('../repositories/cacheInfoRepository');
const { writeFootballSnapshot } = require('./snapshotWriter');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { eventBus, EVENT } = require('../utils/eventBus');
const cron = require('node-cron');

const MS_PER_HOUR = 3600000;
const MIN_POLL_INTERVAL_MS = 15000;

class SmartScheduler {
  constructor() {
    this.running = false;
    this.livePollTimer = null;
    this.cronJobs = [];
    this.lastStatsPoll = 0;
    this.processedLineups = new Set();
  }

  start() {
    this.running = true;
    logger.info('[SmartScheduler] Starting Production Phase 2 scheduler...');

    this.cronJobs.push(cron.schedule(SCHEDULER.TODAY_FIXTURES, () => this.syncTodayFixtures(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.TOMORROW_FIXTURES, () => this.syncTomorrowFixtures(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.YESTERDAY_RESULTS, () => this.syncYesterdayResults(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.STANDINGS, () => this.syncStandings(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.TOP_SCORERS, () => this.syncTopScorers(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.PREDICTIONS, () => this.syncPredictions(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.ODDS_MORNING, () => this.syncOdds(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.ODDS_AFTERNOON, () => this.syncOdds(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.ODDS_EVENING, () => this.syncOdds(), { timezone: 'UTC' }));
    this.cronJobs.push(cron.schedule(SCHEDULER.VIDEOS, () => this.syncVideos(), { timezone: 'UTC' }));

    // Run initial syncs sequentially
    setTimeout(async () => {
      await this.syncTodayFixtures();
      await this.syncTomorrowFixtures();
      await this.syncYesterdayResults();
      this.syncStandings();
      this.syncTopScorers();
      this.syncPredictions();
      this.syncOdds();
      this.syncVideos();
    }, 5000);

    this.startLivePolling();
    logger.info('[SmartScheduler] All cron jobs registered.');
  }

  async stop() {
    this.running = false;
    if (this.livePollTimer) clearTimeout(this.livePollTimer);
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    logger.info('[SmartScheduler] Stopped.');
  }

  async syncTodayFixtures() {
    if (!this.running) return;
    const dateStr = formatDate(new Date());
    try {
      logger.info(`[Scheduler] → Today's fixtures (${dateStr})`);
      let matches = [];
      try { matches = await goalApi.getFixtures(dateStr); } 
      catch (err) { matches = await livescoreApi.getFixtures(dateStr); }
      
      const { written } = await withRetry(() => fixturesRepo.upsertFixtures(matches, dateStr), 'FixturesRepo.upsertFixtures');
      await writeFootballSnapshot(dateStr, { matches });
      
      await cacheInfoRepo.update(COLLECTIONS.FIXTURES, { count: matches.length, written, date: dateStr });
      eventBus.emit(EVENT.DAILY_FIXTURES_UPDATED, { date: dateStr });
      logger.info(`[Scheduler] ✓ Today: ${matches.length} fixtures, ${written} writes`);
    } catch (err) { logger.error(`[Scheduler] ✗ Today fixtures failed: ${err.message}`); }
  }

  async syncTomorrowFixtures() {
    if (!this.running) return;
    const dateStr = getDateOffset(1);
    try {
      logger.info(`[Scheduler] → Tomorrow's fixtures (${dateStr})`);
      let matches = [];
      try { matches = await goalApi.getFixtures(dateStr); } 
      catch (err) { matches = await livescoreApi.getFixtures(dateStr); }
      
      const { written } = await withRetry(() => fixturesRepo.upsertFixtures(matches, dateStr), 'FixturesRepo.upsertFixtures');
      await writeFootballSnapshot(dateStr, { matches });
      
      await cacheInfoRepo.update(COLLECTIONS.FIXTURES, { count: matches.length, written, date: dateStr });
      eventBus.emit(EVENT.DAILY_FIXTURES_UPDATED, { date: dateStr });
      logger.info(`[Scheduler] ✓ Tomorrow: ${matches.length} fixtures, ${written} writes`);
    } catch (err) { logger.error(`[Scheduler] ✗ Tomorrow fixtures failed: ${err.message}`); }
  }

  async syncYesterdayResults() {
    if (!this.running) return;
    const dateStr = getDateOffset(-1);
    try {
      logger.info(`[Scheduler] → Yesterday's results (${dateStr})`);
      let matches = [];
      try { matches = await goalApi.getFixtures(dateStr); } 
      catch (err) { matches = await livescoreApi.getFixtures(dateStr); }
      
      const finished = matches.filter(m => STATUS.FOOTBALL_FINISHED.includes(m.status));
      const { written } = await withRetry(() => fixturesRepo.upsertResults(finished, dateStr), 'FixturesRepo.upsertResults');
      await writeFootballSnapshot(dateStr, { matches, finished });
      
      await cacheInfoRepo.update(COLLECTIONS.RESULTS, { count: finished.length, written, date: dateStr });
      eventBus.emit(EVENT.DAILY_FIXTURES_UPDATED, { date: dateStr });
      logger.info(`[Scheduler] ✓ Yesterday: ${finished.length} results, ${written} writes`);
    } catch (err) { logger.error(`[Scheduler] ✗ Yesterday results failed: ${err.message}`); }
  }

  async syncStandings() {
    if (!this.running) return;
    let ok = 0, fail = 0;
    logger.info(`[Scheduler] → Standings sync (${LEAGUES.length} leagues)`);
    for (const league of LEAGUES) {
      if (!goalApi.isBudgetAvailable(1)) break;
      try {
        const data = await goalApi.getStandings(league.id, league.season);
        await standingsRepo.upsert(league.id, data.league);
        ok++;
      } catch (err) { fail++; }
    }
    eventBus.emit(EVENT.STANDINGS_UPDATED);
    logger.info(`[Scheduler] ✓ Standings: ${ok} ok, ${fail} fail`);
  }

  async syncTopScorers() {
    if (!this.running) return;
    let ok = 0, fail = 0;
    logger.info(`[Scheduler] → Top scorers sync (${LEAGUES.length} leagues)`);
    for (const league of LEAGUES) {
      if (!goalApi.isBudgetAvailable(1)) break;
      try {
        const scorers = await goalApi.getTopScorers(league.id, league.season);
        await topScorersRepo.upsert(league.id, scorers, { id: league.id, name: league.name, country: league.country, logo: league.flag });
        ok++;
      } catch (err) {
        fail++;
        if (err.message.includes('disabled')) break;
      }
    }
    logger.info(`[Scheduler] ✓ Top scorers: ${ok} ok, ${fail} fail`);
  }

  // ★ FIX: Wrapped entirely in try/catch to prevent Unhandled Rejection
  async syncPredictions() {
    if (!this.running) return;
    try {
      const dateStr = formatDate(new Date());
      const matches = await fixturesRepo.getByDate(dateStr);
      let ok = 0, fail = 0;
      for (const m of matches) {
        if (!goalApi.isBudgetAvailable(1)) break;
        try {
          const data = await goalApi.getPredictions(m.id);
          await matchDetailsRepo.upsertPredictions(m.id, data);
          ok++;
        } catch (err) {
          fail++;
          if (err.message.includes('disabled')) break;
        }
      }
      logger.info(`[Scheduler] ✓ Predictions: ${ok} ok, ${fail} fail`);
    } catch (err) {
      logger.error(`[Scheduler] ✗ Predictions failed: ${err.message}`);
    }
  }

  // ★ FIX: Wrapped entirely in try/catch to prevent Unhandled Rejection
  async syncOdds() {
    if (!this.running) return;
    try {
      const dateStr = formatDate(new Date());
      const matches = await fixturesRepo.getByDate(dateStr);
      let ok = 0, fail = 0;
      for (const m of matches) {
        if (!goalApi.isBudgetAvailable(1)) break;
        try {
          const data = await goalApi.getOdds(m.id);
          await matchDetailsRepo.upsertOdds(m.id, data);
          ok++;
        } catch (err) {
          fail++;
          if (err.message.includes('disabled')) break;
        }
      }
      logger.info(`[Scheduler] ✓ Odds: ${ok} ok, ${fail} fail`);
    } catch (err) {
      logger.error(`[Scheduler] ✗ Odds failed: ${err.message}`);
    }
  }

  async syncVideos() {
    if (!this.running) return;
    try {
      const videos = await goalApi.getVideos();
      await videosRepo.replaceVideos(videos);
      eventBus.emit(EVENT.CACHE_INVALIDATED, { prefix: 'videos:' });
    } catch (err) { logger.error(`[Scheduler] ✗ Videos failed: ${err.message}`); }
  }

  _determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap) {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0);
    const hoursUntilMidnight = Math.max(0, (endOfDay - now)) / MS_PER_HOUR;

    const spendableBudget = Math.max(0, (remaining ?? API.DAILY_BUDGET) - API.RESERVE);
    const capRemaining = Math.max(0, liveCap - liveUsed);
    const spendableCalls = Math.min(spendableBudget, capRemaining);

    let desiredInterval;
    if (liveCount === 0) desiredInterval = LIVE_POLLING.IDLE_INTERVAL_MS;
    else if (isNearFinish) desiredInterval = LIVE_POLLING.NEAR_FINISH_INTERVAL_MS;
    else if (liveCount <= 3) desiredInterval = LIVE_POLLING.LOW_LIVE_INTERVAL_MS;
    else if (liveCount <= 10) desiredInterval = LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;
    else desiredInterval = LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;

    let expectedWindowHours = liveCount > 0 ? Math.min(hoursUntilMidnight, 2) : hoursUntilMidnight;
    let expectedWindowMs = Math.max(0.5, expectedWindowHours) * MS_PER_HOUR;

    let interval = desiredInterval;
    let isPacing = false;

    if (spendableCalls > 0) {
      const maxAffordableInterval = expectedWindowMs / spendableCalls;
      if (maxAffordableInterval > desiredInterval) {
        interval = maxAffordableInterval;
        isPacing = true;
      }
    } else {
      interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    if (interval < MIN_POLL_INTERVAL_MS) interval = MIN_POLL_INTERVAL_MS;
    if (interval > LIVE_POLLING.IDLE_INTERVAL_MS) interval = LIVE_POLLING.IDLE_INTERVAL_MS;

    return { interval, mode: isPacing ? 'PACING' : 'NORMAL' };
  }

  startLivePolling() {
    const poll = async () => {
      if (!this.running) return;

      try {
        const remaining = goalApi.getRemaining();
        const liveUsed = getLiveRequestsToday();
        const liveCap = LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP;

        if (remaining !== null && remaining < LIVE_POLLING.MIN_BUDGET_TO_POLL) {
          logger.warn(`[Scheduler] Live polling skipped — budget low (${remaining})`);
          this.livePollTimer = setTimeout(poll, LIVE_POLLING.IDLE_INTERVAL_MS);
          return;
        }

        let matches = [];
        if (livescoreApi.isBudgetAvailable(1)) {
          try { matches = await livescoreApi.getLive(); } catch (err) { }
        }
        if (!matches.length && goalApi.isBudgetAvailable(1)) {
          try { matches = await goalApi.getLive(); } catch (err) { }
        }

        await fixturesRepo.replaceLive(matches);
        const todayStr = formatDate(new Date());
        await writeFootballSnapshot(todayStr, { live: matches });
        eventBus.emit(EVENT.LIVE_FIXTURES_UPDATED);

        const liveCount = matches.length;
        const isNearFinish = matches.some(m => (m.elapsed || m.minute || 0) >= 80);
        const state = this._determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap);
        const interval = state.interval;

        const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
        const actuallyLive = matches.filter(m => liveStatuses.includes(m.status));
        
        for (const m of actuallyLive) {
          if (!this.processedLineups.has(m.id) && goalApi.isBudgetAvailable(1)) {
            try {
              const lineups = await goalApi.getLineups(m.id);
              await matchDetailsRepo.upsertLineups(m.id, lineups);
              this.processedLineups.add(m.id);
            } catch (err) { }
          }
        }

        const now = Date.now();
        if (now - this.lastStatsPoll > 5 * 60 * 1000 && actuallyLive.length > 0) {
          this.lastStatsPoll = now;
          for (const m of actuallyLive) {
            if (goalApi.isBudgetAvailable(1)) {
              try {
                const stats = await goalApi.getStatistics(m.id);
                await matchDetailsRepo.upsertStatistics(m.id, stats);
              } catch (err) { }
            }
          }
        }

        const currentLiveIds = new Set(actuallyLive.map(m => m.id));
        for (const id of this.processedLineups) {
          if (!currentLiveIds.has(id)) this.processedLineups.delete(id);
        }

        logger.info(`[Scheduler] 📡 Live: ${liveCount} matches (${state.mode}) — next poll in ${(interval/1000).toFixed(0)}s`);
        this.livePollTimer = setTimeout(poll, interval);
      } catch (err) {
        logger.error(`[Scheduler] Live polling error: ${err.message}`);
        this.livePollTimer = setTimeout(poll, LIVE_POLLING.IDLE_INTERVAL_MS);
      }
    };

    poll();
  }
}

module.exports = new SmartScheduler();