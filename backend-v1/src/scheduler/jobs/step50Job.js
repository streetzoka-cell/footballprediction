// backend-v1/src/scheduler/jobs/step50Job.js
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const logger = require('../../utils/logger');
const internetMonitor = require('../../services/InternetMonitor');

const SCRIPT = path.join(process.cwd(), 'pipeline', '50-generate-daily-predictions.py');
const PYTHON = process.env.PYTHON || 'python';
const TIMEOUT_MS = 15 * 60 * 1000;
const MIN_GAP_MS = 10 * 60 * 1000;

let running = false;
let lastFinishedAt = 0;

function runStep50() {
  return new Promise((resolve) => {
    // PYTHONUTF8: same cp1252 fix as the daily pipeline job
    const child = spawn(PYTHON, [SCRIPT], {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let tail = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already dead */ }
      resolve({ ok: false, reason: 'timeout' });
    }, TIMEOUT_MS);

    child.stdout.on('data', (c) => { tail = (tail + c.toString()).slice(-4000); });
    child.stderr.on('data', (c) => { tail = (tail + c.toString()).slice(-4000); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, reason: err.message }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) logger.error(`[Step50] exit=${code}\n${tail}`);
      resolve({ ok: code === 0, tail });
    });
  });
}

async function execute() {
  if (running) return { skipped: true, reason: 'RUNNING' };
  if (!internetMonitor.isOnline) return { skipped: true, reason: 'OFFLINE' };
  if (Date.now() - lastFinishedAt < MIN_GAP_MS) return { skipped: true, reason: 'MIN_GAP' };

  running = true;
  try {
    const r = await runStep50();
    if (r.ok) logger.info('[Step50] Refresh OK (pick_groups + live preds updated).');
    return r;
  } finally {
    running = false;
    lastFinishedAt = Date.now();
  }
}

module.exports = { execute };