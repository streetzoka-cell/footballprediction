// backend-v1/src/scheduler/jobs/fixturesJob.js

const fixtureService = require('../../services/FixtureService');
const logger = require('../../utils/logger');


async function execute(force = false) {

  try {

    logger.info(
      '[FixturesJob] Syncing today fixtures...'
    );


    const count =
      await fixtureService.syncTodayFixtures(force);



    logger.info(
      `[FixturesJob] Fixtures synced: ${count}`
    );


    return {
      count
    };


  } catch (err) {


    logger.error(
      `[FixturesJob] Failed: ${err.message}`
    );


    return {
      count: 0,
      error: err.message
    };

  }

}


module.exports = {

  execute,

  // Run twice daily
  // Morning refresh + evening update
  schedule: '0 6,18 * * *'

};