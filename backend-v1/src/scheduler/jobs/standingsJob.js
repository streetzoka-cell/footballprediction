// backend-v1/src/scheduler/jobs/standingsJob.js

const standingsService = require('../../services/StandingsService');
const logger = require('../../utils/logger');


async function execute(force = false) {

  try {

    logger.info(
      '[StandingsJob] Syncing standings...'
    );


    const result =
      await standingsService.syncStandings(force);



    const ok =
      result?.ok || 0;

    const fail =
      result?.fail || 0;



    logger.info(
      `[StandingsJob] Complete | Updated: ${ok} | Failed: ${fail}`
    );


    return {
      ok,
      fail
    };


  } catch (err) {


    logger.error(
      `[StandingsJob] Failed: ${err.message}`
    );


    return {
      ok: 0,
      fail: 1,
      error: err.message
    };

  }

}


module.exports = {

  execute,

  // Standings do not need frequent updates
  // Recommended: every 6 hours
  schedule: '0 */6 * * *'

};