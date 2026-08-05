// backend-v1/src/services/RankingEngine.js

const admin = require('firebase-admin');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');
const { WRITE_TIMEOUT_MS } = require('../config/constants');
const { publishJSON } = require('./StaticFilePublisher');

const OPS_PER_BATCH = 100;

const _resolving = new Set();


function calculatePoints(predH, predA, actualH, actualA) {

  const ph = Number(predH);
  const pa = Number(predA);
  const ah = Number(actualH);
  const aa = Number(actualA);


  if (ph === ah && pa === aa) {
    return {
      points:10,
      resultType:'exact'
    };
  }


  const predicted =
    ph > pa ? 'H' :
    ph < pa ? 'A' :
    'D';


  const actual =
    ah > aa ? 'H' :
    ah < aa ? 'A' :
    'D';


  if (predicted === actual) {

    return {
      points:3,
      resultType:'result'
    };

  }


  return {
    points:0,
    resultType:'miss'
  };

}



function normalizeScore(value, field){

  const n = Number(value);


  if(
    !Number.isInteger(n) ||
    n < 0 ||
    n > 99
  ){

    throw ApiError.badRequest(
      `${field} must be an integer between 0 and 99`
    );

  }


  return n;

}




async function alreadyResolved(
  db,
  matchDate,
  matchId
){

  const snap = await db
    .collection('match_resolution_status')
    .doc(matchDate)
    .get();


  if(!snap.exists){
    return false;
  }


  const resolved =
    snap.data()?.resolvedMatches || [];


  return resolved.includes(
    String(matchId)
  );

}






