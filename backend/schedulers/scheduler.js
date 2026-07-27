const { SCHEDULER, LIVE_POLLING, FT_RECOVERY, API } = require("../config/constants");
const {
  getRemainingRequests,
  getLiveRequestsToday,
} = require("../config/api");
const {
  getBasketballRemainingRequests,
  getBasketballLiveRequestsToday,
  isBasketballConfigured,
} = require("../config/basketballApi");
const logger = require("../utils/logger");
const RangeFixturesService = require("../services/rangeFixturesService"); // ★ NEW IMPORT

const MS_PER_HOUR = 3600000;
const MIN_POLL_INTERVAL_MS = 180000;
const MIN_WINDOW_HOURS = 0.5;

class Scheduler {
  constructor(services = {}) {
    this.services = services;
    this.running = false;
    this.pollingControllers = [];
    this.cronTimers = [];
    this.syncStatus = {};
    this.activeSleepControllers = new Set();
    this.activeJobs = new Set();

    for (const name of Object.keys(services)) {
      this.syncStatus[name] = this._createInitialStatus();
    }
  }

  async runInitialSync() {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(" Initial Sync (meta-aware)");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // ★ NEW: Run Range Fetcher on startup to update 10 days back / 14 days forward
    const rangeService = new RangeFixturesService();
    await this._executeCustomJob("RangeFixtures", rangeService);

    await this._tryRun("footballLiveFixtures");
    if (isBasketballConfigured) await this._tryRun("basketballLiveFixtures");

    await this._executeJob("footballDailyFixtures", this.services.footballDailyFixtures, true, true);
    if (isBasketballConfigured) await this._tryRun("basketballDailyFixtures");

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(" Initial Sync Complete");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  start() {
    this.running = true;
    logger.info("[Scheduler] Starting smart scheduler...");

    this._startLivePolling("football");
    if (isBasketballConfigured) this._startLivePolling("basketball");

    this._scheduleRecurring(
      "footballDailyFixtures",
      () => this._getMsUntilDaily(SCHEDULER.FIXTURES_DAILY),
      () => this._getMsUntilDaily(SCHEDULER.FIXTURES_DAILY)
    );

    if (isBasketballConfigured) {
      this._scheduleRecurring(
        "basketballDailyFixtures",
        () => this._getMsUntilDaily(SCHEDULER.BASKETBALL_FIXTURES_DAILY),
        () => this._getMsUntilDaily(SCHEDULER.BASKETBALL_FIXTURES_DAILY)
      );
    }

    // ★ NEW: Schedule Range Fetcher at 12:00 AM UTC daily
    this._scheduleRangeFetcher();

    this._logSchedule();
    logger.info("[Scheduler] Started.");
  }

  _scheduleRangeFetcher() {
    const runRange = async () => {
      if (!this.running) return;
      const rangeService = new RangeFixturesService();
      await this._executeCustomJob("RangeFixtures", rangeService);
      
      if (this.running) {
        // Schedule for next day at 12:00 AM UTC (Midnight)
        const next = new Date();
        next.setUTCHours(0, 0, 0, 0); // ★ FIX: 12 AM UTC
        if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
        const ms = next - new Date();
        this.cronTimers.push(setTimeout(runRange, ms));
      }
    };
    
    // Schedule the first run
    const initialNext = new Date();
    initialNext.setUTCHours(0, 0, 0, 0); // ★ FIX: 12 AM UTC
    if (initialNext <= new Date()) initialNext.setUTCDate(initialNext.getUTCDate() + 1);
    this.cronTimers.push(setTimeout(runRange, initialNext - new Date()));
  }

  async stop() {
    this.running = false;

    for (const ctrl of this.pollingControllers) ctrl.stop = true;
    this.pollingControllers = [];

    for (const timer of this.cronTimers) clearTimeout(timer);
    this.cronTimers = [];

    for (const ctrl of this.activeSleepControllers) {
      if (!ctrl.signal.aborted) ctrl.abort();
    }
    this.activeSleepControllers.clear();

    if (this.activeJobs.size > 0) {
      logger.info(`[Scheduler] Waiting for ${this.activeJobs.size} active job(s) to finish...`);
      await Promise.allSettled([...this.activeJobs]);
    }

    logger.info("[Scheduler] Stopped.");
  }

  getStatus() {
    return {
      running: this.running,
      jobs: structuredClone(this.syncStatus),
    };
  }

  _determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap) {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = Math.max(0, endOfDay - now);
    const hoursUntilMidnight = msUntilMidnight / MS_PER_HOUR;

    const reserveForDaily = LIVE_POLLING.RESERVE_FOR_DAILY_CRON;
    const spendableBudget = Math.max(0, (remaining ?? API.DAILY_BUDGET) - reserveForDaily);
    const capRemaining = Math.max(0, liveCap - liveUsed);
    const spendableCalls = Math.min(spendableBudget, capRemaining);

    const { tier: liveTier, interval: desired } = this._classifyLiveTier(liveCount, isNearFinish);

    let expectedWindowHours;
    if (isNearFinish) {
      expectedWindowHours = Math.min(hoursUntilMidnight, 1);
    } else if (liveCount > 40) {
      expectedWindowHours = Math.min(hoursUntilMidnight, 3);
    } else if (liveCount > 0) {
      expectedWindowHours = Math.min(hoursUntilMidnight, 2);
    } else {
      expectedWindowHours = hoursUntilMidnight;
    }
    const expectedWindowMs = Math.max(MIN_WINDOW_HOURS, expectedWindowHours) * MS_PER_HOUR;

    let interval = desired;
    let isPacing = false;

    if (spendableCalls > 0) {
      const maxAffordableInterval = expectedWindowMs / spendableCalls;
      if (maxAffordableInterval > desired) {
        interval = maxAffordableInterval;
        isPacing = true;
      }
    } else {
      interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    if (liveCount === 0) interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    if (interval < MIN_POLL_INTERVAL_MS) interval = MIN_POLL_INTERVAL_MS;
    if (interval > LIVE_POLLING.IDLE_INTERVAL_MS) interval = LIVE_POLLING.IDLE_INTERVAL_MS;

    const budgetTier = this._classifyBudgetTier(remaining, spendableBudget);
    const mode = this._labelMode(liveTier, spendableCalls, isPacing, budgetTier);

    return {
      mode,
      interval,
      liveTier,
      budgetTier,
      isPacing,
      spendableCalls,
      hoursUntilMidnight: hoursUntilMidnight.toFixed(1),
      expectedWindowHours: expectedWindowHours.toFixed(1),
    };
  }

  _classifyLiveTier(liveCount, isNearFinish) {
    if (liveCount === 0) return { tier: "IDLE", interval: LIVE_POLLING.IDLE_INTERVAL_MS };
    if (liveCount <= 5) return { tier: "LIVE_LOW", interval: LIVE_POLLING.LOW_LIVE_INTERVAL_MS };
    if (liveCount <= 15) return { tier: "LIVE_MED", interval: LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS };
    if (liveCount <= 40) return { tier: "LIVE_HIGH", interval: LIVE_POLLING.HIGH_LIVE_INTERVAL_MS };
    
    let tier = "LIVE_MASS";
    let interval = LIVE_POLLING.MASSIVE_LIVE_INTERVAL_MS;

    if (isNearFinish) {
      tier = "NEAR_FT";
      interval = Math.max(interval, LIVE_POLLING.NEAR_FINISH_INTERVAL_MS);
    }
    return { tier, interval };
  }

  _classifyBudgetTier(remaining, spendableBudget) {
    if (remaining <= 0) return "EXHAUSTED";
    if (spendableBudget <= 0) return "RESERVE_LOCKED";
    if (remaining <= LIVE_POLLING.BUDGET_CRITICAL_THRESHOLD) return "CRITICAL";
    if (remaining <= LIVE_POLLING.BUDGET_NORMAL_THRESHOLD) return "NORMAL";
    return "HEALTHY";
  }

  _labelMode(liveTier, spendableCalls, isPacing, budgetTier) {
    if (spendableCalls <= 0) return "BUDGET_LOCKED";
    if (isPacing) return `PACING+${liveTier}`;
    if (budgetTier === "CRITICAL") return `BUDGET_CRIT+${liveTier}`;
    if (budgetTier === "NORMAL") return `BUDGET_NORMAL+${liveTier}`;
    return liveTier;
  }

  _startLivePolling(sport) {
    const serviceName = sport === "football" ? "footballLiveFixtures" : "basketballLiveFixtures";
    const service = this.services[serviceName];

    if (!service) {
      logger.warn(`[Scheduler] ${serviceName} not registered — skipping`);
      return;
    }

    const getBudget = sport === "football" ? getRemainingRequests : getBasketballRemainingRequests;
    const getLiveCount = sport === "football" ? getLiveRequestsToday : getBasketballLiveRequestsToday;
    const liveCap = sport === "football" ? LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP : LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP;
    const displayBudget = API.DAILY_BUDGET;

    const controller = { stop: false };
    this.pollingControllers.push(controller);

    this._pollingLoop(serviceName, service, getBudget, getLiveCount, liveCap, controller, displayBudget).catch(
      (err) => logger.error(`[Scheduler] ${sport} polling crashed: ${err.message}`)
    );
  }

  async _pollingLoop(serviceName, service, getBudget, getLiveCount, liveCap, controller, displayBudget) {
    const sport = serviceName.includes("basketball") ? "basketball" : "football";
    let consecutiveErrors = 0;
    let liveCount = 0;
    let isNearFinish = false;

    const initialResult = this.syncStatus[serviceName]?.lastResult;
    if (initialResult && initialResult.polled !== false) {
      liveCount = initialResult.liveCount ?? initialResult.total ?? 0;
      isNearFinish = (initialResult.nearFT ?? 0) > 0 || initialResult.isNearFinish === true;
      
      if (liveCount > 0) {
        logger.info(`[Scheduler] ${sport.toUpperCase()} seeded from initial sync: ${liveCount} live matches`);
      }
    }

    logger.info(`[Scheduler] ${sport.toUpperCase()} live polling started`);

    while (!controller.stop) {
      try {
        const remaining = getBudget();
        const liveUsed = getLiveCount();
        
        const dailyStatusName = sport === "football" ? "footballDailyFixtures" : "basketballDailyFixtures";
        const totalDailyMatches = this.syncStatus[dailyStatusName]?.lastResult?.totalToday || this.syncStatus[dailyStatusName]?.lastResult?.total || 0;

        const state = this._determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap);

        const intervalMin = (state.interval / 60000).toFixed(1);
        const logRemaining = remaining !== null ? remaining : displayBudget;
        
        logger.info(
          `[Scheduler] ${sport.toUpperCase()} [${state.mode}] Next poll in ${intervalMin}m ` +
            `[Live: ${liveUsed}/${liveCap} cap, API: ${logRemaining}/${displayBudget}, ` +
            `LiveMatches: ${liveCount}, NearFT: ${isNearFinish ? "Y" : "N"}, ` +
            `Spendable: ${state.spendableCalls}, TimeLeft: ${state.hoursUntilMidnight}h, ` +
            `LiveWindow: ${state.expectedWindowHours}h, TotalToday: ${totalDailyMatches}]`
        );

        await this._sleep(state.interval);
        if (controller.stop) break;

        const nowRemaining = getBudget();
        const nowLiveUsed = getLiveCount();

        if (nowRemaining !== null && nowRemaining <= 0) {
          logger.warn(`[Scheduler] ${sport.toUpperCase()} paused — budget 0/${displayBudget}`);
          continue;
        }

        if (nowRemaining !== null && nowRemaining < LIVE_POLLING.MIN_BUDGET_TO_POLL) {
          logger.warn(`[Scheduler] ${sport.toUpperCase()} skipped — budget below MIN_BUDGET_TO_POLL`);
          continue;
        }

        const prevHadLive = liveCount > 0;
        
        const jobPromise = service.run();
        this.activeJobs.add(jobPromise);
        const result = await jobPromise.finally(() => this.activeJobs.delete(jobPromise));
        
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        const actuallyPolled = result?.polled !== false;

        if (actuallyPolled) {
          liveCount = result.liveCount ?? result.total ?? 0;
          isNearFinish = (result.nearFT ?? 0) > 0 || result.isNearFinish === true;
        }

        const recoveredFT = result?.recoveredFT || 0;
        const capReached = result?.capReached === true;
        const logNowRemaining = nowRemaining !== null ? nowRemaining : displayBudget;

        logger.info(
          `[Scheduler] ${sport.toUpperCase()} sync done. ` +
            `Live: ${liveCount} match(es). NearFT: ${isNearFinish ? "Yes" : "No"}. ` +
            `FT→: ${recoveredFT}. Cap: ${nowLiveUsed}/${liveCap}${capReached ? " (REACHED)" : ""}. ` +
            `Budget: ${logNowRemaining}/${displayBudget}`
        );

        if (
          prevHadLive &&
          liveCount === 0 &&
          actuallyPolled &&
          FT_RECOVERY.ENABLED &&
          logNowRemaining > FT_RECOVERY.MIN_BUDGET_TO_FETCH
        ) {
          await this._handleLiveSessionEnd(sport, serviceName, service);
        }
      } catch (err) {
        consecutiveErrors++;
        this._updateStatus(serviceName, "error", null, err);

        logger.error(
          `[Scheduler] ${sport.toUpperCase()} error ` +
            `(${consecutiveErrors}/${LIVE_POLLING.MAX_CONSECUTIVE_ERRORS}): ${err.message}`
        );

        if (consecutiveErrors >= LIVE_POLLING.MAX_CONSECUTIVE_ERRORS) {
          logger.error(`[Scheduler] ${sport.toUpperCase()} polling stopped — max errors reached`);
          break;
        }

        await this._sleep(LIVE_POLLING.ERROR_BACKOFF_MS);
      }
    }
  }

