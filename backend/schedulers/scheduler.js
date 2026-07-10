/*
 * scheduler.js
 * Smart scheduler with midnight rollover + adaptive live polling.
 *
 * CRON SCHEDULE:
 *   00:05, 00:20, 00:35, 00:50, 01:05... (Every 15 min until 3 AM)
 *     → Calls rollover() to shift data: tomorrow→today, today→yesterday
 *     → 0 API calls. Skips if meta says already done.
 *
 *   03:00 AM (Once daily)
 *     → Calls run() to fetch tomorrow's fixtures (1 API call)
 *     → Also verifies rollover happened (fallback if midnight cron failed)
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

    // Live — always run (real-time data)
    await this._tryRun("footballLiveFixtures");

    if (isBasketballConfigured) {
      await this._tryRun("basketballLiveFixtures");
    }

    // Daily — full run handles rollover check + tomorrow fetch
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

    // 1. Adaptive live polling loops
    this._startLivePolling("football");

    if (isBasketballConfigured) {
      this._startLivePolling("basketball");
    }

    // 2. Midnight Rollover Crons (Every 15 min from 00:05 to 02:50)
    // These call rollover() which is 0 API calls and idempotent
    this._startCron(
      "footballDailyRollover",
      SCHEDULER.FIXTURES_MIDNIGHT_RETRY
    );

    if (isBasketballConfigured) {
      this._startCron(
        "basketballDailyRollover",
        SCHEDULER.BASKETBALL_FIXTURES_MIDNIGHT_RETRY
      );
    }

    // 3. Daily Fetch Crons (3 AM)
    // These call run() which fetches tomorrow (1 API call)
    // and acts as a fallback if rollover failed at midnight
    this._startCron(
      "footballDailyFixtures",
      SCHEDULER.FIXTURES_DAILY
    );

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

        if (remaining !== null && remaining <= 0) {
          logger.warn(
            `[Scheduler] ${sport} paused — budget 0/${API.DAILY_BUDGET}`
          );
          await this._sleep(LIVE_POLLING.CAP_REACHED_INTERVAL_MS);
          continue;
        }

        if (
          remaining !== null &&
          remaining < LIVE_POLLING.MIN_BUDGET_TO_POLL
        ) {
          await this._sleep(LIVE_POLLING.CRITICAL_INTERVAL_MS);
          continue;
        }

        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        let interval;

        if (result?.capReached) {
          interval = LIVE_POLLING.CAP_REACHED_INTERVAL_MS;
        } else if (result?.hasLive === false) {
          interval = LIVE_POLLING.NO_LIVE_CHECK_INTERVAL_MS;
        } else if (
          remaining === null ||
          remaining > LIVE_POLLING.LOW_BUDGET_THRESHOLD
        ) {
          interval = LIVE_POLLING.ACTIVE_INTERVAL_MS;
        } else if (remaining > LIVE_POLLING.CRITICAL_BUDGET_THRESHOLD) {
          interval = LIVE_POLLING.LOW_BUDGET_INTERVAL_MS;
        } else {
          interval = LIVE_POLLING.CRITICAL_INTERVAL_MS;
        }

        logger.info(
          `[Scheduler] ${sport} next in ${Math.round(interval / 1000)}s ` +
          `[live: ${liveUsed}/${getLiveCap}, api: ${remaining ?? "???"}/${API.DAILY_BUDGET}]`
        );

        await this._sleep(interval);
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
    
    // Handle comma-separated minutes (e.g., "5,20,35,50")
    const minuteParts = parts[0].split(',');
    const hourParts = parts[1].split('-');
    
    const now = new Date();
    const currentMinute = now.getUTCMinutes();
    const currentHour = now.getUTCHours();
    
    // Parse target minutes
    const targetMinutes = minuteParts.map(m => parseInt(m, 10)).sort((a, b) => a - b);
    
    // Parse target hours
    let targetHours = [];
    if (hourParts.length === 2) {
      const startH = parseInt(hourParts[0], 10);
      const endH = parseInt(hourParts[1], 10);
      for (let h = startH; h <= endH; h++) {
        targetHours.push(h);
      }
    } else {
      targetHours = [parseInt(hourParts[0], 10)];
    }

    // Find the next occurrence
    let minMs = Infinity;

    for (const h of targetHours) {
      for (const m of targetMinutes) {
        const next = new Date(now);
        next.setUTCHours(h, m, 0, 0);

        if (next <= now) {
          // If this time has passed today, check if it's a recurring pattern
          // For daily patterns, move to tomorrow
          if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
            next.setUTCDate(next.getUTCDate() + 1);
          } else {
            continue;
          }
        }

        const diff = next - now;
        if (diff > 0 && diff < minMs) {
          minMs = diff;
        }
      }
    }

    // Fallback: if no time found today (e.g., window closed), schedule for tomorrow's first occurrence
    if (minMs === Infinity) {
      const firstMin = targetMinutes[0];
      const firstHour = targetHours[0];
      const next = new Date(now);
      next.setUTCHours(firstHour, firstMin, 0, 0);
      next.setUTCDate(next.getUTCDate() + 1);
      minMs = next - now;
    }

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
    logger.info("  Midnight Rollover: Every 15 min (00:05 - 02:50)");
    logger.info("  Daily Fetch:      03:00 AM (1 API call)");
    logger.info("  Live Polling:     Adaptive (2-60 min)");
    logger.info("[Scheduler] ════════════════════════");
  }
}

module.exports = Scheduler;