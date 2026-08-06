const cron = require('node-cron');
const logger = require('../utils/logger');
const metrics = require('./metrics/JobMetrics');

class SchedulerEngine {
  constructor() {
    this.jobs = [];
    this.livePollTimer = null;
    this.runningJobs = new Set();
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

  async runManually(name, taskFn) {
    return this._runJob(name, taskFn);
  }

  async _runJob(name, taskFn) {
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
      try {
        const nextInterval = await pollFn();
        this.livePollTimer = setTimeout(poll, nextInterval || 30000);
      } catch (err) {
        logger.error(`[SchedulerEngine] Live polling error: ${err.message}`);
        // Retry with longer interval on error
        this.livePollTimer = setTimeout(poll, 60000);
      }
    };
    poll();
  }

  stopAll() {
    this.jobs.forEach(({ job }) => job.stop());
    if (this.livePollTimer) clearTimeout(this.livePollTimer);
    this.jobs = [];
    this.runningJobs.clear();
    logger.info('[SchedulerEngine] All schedulers stopped.');
  }

  getMetrics() {
    return metrics.getAll();
  }
}

module.exports = new SchedulerEngine();