  async _handleLiveSessionEnd(sport, serviceName, service) {
    logger.info(
      `[Scheduler] ${sport.toUpperCase()} live session ended. ` +
        `Triggering immediate FT confirmation in ${LIVE_POLLING.FT_CONFIRMATION_DELAY_MS / 1000}s...`
    );
    await this._sleep(LIVE_POLLING.FT_CONFIRMATION_DELAY_MS);
    if (!this.running) return;

    const dailyServiceName = sport === "football" ? "footballDailyFixtures" : "basketballDailyFixtures";
    const dailyService = this.services[dailyServiceName];
    
    if (dailyService) {
      logger.info(
        `[Scheduler] ${sport.toUpperCase()} executing immediate ${dailyServiceName} ` +
        `to ensure all finished matches (including yesterday) are updated to FT...`
      );
      await this._executeJob(dailyServiceName, dailyService);
      logger.info(`[Scheduler] ${sport.toUpperCase()} immediate FT confirmation via ${dailyServiceName} completed.`);
    } else {
      logger.info(`[Scheduler] ${sport.toUpperCase()} executing immediate FT confirmation poll...`);
      await this._executeJob(serviceName, service);
    }
  }

  _scheduleRecurring(serviceName, getInitialDelayMs, getIntervalMs) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(`[Scheduler] ${serviceName} not registered — skipping`);
      return;
    }

    const run = async () => {
      if (!this.running) return;

      const jobPromise = service.run();
      this.activeJobs.add(jobPromise);

      try {
        logger.info(`[Scheduler] Cron → ${serviceName}`);
        const result = await jobPromise;
        this._updateStatus(serviceName, "success", result);
      } catch (err) {
        this._updateStatus(serviceName, "error", null, err);
        logger.error(`[Scheduler] Cron ${serviceName} failed: ${err.message}`);
      } finally {
        this.activeJobs.delete(jobPromise);
      }

      if (this.running) {
        const timer = setTimeout(run, getIntervalMs());
        this.cronTimers.push(timer);
      }
    };

    const timer = setTimeout(run, getInitialDelayMs());
    this.cronTimers.push(timer);
  }

  _getMsUntilDaily(cronExpr) {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 2) {
      throw new Error(`Invalid cron expression: ${cronExpr}. Expected format: "M H"`);
    }
    
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    const minMs = next - now;
    return minMs;
  }

  async _tryRun(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(`[Scheduler] ${serviceName} not registered — skipping`);
      return;
    }
    await this._executeJob(serviceName, service, true);
  }

  async _executeJob(name, service, initial = false, force = false) {
    const status = this.syncStatus[name];
    if (status && status.status === "running") {
      logger.warn(`[Scheduler] ${name} still running — skip`);
      return;
    }

    if (status) status.status = "running";
    const jobPromise = service.run(force);
    this.activeJobs.add(jobPromise);

    try {
      logger.info(`[Scheduler] ${initial ? "Initial" : "Cron"} → ${name}`);
      const result = await jobPromise;
      this._updateStatus(name, "success", result);
    } catch (err) {
      this._updateStatus(name, "error", null, err);
      logger.error(`[Scheduler] ${name} failed: ${err.message}`);
    } finally {
      this.activeJobs.delete(jobPromise);
    }
  }

  // ★ NEW: Custom job executor for services that don't take a `force` argument (like RangeFixtures)
  async _executeCustomJob(name, service) {
    const jobPromise = service.run();
    this.activeJobs.add(jobPromise);

    try {
      logger.info(`[Scheduler] Custom Job → ${name}`);
      await jobPromise;
    } catch (err) {
      logger.error(`[Scheduler] Custom Job ${name} failed: ${err.message}`);
    } finally {
      this.activeJobs.delete(jobPromise);
    }
  }

  _updateStatus(name, status, result = null, error = null) {
    const cur = this.syncStatus[name];
    if (!cur) return; // Safety check
    
    cur.status = status;
    cur.lastSync = new Date().toISOString();
    cur.totalRuns++;

    if (result) {
      cur.lastDuration = result.duration ?? null;
      cur.lastResult = {
        total: result.total ?? null,
        totalToday: result.totalToday ?? null,
        writes: result.writes ?? null,
        removed: result.removed ?? null,
        apiCalls: result.apiCalls ?? null,
        hasLive: result.hasLive ?? null,
        isNearFinish: result.isNearFinish ?? null,
        capReached: result.capReached ?? null,
        deduped: result.deduped ?? null,
        rolloverYesterday: result.rolloverYesterday ?? null,
        rolloverToday: result.rolloverToday ?? null,
        recoveredFT: result.recoveredFT ?? null,
        skipped: result.skipped ?? null,
        success: result.success ?? null,
        polled: result.polled ?? null,
        liveCount: result.liveCount ?? null,
        nearFT: result.nearFT ?? null,
      };
    }

    if (status === "error") {
      cur.errorCount++;
      cur.lastError = error?.message || "Unknown";
    } else {
      cur.lastError = null;
    }
  }

  _createInitialStatus() {
    return {
      status: "idle",
      lastSync: null,
      lastDuration: null,
      lastResult: null,
      lastError: null,
      errorCount: 0,
      totalRuns: 0,
    };
  }

  _sleep(ms) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      this.activeSleepControllers.add(controller);

      const timer = setTimeout(() => {
        this.activeSleepControllers.delete(controller);
        resolve();
      }, ms);

      if (timer.unref) timer.unref();

      controller.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        this.activeSleepControllers.delete(controller);
        resolve();
      });
    });
  }

  _logSchedule() {
    logger.info("[Scheduler] ═══ Adaptive Schedule v6 ═══");
    logger.info("  Density-Aware Polling Intervals:");
    logger.info("    0 live       → 30 min  (IDLE)");
    logger.info("    1–5 live     → 15 min  (LIVE_LOW)");
    logger.info("    6–15 live    → 10 min  (LIVE_MED)");
    logger.info("    16–40 live   →  5 min  (LIVE_HIGH)");
    logger.info("    41+ live     →  3 min  (LIVE_MASS)");
    logger.info("    80'+ / ET    →  5 min  (NEAR_FT)");
    logger.info("  Budget Pacing dynamically adjusts interval if calls are running low.");
    logger.info(`  Football Live Cap:   ${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Basketball Live Cap: ${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Daily API Budget:    ${API.DAILY_BUDGET}`);
    logger.info(`  Reserve for Daily:   ${LIVE_POLLING.RESERVE_FOR_DAILY_CRON} calls`);
    logger.info("[Scheduler] ═════════════════════════════════════");
  }
}

module.exports = Scheduler;