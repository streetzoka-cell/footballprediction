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
  // SMART STATE MACHINE (Priority-Based)
  // 
  // 1. Live Tier (Desired Interval based on match state)
  // 2. Hard Limits (Budget & Cap Floors)
  // 3. Day-Pacing (Spread calls across a 3-hour active window)
  //
  // Final interval = shortest interval that doesn't violate a hard limit
  // ═══════════════════════════════════════════════════════════════
  _determinePollingState(remaining, liveCount, isNearFinish, liveUsed, liveCap) {
    // ── 1. Desired interval from live match count ──
    let liveTier;
    let desired;

    if (isNearFinish && liveCount > 0) {
      liveTier = "NEAR_FT";
      desired = LIVE_POLLING.NEAR_FINISH_INTERVAL_MS;       // 2.5 min
    } else if (liveCount === 0) {
      liveTier = "IDLE";
      desired = LIVE_POLLING.IDLE_INTERVAL_MS;              // 60 min
    } else if (liveCount <= 5) {
      liveTier = "LIVE_LOW";
      desired = LIVE_POLLING.LOW_LIVE_INTERVAL_MS;          // 15 min
    } else if (liveCount <= 15) {
      liveTier = "LIVE_MED";
      desired = LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;       // 10 min
    } else {
      liveTier = "LIVE_HIGH";
      desired = LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;         // 5 min
    }

    // ── 2. Hard limit floors (Budget & Cap) ──
    let budgetTier = "HEALTHY";
    let budgetFloor = 0;

    if (remaining !== null) {
      if (remaining <= 0) {
        budgetTier = "EXHAUSTED";
        budgetFloor = Infinity; 
      } else if (remaining <= LIVE_POLLING.BUDGET_CRITICAL_THRESHOLD) {
        budgetTier = "RESERVE";       
        budgetFloor = LIVE_POLLING.BUDGET_RESERVE_FLOOR_MS;
      } else if (remaining <= LIVE_POLLING.BUDGET_NORMAL_THRESHOLD) {
        budgetTier = "CRITICAL";      
        budgetFloor = LIVE_POLLING.BUDGET_CRITICAL_FLOOR_MS;
      } else if (remaining <= LIVE_POLLING.BUDGET_HEALTHY_THRESHOLD) {
        budgetTier = "NORMAL";        
        budgetFloor = LIVE_POLLING.BUDGET_NORMAL_FLOOR_MS;
      }
    }

    const capRemaining = liveCap - liveUsed;
    let capTier = "OK";
    let capFloor = 0;

    if (capRemaining <= 0) {
      capTier = "EXHAUSTED";
      capFloor = LIVE_POLLING.CAP_EXHAUSTED_INTERVAL_MS;  // 1 hour
    } else if (capRemaining <= LIVE_POLLING.CAP_CRITICAL_REMAINING) {
      capTier = "CRITICAL";   
      capFloor = LIVE_POLLING.CAP_CRITICAL_FLOOR_MS;
    } else if (capRemaining <= LIVE_POLLING.CAP_NORMAL_REMAINING) {
      capTier = "LOW";        
      capFloor = LIVE_POLLING.CAP_LOW_FLOOR_MS;
    }

    // ── 3. Pacing floor ──
    // Spread remaining cap calls across a rolling 3-hour active window.
    // Matches rarely last longer than 2-3 hours, so we don't need to save 
    // calls for 12 hours from now—only for the current live block.
    let pacingFloor = 0;
    let isPacing = false;

    if (capRemaining > LIVE_POLLING.CAP_FT_RESERVE && budgetTier !== "EXHAUSTED") {
      const activeWindowHours = 3; 
      const effectiveCap = capRemaining - LIVE_POLLING.CAP_FT_RESERVE;

      // Calculate the minimum interval required to avoid depletion during the 3h window
      pacingFloor = (activeWindowHours * 3600000) / effectiveCap;

      if (pacingFloor > desired) {
        isPacing = true;
      }
    }

    // ── 4. Final interval = Math.max(desired, hardLimits) ──
    let interval;
    if (budgetTier === "EXHAUSTED") {
      interval = LIVE_POLLING.BUDGET_RESERVE_FLOOR_MS; 
    } else {
      interval = Math.max(desired, budgetFloor, capFloor, pacingFloor);
    }

    // ── 5. Human-readable mode label ──
    let mode = liveTier;

    if (budgetTier === "EXHAUSTED") {
      mode = "BUDGET_EXHAUSTED";
    } else if (capTier === "EXHAUSTED") {
      mode = `CAP_DONE+${liveTier}`;
    } else if (budgetTier === "RESERVE") {
      mode = `BUDGET_RESERVE+${liveTier}`;
    } else if (capTier === "CRITICAL") {
      mode = `CAP_CRIT+${liveTier}`;
    } else if (isPacing) {
      mode = `PACING+${liveTier}`;
    } else if (budgetTier === "CRITICAL") {
      mode = `BUDGET_CRIT+${liveTier}`;
    } else if (capTier === "LOW") {
      mode = `CAP_LOW+${liveTier}`;
    } else if (budgetTier === "NORMAL") {
      mode = `BUDGET_NORMAL+${liveTier}`;
    }

    return { mode, interval, liveTier, budgetTier, capTier, isPacing };
  }

  async _pollingLoop(serviceName, service, getBudget, getLiveCount, liveCap, controller) {
    const sport = serviceName.includes("basketball") ? "basketball" : "football";
    let consecutiveErrors = 0;
    let liveCount = 0;
    let isNearFinish = false;

    // ★ SEED FROM INITIAL SYNC
    // If runInitialSync already fetched live matches, use its result so 
    // we don't start at 0 and incorrectly wait 60 minutes for the next poll.
    const initialResult = this.syncStatus[serviceName]?.lastResult;
    if (initialResult && initialResult.polled !== false) {
      // Use liveCount/nearFT if available, fallback to total/isNearFinish
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
        const state = this._determinePollingState(
          remaining,
          liveCount,
          isNearFinish,
          liveUsed,
          liveCap
        );

        const intervalMin = (state.interval / 60000).toFixed(1);
        logger.info(
          `[Scheduler] ${sport.toUpperCase()} [${state.mode}] Next poll in ${intervalMin}m ` +
            `[Live: ${liveUsed}/${liveCap} cap, API: ${remaining ?? "???"}/${API.DAILY_BUDGET}, ` +
            `LiveMatches: ${liveCount}, NearFT: ${isNearFinish ? "Y" : "N"}]`
        );

        await this._sleep(state.interval);
        if (controller.stop) break;

        // ── Re-check guards after sleeping ──
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

        // ── Execute poll ──
        const prevHadLive = liveCount > 0;
        const result = await service.run();
        consecutiveErrors = 0;
        this._updateStatus(serviceName, "success", result);

        // Only update live state if the service actually polled the API.
        // When capReached=true or budget was too low, the service returns
        // an empty result without making an API call. In that case we
        // preserve the last known liveCount/isNearFinish.
        const actuallyPolled = result && result.polled !== false;

        if (actuallyPolled) {
          // ★ Read directly from the verified normalized data returned by service
          liveCount = result.liveCount ?? result.total ?? 0;
          isNearFinish = (result.nearFT ?? 0) > 0 || result.isNearFinish === true;
        }

        const recoveredFT = result?.recoveredFT || 0;
        const capReached = result?.capReached === true;

        logger.info(
          `[Scheduler] ${sport.toUpperCase()} sync done. ` +
            `Live: ${liveCount} match(es). NearFT: ${isNearFinish ? "Yes" : "No"}. ` +
            `FT→: ${recoveredFT}. Cap: ${nowLiveUsed}/${liveCap}${capReached ? " (REACHED)" : ""}. ` +
            `Budget: ${nowRemaining ?? "???"}/${API.DAILY_BUDGET}`
        );

        // ── SMART FT RECOVERY TRIGGER ──
        // If we HAD live games but now we DON'T, it means games just finished.
        // Wait 60s and poll again IMMEDIATELY to catch the final score
        // instead of waiting for the next regular cycle.
        if (
          prevHadLive &&
          liveCount === 0 &&
          actuallyPolled &&
          FT_RECOVERY.ENABLED &&
          nowRemaining > FT_RECOVERY.MIN_BUDGET_TO_FETCH
        ) {
          logger.info(
            `[Scheduler] ${sport.toUpperCase()} live session ended. ` +
              `Triggering immediate FT confirmation in ${LIVE_POLLING.FT_CONFIRMATION_DELAY_MS / 1000}s...`
          );
          await this._sleep(LIVE_POLLING.FT_CONFIRMATION_DELAY_MS);
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
    logger.info("[Scheduler] ═══ Adaptive Schedule Configuration ═══");
    logger.info("  Live-Count Tiers (desired intervals):");
    logger.info(`    0 live      → 60 min   (IDLE)`);
    logger.info(`    1–5 live    → 15 min   (LIVE_LOW)`);
    logger.info(`    6–15 live   → 10 min   (LIVE_MED)`);
    logger.info(`    16+ live    →  5 min   (LIVE_HIGH)`);
    logger.info(`    80'+ / ET   → 2.5 min  (NEAR_FT)`);
    logger.info("  Budget Tiers (slowdown floors):");
    logger.info(`    > 30 left   → HEALTHY  (no floor)`);
    logger.info(`    15–30 left  → NORMAL   (≥ 15 min floor)`);
    logger.info(`    8–15 left   → CRITICAL (≥ 30 min floor)`);
    logger.info(`    < 8 left    → RESERVE  (≥ 1 h floor)`);
    logger.info("  Cap Tiers (live-polling-cap floors):");
    logger.info(`    > 15 left   → OK       (no floor)`);
    logger.info(`    6–15 left   → LOW      (≥ 15 min floor)`);
    logger.info(`    1–5 left    → CRITICAL (≥ 30 min floor)`);
    logger.info(`    0 left      → EXHAUSTED (1 h, 0 API cost)`);
    logger.info("  Day-Pacing: Spreads remaining cap across a 3-hour active window");
    logger.info(`  Football Live Cap:   ${LIVE_POLLING.FOOTBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Basketball Live Cap: ${LIVE_POLLING.BASKETBALL_DAILY_LIVE_CAP}/day`);
    logger.info(`  Daily API Budget:    ${API.DAILY_BUDGET}`);
    logger.info(`  FT Reserve:          ${LIVE_POLLING.CAP_FT_RESERVE} calls held for FT recovery`);
    logger.info("[Scheduler] ═════════════════════════════════════");
  }
}

module.exports = Scheduler;