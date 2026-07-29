// backend-v1/src/scheduler/jobs/finishedFixturesJob.js
const fixtureService = require('../../services/FixtureService');

async function execute() {
  const count = await fixtureService.syncFinishedFixtures();
  return { count };
}

module.exports = { execute };