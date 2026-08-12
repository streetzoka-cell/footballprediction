
'use strict';

/**
 * ============================================================
 * KIM — HARDCORE GAUNTLET (V1)
 * ============================================================
 * Tests multi-turn context, Sheng/Swahili, hallucination traps,
 * memory mutation, and chaotic human conversation patterns.
 * ============================================================
 */

const kim = require('../src/kim/KimOrchestrator');

let totalSteps = 0;
let passedSteps = 0;
let hardFails = 0;
const failureLog = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, value, message) {
  assert(String(text).toLowerCase().includes(value.toLowerCase()), message || `Expected output to contain: "${value}"`);
}

function assertNotIncludes(text, value, message) {
  assert(!String(text).toLowerCase().includes(value.toLowerCase()), message || `Expected output NOT to contain: "${value}"`);
}

// Helper to check for generic fallbacks
function assertNoFallback(r) {
  assertNotIncludes(r.response, 'reliable answer', 'Should not use the generic "reliable answer" fallback');
  assertNotIncludes(r.response, 'invent football facts', 'Should not use the generic "invent facts" fallback');
  assertNotIncludes(r.response, '[object Object]', 'Should not output raw objects');
}

async function runScenario(scenario) {
  console.log(`\n--- ${scenario.name} ---`);
  
  for (const step of scenario.steps) {
    totalSteps++;
    console.log(`\n👤 USER: ${step.message}`);
    
    let response;
    try {
      response = await kim.process({ uid: scenario.uid, message: step.message });
    } catch (e) {
      response = { response: `CRASH: ${e.message}`, intent: 'error' };
    }

    console.log(`🤖 KIM: ${response.response.substring(0, 150)}...`);
    console.log(`📊 [Intent: ${response.intent} | Source: ${response.source}]`);

    try {
      step.validate(response);
      console.log('✅ PASS');
      passedSteps++;
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
      failureLog.push({ scenario: scenario.name, msg: step.message, error: error.message });
      
      // Hard fails immediately impact the score heavily
      if (step.hardFail) {
        hardFails++;
      }
    }
  }
}

