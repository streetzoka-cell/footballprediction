// backend-v1/src/routes/admin/ranking.js

const express = require('express');
const router = express.Router();

const adminAuth = require('../../../middleware/adminAuth');

const LeaderboardEngine =
  require('../../../services/LeaderboardEngine');

const RankingEngine =
  require('../../../services/RankingEngine');

const finishedFixturesJob =
  require('../../../scheduler/jobs/finishedFixturesJob');

const logger =
  require('../../../utils/logger');



router.use(adminAuth);





let fixturesRefreshRunning = false;





function todayStr(){

  return new Date()
    .toISOString()
    .split('T')[0];

}








/*
    Resolve finished match

    Applies:
    - prediction points
    - user totals
    - daily leaderboard

    Does NOT rebuild:
    - weekly
    - monthly
    - GOAT
*/

router.post(
'/resolve',
async(req,res,next)=>{


  try{


    const result =

      await RankingEngine.resolveMatch(
        req.body || {}
      );




    logger.info(

      `[ADMIN] Match resolve requested: ${req.body?.matchId}`

    );





    return res.json({


      success:true,


      resolved:
        result.resolved,



      message:

        result.alreadyResolved

        ?

        'Match already processed.'

        :

        'Match resolved successfully.',



      result


    });





  }catch(err){


    next(err);


  }



});









/*
    Manual rebuild controller

    Supported:

    /daily
    /weekly
    /monthly
    /goat
    /fixtures
    /all

*/

router.post(
'/rebuild/:period',
async(req,res,next)=>{


try{



  const period =

    String(
      req.params.period || ''
    )

    .trim()

    .toLowerCase();





  const dateStr =

    String(
      req.body?.dateStr || ''
    )

    .trim();









  /*
      FIXTURES REFRESH

      Runs async because Cloudflare
      may timeout long jobs.
  */


  if(period === 'fixtures'){



    if(fixturesRefreshRunning){


      return res.json({

        success:true,

        message:
          'Fixtures refresh already running.'

      });


    }






    fixturesRefreshRunning = true;





    res.json({

      success:true,

      message:
        'Fixtures refresh started in background.'

    });







    finishedFixturesJob
      .execute(true)


      .catch(err=>{


        logger.error(

          `[ADMIN] Finished fixtures refresh failed: ${err.message}`

        );


      })


      .finally(()=>{


        fixturesRefreshRunning = false;


      });





    return;


  }









  /*
      DAILY
  */


  if(period === 'daily'){



    const result =

      await LeaderboardEngine
      .rebuildDailyLeaderboard(

        dateStr ||
        todayStr()

      );




    logger.info(

      `[ADMIN] Daily leaderboard rebuilt`

    );




    return res.json({

      success:true,

      result


    });


  }









  /*
      PERIOD LEADERBOARDS
  */


  if(

    period === 'weekly' ||

    period === 'monthly' ||

    period === 'goat'

  ){



    const result =

      await LeaderboardEngine
      .rebuildPeriod(

        period,

        dateStr

      );





    logger.info(

      `[ADMIN] ${period} leaderboard rebuilt`

    );





    return res.json({

      success:true,

      result


    });


  }









  /*
      FULL REBUILD

      Use carefully.
      Expensive operation.
  */


  if(period === 'all'){



    logger.warn(

      '[ADMIN] Full leaderboard rebuild started'

    );





    const date =

      dateStr ||
      todayStr();





    const daily =

      await LeaderboardEngine
      .rebuildDailyLeaderboard(
        date
      );





    const weekly =

      await LeaderboardEngine
      .rebuildPeriod(
        'weekly'
      );





    const monthly =

      await LeaderboardEngine
      .rebuildPeriod(
        'monthly'
      );





    const goat =

      await LeaderboardEngine
      .rebuildPeriod(
        'goat'
      );






    return res.json({


      success:true,


      result:{


        daily,

        weekly,

        monthly,

        goat


      }


    });



  }









  return res.status(400)
  .json({


    success:false,


    error:{


      code:
        'INVALID_PERIOD',



      message:
        'Invalid rebuild period.'

    }


  });







}catch(err){


  next(err);


}



});









module.exports = router;