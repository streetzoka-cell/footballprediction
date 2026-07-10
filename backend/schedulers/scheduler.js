/*
 * scheduler.js
 * Smart scheduler with 3 AM daily run + adaptive live polling.
 */

const { SCHEDULER, LIVE_POLLING, API } = require("../config/constants");
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

    for (const name of Object.keys(services)) {
      this.syncStatus[name] = this._createInitialStatus();
    }
  }

  // ==========================================================
  // INITIAL SYNC
  // ==========================================================

  async runInitialSync() {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(" Initial Sync (meta-aware)");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    await this._tryRun("footballLiveFixtures");

    if (isBasketballConfigured) {
      await this._tryRun("basketballLiveFixtures");
    }

    await this._tryRun("footballDailyFixtures");

    if (isBasketballConfigured) {
      await this._tryRun("basketballDailyFixtures");
    }

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(" Initial Sync Complete");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  // ==========================================================
  // START
  // ==========================================================

  start() {
    this.running = true;
    logger.info("[Scheduler] Starting smart scheduler...");

    this._startLivePolling("football");

    if (isBasketballConfigured) {
      this._startLivePolling("basketball");
    }

    this._startCron("footballDailyFixtures", SCHEDULER.FIXTURES_DAILY);

    if (isBasketballConfigured) {
      this._startCron(
        "basketballDailyFixtures",
        SCHEDULER.BASKETBALL_FIXTURES_DAILY
      );
    }

    this._logSchedule();
    logger.info("[Scheduler] Started.");
  }

  // ==========================================================
  // STOP
  // ==========================================================

  stop() {
    this.running = false;

    for (const ctrl of this.pollingControllers) {
      ctrl.stop = true;
    }
    this.pollingControllers = [];

    for (const timer of this.cronTimers) {
      clearTimeout(timer);
    }
    this.cronTimers = [];

    logger.info("[Scheduler] Stopped.");
  }

  // ==========================================================
  // STATUS
  // ==========================================================

  getStatus() {
    return {
      running: this.running,
      jobs: { ...this.syncStatus },
    };
  }

  // ==========================================================
  // LIVE POLLING LOOP
  // ==========================================================

  _startLivePolling(sport) {
    const serviceName =
      sport === "football"
        ? "footballLiveFixtures"
        : "basketballLiveFixtures";

    const service = this.services[serviceName];
    if (!service) {
      logger.warn(
        `[Scheduler] ${serviceName} not registered — skipping`
      );
      return;
    }

    const getBudget =
      sport === "football"
        ? getRemainingRequests
        : getBasketballRemainingRequests;

    const getLiveCount =
      sport === "football"
        ? getLiveRequestsToday
        : getBasketballLiveRequestsToday;

    const getLiveCap =
      sport === "football"
        ? LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP
        : LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP;

    const controller = { stop: false };
    this.pollingControllers.push(controller);

    this._pollingLoop(
      serviceName,
      service,
      getBudget,
      getLiveCount,
      getLiveCap,
      controller
    ).catch((err) => {
      logger.error(
        `[Scheduler] ${sport} polling crashed: ${err.message}`
      );
    });
  }

  async _pollingLoop(
    serviceName,
    service,
    getBudget,
    getLiveCount,
    getLiveCap,
    controller
  ) {
    const sport = serviceName.includes("basketball")
      ? "basketball"
      : "football";

    let consecutiveErrors = 0;

    logger.info(
      `[Scheduler] ${sport} live polling started`
    );

    while (!controller.stop) {
      try {
        const remaining = getBudget();
        const liveUsed = getLiveCount();

        let interval;

        if (remaining !== null && remaining <= 0) {
          interval = LIVE_POLLING.CAP_REACHED_INTERVAL_MS;
        } else if (
          remaining !== null &&
          remaining < LIVE_POLLING.MIN_BUDGET_TO_POLL
        ) {
          interval = LIVE_POLLING.CRITICAL_INTERVAL_MS;
        } else {
          // Use 5-min active interval — if games are live,
          // don't waste time waiting 30 min for first poll
          interval = LIVE_POLLING.ACTIVE_INTERVAL_MS;
        }

        logger.info(
          `[Scheduler] ${sport} next in ${Math.round(interval / 1000)}s ` +
          `[live: ${liveUsed}/${getLiveCap}, api: ${remaining ?? "???"}/${API.DAILY_BUDGET}]`
        );

        await this._sleep(interval);

        if (controller.stop) break;

        // Re-check guards after sleeping
        const nowRemaining = getBudget();
        const nowLiveUsed = getLiveCount();

        if (nowRemaining !== null && nowRemaining <= 0) {
          logger.warn(
            `[Scheduler] ${sport} paused — budget 0/${API.DAILY_BUDGET}`
          );
          continue;
        }

        if (
          nowRemaining !== null &&
          nowRemaining < LIVE_POLLING.MIN_BUDGET_TO_POLL
        ) {
          continue;
        }

        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        // Adjust next interval based on result
        if (result?.capReached) {
          interval = LIVE_POLLING.CAP_REACHED_INTERVAL_MS;
        } else if (result?.hasLive === false) {
          interval = LIVE_POLLING.NO_LIVE_CHECK_INTERVAL_MS;
        } else if (
          nowRemaining === null ||
          nowRemaining > LIVE_POLLING.LOW_BUDGET_THRESHOLD
        ) {
          interval = LIVE_POLLING.ACTIVE_INTERVAL_MS;
        } else if (nowRemaining > LIVE_POLLING.CRITICAL_BUDGET_THRESHOLD) {
          interval = LIVE_POLLING.LOW_BUDGET_INTERVAL_MS;
        } else {
          interval = LIVE_POLLING.CRITICAL_INTERVAL_MS;
        }

        logger.info(
          `[Scheduler] ${sport} next in ${Math.round(interval / 1000)}s ` +
          `[live: ${getLiveCount()}/${getLiveCap}, api: ${getBudget() ?? "???"}/${API.DAILY_BUDGET}]`
        );

      } catch (err) {
        consecutiveErrors++;
        this._updateStatus(serviceName, "error", null, err);

        logger.error(
          `[Scheduler] ${sport} error (${consecutiveErrors}/${LIVE_POLLING.MAX_CONSECUTIVE_ERRORS}): ${err.message}`
        );

        if (consecutiveErrors >= LIVE_POLLING.MAX_CONSECUTIVE_ERRORS) {
          logger.error(
            `[Scheduler] ${sport} polling stopped — max errors`
          );
          break;
        }

        await this._sleep(LIVE_POLLING.ERROR_BACKOFF_MS);
      }
    }
  }

  // ==========================================================
  // CRON JOBS
  // ==========================================================

  _startCron(serviceName, cronExpr) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(
        `[Scheduler] ${serviceName} not registered — skipping cron`
      );
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
        logger.error(
          `[Scheduler] Cron ${serviceName} failed: ${err.message}`
        );
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

    logger.info(
      `[Scheduler] Next "${cronExpr}" in ${Math.round(minMs / 60000)} min`
    );
    return minMs;
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  async _tryRun(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(
        `[Scheduler] ${serviceName} not registered — skipping`
      );
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
      logger.info(
        `[Scheduler] ${initial ? "Initial" : "Cron"} → ${name}`
      );

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

  _sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref();
    });
  }

  _logSchedule() {
    logger.info("[Scheduler] ═══ Smart Schedule ═══");
    logger.info("  Daily Rollover+Fetch: 03:00 AM (1 API call/sport)");
    logger.info("  Live Polling:        5 min (live) / 30 min (idle)");
    logger.info("  Football Live Cap:   20/day");
    logger.info("  Basketball Live Cap: 10/day");
    logger.info("  Budget Used:         ~22 football, ~12 basketball");
    logger.info("[Scheduler] ════════════════════════");
  }
}

module.exports = Scheduler;