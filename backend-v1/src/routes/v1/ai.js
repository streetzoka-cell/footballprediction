const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const { GoogleGenAI } = require('@google/genai');

const env = require('../../config/env');
const logger = require('../../utils/logger');

const {
  authenticateFirebaseUser
} = require('../../middleware/firebaseAuth');

const {
  getDb
} = require('../../config/firebase');



const ai =
  new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY
  });



const SYSTEM_PROMPT = `

You are ZIE, the official AI intelligence engine of ZOKASCORE.

You are an elite football intelligence assistant specializing in:

- Match analysis
- Tactical breakdowns
- Football statistics
- Prediction insights
- Team performance analysis

You are professional, friendly and honest.

Rules:

- Never invent facts.
- Never create fake scores or statistics.
- Never pretend to have live information unless provided.
- Use PLATFORM DATA when discussing ZOKASCORE matches.
- Use USER PROFILE only for user-specific questions.
- Keep answers clean and concise.
- Avoid unnecessary markdown.
- Never use bold formatting.
- Always represent ZOKASCORE professionally.

`;



const MODELS = [

  "gemini-2.0-flash-lite",

  "gemini-2.5-flash-lite",

  "gemini-3.5-flash"

];



const FALLBACK_CODES = [

  429,

  404,

  503

];



const CACHE_TTL_MS =
  60 * 60 * 1000;


const MAX_CACHE_SIZE =
  1000;



/*
    AI RESPONSE CACHE

    Prevents repeated Gemini calls
*/


const responseCache =
  new Map();





/*
    USER CONTEXT CACHE

    Reduces Firestore reads
*/


const userContextCache =
  new Map();


const USER_CONTEXT_TTL =
  2 * 60 * 1000;





/*
    PLATFORM DATA CACHE

    Featured matches
    Zoka Picks
*/


let platformCache = {

  data:null,

  timestamp:0

};


const PLATFORM_CACHE_TTL =
  5 * 60 * 1000;







const STATIC_RESPONSES = {


  "who are you":

  "I'm ZIE, the official AI intelligence engine of ZOKASCORE. I help with football analysis, predictions and match insights.",



  "what is zokascore":

  "ZOKASCORE is a football intelligence platform combining predictions, rankings, statistics and AI-powered football insights.",



  "what can you do":

  "I can analyze matches, explain tactics, review predictions and help you understand football data."

};







function normalizeQuery(query){

  return query

    .toLowerCase()

    .replace(/[^\w\s]/gi,'')

    .replace(/\s+/g,' ')

    .trim();

}







function ensureCacheLimit(){


  while(
    responseCache.size >
    MAX_CACHE_SIZE
  ){

    const first =
      responseCache
      .keys()
      .next()
      .value;


    responseCache.delete(first);

  }

}








function getResponseCache(key){


  const cached =
    responseCache.get(key);



  if(!cached){

    return null;

  }



  if(
    Date.now() -
    cached.time
    >
    CACHE_TTL_MS
  ){

    responseCache.delete(key);

    return null;

  }



  return cached;

}







function saveResponseCache(
  key,
  value
){


  responseCache.set(

    key,

    {

      ...value,

      time:
        Date.now()

    }

  );


  ensureCacheLimit();

}








function validateRequest(body){


  if(
    !body ||
    typeof body !== "object"
  ){

    return {

      valid:false,

      error:"Invalid request."

    };

  }



  if(
    !body.message ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ){

    return {

      valid:false,

      error:"Message is required."

    };

  }



  if(
    body.message.length > 2000
  ){

    return {

      valid:false,

      error:"Message too long."

    };

  }



  if(
    body.history &&
    !Array.isArray(body.history)
  ){

    return {

      valid:false,

      error:"History must be an array."

    };

  }



  return {

    valid:true

  };

}








function sanitizeHistory(history){


  if(!Array.isArray(history)){

    return [];

  }



  return history

    .slice(-15)

    .filter(

      msg =>

        msg &&

        typeof msg.role === "string" &&

        typeof msg.content === "string"

    )

    .map(

      msg => ({

        role:

          msg.role === "assistant"

          ?

          "model"

          :

          "user",


        content:

          msg.content.substring(
            0,
            1500
          )

      })

    );

}
const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const { GoogleGenAI } = require('@google/genai');

