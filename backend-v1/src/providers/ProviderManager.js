// backend-v1/src/providers/ProviderManager.js
const { getProvider } = require('./ProviderFactory');
const logger = require('../utils/logger');

const providers = {
  isports: getProvider('isports'),
  'api-football': getProvider('api-football'),
  'football-data': getProvider('football-data'),
  sportsdb: getProvider('sportsdb')
};

// ★ CONFIGURABLE PRIORITY MAP
const PRIORITY = {
  getLiveFixtures: ['isports', 'api-football'],
  getFixtures: ['isports', 'api-football', 'football-data'],
  getLeague: ['isports', 'sportsdb'],
  getStandings: ['football-data', 'api-football'],
  getTeams: ['football-data', 'api-football'],
  getTeam: ['football-data', 'api-football'],
};

async function tryChain(method, params = []) {
  let lastErr;
  let lastResult = null; // ★ Track the last result (even if empty)
  const chain = PRIORITY[method] || [];

  for (const providerName of chain) {
    const provider = providers[providerName];
    if (!provider || typeof provider[method] !== 'function') continue;

    // ★ BUDGET CHECK: Skip provider if budget is exhausted
    if (typeof provider.isBudgetAvailable === 'function' && !provider.isBudgetAvailable()) {
      logger.info(`[ProviderManager] ${method}: ${providerName} skipped (budget exhausted). Trying next...`);
      continue;
    }

    try {
      const result = await provider[method](...params);
      
      // ★ If we got actual data, return it immediately!
      const hasData = result != null && (!Array.isArray(result) || result.length > 0);
      if (hasData) {
        return result;
      }
      
      // It's an empty array or null. Save it just in case all providers return empty,
      // but continue trying the next provider to see if it has data.
      lastResult = Array.isArray(result) ? result : null;
      logger.warn(`[ProviderManager] ${method}: ${providerName} returned empty → trying next`);
      continue;

    } catch (err) {
      if (err.message === 'Not implemented') continue; // Silently skip
      
      logger.warn(`[ProviderManager] ${method}: ${providerName} failed (${err.message}) → trying next`);
      lastErr = err;
    }
  }
  
  // ★ If we reach here, all providers either failed or returned empty.
  // If we got at least an empty array from someone, return that instead of crashing.
  if (lastResult !== null) {
    logger.info(`[ProviderManager] ${method}: All providers returned empty. Returning empty array.`);
    return lastResult;
  }
  
  // If we got absolutely nothing (all providers threw hard errors), throw the last error.
  throw lastErr || new Error(`${method}: All providers failed, returned empty, or were not implemented.`);
}

// ★ DYNAMIC METHOD EXPORTS
module.exports = Object.keys(PRIORITY).reduce((acc, method) => {
  acc[method] = (...args) => tryChain(method, args);
  return acc;
}, {});

// Expose health check for all providers
module.exports.getHealthStatus = async () => {
  const results = {};
  for (const [name, provider] of Object.entries(providers)) {
    try {
      results[name] = await provider.health();
    } catch (e) {
      results[name] = { provider: name, healthy: false, error: e.message };
    }
  }
  return results;
};