async function updateZokaPicksForMatch(
  date,
  matchId,
  homeScore,
  awayScore
){

  try{

    const db = getDb();


    const snap =
      await db
      .collection('zoka_picks')
      .doc(String(date))
      .get();


    if(!snap.exists){
      return false;
    }


    const data =
      snap.data() || {};


    const matches =
      Array.isArray(data.matches)
      ? data.matches
      : [];



    let changed = false;



    const updated =
      matches.map(match=>{


        if(
          String(match.matchId)
          === String(matchId)
          &&
          match.status !== 'finished'
        ){

          changed = true;


          return {

            ...match,

            homeScore,

            awayScore,

            status:'finished',

            updatedAt:
              new Date().toISOString()

          };

        }


        return match;


      });



    if(!changed){
      return false;
    }



    await db
    .collection('zoka_picks')
    .doc(String(date))
    .set({

      date,

      matches:updated,

      totalMatches:
        updated.length,

      isDraft:false,

      updatedAt:
        new Date().toISOString()

    },{
      merge:true
    });



    await publishJSON(
      `zokapicks/${date}.json`,
      {
        data:updated,
        date,
        matches:updated
      }
    );



    logger.info(
      `[RankingEngine] Updated Zoka Picks ${matchId}`
    );


    return true;


  }catch(err){


    logger.warn(
      `[RankingEngine] Zoka Picks update failed: ${err.message}`
    );


    return false;

  }

}
async function resolveMatch(input = {}) {

  const matchId =
    String(input.matchId || '').trim();

  const matchDate =
    String(input.matchDate || '').trim();



  if(!matchId){
    throw ApiError.badRequest(
      'matchId is required'
    );
  }


  if(!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)){

    throw ApiError.badRequest(
      'matchDate must be YYYY-MM-DD'
    );

  }



  const homeScore =
    normalizeScore(
      input.homeScore,
      'homeScore'
    );


  const awayScore =
    normalizeScore(
      input.awayScore,
      'awayScore'
    );



  const key =
    `${matchDate}:${matchId}`;



  if(_resolving.has(key)){

    return {

      resolved:false,

      reason:'in_progress',

      matchId,

      matchDate

    };

  }



  const db = getDb();



  /*
    IMPORTANT:
    Stop duplicate cron executions
    before reading predictions.
  */

  if(
    await alreadyResolved(
      db,
      matchDate,
      matchId
    )
  ){

    logger.info(
      `[RankingEngine] Match ${matchId} already resolved.`
    );


    return {

      resolved:false,

      alreadyResolved:true,

      matchId,

      matchDate

    };

  }



  _resolving.add(key);



  try {



    /*
      Find previous processed users.
      This protects against partial retries.
    */

    const processed =
      new Set();



    const processedSnap =
      await db
      .collection('prediction_results')
      .where(
        'matchId',
        '==',
        String(matchId)
      )
      .select('userId')
      .get();



    processedSnap.forEach(doc=>{

      const uid =
        doc.get('userId');


      if(uid){
        processed.add(String(uid));
      }

    });





    /*
      Load predictions only for this match.
    */

    const predsSnap =
      await db
      .collection('user_predictions')
      .where(
        'matchId',
        '==',
        String(matchId)
      )
      .get();



    const operations = [];



    predsSnap.forEach(doc=>{


      const prediction =
        doc.data() || {};


      const uid =
        String(prediction.userId || '');



      if(!uid || processed.has(uid)){
        return;
      }



      const predictedHome =
        Number(prediction.homeScore);


      const predictedAway =
        Number(prediction.awayScore);



      if(
        !Number.isInteger(predictedHome)
        ||
        !Number.isInteger(predictedAway)
      ){

        return;

      }



      const result =
        calculatePoints(
          predictedHome,
          predictedAway,
          homeScore,
          awayScore
        );



      operations.push({

        prediction,

        uid,

        points:
          result.points,

        resultType:
          result.resultType

      });


    });





    /*
       Write results in batches
    */

    let applied = 0;



    for(
      let i = 0;
      i < operations.length;
      i += OPS_PER_BATCH
    ){


      const chunk =
        operations.slice(
          i,
          i + OPS_PER_BATCH
        );



      const batch =
        db.batch();



      for(const op of chunk){


        const prediction =
          op.prediction;



        const resultRef =
          db
          .collection('prediction_results')
          .doc(
            `${op.uid}_${matchId}`
          );



        batch.set(
          resultRef,
          {

            userId:op.uid,

            displayName:
              prediction.displayName ||
              'Player',


            matchId:
              String(matchId),


            matchDate:
              prediction.matchDate ||
              matchDate,


            predictedHome:
              Number(prediction.homeScore),


            predictedAway:
              Number(prediction.awayScore),


            actualHome:
              homeScore,


            actualAway:
              awayScore,


            points:
              op.points,


            resultType:
              op.resultType,


            resolvedAt:
              admin.firestore
              .FieldValue
              .serverTimestamp()


          },
          {
            merge:true
          }
        );




        const totalRef =
          db
          .collection('user_points_total')
          .doc(op.uid);



        batch.set(
          totalRef,
          {

            uid:op.uid,


            displayName:
              prediction.displayName ||
              'Player',


            totalPoints:
              admin.firestore
              .FieldValue
              .increment(
                op.points
              ),


            predictionsCount:
              admin.firestore
              .FieldValue
              .increment(1),


            updatedAt:
              admin.firestore
              .FieldValue
              .serverTimestamp()


          },
          {
            merge:true
          }
        );





        const dailyRef =
          db
          .collection('daily_leaderboard')
          .doc(matchDate)
          .collection('users')
          .doc(op.uid);



        batch.set(
          dailyRef,
          {

            uid:op.uid,


            displayName:
              prediction.displayName ||
              'Player',


            points:
              admin.firestore
              .FieldValue
              .increment(
                op.points
              ),


            predictions:
              admin.firestore
              .FieldValue
              .increment(1)


          },
          {
            merge:true
          }
        );

      }




      await Promise.race([

        batch.commit(),

        new Promise(
          (_,reject)=>
          setTimeout(
            ()=>reject(
              new Error(
                'Ranking batch timeout'
              )
            ),
            WRITE_TIMEOUT_MS
          )
        )

      ]);



      applied += chunk.length;


    }
        /*
      Mark featured prediction as finished
    */

    const predId =
      `feat_${matchDate}_${matchId}`;


    await db
      .collection('active_predictions')
      .doc(predId)
      .set({

        homeScore,

        awayScore,

        status:'FT',

        isFinished:true,

        isResolved:true,


        'display.isFinished':true,

        'display.isLive':false,


        'display.score.home':
          homeScore,


        'display.score.away':
          awayScore,


        resolvedAt:
          admin.firestore
          .FieldValue
          .serverTimestamp(),


        updatedAt:
          admin.firestore
          .FieldValue
          .serverTimestamp()


      },
      {
        merge:true
      });






    /*
      Mark match resolved.
      This is the protection against
      duplicate cron executions.
    */

    await db
      .collection('match_resolution_status')
      .doc(matchDate)
      .set({

        resolvedMatches:
          admin.firestore
          .FieldValue
          .arrayUnion(
            String(matchId)
          ),


        updatedAt:
          admin.firestore
          .FieldValue
          .serverTimestamp()


      },
      {
        merge:true
      });






    /*
      Update published Zoka Picks
    */

    await updateZokaPicksForMatch(
      matchDate,
      matchId,
      homeScore,
      awayScore
    );






    /*
      IMPORTANT:
      Removed:

      - publishDailyLeaderboardSnapshot()
      - rebuildGoat()
      - rebuildPeriod('weekly')
      - rebuildPeriod('monthly')

      These were causing massive Firestore usage.

      FinishedFixturesJob will rebuild once
      after processing all matches.
    */





    logger.info(
      `[RankingEngine] Match ${matchId} resolved. Applied ${applied} users.`
    );



    return {

      resolved:true,

      matchId,

      matchDate,


      users:applied,


      skipped:
        processed.size,


      leaderboardUpdateRequired:true

    };



  } finally {


    _resolving.delete(key);


  }

}






module.exports = {

  resolveMatch,

  calculatePoints,

  alreadyResolved

};