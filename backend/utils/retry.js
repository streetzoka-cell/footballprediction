const env = require('../config/env');
const logger = require('./logger');

/**
 * Retries a given async function with exponential backoff.
 * 
 * @param {Function} fn - The async function to execute
 * @param {string} name - The name of the operation (for logging)
 * @param {number} maxAttempts - Max retry attempts (default: 3)
 * @param {number} baseDelayMs - Base delay in ms (default: 2000)
 */
async function withRetry(fn, name, maxAttempts = 3, baseDelayMs = 2000) {
  let attempt = 1;
  
  while (attempt <= maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = attempt === maxAttempts;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      
      if (err.code === 'BUDGET_EXHAUSTED' || err.message.includes('budget')) {
        throw err; // Don't retry if we're out of API budget
      }
      
      if (err.response?.status === 403 || err.response?.status === 404) {
        throw err; // Don't retry forbidden or not found
      }

      if (isLastAttempt) {
        logger.error(`[Retry] ✗ ${name} failed after ${maxAttempts} attempts: ${err.message}`);
        throw err;
      }

      logger.warn(`[Retry] ⏳ ${name} attempt ${attempt} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
}

module.exports = { withRetry };