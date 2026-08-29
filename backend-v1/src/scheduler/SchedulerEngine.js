// backend-v1/src/scheduler/SchedulerEngine.js
const cron = require('node-cron');
const logger = require('../utils/logger');
const metrics = require('./metrics/JobMetrics');

class SchedulerEngine {
  constructor() {
    this.jobs = [];
    this.livePollTimer = null;
    this.runningJobs = new Set();
    this.backgroundTasks = []; // intervals owned by the engine
    this.stopping = false;     // ★ NEW: blocks new job starts after stopAll()
  }

  schedule(name, cronExpression, taskFn) {
    if (!cronExpression || typeof cronExpression !== 'string') {
      logger.info(`[SchedulerEngine] Skipping '${name}'. Cron schedule is disabled.`);
      return;
    }

    logger.info(`[SchedulerEngine] Registering '${name}' with pattern '${cronExpression}'`);

    const job = cron.schedule(
      cronExpression,
      async () => { await this._runJob(name, taskFn); },
      { timezone: 'UTC' }
    );

    this.jobs.push({ name, job });
  }

  /*
   * Background intervals registered through the engine so stopAll()
   * clears them. ★ Routed through _runJob: same-name overlap guard
   * (no overlapping executions if a run outlasts its interval) and
   * metrics recording, identical to cron jobs.
   */
  addBackgroundTask(name, intervalMs, taskFn) {
    const timer = setInterval(async () => {
      try {
        await this._runJob(name, taskFn); // never throws — catches internally
      } catch (err) {
        logger.error(`[SchedulerEngine] ${name} failed: ${err.message}`);
      }
    }, intervalMs);

    timer.unref?.(); // never keep the process alive just for this
    this.backgroundTasks.push({ name, timer });
    logger.info(
      `[SchedulerEngine] Background task '${name}' registered (every ${Math.round(intervalMs / 1000)}s)`
    );
  }

  async runManually(name, taskFn) {
    return this._runJob(name, taskFn);
  }

  async _runJob(name, taskFn) {
    if (this.stopping) {
      return { skipped: true, reason: 'STOPPING' };
    }

    if (this.runningJobs.has(name)) {
      logger.warn(`[SchedulerEngine] Skipping ${name}. Already running.`);
      return { skipped: true, reason: 'RUNNING' };
    }

    this.runningJobs.add(name);
    const start = Date.now();

    try {
      logger.info(`[SchedulerEngine] → Running: ${name}`);
      const result = await taskFn();
      const duration = Date.now() - start;

      metrics.record(name, true, duration);
      logger.info(`[SchedulerEngine] ✓ ${name} completed in ${duration}ms`);

      return result;
    } catch (err) {
      const duration = Date.now() - start;
      metrics.record(name, false, duration);
      logger.error(`[SchedulerEngine] ✗ ${name} failed after ${duration}ms: ${err.message}`);
      logger.error(`[SchedulerEngine] Stack: ${err.stack}`);
      return { error: err.message };
    } finally {
      this.runningJobs.delete(name);
    }
  }

  startLivePolling(pollFn) {
    const poll = async () => {
      if (this.stopping) return; // ★ do not start a poll after stopAll()

      try {
        const nextInterval = await pollFn();

        // ★ BUG FIX: an in-flight poll resolving DURING shutdown used to
        //   re-arm the timer here — resurrecting the loop after stopAll()
        //   cleared it, so liveJob kept firing mid-flush.
        if (this.stopping) return;

        this.livePollTimer = setTimeout(poll, nextInterval || 30000);
      } catch (err) {
        if (this.stopping) return;
        logger.error(`[SchedulerEngine] Live polling error: ${err.message}`);
        this.livePollTimer = setTimeout(poll, 60000);
      }
    };
    poll();
  }

  /*
   * Waits for in-flight jobs to finish (bounded), so shutdown can flush
   * WAL/queue without a job writing concurrently. Optional — call with
   * await in bootstrap shutdown if you want fully quiesced stops.
   */
  async drain(timeoutMs = 30000) {
    const start = Date.now();
    while (this.runningJobs.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (this.runningJobs.size > 0) {
      logger.warn(`[SchedulerEngine] Drain timeout — still running: ${[...this.runningJobs].join(', ')}`);
    }
  }

  stopAll() {
    this.stopping = true; // ★ first: block new starts + poll re-arms

    this.jobs.forEach(({ job }) => job.stop());

    if (this.livePollTimer) clearTimeout(this.livePollTimer);

    this.backgroundTasks.forEach(({ name, timer }) => {
      clearInterval(timer);
      logger.info(`[SchedulerEngine] Stopped background task: ${name}`);
    });
    this.backgroundTasks = [];

    this.jobs = [];
    this.runningJobs.clear();
    logger.info('[SchedulerEngine] All schedulers stopped.');
  }

  getMetrics() {
    return metrics.getAll();
  }
}

module.exports = new SchedulerEngine();