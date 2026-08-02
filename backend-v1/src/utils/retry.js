const logger = require('./logger');

async function withRetry(fn, name, maxRetries = 1, initialDelay = 1000) {
  let lastError;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (i < maxRetries) {
        const delay = initialDelay * Math.pow(2, i);
        logger.warn(
          `[Retry] ${name} failed (Attempt ${i + 1}/${maxRetries + 1}). Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

module.exports = { withRetry };