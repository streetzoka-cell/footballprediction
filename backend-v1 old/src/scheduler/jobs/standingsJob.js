// footballprediction/backend-v1/src/scheduler/jobs/standingsJob.js

const standingsService = require('../../services/StandingsService');

async function execute() {
  const { ok, fail } = await standingsService.syncStandings();
  return { ok, fail };
}

module.exports = { execute };
