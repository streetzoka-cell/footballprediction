const logger = require('./logger');

// Simple in-memory circuit breaker for provider endpoints
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
  if (!breakers[name] || !breakers[name].tripped) {
    logger.warn(`[CircuitBreaker] Tripped: ${name} (Reason: ${reason})`);
  }
  breakers[name] = {
    tripped: true,
    resetTime: Date.now() + (60 * 60 * 1000), // 1 hour timeout
  };
}

module.exports = { isDisabled, trip };