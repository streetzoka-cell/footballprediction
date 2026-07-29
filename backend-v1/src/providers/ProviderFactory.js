const env = require('../config/env');
const ApiFootballAdapter = require('./ApiFootballAdapter');
const SportsDbAdapter = require('./SportsDbAdapter');
const FootballDataAdapter = require('./FootballDataAdapter'); // ★ NEW
const SportScoreAdapter = require('./SportScoreAdapter');

const providers = {
  'api-football': ApiFootballAdapter,
  'football-data': FootballDataAdapter, // ★ NEW
  'sportsdb': SportsDbAdapter,
  'sportscore': SportScoreAdapter,
};

function getProvider(name) {
  const providerName = name || env.DATA_PROVIDER;
  const provider = providers[providerName];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return provider;
}

module.exports = { getProvider };