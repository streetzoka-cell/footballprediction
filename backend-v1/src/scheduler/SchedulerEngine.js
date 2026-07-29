const cron = require('node-cron');
const logger = require('../utils/logger');
const metrics = require('./metrics/JobMetrics');

class SchedulerEngine {
  constructor() {
    this.jobs = [];
    this.livePollTimer = null;
    this.lastStatsPoll = 0;
    this.processedLineups = new Set();
  }

  // Schedule standard cron jobs
  schedule(name, cronExpression, taskFn) {
    logger.info(`[SchedulerEngine] Registering '${name}' with pattern '${cronExpression}'`);
    const job = cron.schedule(cronExpression, async () => {
      await this._runJob(name, taskFn);
    }, { timezone: 'UTC' });
    
    this.jobs.push({ name, job });
  }

  // Run a job manually (for admin triggers)
  async runManually(name, taskFn) {
    return this._runJob(name, taskFn);
  }

  async _runJob(name, taskFn) {
    const start = Date.now();
    try {
      logger.info(`[SchedulerEngine] → Running: ${name}`);
      const result = await taskFn();
      const dur = Date.now() - start;
      metrics.record(name, true, dur);
      logger.info(`[SchedulerEngine] ✓ ${name} completed in ${dur}ms`);
      return result;
    } catch (err) {
      const dur = Date.now() - start;
      metrics.record(name, false, dur);
      logger.error(`[SchedulerEngine] ✗ ${name} failed: ${err.message}`);
      throw err;
    }
  }

  // Special adaptive timer for live polling
  startLivePolling(pollFn, calculateIntervalFn) {
    const poll = async () => {
      try {
        const interval = await pollFn();
        this.livePollTimer = setTimeout(poll, interval || 30000);
      } catch (err) {
        logger.error(`[SchedulerEngine] Live polling error: ${err.message}`);
        this.livePollTimer = setTimeout(poll, 60000); // Fallback to 60s on error
      }
    };
    poll();
  }

  stopAll() {
    this.jobs.forEach(j => j.job.stop());
    if (this.livePollTimer) clearTimeout(this.livePollTimer);
    this.jobs = [];
    logger.info('[SchedulerEngine] All schedulers stopped.');
  }

  getMetrics() {
    return metrics.getAll();
  }
}

module.exports = new SchedulerEngine();