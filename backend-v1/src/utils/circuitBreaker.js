// backend-v1/src/utils/circuitBreaker.js
const logger = require('./logger');

const breakers = {};

async function isDisabled(name) {
  const b = breakers[name];
  if (!b) return false;
  if (b.tripped && Date.now() > b.resetTime) {
    logger.info(`[CircuitBreaker] ${name} attempting reset.`);
    delete breakers[name];
    return false;
  }
  return !!b?.tripped;
}

async function trip(name, reason = 'unknown') {
  if (!breakers[name]) breakers[name] = { failures: 0, tripped: false, resetTime: 0 };
  
  breakers[name].failures++;
  
  // Only trip if it fails 3 times, and only disable for 5 minutes
  if (breakers[name].failures >= 3 && !breakers[name].tripped) {
    breakers[name].tripped = true;
    breakers[name].resetTime = Date.now() + (5 * 60 * 1000); // 5 minutes
    logger.warn(`[CircuitBreaker] Tripped: ${name} (Reason: ${reason}). Disabled for 5 mins.`);
  }
}

module.exports = { isDisabled, trip };