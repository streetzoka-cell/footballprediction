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
    if (isBasketballConfigured)
      this._startCron("basketballDailyFixtures", SCHEDULER.BASKETBALL_FIXTURES_DAILY);

    this._logSchedule();
    logger.info("[Scheduler] Started.");
  }

  stop() {
    this.running = false;

    for (const ctrl of this.pollingControllers) ctrl.stop = true;
    this.pollingControllers = [];

    for (const timer of this.cronTimers) clearTimeout(timer);
    this.cronTimers = [];

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
    const serviceName =
      sport === "football" ? "footballLiveFixtures" : "basketballLiveFixtures";
    const service = this.services[serviceName];

    if (!service) {
      logger.warn(`[Scheduler] ${serviceName} not registered — skipping`);
      return;
    }

    const getBudget =
      sport === "football" ? getRemainingRequests : getBasketballRemainingRequests;
    const getLiveCount =
      sport === "football" ? getLiveRequestsToday : getBasketballLiveRequestsToday;
    const liveCap =
      sport === "football"
        ? LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP
        : LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP;

    const controller = { stop: false };
    this.pollingControllers.push(controller);

    this._pollingLoop(serviceName, service, getBudget, getLiveCount, liveCap, controller).catch(
      (err) => logger.error(`[Scheduler] ${sport} polling crashed: ${err.message}`)
    );
  }

    // ═══════════════════════════════════════════════════════════════
  // SMART PACING v3
  // - Recognizes NEAR_FT state to avoid pacing matches that are ending soon
  // - Pacing ONLY triggers when budget genuinely cannot sustain desired interval
  // ═══════════════════════════════════════════════════════════════
  _determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap, totalDailyMatches) {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(24, 0, 0, 0); 
    const msUntilMidnight = Math.max(0, endOfDay - now);
    const hoursUntilMidnight = msUntilMidnight / 3600000;

    // ── 1. Calculate Safe Spendable Calls ──
    const reserveForDaily = LIVE_POLLING.RESERVE_FOR_DAILY_CRON;
    const spendableBudget = Math.max(0, (remaining ?? API.DAILY_BUDGET) - reserveForDaily);
    const capRemaining = Math.max(0, liveCap - liveUsed);
    const spendableCalls = Math.min(spendableBudget, capRemaining);

    // ── 2. Desired interval (live density tiers) ──
    let liveTier;
    let desired;

    if (isNearFinish && liveCount > 0) {
      liveTier = "NEAR_FT";
      desired = LIVE_POLLING.NEAR_FINISH_INTERVAL_MS;       // 2 min
    } else if (liveCount === 0) {
      liveTier = "IDLE";
      desired = LIVE_POLLING.IDLE_INTERVAL_MS;              // 30 min
    } else if (liveCount <= 5) {
      liveTier = "LIVE_LOW";
      desired = LIVE_POLLING.LOW_LIVE_INTERVAL_MS;          // 15 min
    } else if (liveCount <= 15) {
      liveTier = "LIVE_MED";
      desired = LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;       // 10 min
    } else if (liveCount <= 40) {
      liveTier = "LIVE_HIGH";
      desired = LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;         // 5 min
    } else {
      liveTier = "LIVE_MASS";
      desired = LIVE_POLLING.MASSIVE_LIVE_INTERVAL_MS;      // 3 min
    }

    // ── 3. Estimate remaining LIVE window (NOT full day) ──
    let expectedLiveHours;
    if (liveCount === 0) {
      expectedLiveHours = 0;
    } else if (isNearFinish) {
      // Matches are ending! Only estimate 30 minutes of action left.
      expectedLiveHours = 0.5; 
    } else {
      // Active live action — window scales with density.
      if (liveCount <= 5)        expectedLiveHours = 2;
      else if (liveCount <= 15)  expectedLiveHours = 3;
      else if (liveCount <= 40)  expectedLiveHours = 4;
      else                       expectedLiveHours = 5;
    }
    
    // Hard cap by time until midnight (API reset)
    expectedLiveHours = Math.min(expectedLiveHours, hoursUntilMidnight);
    if (expectedLiveHours <= 0) expectedLiveHours = 0.5; // prevent divide by zero
    
    const expectedLiveMs = expectedLiveHours * 3600000;

    // ── 4. Smart Pacing ──
    // Pacing ONLY if expected polls at `desired` would burn more than we have.
    let pacingFloor = 0;
    let isPacing = false;

    if (spendableCalls <= 0) {
      pacingFloor = LIVE_POLLING.IDLE_INTERVAL_MS; // budget locked
    } else if (liveCount > 0) {
      const expectedPollsAtDesired = expectedLiveMs / desired;
      if (spendableCalls < expectedPollsAtDesired) {
        // Genuine scarcity — spread calls across expected live window
        pacingFloor = expectedLiveMs / spendableCalls;
        // Hard floor: never pace slower than MIN_POLLS_PER_LIVE_HOUR
        const maxAllowedFloor = 3600000 / LIVE_POLLING.MIN_POLLS_PER_LIVE_HOUR; // 15 min
        pacingFloor = Math.min(pacingFloor, maxAllowedFloor);
        if (pacingFloor > desired) isPacing = true;
      }
      // else: budget is sufficient — use `desired` directly (no pacing!)
    }

    // ── 5. Budget tier label ──
    let budgetTier = "HEALTHY";
    if (remaining <= 0)                                budgetTier = "EXHAUSTED";
    else if (spendableBudget <= 0)                     budgetTier = "RESERVE_LOCKED";
    else if (remaining <= LIVE_POLLING.BUDGET_CRITICAL_THRESHOLD) budgetTier = "CRITICAL";
    else if (remaining <= LIVE_POLLING.BUDGET_NORMAL_THRESHOLD)   budgetTier = "NORMAL";

    // ── 6. Final interval ──
    let interval;
    if (spendableCalls <= 0 && liveCount > 0) {
      interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    } else {
      interval = Math.max(desired, pacingFloor);
    }
    if (liveCount === 0) interval = LIVE_POLLING.IDLE_INTERVAL_MS;
    
    // Never exceed idle (prevents absurd 1h+ waits caused by leftover bugs)
    interval = Math.min(interval, LIVE_POLLING.IDLE_INTERVAL_MS);

    // ── 7. Mode label ──
    let mode = liveTier;
    if (spendableCalls <= 0)               mode = "BUDGET_LOCKED";
    else if (isPacing)                     mode = `PACING+${liveTier}`;
    else if (budgetTier === "CRITICAL")    mode = `BUDGET_CRIT+${liveTier}`;
    else if (budgetTier === "NORMAL")      mode = `BUDGET_NORMAL+${liveTier}`;

    return { 
      mode, 
      interval, 
      liveTier, 
      budgetTier, 
      isPacing, 
      spendableCalls,
      hoursUntilMidnight: hoursUntilMidnight.toFixed(1),
      expectedLiveHours:  expectedLiveHours.toFixed(1),
      totalDailyMatches 
    };
  }

  
  async _pollingLoop(serviceName, service, getBudget, getLiveCount, liveCap, controller) {
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
        
        // Fetch total daily matches from the daily sync status to understand daily density
        const dailyStatusName = sport === "football" ? "footballDailyFixtures" : "basketballDailyFixtures";
        const totalDailyMatches = this.syncStatus[dailyStatusName]?.lastResult?.total || 0;

        const state = this._determinePollingState(
          remaining,
          liveCount,
          isNearFinish,
          liveUsed,
          liveCap,
          totalDailyMatches
        );

        const intervalMin = (state.interval / 60000).toFixed(1);
        const logRemaining = remaining !== null ? remaining : API.DAILY_BUDGET;
        
        logger.info(
          `[Scheduler] ${sport.toUpperCase()} [${state.mode}] Next poll in ${intervalMin}m ` +
            `[Live: ${liveUsed}/${liveCap} cap, API: ${logRemaining}/${API.DAILY_BUDGET}, ` +
            `LiveMatches: ${liveCount}, NearFT: ${isNearFinish ? "Y" : "N"}, ` +
            `Spendable: ${state.spendableCalls}, TimeLeft: ${state.hoursUntilMidnight}h, ` +
            `LiveWindow: ${state.expectedLiveHours}h, TotalToday: ${state.totalDailyMatches}]`
        );

        await this._sleep(state.interval);
        if (controller.stop) break;

        const nowRemaining = getBudget();
        const nowLiveUsed = getLiveCount();

        if (nowRemaining !== null && nowRemaining <= 0) {
          logger.warn(
            `[Scheduler] ${sport.toUpperCase()} paused — budget 0/${API.DAILY_BUDGET}`
          );
          continue;
        }

        if (nowRemaining !== null && nowRemaining < LIVE_POLLING.MIN_BUDGET_TO_POLL) {
          logger.warn(
            `[Scheduler] ${sport.toUpperCase()} skipped — budget below MIN_BUDGET_TO_POLL`
          );
          continue;
        }

        const prevHadLive = liveCount > 0;
        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        const actuallyPolled = result && result.polled !== false;

        if (actuallyPolled) {
          liveCount = result.liveCount ?? result.total ?? 0;
          isNearFinish = (result.nearFT ?? 0) > 0 || result.isNearFinish === true;
        }

        const recoveredFT = result?.recoveredFT || 0;
        const capReached = result?.capReached === true;

        const logNowRemaining = nowRemaining !== null ? nowRemaining : API.DAILY_BUDGET;

        logger.info(
          `[Scheduler] ${sport.toUpperCase()} sync done. ` +
            `Live: ${liveCount} match(es). NearFT: ${isNearFinish ? "Yes" : "No"}. ` +
            `FT→: ${recoveredFT}. Cap: ${nowLiveUsed}/${liveCap}${capReached ? " (REACHED)" : ""}. ` +
            `Budget: ${logNowRemaining}/${API.DAILY_BUDGET}`
        );

        if (
          prevHadLive &&
          liveCount === 0 &&
          actuallyPolled &&
          FT_RECOVERY.ENABLED &&
          logNowRemaining > FT_RECOVERY.MIN_BUDGET_TO_FETCH
        ) {
          logger.info(
            `[Scheduler] ${sport.toUpperCase()} live session ended. ` +
              `Triggering immediate FT confirmation in ${LIVE_POLLING.FT_CONFIRMATION_DELAY_MS / 1000}s...`
          );
          await this._sleep(LIVE_POLLING.FT_CONFIRMATION_DELAY_MS);
          if (controller.stop) break;

          // ★ NEW: Trigger Daily Fixtures immediately to check & update all matches (even yesterday's) to FT
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
            // Fallback to live service if daily service is somehow missing
            logger.info(`[Scheduler] ${sport.toUpperCase()} executing immediate FT confirmation poll...`);
            await this._executeJob(serviceName, service);
          }
        }
      } catch (err) {
        consecutiveErrors++;
        this._updateStatus(serviceName, "error", null, err);

        logger.error(
          `[Scheduler] ${sport.toUpperCase()} error ` +
            `(${consecutiveErrors}/${LIVE_POLLING.MAX_CONSECUTIVE_ERRORS}): ${err.message}`
        );

        if (consecutiveErrors >= LIVE_POLLING.MAX_CONSECUTIVE_ERRORS) {
          logger.error(
            `[Scheduler] ${sport.toUpperCase()} polling stopped — max errors reached`
          );
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
    logger.info("[Scheduler] ═══ Adaptive Schedule v2 ═══");
    logger.info("  Live-Count Tiers (desired intervals):");
    logger.info(`    0 live       → 30 min  (IDLE)`);
    logger.info(`    1–5 live     → 15 min  (LIVE_LOW)`);
    logger.info(`    6–15 live    → 10 min  (LIVE_MED)`);
    logger.info(`    16–40 live   →  5 min  (LIVE_HIGH)`);
    logger.info(`    41+ live     →  3 min  (LIVE_MASS)`);
    logger.info(`    80'+ / ET    →  2 min  (NEAR_FT)`);
    logger.info("  Pacing triggers ONLY when expected live-window polls > spendable calls.");
    logger.info(`  Hard pacing floor: 15 min (MIN_POLLS_PER_LIVE_HOUR=${LIVE_POLLING.MIN_POLLS_PER_LIVE_HOUR})`);
    logger.info(`  Football Live Cap:   ${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Basketball Live Cap: ${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Daily API Budget:    ${API.DAILY_BUDGET}`);
    logger.info(`  Reserve for Daily:   ${LIVE_POLLING.RESERVE_FOR_DAILY_CRON} calls`);
    logger.info("[Scheduler] ═════════════════════════════════════");
  }
}

module.exports = Scheduler;