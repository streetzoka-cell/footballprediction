// schedulers/scheduler.js
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

class Scheduler {
  constructor(services = {}) {
    this.services = services;
    this.running = false;
    this.pollingControllers = [];
    this.cronTimers = [];
    this.syncStatus = {};
    this.activeSleepControllers = new Set();
    this.lastFtRecovery = {}; // Tracks lastFtRecovery per sport

    for (const name of Object.keys(services)) {
      this.syncStatus[name] = this._createInitialStatus();
    }
  }

  async runInitialSync() {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(" Initial Sync (meta-aware)");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await this._tryRun("footballLiveFixtures");
    if (isBasketballConfigured) await this._tryRun("basketballLiveFixtures");
    
    await this._tryRun("footballDailyFixtures");
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

    this._startCron("footballDailyFixtures", SCHEDULER.FIXTURES_DAILY);
    if (isBasketballConfigured) this._startCron("basketballDailyFixtures", SCHEDULER.BASKETBALL_FIXTURES_DAILY);

    this._logSchedule();
    logger.info("[Scheduler] Started.");
  }

  stop() {
    this.running = false;

    for (const ctrl of this.pollingControllers) ctrl.stop = true;
    this.pollingControllers = [];

    for (const timer of this.cronTimers) clearTimeout(timer);
    this.cronTimers = [];

    // Cancel all active sleeps immediately for graceful shutdown
    for (const ctrl of this.activeSleepControllers) {
      if (!ctrl.signal.aborted) ctrl.abort();
    }
    this.activeSleepControllers.clear();

    logger.info("[Scheduler] Stopped.");
  }

  getStatus() {
    return {
      running: this.running,
      jobs: { ...this.syncStatus },
    };
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
    const getLiveCap = sport === "football" ? LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP : LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP;

    const controller = { stop: false };
    this.pollingControllers.push(controller);

    this._pollingLoop(serviceName, service, getBudget, getLiveCount, getLiveCap, controller)
      .catch((err) => logger.error(`[Scheduler] ${sport} polling crashed: ${err.message}`));
  }

  /**
   * Smart State Machine: Determines interval based on Budget Tier, Live Status, and Near-Finish logic
   */
  _determinePollingState(remaining, hasLive, isNearFinish) {
    let mode = "HEALTHY";
    let interval = LIVE_POLLING.ACTIVE_INTERVAL_MS;

    if (remaining !== null && remaining <= 0) {
      mode = "EXHAUSTED";
      interval = LIVE_POLLING.EXHAUSTED_INTERVAL_MS;
    } else if (remaining !== null && remaining <= LIVE_POLLING.CRITICAL_BUDGET_THRESHOLD) {
      mode = "CRITICAL";
      interval = LIVE_POLLING.CRITICAL_INTERVAL_MS;
    } else if (remaining !== null && remaining <= LIVE_POLLING.LOW_BUDGET_THRESHOLD) {
      mode = "LOW";
      interval = LIVE_POLLING.LOW_INTERVAL_MS;
    } else if (remaining !== null && remaining <= LIVE_POLLING.MEDIUM_BUDGET_THRESHOLD) {
      mode = "MEDIUM";
      interval = hasLive ? LIVE_POLLING.MEDIUM_INTERVAL_MS : LIVE_POLLING.LOW_INTERVAL_MS;
    } else {
      // Healthy Budget
      mode = "HEALTHY";
      if (hasLive) {
        interval = isNearFinish ? LIVE_POLLING.NEAR_FINISH_INTERVAL_MS : LIVE_POLLING.ACTIVE_INTERVAL_MS;
        if (isNearFinish) mode = "NEAR_FINISH";
      } else {
        interval = LIVE_POLLING.LOW_INTERVAL_MS; // Idle
      }
    }

    return { mode, interval };
  }