const env = require('../../config/env');
const logger = require('../../utils/logger');

const {
  authenticateFirebaseUser
} = require('../../middleware/firebaseAuth');

const {
  getDb
} = require('../../config/firebase');



const ai =
  new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY
  });



const SYSTEM_PROMPT = `

You are ZIE, the official AI intelligence engine of ZOKASCORE.

You are an elite football intelligence assistant specializing in:

- Match analysis
- Tactical breakdowns
- Football statistics
- Prediction insights
- Team performance analysis

You are professional, friendly and honest.

Rules:

- Never invent facts.
- Never create fake scores or statistics.
- Never pretend to have live information unless provided.
- Use PLATFORM DATA when discussing ZOKASCORE matches.
- Use USER PROFILE only for user-specific questions.
- Keep answers clean and concise.
- Avoid unnecessary markdown.
- Never use bold formatting.
- Always represent ZOKASCORE professionally.

`;



const MODELS = [

  "gemini-2.0-flash-lite",

  "gemini-2.5-flash-lite",

  "gemini-3.5-flash"

];



const FALLBACK_CODES = [

  429,

  404,

  503

];



const CACHE_TTL_MS =
  60 * 60 * 1000;


const MAX_CACHE_SIZE =
  1000;



/*
    AI RESPONSE CACHE

    Prevents repeated Gemini calls
*/


const responseCache =
  new Map();





/*
    USER CONTEXT CACHE

    Reduces Firestore reads
*/


const userContextCache =
  new Map();


const USER_CONTEXT_TTL =
  2 * 60 * 1000;





/*
    PLATFORM DATA CACHE

    Featured matches
    Zoka Picks
*/


let platformCache = {

  data:null,

  timestamp:0

};


const PLATFORM_CACHE_TTL =
  5 * 60 * 1000;







const STATIC_RESPONSES = {


  "who are you":

  "I'm ZIE, the official AI intelligence engine of ZOKASCORE. I help with football analysis, predictions and match insights.",



  "what is zokascore":

  "ZOKASCORE is a football intelligence platform combining predictions, rankings, statistics and AI-powered football insights.",



  "what can you do":

  "I can analyze matches, explain tactics, review predictions and help you understand football data."

};







function normalizeQuery(query){

  return query

    .toLowerCase()

    .replace(/[^\w\s]/gi,'')

    .replace(/\s+/g,' ')

    .trim();

}







function ensureCacheLimit(){


  while(
    responseCache.size >
    MAX_CACHE_SIZE
  ){

    const first =
      responseCache
      .keys()
      .next()
      .value;


    responseCache.delete(first);

  }

}








function getResponseCache(key){


  const cached =
    responseCache.get(key);



  if(!cached){

    return null;

  }



  if(
    Date.now() -
    cached.time
    >
    CACHE_TTL_MS
  ){

    responseCache.delete(key);

    return null;

  }



  return cached;

}







function saveResponseCache(
  key,
  value
){


  responseCache.set(

    key,

    {

      ...value,

      time:
        Date.now()

    }

  );


  ensureCacheLimit();

}








function validateRequest(body){


  if(
    !body ||
    typeof body !== "object"
  ){

    return {

      valid:false,

      error:"Invalid request."

    };

  }



  if(
    !body.message ||
    typeof body.message !== "string" ||
    !body.message.trim()
  ){

    return {

      valid:false,

      error:"Message is required."

    };

  }



  if(
    body.message.length > 2000
  ){

    return {

      valid:false,

      error:"Message too long."

    };

  }



  if(
    body.history &&
    !Array.isArray(body.history)
  ){

    return {

      valid:false,

      error:"History must be an array."

    };

  }



  return {

    valid:true

  };

}








