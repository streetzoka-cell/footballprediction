const logger = require('../../utils/logger');

const metrics = {};

function record(jobName, success, durationMs) {
  if (!metrics[jobName]) {
    metrics[jobName] = { runs: 0, successes: 0, failures: 0, avgDurationMs: 0, lastRun: null };
  }
  
  const m = metrics[jobName];
  m.runs++;
  if (success) m.successes++; else m.failures++;
  m.avgDurationMs = ((m.avgDurationMs * (m.runs - 1)) + durationMs) / m.runs;
  m.lastRun = new Date().toISOString();
}

function getAll() {
  return metrics;
}

module.exports = { record, getAll };