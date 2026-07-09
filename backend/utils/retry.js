/*
 * retry.js
 * Generic retry helper with exponential backoff.
 *
 * Production additions:
 *   - Never retries 429 (rate limit) — retrying burns MORE budget
 *   - Never retries BUDGET_EXHAUSTED — respect the stop signal
 *   - Never retries timeout after max attempts (firewall risk)
 */

const { RETRY } = require("../config/constants");
const logger = require("./logger");

class RetryError extends Error {
  constructor(message, { originalError, attempts } = {}) {
    super(message);
    this.name = "RetryError";
    this.originalError = originalError;
    this.attempts = attempts;
  }
}

/**
 * Execute fn with retry on transient failures.
 *
 * WILL retry: 500, 502, 503, 504, network errors, timeouts
 * WON'T retry: 400, 401, 403, 404, 422, 429, BUDGET_EXHAUSTED
 *
 * @param {Function} fn - Async function to execute
 * @param {string} label - Label for log messages
 * @param {Object} options - Override retry config
 * @returns {Promise<*>}
 */
async function withRetry(fn, label = "operation", options = {}) {
  const maxAttempts = options.maxAttempts ?? RETRY.MAX_ATTEMPTS;
  const baseDelay = options.baseDelay ?? RETRY.BASE_DELAY_MS;
  const maxDelay = options.maxDelay ?? RETRY.MAX_DELAY_MS;
  const useJitter = options.jitter ?? RETRY.JITTER;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const status = err.response?.status;
      const code = err.code;

      // ── Never retry these ──

      // Auth failures — retrying won't fix a bad key
      if (status === 401 || status === 403) {
        logger.error(`[${label}] Auth failed (${status}) — no retry`);
        throw err;
      }

      // Client errors — retrying won't fix bad input
      if (status === 400 || status === 404 || status === 422) {
        logger.error(`[${label}] Client error (${status}) — no retry`);
        throw err;
      }

      // Rate limited — RETRYING BURNS MORE BUDGET
      // The correct response to 429 is STOP, not retry
      if (status === 429) {
        logger.error(`[${label}] Rate limited (429) — no retry`);
        throw err;
      }

      // Budget exhausted — our custom stop signal
      if (code === "BUDGET_EXHAUSTED") {
        logger.error(`[${label}] Budget exhausted — no retry`);
        throw err;
      }

      // ── Check if we've exhausted attempts ──

      if (attempt >= maxAttempts) {
        logger.error(
          `[${label}] Failed after ${maxAttempts} attempts: ${err.message}`
        );
        throw new RetryError(err.message, {
          originalError: err,
          attempts: maxAttempts,
        });
      }

      // ── Retry with backoff ──

      const exponential = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay
      );

      const jitter = useJitter ? Math.random() * 1000 : 0;
      const delay = Math.round(exponential + jitter);

      logger.warn(
        `[${label}] Attempt ${attempt}/${maxAttempts} failed (${status ?? "network"}). Retrying in ${delay}ms...`
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  RetryError,
  withRetry,
};