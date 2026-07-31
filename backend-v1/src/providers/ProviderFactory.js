const env = require('../config/env');
const ApiFootballAdapter   = require('./ApiFootballAdapter');
const SportsDbAdapter      = require('./SportsDbAdapter');
const FootballDataAdapter  = require('./FootballDataAdapter');
const SportScoreAdapter    = require('./SportScoreAdapter');
const IsportsAdapter       = require('./IsportsAdapter'); // ★ NEW

const providers = {
  'api-football':   ApiFootballAdapter,
  'football-data':  FootballDataAdapter,
  'sportsdb':       SportsDbAdapter,
  'sportscore':     SportScoreAdapter,
  'isports':        IsportsAdapter, // ★ NEW
};

function getProvider(name) {
  const providerName = name || env.DATA_PROVIDER;
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}`);
  return provider;
}

module.exports = { getProvider };