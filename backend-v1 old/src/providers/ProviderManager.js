// footballprediction/backend-v1/src/providers/ProviderManager.js
const { getProvider } = require('./ProviderFactory');
const logger = require('../utils/logger');
const circuitBreaker = require('../utils/circuitBreaker'); // â˜… YOUR EXISTING UTILITY
const internetMonitor = require('../services/InternetMonitor');

const providers = {
  isports: getProvider('isports'),
  'api-football': getProvider('api-football'),
  'football-data': getProvider('football-data'),
  sportsdb: getProvider('sportsdb')
};

const PRIORITY = {
  getLiveFixtures: ['isports', 'api-football'],
  getFixtures: ['isports', 'api-football'],
  getLeague: ['isports', 'sportsdb'],
  getStandings: ['football-data', 'api-football'],
  getTeams: ['football-data', 'api-football'],
  getTeam: ['api-football', 'sportsdb'],
};

async function tryChain(method, params = []) {
  // 1. Pause if internet is offline
  if (!internetMonitor.isOnline) {
    throw new Error('Internet is offline. Skipping API calls.');
  }

  let lastErr;
  let lastResult = null; 
  const chain = PRIORITY[method] || [];

  for (const providerName of chain) {
    const provider = providers[providerName];
    if (!provider || typeof provider[method] !== 'function') continue;

    // 2. Check your Circuit Breaker
    if (await circuitBreaker.isDisabled(providerName)) {
      logger.info(`[ProviderManager] ${method}: ${providerName} skipped (Circuit Open).`);
      continue;
    }

    try {
      const result = await provider[method](...params);
      
      const hasData = result != null && (!Array.isArray(result) || result.length > 0);
      if (hasData) return result;
      
      lastResult = Array.isArray(result) ? result : null;
      continue;
    } catch (err) {
      if (err.message === 'Not implemented') continue;
      
      // 3. Trip the breaker on failure
      await circuitBreaker.trip(providerName, err.message);
      logger.warn(`[ProviderManager] ${method}: ${providerName} failed (${err.message}) â†’ trying next`);
      lastErr = err;
    }
  }
  
  if (method.startsWith('get') && method !== 'getFixtures' && method !== 'getLiveFixtures' && method !== 'getTeams') {
    return null;
  }
  if (lastResult !== null) return lastResult;
  
  throw lastErr || new Error(`${method}: All providers failed, returned empty, or were not implemented.`);
}

module.exports = Object.keys(PRIORITY).reduce((acc, method) => {
  acc[method] = (...args) => tryChain(method, args);
  return acc;
}, {});

module.exports.getHealthStatus = async () => {
  const results = {};
  for (const [name, provider] of Object.entries(providers)) {
    try {
      results[name] = await provider.health();
      results[name].circuitOpen = await circuitBreaker.isDisabled(name);
    } catch (e) {
      results[name] = { provider: name, healthy: false, error: e.message };
    }
  }
  return results;
};

module.exports.providers = providers;
