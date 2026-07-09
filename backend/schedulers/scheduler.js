/*
 * scheduler.js
 * Perfect scheduler — meta-aware initial sync,
 * cap-governed live polling, no wasted requests.
 *
 * CONSTRUCTOR CHANGE:
 *   DailyFixturesService no longer takes ftProcessor.
 *   new DailyFixturesService(repo, teamsProcessor)
 *   new BasketballDailyFixturesService(repo)
 *
 * INITIAL SYNC LOGIC:
 *   1. Always run live check (need real-time data)
 *   2. Check meta before daily fetch (dedup)
 *   3. If meta says already fetched today → skip daily
 *
 * WORST CASE: 44 API calls/day out of 100.
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
  //
  // Live: ALWAYS run (users need real-time scores immediately)
  // Daily: Run ONLY if meta says we haven't fetched today
  //   → Saves 2 requests on server restart after 3 AM cron
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

    // Daily — check meta first, skip if already done
    const footballDailyResult = await this._tryRunDaily(
      "footballDailyFixtures"
    );

    if (isBasketballConfigured) {
      await this._tryRunDaily("basketballDailyFixtures");
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
    logger.info(
      "[Scheduler] Starting budget-perfect scheduler..."
    );

    // 1. Adaptive live polling loops
    this._startLivePolling("football");

    if (isBasketballConfigured) {
      this._startLivePolling("basketball");
    }

    // 2. Cron — daily tomorrow fetch only
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
  //
  // Interval selection:
  //   capReached       → 60 min (wait for midnight)
  //   no live games    → 10 min (idle)
  //   budget > 30      →  2 min (active)
  //   budget 10-30     → 10 min (conserving)
  //   budget < 10      → 30 min (critical)
  //   budget = 0       → 60 min (exhausted)
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

        // Budget exhausted
        if (remaining !== null && remaining <= 0) {
          logger.warn(
            `[Scheduler] ${sport} paused — budget 0/${API.DAILY_BUDGET}`
          );
          await this._sleep(LIVE_POLLING.CAP_REACHED_INTERVAL_MS);
          continue;
        }

        // Below minimum
        if (
          remaining !== null &&
          remaining < LIVE_POLLING.MIN_BUDGET_TO_POLL
        ) {
          await this._sleep(LIVE_POLLING.CRITICAL_INTERVAL_MS);
          continue;
        }

        // Execute
        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        // Pick interval
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

    logger.info(
      `[Scheduler] ${sport} live polling exited`
    );
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
    const minute =
      parts[0] === "*" ? 0 : parseInt(parts[0], 10);
    const hour =
      parts[1] === "*" ? 0 : parseInt(parts[1], 10);
    const dayOfWeek = parts[4];

    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);

    if (dayOfWeek !== "*") {
      const target = parseInt(dayOfWeek, 10) % 7;
      const current = next.getUTCDay();
      let daysUntil = target - current;

      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0 && next <= now) daysUntil = 7;

      next.setUTCDate(next.getUTCDate() + daysUntil);
    } else {
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
    }

    const ms = next - now;
    logger.info(
      `[Scheduler] Next "${cronExpr}" in ${Math.round(ms / 60000)} min`
    );
    return ms;
  }

  // ==========================================================
  // HELPERS
  // ==========================================================

  /**
   * Try running a daily service.
   * The service itself handles meta dedup internally.
   * This wrapper just catches and logs errors.
   */
  async _tryRunDaily(serviceName) {
    const service = this.services[serviceName];
    if (!service) {
      logger.warn(
        `[Scheduler] ${serviceName} not registered — skipping`
      );
      return;
    }

    await this._executeJob(serviceName, service, true);
  }

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
    logger.info("[Scheduler] ═══ Budget (100/day) ═══");
    logger.info(
      `  Daily fetch (3-day rollover): 2 req (FB + BB)`
    );
    logger.info(
      `  Football live cap: ${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}/day`
    );
    logger.info(
      `  Basketball live cap: ${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}/day`
    );
    logger.info(`  Max total: 44/day | Reserve: 56/day`);
    logger.info("[Scheduler] ═══ 3-Day Rollover ═══");
    logger.info(
      "  tomorrowFixtures → todayFixtures → yesterdayFixtures"
    );
    logger.info("  Overnight FT games auto-recovered");
    logger.info("  Meta dedup prevents double-fetch on restart");
    logger.info("[Scheduler] ═══ Live Intervals ═══");
    logger.info(
      `  Active:   ${LIVE_POLLING.ACTIVE_INTERVAL_MS / 1000}s`
    );
    logger.info(
      `  Idle:     ${LIVE_POLLING.NO_LIVE_CHECK_INTERVAL_MS / 1000}s`
    );
    logger.info(
      `  Conserving: ${LIVE_POLLING.LOW_BUDGET_INTERVAL_MS / 1000}s`
    );
    logger.info(
      `  Critical:  ${LIVE_POLLING.CRITICAL_INTERVAL_MS / 1000}s`
    );
    logger.info(
      `  Cap hit:   ${LIVE_POLLING.CAP_REACHED_INTERVAL_MS / 1000}s`
    );
    logger.info("[Scheduler] ═══ Disabled (free plan) ═══");
    logger.info("  Standings — 19 req/week");
    logger.info("  Leagues   — 19 req/week");
  }
}

module.exports = Scheduler;