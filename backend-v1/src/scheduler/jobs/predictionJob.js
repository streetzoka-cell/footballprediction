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

// ★ NEW: Point to the Master Orchestrator instead of just Step 50
const PIPELINE_SCRIPT = path.join(
  ROOT,
  'pipeline',
  'run_daily_pipeline.js'
);

// Use the Node.js executable to run the orchestrator script
const NODE_COMMAND = process.execPath || 'node';

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
      '[PipelineJob] ========================================'
    );

    logger.info(
      '[PipelineJob] Starting ZOKASCORE V2 Master Pipeline...'
    );

    logger.info(
      `[PipelineJob] Node: ${NODE_COMMAND}`
    );

    logger.info(
      `[PipelineJob] Script: ${PIPELINE_SCRIPT}`
    );

    // --------------------------------------------------------
    // PRE-FLIGHT
    // --------------------------------------------------------

    if (!fs.existsSync(PIPELINE_SCRIPT)) {

      logger.error(
        `[PipelineJob] Orchestrator script not found: ${PIPELINE_SCRIPT}`
      );

      return resolve(RETRY_DELAY_MS);
    }

    // --------------------------------------------------------
    // EXECUTE NODE ORCHESTRATOR
    // --------------------------------------------------------

    execFile(
      NODE_COMMAND,
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
            `[PipelineJob] Orchestrator stderr:\n${stderr.trim()}`
          );
        }

        // ------------------------------------------------------
        // PROCESS FAILURE
        // ------------------------------------------------------

        if (error) {

          logger.error(
            `[PipelineJob] Master Pipeline failed: ${error.message}`
          );

          if (typeof error.code !== 'undefined') {
            logger.error(
              `[PipelineJob] Exit code: ${error.code}`
            );
          }

          if (stdout && stdout.trim()) {
            logger.error(
              `[PipelineJob] Orchestrator output before failure:\n${stdout.trim()}`
            );
          }

          logger.warn(
            '[PipelineJob] Retry scheduled in 1 hour.'
          );

          return resolve(RETRY_DELAY_MS);
        }

        // ------------------------------------------------------
        // SUCCESS
        // ------------------------------------------------------

        if (stdout && stdout.trim()) {

          logger.info(
            `[PipelineJob] Orchestrator output:\n${stdout.trim()}`
          );
        }

        logger.info(
          '[PipelineJob] Master Pipeline completed successfully.'
        );

        logger.info(
          '[PipelineJob] Next execution scheduled in 24 hours.'
        );

        logger.info(
          '[PipelineJob] ========================================'
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