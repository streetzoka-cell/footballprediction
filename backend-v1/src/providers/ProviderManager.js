// backend-v1/src/providers/ProviderManager.js

const { getProvider } = require('./ProviderFactory');
const logger = require('../utils/logger');
const circuitBreaker = require('../utils/circuitBreaker');
const internetMonitor = require('../services/InternetMonitor');

const providers = {
  isports: getProvider('isports'),
  'api-football': getProvider('api-football'),
  'football-data': getProvider('football-data'),
  sportsdb: getProvider('sportsdb'),
  sportscore: getProvider('sportscore'),
};

const METHOD_PRIORITY = {
  // Public high-priority frontend data
  getLiveFixtures: ['isports', 'api-football'],
  getFixtures: ['isports', 'api-football'],
  getStandings: ['football-data', 'api-football'],
  getTeams: ['football-data', 'api-football'],
  getTeam: ['api-football', 'sportsdb'],
  getLeague: ['isports', 'sportsdb'],

  // Secondary data
  getTopScorers: ['api-football', 'football-data'],
  getFixture: ['api-football', 'isports'],
  getPlayers: ['api-football'],
  getPlayer: ['api-football', 'sportsdb'],

  // Match details
  getLineups: ['api-football'],
  getStatistics: ['api-football'],
  getPredictions: ['api-football'],
  getOdds: ['api-football'],
  getHeadToHead: ['api-football'],

  // Search/media
  search: ['sportsdb'],
  getVideos: [],
};

const SAFE_EMPTY = {
  getLiveFixtures: [],
  getFixtures: [],
  getStandings: null,
  getTeams: [],
  getTeam: null,
  getLeague: null,
  getTopScorers: [],
  getFixture: null,
  getPlayers: [],
  getPlayer: null,
  getLineups: null,
  getStatistics: null,
  getPredictions: null,
  getOdds: null,
  getHeadToHead: [],
  search: [],
  getVideos: () => ({ data: [], count: 0, source: 'none' }),
};

const CRITICAL_METHODS = new Set([
  'getLiveFixtures',
  'getFixtures',
  'getStandings',
  'getTeams',
]);

let lastActiveProvider = 'isports';

function safeEmptyFor(method) {
  const value = SAFE_EMPTY[method];
  return typeof value === 'function' ? value() : value;
}

function hasUsefulData(result) {
  if (result === null || result === undefined) return false;
  if (Array.isArray(result)) return result.length > 0;
  if (typeof result === 'object') return Object.keys(result).length > 0;
  return Boolean(result);
}

async function tryChain(method, params = []) {
  if (!internetMonitor.isOnline) {
    if (CRITICAL_METHODS.has(method)) {
      throw new Error('Internet is offline. Skipping API calls.');
    }

    return safeEmptyFor(method);
  }

  const chain = METHOD_PRIORITY[method] || [];

  if (!chain.length) {
    return safeEmptyFor(method);
  }

  let lastErr = null;
  let lastResult = null;

  for (const providerName of chain) {
    const provider = providers[providerName];

    if (!provider || typeof provider[method] !== 'function') {
      continue;
    }

    if (await circuitBreaker.isDisabled(providerName)) {
      logger.info(
        `[ProviderManager] ${method}: ${providerName} skipped (Circuit Open).`
      );
      continue;
    }

    try {
      const result = await provider[method](...params);

      if (hasUsefulData(result)) {
        lastActiveProvider = providerName;
        return result;
      }

      if (Array.isArray(result)) {
        lastResult = result;
      }

      continue;
    } catch (err) {
      if (err.message === 'Not implemented') {
        continue;
      }

      await circuitBreaker.trip(providerName, err.message);

      logger.warn(
        `[ProviderManager] ${method}: ${providerName} failed (${err.message}) → trying next`
      );

      lastErr = err;
    }
  }

  if (lastResult !== null) {
    return lastResult;
  }

  if (lastErr && CRITICAL_METHODS.has(method)) {
    throw lastErr;
  }

  return safeEmptyFor(method);
}

const exportedMethods = {};

for (const method of Object.keys(METHOD_PRIORITY)) {
  exportedMethods[method] = (...args) => tryChain(method, args);
}

async function getHealthStatus() {
  const results = {};

  for (const [name, provider] of Object.entries(providers)) {
    try {
      const health =
        typeof provider.health === 'function'
          ? await provider.health()
          : { provider: name, healthy: false };

      results[name] = {
        ...health,
        provider: name,
        circuitOpen: await circuitBreaker.isDisabled(name),
      };
    } catch (err) {
      results[name] = {
        provider: name,
        healthy: false,
        error: err.message,
        circuitOpen: await circuitBreaker.isDisabled(name),
      };
    }
  }

  return results;
}

async function getHealthSummary() {
  const providerHealth = await getHealthStatus();

  let budgetRemaining = 0;

  for (const name of ['api-football', 'isports']) {
    const provider = providers[name];

    if (provider && typeof provider.getRemaining === 'function') {
      try {
        budgetRemaining += Number(provider.getRemaining()) || 0;
      } catch {
        // Ignore provider budget errors
      }
    }
  }

  return {
    status: internetMonitor.isOnline ? 'healthy' : 'offline',
    internet: internetMonitor.isOnline,
    activeProvider: getActiveProviderName(),
    budgetRemaining,
    providers: providerHealth,
    timestamp: new Date().toISOString(),
  };
}

function getActiveProviderName() {
  return lastActiveProvider;
}

module.exports = {
  ...exportedMethods,
  providers,
  getHealthStatus,
  getHealthSummary,
  getActiveProviderName,
};