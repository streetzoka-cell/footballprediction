const fixtureService = require('../../services/FixtureService');

async function execute() {
  const count = await fixtureService.syncTomorrowFixtures();

  return {
    count,
  };
}

module.exports = {
  execute,
};