function sanitizeHistory(history){


  if(!Array.isArray(history)){

    return [];

  }



  return history

    .slice(-15)

    .filter(

      msg =>

        msg &&

        typeof msg.role === "string" &&

        typeof msg.content === "string"

    )

    .map(

      msg => ({

        role:

          msg.role === "assistant"

          ?

          "model"

          :

          "user",


        content:

          msg.content.substring(
            0,
            1500
          )

      })

    );

}
function handleGeminiError(err, model){


  const code =
    err.status || err.code;



  logger.error(

    `[ZIE] Gemini ${model} failed (${code}): ${err.message}`

  );




  let error =
    "AI service unavailable. Please try again.";





  if(code === 400){

    error =
      "Invalid AI request.";

  }

  else if(
    code === 401 ||
    code === 403
  ){

    error =
      "AI authentication failed.";

  }

  else if(code === 404){

    error =
      "AI model unavailable.";

  }

  else if(code === 429){

    error =
      "AI usage limit reached. Please try again later.";

  }

  else if(code === 503){

    error =
      "AI service is busy. Please retry.";

  }

  else if(err.message === "TIMEOUT"){

    error =
      "AI response timed out.";

  }



  return {

    success:false,

    error,

    model:model || "unknown"

  };


}









async function generateWithFallback(contents){



  for(
    const model of MODELS
  ){



    const started =
      Date.now();




    try{



      const timeout =

        new Promise(

          (_, reject)=>

            setTimeout(

              ()=>reject(
                new Error("TIMEOUT")
              ),

              12000

            )

        );







      const request =

        ai.models.generateContent({

          model,


          contents,


          systemInstruction:
            SYSTEM_PROMPT,



          generationConfig:{


            temperature:
              0.45,


            topP:
              0.9,


            topK:
              32,


            maxOutputTokens:
              600


          }


        });







      const response =

        await Promise.race([

          request,

          timeout

        ]);







      const responseTime =

        Date.now() - started;






      logger.info(

        `[ZIE] ${model} response ${responseTime}ms`

      );







      return {


        success:true,


        model,


        reply:

          response.text ||

          "I could not generate a response.",



        responseTime:

          `${responseTime}ms`


      };






    }catch(err){



      const code =
        err.status || err.code;





      if(

        err.message === "TIMEOUT" ||

        FALLBACK_CODES.includes(code)

      ){



        logger.warn(

          `[ZIE] Fallback from ${model}`

        );



        continue;


      }





      if(

        [

          400,

          401,

          403,

          500

        ].includes(code)

      ){


        return handleGeminiError(
          err,
          model
        );


      }






      logger.warn(

        `[ZIE] ${model} error: ${err.message}`

      );



    }



  }







  return {


    success:false,


    error:

      "ZIE is currently busy. Try again shortly.",



    model:

      "fallback_failed"


  };


}









/*
    POST /api/v1/ai/zoka
*/


router.post(

'/zoka',

authenticateFirebaseUser,

async(req,res)=>{


try{



  if(!env.GEMINI_API_KEY){


    return res.status(500).json({

      success:false,

      error:"AI service unavailable."

    });


  }







  const validation =

    validateRequest(
      req.body
    );







  if(!validation.valid){


    return res.status(400).json({

      success:false,

      error:
        validation.error

    });


  }







  const {

    message,

    history=[]


  } = req.body;







  /*
      User isolated cache key

      Prevents users sharing AI answers
  */


  const cacheKey =

    `${req.user.uid}:${normalizeQuery(message)}`;









  /*
      Static responses
  */


  const staticReply =

    STATIC_RESPONSES[
      normalizeQuery(message)
    ];






  if(staticReply){


    return res.json({

      success:true,

      model:"static",

      reply:
        staticReply,

      responseTime:
        "1ms"

    });


  }









  /*
      AI response cache
  */



  const cached =

    getResponseCache(
      cacheKey
    );







  if(cached){


    return res.json({


      success:true,


      model:

        `${cached.model} (cached)`,



      reply:

        cached.reply,



      responseTime:

        "0ms"


    });


  }









  /*
      Load secure context
  */


  const userContext =

    await getCachedUserContext(

      req.user.uid

    );





  const platformContext =

    await getCachedPlatformContext();








  const contents =

    await buildPrompt({

      message,

      history,

      userContext,

      platformContext


    });







  const result =

    await generateWithFallback(
      contents
    );







  if(result.success){


    saveResponseCache(

      cacheKey,

      result

    );



    return res.json(result);


  }







  return res.status(503).json(result);







}catch(err){



  logger.error(

    `[ZIE] Route crash: ${err.message}`

  );



  return res.status(500).json({


    success:false,


    error:

      "Unexpected AI error."


  });



}



});








module.exports = router;