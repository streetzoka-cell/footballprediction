// backend-v1/src/scheduler/jobs/finishedFixturesJob.js

const fixtureService = require('../../services/FixtureService');
const {
  resolveMatch,
  rebuildDailyLeaderboard,
} = require('./resolvePredictionsJob');

const logger = require('../../utils/logger');


function getDateOffset(offset) {
  const d = new Date();

  d.setUTCDate(
    d.getUTCDate() + offset
  );

  return d.toISOString().split('T')[0];
}



async function execute(forceFetch = false) {

  try {

    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);


    logger.info(
      '[FinishedFixturesJob] Checking finished fixtures...'
    );



    /*
      Load finished matches once.
      No forced API refresh unless manually requested.
    */

    const [
      todayMatches,
      yesterdayMatches
    ] = await Promise.all([

      fixtureService.syncFinishedFixtures(
        forceFetch,
        0
      ),

      fixtureService.syncFinishedFixtures(
        forceFetch,
        -1
      )

    ]);



    const matches = [

      ...(todayMatches || []),
      ...(yesterdayMatches || [])

    ];



    if(!matches.length){

      logger.info(
        '[FinishedFixturesJob] No finished matches.'
      );

      return {
        count:0,
        resolved:0
      };

    }




    let resolvedCount = 0;

    const rebuildDates = new Set();




    for(const match of matches){


      try{


        if(
          match.homeScore == null ||
          match.awayScore == null
        ){

          continue;

        }



        const matchDate =
          match.dateStr ||
          match.date?.split('T')[0];



        if(!matchDate){

          continue;

        }



        const result =
          await resolveMatch(

            match.id,

            match.homeScore,

            match.awayScore,

            matchDate

          );




        /*
          Only rebuild if new resolution happened.
        */

        if(
          result &&
          result.leaderboardUpdateRequired
        ){

          resolvedCount++;

          rebuildDates.add(matchDate);

        }



      }catch(err){


        logger.error(

          `[FinishedFixturesJob] Match ${match.id} failed: ${err.message}`

        );


      }


    }




    /*
      ONE leaderboard rebuild per day.
      Previously this could run:
      
      20 matches =
      20 leaderboard rebuilds

      Now:
      20 matches =
      1 rebuild
    */


    for(const date of rebuildDates){


      logger.info(

        `[FinishedFixturesJob] Rebuilding leaderboard ${date}`

      );


      await rebuildDailyLeaderboard(date);


    }




    return {

      count:matches.length,

      resolved:resolvedCount,

      rebuilt:[...rebuildDates]

    };



  }catch(err){


    logger.error(

      `[FinishedFixturesJob] Failed: ${err.message}`

    );


    return {

      count:0,

      resolved:0,

      error:err.message

    };


  }

}



module.exports = {

  execute

};