const logger = require('./logger');

async function retry(fn, opts = {}) {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, label = 'retry' } = opts;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Never retry 400 (invalid token), 403 (no permission), 404 (not found)
      var status = err.response ? err.response.status : 0;
      if (status === 400 || status === 403 || status === 404) {
        throw err;
      }
      if (attempt <= maxRetries) {
        var jitter = Math.random() * 0.4 + 0.8;
        var delay = Math.min(baseDelay * Math.pow(2, attempt - 1) * jitter, maxDelay);
        logger.warn('[' + label + '] Attempt ' + attempt + '/' + (maxRetries + 1) + ' - retrying in ' + Math.round(delay) + 'ms');
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

module.exports = retry;
