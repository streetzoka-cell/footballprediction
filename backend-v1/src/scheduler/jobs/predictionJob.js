'use strict';

const {
  execFile
} = require('child_process');

const fs = require('fs');
const path = require('path');

const logger = require('../../utils/logger');

// ============================================================
// CONFIGURATION
// ============================================================

const ROOT = process.cwd();

const PIPELINE_SCRIPT = path.join(
  ROOT,
  'pipeline',
  '50-generate-daily-predictions.py'
);

// Windows virtual-environment Python.
// Fall back to "python" for environments where the venv path
// does not exist.
const WINDOWS_PYTHON = path.join(
  ROOT,
  '.venv',
  'Scripts',
  'python.exe'
);

const UNIX_PYTHON = path.join(
  ROOT,
  '.venv',
  'bin',
  'python'
);

const PYTHON_COMMAND =
  process.platform === 'win32'
    ? (
        fs.existsSync(WINDOWS_PYTHON)
          ? WINDOWS_PYTHON
          : 'python'
      )
    : (
        fs.existsSync(UNIX_PYTHON)
          ? UNIX_PYTHON
          : 'python3'
      );

// Retry after failure.
const RETRY_DELAY_MS =
  60 * 60 * 1000;

// Normal successful interval.
const SUCCESS_INTERVAL_MS =
  24 * 60 * 60 * 1000;

// Maximum stdout/stderr buffer.
const MAX_BUFFER =
  20 * 1024 * 1024;

// ============================================================
// JOB
// ============================================================

async function execute() {

  return new Promise((resolve) => {

    logger.info(
      '[PredictionJob] ========================================'
    );

    logger.info(
      '[PredictionJob] Starting Pipeline 50 daily prediction generation...'
    );

    logger.info(
      `[PredictionJob] Python: ${PYTHON_COMMAND}`
    );

    logger.info(
      `[PredictionJob] Script: ${PIPELINE_SCRIPT}`
    );

    // --------------------------------------------------------
    // PRE-FLIGHT
    // --------------------------------------------------------

    if (!fs.existsSync(PIPELINE_SCRIPT)) {

      logger.error(
        `[PredictionJob] Pipeline script not found: ${PIPELINE_SCRIPT}`
      );

      return resolve(RETRY_DELAY_MS);
    }

    if (
      process.platform === 'win32' &&
      fs.existsSync(WINDOWS_PYTHON)
    ) {
      logger.info(
        '[PredictionJob] Using project .venv Python interpreter.'
      );
    }

    // --------------------------------------------------------
    // EXECUTE PYTHON
    // --------------------------------------------------------

    execFile(
      PYTHON_COMMAND,
      [PIPELINE_SCRIPT],
      {
        cwd: ROOT,
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
      },
      (error, stdout, stderr) => {

        // ------------------------------------------------------
        // STDERR
        // ------------------------------------------------------

        if (stderr && stderr.trim()) {

          logger.warn(
            `[PredictionJob] Python stderr:\n${stderr.trim()}`
          );
        }

        // ------------------------------------------------------
        // PROCESS FAILURE
        // ------------------------------------------------------

        if (error) {

          logger.error(
            `[PredictionJob] Pipeline 50 failed: ${error.message}`
          );

          if (typeof error.code !== 'undefined') {
            logger.error(
              `[PredictionJob] Exit code: ${error.code}`
            );
          }

          if (stdout && stdout.trim()) {
            logger.error(
              `[PredictionJob] Python output before failure:\n${stdout.trim()}`
            );
          }

          logger.warn(
            '[PredictionJob] Retry scheduled in 1 hour.'
          );

          return resolve(RETRY_DELAY_MS);
        }

        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------

        if (stdout && stdout.trim()) {

          logger.info(
            `[PredictionJob] Pipeline 50 output:\n${stdout.trim()}`
          );
        }

        logger.info(
          '[PredictionJob] Pipeline 50 completed successfully.'
        );

        logger.info(
          '[PredictionJob] Next execution scheduled in 24 hours.'
        );

        logger.info(
          '[PredictionJob] ========================================'
        );

        return resolve(SUCCESS_INTERVAL_MS);
      }
    );
  });
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  execute,
};
