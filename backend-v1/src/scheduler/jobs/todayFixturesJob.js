const fixtureService = require('../../services/FixtureService');

async function execute() {
  const count = await fixtureService.syncTodayFixtures();

  return {
    count,
  };
}

module.exports = {
  execute,
};