  async _pollingLoop(serviceName, service, getBudget, getLiveCount, getLiveCap, controller) {
    const sport = serviceName.includes("basketball") ? "basketball" : "football";
    let consecutiveErrors = 0;
    let hasLive = false;
    let isNearFinish = false;

    logger.info(`[Scheduler] ${sport.toUpperCase()} live polling started`);

    while (!controller.stop) {
      try {
        const remaining = getBudget();
        const liveUsed = getLiveCount();
        const { mode, interval } = this._determinePollingState(remaining, hasLive, isNearFinish);

        logger.info(
          `[Scheduler] ${sport.toUpperCase()} [${mode}] Next poll in ${Math.round(interval / 60000)}m ` +
          `[Live: ${liveUsed}/${getLiveCap}, API: ${remaining ?? "???"}/${API.DAILY_BUDGET}]`
        );

        await this._sleep(interval);
        if (controller.stop) break;

        // Re-check guards after sleeping
        const nowRemaining = getBudget();
        const nowLiveUsed = getLiveCount();

        if (nowRemaining !== null && nowRemaining <= 0) {
          logger.warn(`[Scheduler] ${sport.toUpperCase()} paused — budget 0/${API.DAILY_BUDGET}`);
          continue;
        }

        if (nowRemaining !== null && nowRemaining < LIVE_POLLING.MIN_BUDGET_TO_POLL) {
          continue;
        }

        const prevHasLive = hasLive;
        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        hasLive = result?.hasLive === true;
        isNearFinish = result?.isNearFinish === true; // Service should return this boolean
        const recoveredFT = result?.recoveredFT || 0;

        logger.info(
          `[Scheduler] ${sport.toUpperCase()} sync done. Live: ${hasLive ? "Yes" : "No"}. Near FT: ${isNearFinish ? "Yes" : "No"}. ` +
          `FT Recovered: ${recoveredFT}. Budget: ${nowRemaining ?? "???"}/${API.DAILY_BUDGET}`
        );

        // SMART FT RECOVERY TRIGGER
        // If we HAD live games, but now we DON'T, it means games just finished.
        // We wait 60 seconds and poll again IMMEDIATELY to catch the final score 
        // instead of waiting for the next 1-hour idle cycle.
        if (prevHasLive && !hasLive && FT_RECOVERY.ENABLED && nowRemaining > FT_RECOVERY.MIN_BUDGET_TO_FETCH) {
          logger.info(`[Scheduler] ${sport.toUpperCase()} live session ended. Triggering immediate FT confirmation in ${LIVE_POLLING.FT_CONFIRMATION_DELAY_MS / 1000}s...`);
          await this._sleep(LIVE_POLLING.FT_CONFIRMATION_DELAY_MS);
        }

      } catch (err) {
        consecutiveErrors++;
        this._updateStatus(serviceName, "error", null, err);

        logger.error(
          `[Scheduler] ${sport.toUpperCase()} error (${consecutiveErrors}/${LIVE_POLLING.MAX_CONSECUTIVE_ERRORS}): ${err.message}`
        );

        if (consecutiveErrors >= LIVE_POLLING.MAX_CONSECUTIVE_ERRORS) {
          logger.error(`[Scheduler] ${sport.toUpperCase()} polling stopped — max errors reached`);
          break;
        }

        await this._sleep(LIVE_POLLING.ERROR_BACKOFF_MS);
      }
    }
  }

  _startCron(serviceName, cronExpr) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(`[Scheduler] ${serviceName} not registered — skipping cron`);
      return;
    }

    const run = async () => {
      if (!this.running) return;

      try {
        logger.info(`[Scheduler] Cron → ${serviceName}`);
        const result = await service.run();
        this._updateStatus(serviceName, "success", result);
      } catch (err) {
        this._updateStatus(serviceName, "error", null, err);
        logger.error(`[Scheduler] Cron ${serviceName} failed: ${err.message}`);
      }

      if (this.running) {
        const ms = this._getMsUntilCron(cronExpr);
        const timer = setTimeout(run, ms);
        this.cronTimers.push(timer);
      }
    };

    const ms = this._getMsUntilCron(cronExpr);
    const timer = setTimeout(run, ms);
    this.cronTimers.push(timer);
  }

  _getMsUntilCron(cronExpr) {
    const parts = cronExpr.trim().split(/\s+/);
    const minute = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);

    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    const minMs = next - now;
    logger.info(`[Scheduler] Next "${cronExpr}" in ${Math.round(minMs / 60000)} min`);
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

  async _executeJob(name, service, initial = false) {
    const status = this.syncStatus[name];
    if (status.status === "running") {
      logger.warn(`[Scheduler] ${name} still running — skip`);
      return;
    }

    try {
      status.status = "running";
      logger.info(`[Scheduler] ${initial ? "Initial" : "Cron"} → ${name}`);
      const result = await service.run();
      this._updateStatus(name, "success", result);
    } catch (err) {
      this._updateStatus(name, "error", null, err);
      logger.error(`[Scheduler] ${name} failed: ${err.message}`);
    }
  }

  _updateStatus(name, status, result = null, error = null) {
    const cur = this.syncStatus[name];
    cur.status = status;
    cur.lastSync = new Date().toISOString();
    cur.totalRuns++;

    if (result) {
      cur.lastDuration = result.duration ?? null;
      cur.lastResult = {
        total: result.total ?? null,
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

  /**
   * Cancellable Sleep. Prevents hanging the event loop during shutdown.
   */
  _sleep(ms) {
    return new Promise((resolve) => {
      const controller = new AbortController();
      this.activeSleepControllers.add(controller);
      
      const timer = setTimeout(() => {
        this.activeSleepControllers.delete(controller);
        resolve();
      }, ms);
      
      // Allow Node to exit if this is the only timer left
      if (timer.unref) timer.unref();

      controller.signal.addEventListener('abort', () => {
        clearTimeout(timer);
        this.activeSleepControllers.delete(controller);
        resolve();
      });
    });
  }

  _logSchedule() {
    logger.info("[Scheduler] ═══ Smart Schedule Configuration ═══");
    logger.info(`  Daily Rollover+Fetch: 03:00 AM UTC (1 API call/sport)`);
    logger.info(`  Live Polling (Active): ${LIVE_POLLING.ACTIVE_INTERVAL_MS / 60000}m`);
    logger.info(`  Live Polling (Near FT): ${LIVE_POLLING.NEAR_FINISH_INTERVAL_MS / 60000}m`);
    logger.info(`  Live Polling (Idle):   ${LIVE_POLLING.LOW_INTERVAL_MS / 60000}m`);
    logger.info(`  Football Live Cap:     ${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Basketball Live Cap:   ${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Daily API Budget:      ${API.DAILY_BUDGET}`);
    logger.info("[Scheduler] ═════════════════════════════════════");
  }
}

module.exports = Scheduler;