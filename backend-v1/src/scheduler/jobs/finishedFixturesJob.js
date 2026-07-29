const fixtureService = require('../../services/FixtureService');

async function execute() {
  const count = await fixtureService.syncYesterdayResults();
  return { count };
}

module.exports = { execute };