/*
 * retry.js
 * Generic retry helper with exponential backoff.
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

      if (status === 401 || status === 403) {
        logger.error(`[${label}] Auth failed (${status}) — no retry`);
        throw err;
      }
      if (status === 400 || status === 404 || status === 422) {
        logger.error(`[${label}] Client error (${status}) — no retry`);
        throw err;
      }
      if (status === 429) {
        logger.error(`[${label}] Rate limited (429) — no retry`);
        throw err;
      }
      if (code === "BUDGET_EXHAUSTED") {
        logger.error(`[${label}] Budget exhausted — no retry`);
        throw err;
      }

      if (attempt >= maxAttempts) {
        logger.error(`[${label}] Failed after ${maxAttempts} attempts: ${err.message}`);
        throw new RetryError(err.message, { originalError: err, attempts: maxAttempts });
      }

      const exponential = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = useJitter ? Math.random() * 1000 : 0;
      const delay = Math.round(exponential + jitter);

      logger.warn(`[${label}] Attempt ${attempt}/${maxAttempts} failed (${status ?? "network"}). Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { RetryError, withRetry };