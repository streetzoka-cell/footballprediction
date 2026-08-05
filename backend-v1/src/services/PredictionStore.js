// backend-v1/src/services/PredictionStore.js

const path = require('path');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

const {
  writeJSONAtomicSync,
  readJSONSafeSync,
  ensureDirSync,
} = require('../utils/atomicWriter');


const PUBLIC_PREDICTIONS_FILE = path.join(
  process.cwd(),
  'public_data',
  'predictions.json'
);


const DATA_DIR = path.join(
  process.cwd(),
  'data',
  'predictions'
);


const RECEIPTS_DIR = path.join(
  DATA_DIR,
  'receipts'
);


ensureDirSync(DATA_DIR);
ensureDirSync(RECEIPTS_DIR);



const VALID_CHOICES = new Set([
  'home',
  'draw',
  'away'
]);



let store = {};

const receiptsCache = new Map();


let aggregateWriteTimer = null;

let aggregateDirty = false;


const receiptTimers = new Map();




function safeFileId(id) {

  return String(id)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0,120);

}




function loadAggregate() {

  const data =
    readJSONSafeSync(
      PUBLIC_PREDICTIONS_FILE,
      {}
    );


  store =
    data &&
    typeof data === 'object' &&
    !Array.isArray(data)

      ? data

      : {};

}




function receiptPath(matchId) {

  return path.join(
    RECEIPTS_DIR,
    `${safeFileId(matchId)}.json`
  );

}




function loadReceipts(matchId) {

  const mid = String(matchId);


  if (receiptsCache.has(mid)) {

    return receiptsCache.get(mid);

  }



  const raw =
    readJSONSafeSync(
      receiptPath(mid),
      {}
    );



  const entries =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw)

      ? Object.entries(raw)

      : [];



  const map =
    new Map(
      entries.map(([key,value]) => [
        String(key),
        String(value)
      ])
    );



  receiptsCache.set(mid,map);


  return map;

}





function saveReceipts(matchId) {

  const map =
    receiptsCache.get(
      String(matchId)
    );


  if (!map) return;



  writeJSONAtomicSync(

    receiptPath(matchId),

    Object.fromEntries(
      map.entries()
    ),

    {
      pretty:false
    }

  );

}




function saveAggregate() {

  writeJSONAtomicSync(

    PUBLIC_PREDICTIONS_FILE,

    store,

    {
      pretty:true
    }

  );

}




function scheduleAggregateSave() {


  aggregateDirty = true;



  if (aggregateWriteTimer) {

    return;

  }



  aggregateWriteTimer = setTimeout(() => {


    if (aggregateDirty) {

      saveAggregate();

      aggregateDirty = false;

    }



    aggregateWriteTimer = null;



  },5000);


}






function scheduleReceiptSave(matchId) {


  const mid = String(matchId);



  if (receiptTimers.has(mid)) {

    return;

  }



  const timer =
    setTimeout(() => {


      saveReceipts(mid);


      receiptTimers.delete(mid);



    },5000);



  receiptTimers.set(
    mid,
    timer
  );

}






function emptyAggregate() {

  return {

    totalVotes:0,

    home:0,

    draw:0,

    away:0,

    updatedAt:
      new Date().toISOString()

  };

}





function buildPublicAggregate(matchId) {


  const mid =
    String(matchId);



  const data =
    store[mid] ||
    emptyAggregate();



  const total =
    Number(
      data.totalVotes || 0
    );



  let homePct =
    total
      ? Math.round(
          (Number(data.home || 0) / total) * 100
        )
      : 0;



  let drawPct =
    total
      ? Math.round(
          (Number(data.draw || 0) / total) * 100
        )
      : 0;



  let awayPct =
    total
      ? Math.round(
          (Number(data.away || 0) / total) * 100
        )
      : 0;




  const sum =
    homePct +
    drawPct +
    awayPct;



  if(total > 0 && sum !==100){

    const diff =
      100 - sum;


    if(data.home >= data.draw &&
       data.home >= data.away){

      homePct += diff;

    }
    else if(
      data.draw >= data.home &&
      data.draw >= data.away
    ){

      drawPct += diff;

    }
    else{

      awayPct += diff;

    }

  }




  return {

    matchId:mid,

    totalVotes:total,


    votes:{

      home:Number(data.home || 0),

      draw:Number(data.draw || 0),

      away:Number(data.away || 0)

    },


    percentages:{

      home:homePct,

      draw:drawPct,

      away:awayPct

    },


    updatedAt:
      data.updatedAt || null

  };

}