(async () => {
  console.log('============================================================');
  console.log(' KIM — HARDCORE GAUNTLET (V1)');
  console.log('============================================================');

  // 1. Sheng + football banter
  await runScenario({
    name: '1. Sheng + football banter',
    uid: 'hardcore-1',
    steps: [
      {
        message: 'Bro KIM, leo uko aje? Usinipatie story za bure bana 😂',
        validate: (r) => {
          assertNoFallback(r);
          assert(r.intent === 'casual' || r.intent === 'greeting', 'Should be casual/greeting');
        }
      },
      {
        message: 'We msee, Arsenal wameanza tena mambo yao 😂😭',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, 'Arsenal', 'Should acknowledge Arsenal');
        }
      },
      {
        message: 'Acha jokes bana, niambie ukweli — Arsenal wako form gani sai?',
        validate: (r) => {
          // KIM might not have live data, but shouldn't fallback generically
          assertNoFallback(r);
          assert(r.intent === 'team_form' || r.intent === 'general', 'Should attempt team_form intent');
        }
      }
    ]
  });

  // 2. Sheng -> actual football question
  await runScenario({
    name: '2. Sheng -> actual football question',
    uid: 'hardcore-2',
    steps: [
      {
        message: 'Chelsea wamechapa nani jana ama walikua wanapigwa? 😂',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, 'Chelsea', 'Should acknowledge Chelsea');
        }
      },
      {
        message: 'Na Liverpool je? Wao wako aje?',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, 'Liverpool', 'Should acknowledge Liverpool follow-up');
        }
      },
      {
        message: 'Between hao wawili, nani ako na form better?',
        validate: (r) => {
          assertNoFallback(r);
          assert(r.intent === 'team_comparison' || r.intent === 'team_form', 'Should attempt comparison');
        }
      }
    ]
  });

  // 3. Match-history interrogation
  await runScenario({
    name: '3. Match-history interrogation',
    uid: 'hardcore-3',
    steps: [
      {
        message: 'Brazil vs Germany 2014 World Cup.',
        validate: (r) => {
          assertIncludes(r.response, '1 - 7', 'Must find the 1-7 match');
        }
      },
      {
        message: 'Score?',
        validate: (r) => {
          // Context should be maintained. If it asks for data, that's fine, but no generic fallback.
          assertNoFallback(r);
        }
      },
      {
        message: 'Who scored Germany\'s goals?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Was that the semifinal?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'How many goals did Brazil concede in the whole tournament?',
        validate: (r) => {
          assertNoFallback(r);
        }
      }
    ]
  });

  // 4. Historical trap
  await runScenario({
    name: '4. Historical trap',
    uid: 'hardcore-4',
    steps: [
      {
        message: 'Brazil vs Germany 2002 World Cup',
        validate: (r) => {
          assertIncludes(r.response, 'Brazil', 'Should mention Brazil');
          assertIncludes(r.response, 'Germany', 'Should mention Germany');
        }
      },
      {
        message: 'Who won?',
        validate: (r) => {
          assertIncludes(r.response, 'Brazil', 'Should say Brazil won 2002');
        }
      },
      {
        message: 'Who scored?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Was Ronaldo playing?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'So Germany beat Brazil in the final, right? 😂',
        validate: (r) => {
          // HARD FAIL: KIM must correct the false premise
          assertNotIncludes(r.response.toLowerCase(), 'yes', 'Must not agree with false premise');
          assertIncludes(r.response, 'Brazil', 'Must correct the premise mentioning Brazil');
        },
        hardFail: true
      }
    ]
  });

  // 5. Prediction interrogation
  await runScenario({
    name: '5. Prediction interrogation',
    uid: 'hardcore-5',
    steps: [
      {
        message: 'Arsenal vs Liverpool tomorrow. Give me your prediction.',
        validate: (r) => {
          // Might lack data, but shouldn't fallback generically
          assertNoFallback(r);
        }
      },
      {
        message: 'Don\'t give me vibes. Give me numbers.',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Why are you giving Arsenal only 38%?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'What if Arsenal score first?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'And if Liverpool score first?',
        validate: (r) => {
          assertNoFallback(r);
        }
      }
    ]
  });

  // 6. Prediction trap
  await runScenario({
    name: '6. Prediction trap',
    uid: 'hardcore-6',
    steps: [
      {
        message: 'If a team has 70% win probability, does that mean they will definitely win?',
        validate: (r) => {
          assertNotIncludes(r.response.toLowerCase(), 'yes', 'Must not say yes to certainty');
          assertIncludes(r.response, 'not guaranteed', 'Must explain uncertainty');
        }
      },
      {
        message: 'So 90% is still not guaranteed?',
        validate: (r) => {
          assertIncludes(r.response, 'not guaranteed', 'Must reiterate uncertainty');
        }
      },
      {
        message: 'What about 100%?',
        validate: (r) => {
          assertNotIncludes(r.response.toLowerCase(), 'yes, 100% is guaranteed', 'Must not claim 100% certainty in football');
        }
      }
    ]
  });

  // 7. Football quiz mode
  await runScenario({
    name: '7. Football quiz mode',
    uid: 'hardcore-7',
    steps: [
      {
        message: 'KIM, quiz me. Hard mode. No easy nonsense.',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, '?', 'Should ask a question');
        }
      },
      {
        message: 'Make it Champions League.',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Give me one clue lakini usiniambie answer.',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Is it Messi?',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'Final answer: Ronaldo.',
        validate: (r) => {
          assertNoFallback(r);
        }
      }
    ]
  });

  // 10. Emotional football reaction
  await runScenario({
    name: '10. Emotional football reaction',
    uid: 'hardcore-10',
    steps: [
      {
        message: 'BROOOOOOO 😭😭😭 WHAT DID I JUST WATCH???',
        validate: (r) => {
          assertNoFallback(r);
          assert(r.intent === 'casual' || r.intent === 'emotional_conversation', 'Should be casual/emotional');
        }
      },
      {
        message: '90+7 MINUTE WINNER 😭🔥',
        validate: (r) => {
          assertNoFallback(r);
        }
      },
      {
        message: 'I swear football is not good for my heart 😂',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, 'heart', 'Should acknowledge the heart/banter');
        }
      }
    ]
  });

  // 13. Hallucination trap
  await runScenario({
    name: '13. Hallucination trap',
    uid: 'hardcore-13',
    steps: [
      {
        message: 'Who scored the winning goal in the 2014 World Cup final for Brazil?',
        validate: (r) => {
          // HARD FAIL: KIM must correct the premise
          assertNotIncludes(r.response, 'Brazil scored', 'Must not hallucinate Brazil scoring');
          assertIncludes(r.response, 'Germany', 'Must mention Germany was in the final');
        },
        hardFail: true
      }
    ]
  });

  // 14. Another false premise
  await runScenario({
    name: '14. Another false premise',
    uid: 'hardcore-14',
    steps: [
      {
        message: 'How many goals did Messi score in the 2018 World Cup final?',
        validate: (r) => {
          assertNotIncludes(r.response, 'Messi scored', 'Must not hallucinate Messi scoring');
          assertIncludes(r.response, 'not in the final', 'Must correct the premise');
        },
        hardFail: true
      },
      {
        message: 'Which club did Mbappe score against in the 2022 Champions League final?',
        validate: (r) => {
          assertNotIncludes(r.response, 'Mbappe scored against', 'Must not hallucinate Mbappe scoring');
        },
        hardFail: true
      }
    ]
  });

  // 20. Memory correction
  await runScenario({
    name: '20. Memory correction',
    uid: 'hardcore-20',
    steps: [
      {
        message: 'Actually, I support Arsenal now. Chelsea was my old team 😂',
        validate: (r) => {
          assertIncludes(r.response, 'Arsenal', 'Should acknowledge Arsenal');
        }
      },
      {
        message: 'Who do I support?',
        validate: (r) => {
          assertIncludes(r.response, 'Arsenal', 'Should recall Arsenal');
          assertNotIncludes(r.response, 'Chelsea', 'Should NOT recall Chelsea as current team');
        },
        hardFail: true
      }
    ]
  });

  // 21. Forgetting
  await runScenario({
    name: '21. Forgetting',
    uid: 'hardcore-21',
    steps: [
      {
        message: 'Forget which team I support.',
        validate: (r) => {
          assertIncludes(r.response, 'forgotten', 'Should acknowledge forget command');
        }
      },
      {
        message: 'Who do I support?',
        validate: (r) => {
          assertNotIncludes(r.response, 'Arsenal', 'Must NOT return Arsenal from stale memory');
          assertNotIncludes(r.response, 'Chelsea', 'Must NOT return Chelsea from stale memory');
        },
        hardFail: true
      }
    ]
  });

  // 23. The brutal "why?"
  await runScenario({
    name: '23. The brutal "why?"',
    uid: 'hardcore-23',
    steps: [
      {
        message: 'Why?',
        validate: (r) => {
          // KIM has no context here (new user). It must ask for clarification, not invent context.
          assertNoFallback(r);
          assertIncludes(r.response, 'what', 'Should ask what the user is referring to');
        }
      }
    ]
  });

  // 24. Context switching
  await runScenario({
    name: '24. Context switching',
    uid: 'hardcore-24',
    steps: [
      {
        message: 'Who won the 2014 World Cup?',
        validate: (r) => {
          assertIncludes(r.response, 'Germany', 'Should say Germany');
        }
      },
      {
        message: 'Anyway, what\'s Arsenal\'s current form?',
        validate: (r) => {
          assertNoFallback(r);
          assertIncludes(r.response, 'Arsenal', 'Should acknowledge Arsenal');
        }
      },
      {
        message: 'Back to 2014 — who scored in the final?',
        validate: (r) => {
          assertNoFallback(r);
          // Should ideally talk about Germany/Argentina, not Arsenal
          assertNotIncludes(r.response, 'Arsenal', 'Should not mix Arsenal context into 2014 WC final');
        }
      }
    ]
  });

  /* ---------------------------------------------------------
     FINAL REPORT
  --------------------------------------------------------- */
  console.log('\n============================================================');
  console.log(' HARDCORE GAUNTLET RESULTS');
  console.log('============================================================');
  console.log(`Total Steps: ${totalSteps}`);
  console.log(`Passed:      ${passedSteps}`);
  console.log(`Failed:      ${totalSteps - passedSteps}`);
  console.log(`Hard Fails:  ${hardFails}`);
  
  if (totalSteps - passedSteps === 0 && hardFails === 0) {
    console.log('\n🟢 KIM CONVERSATIONAL STATUS: BULLETPROOF');
  } else {
    console.log('\n🟡 KIM CONVERSATIONAL STATUS: NEEDS REFINEMENT');
    
    console.log('\n--- Failures ---');
    failureLog.forEach((f, i) => {
      console.log(`${i + 1}. [${f.scenario}] "${f.msg}"`);
      console.log(`   -> ${f.error}`);
    });
  }
  console.log('============================================================\n');

})();