function vote({
  matchId,
  choice,
  voterId=null
}) {


  const mid =
    String(matchId || '')
      .trim();



  if(!mid){

    throw ApiError.badRequest(
      'matchId is required'
    );

  }



  if(!VALID_CHOICES.has(choice)){

    throw ApiError.badRequest(
      'choice must be one of: home, draw, away'
    );

  }



  const receipts =
    loadReceipts(mid);



  if(!store[mid]){

    store[mid] =
      emptyAggregate();

  }



  const agg =
    store[mid];



  let status =
    'recorded';


  let previousChoice = null;




  if(voterId){


    const vid =
      String(voterId).trim();



    previousChoice =
      receipts.get(vid) || null;



    if(previousChoice === choice){


      return {

        status:'duplicate',

        previousChoice,

        matchId:mid,

        choice,

        aggregate:
          buildPublicAggregate(mid)

      };

    }




    if(
      previousChoice &&
      VALID_CHOICES.has(previousChoice)
    ){

      agg[previousChoice] =
        Math.max(
          0,
          Number(agg[previousChoice] || 0)-1
        );


      agg.totalVotes =
        Math.max(
          0,
          Number(agg.totalVotes || 0)-1
        );


      status='changed';

    }



    receipts.set(
      vid,
      choice
    );


  }




  agg[choice] =
    Number(agg[choice] || 0)+1;



  agg.totalVotes =
    Number(agg.totalVotes || 0)+1;



  agg.updatedAt =
    new Date().toISOString();



  store[mid]=agg;



  scheduleAggregateSave();



  if(voterId){

    scheduleReceiptSave(mid);

  }



  logger.info(

    `[PredictionStore] vote match=${mid} choice=${choice} status=${status} total=${agg.totalVotes}`

  );



  return {

    status,

    previousChoice,

    matchId:mid,

    choice,

    aggregate:
      buildPublicAggregate(mid)

  };

}







function get(matchId){

  return buildPublicAggregate(matchId);

}






function getAll(){

  return Object.keys(store)
    .reduce((acc,mid)=>{

      acc[mid]=
        buildPublicAggregate(mid);

      return acc;

    },{});

}







function stats(){

  let totalVotes=0;


  for(const mid of Object.keys(store)){

    totalVotes +=
      Number(
        store[mid]?.totalVotes || 0
      );

  }



  return {

    matches:
      Object.keys(store).length,

    totalVotes,

    receiptFilesCached:
      receiptsCache.size

  };

}







function cleanupOldPredictions(days=30){


  const cutoff =
    Date.now() -
    days * 86400000;



  let removed=0;



  for(const mid of Object.keys(store)){


    const updated =
      new Date(
        store[mid].updatedAt
      ).getTime();



    if(updated < cutoff){


      delete store[mid];

      receiptsCache.delete(mid);

      removed++;

    }

  }



  if(removed){

    saveAggregate();

  }



  return removed;

}







function clearReceiptCache(){


  if(receiptsCache.size > 5000){

    receiptsCache.clear();


    logger.info(
      '[PredictionStore] Receipt cache cleared'
    );

  }

}






loadAggregate();






module.exports = {

  vote,

  get,

  getAll,

  stats,

  cleanupOldPredictions,

  clearReceiptCache

};