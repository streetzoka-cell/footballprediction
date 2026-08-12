'use strict';

/**
 * ============================================================
 * KIM — ADVERSARIAL CONVERSATIONAL TEST SUITE
 * ============================================================
 * Tests multi-turn context, slang, emotional reactions, 
 * memory corrections, and human-like conversational flow.
 * ============================================================
 */

const kim = require('../src/kim/KimOrchestrator');

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(text, value, message) {
  assert(String(text).toLowerCase().includes(value.toLowerCase()), message || `Expected output to contain: "${value}"`);
}

function assertNotIncludes(text, value, message) {
  assert(!String(text).toLowerCase().includes(value.toLowerCase()), message || `Expected output NOT to contain: "${value}"`);
}

async function runScenario(scenario) {
  console.log(`\n--- Scenario: ${scenario.name} ---`);
  
  for (const step of scenario.steps) {
    console.log(`\n👤 USER: ${step.message}`);
    
    let response;
    try {
      response = await kim.process({ uid: scenario.uid, message: step.message });
    } catch (e) {
      response = { response: `CRASH: ${e.message}`, intent: 'error' };
    }

    console.log(`🤖 KIM: ${response.response}`);
    console.log(`📊 [Intent: ${response.intent} | Source: ${response.source}]`);

    try {
      step.validate(response);
      console.log('✅ PASS');
      passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${error.message}`);
      failed++;
    }
  }
}

(async () => {
  console.log('============================================================');
  console.log(' KIM — ADVERSARIAL CONVERSATIONAL TEST SUITE');
  console.log('============================================================');

  /* ---------------------------------------------------------
     SCENARIO 1: Match Resolution & Context Drift
     Testing if KIM can find the 7-1 match and handle follow-ups
  --------------------------------------------------------- */
  await runScenario({
    name: 'Match Resolution & Follow-ups',
    uid: 'adversarial-1',
    steps: [
      {
        message: 'what was the score of Brazil vs Germany in the 2014 World Cup?',
        validate: (r) => {
          assertIncludes(r.response, '1 - 7', 'Should contain the exact 1-7 scoreline');
          assertIncludes(r.response, 'Germany', 'Should mention Germany');
        }
      },
      {
        message: 'who scored?',
        validate: (r) => {
          // KIM's match data might not have goalscorers. It should gracefully admit it or provide them if available.
          assert(r.response.length > 0, 'Should not crash on follow-up');
          assertNotIncludes(r.response, '[object Object]', 'Should not output raw objects');
        }
      },
      {
        message: 'what about the final?',
        validate: (r) => {
          // KIM should either look up the 2014 final or ask for clarification
          assert(r.intent === 'football_knowledge' || r.intent === 'match_result' || r.intent === 'general', 'Should attempt to resolve the final');
        }
      },
      {
        message: 'wait, I meant 2002',
        validate: (r) => {
          // KIM should understand the context drift to 2002 World Cup final
          assertIncludes(r.response, 'Brazil', 'Should mention Brazil for 2002 final');
          assertIncludes(r.response, 'Germany', 'Should mention Germany');
        }
      }
    ]
  });

  /* ---------------------------------------------------------
     SCENARIO 2: Slang, Challenges & Banter
     Testing if KIM speaks like a human, not a robot
  --------------------------------------------------------- */
  await runScenario({
    name: 'Slang & Banter',
    uid: 'adversarial-2',
    steps: [
      {
        message: 'bro who is better messi or ronaldo',
        validate: (r) => {
          assertNotIncludes(r.response, 'reliable answer', 'Should not use the generic fallback for a banter question');
          assertNotIncludes(r.response, 'invent football facts', 'Should not sound like a strict database machine');
        }
      },
      {
        message: 'nah that\'s cap 😂',
        validate: (r) => {
          assert(r.intent === 'casual' || r.intent === 'challenge', 'Should be classified as casual or challenge');
          assertNotIncludes(r.response, 'reliable answer', 'Should not fallback here either');
        }
      },
      {
        message: 'prove it',
        validate: (r) => {
          assertIncludes(r.response, 'numbers', 'Should accept the challenge and talk about numbers');
        }
      }
    ]
  });

  /* ---------------------------------------------------------
     SCENARIO 3: Memory Corrections & Forgetting
     Testing if KIM can update its memory and forget on command
  --------------------------------------------------------- */
  await runScenario({
    name: 'Memory Corrections',
    uid: 'adversarial-3',
    steps: [
      {
        message: 'My name is Kimutai',
        validate: (r) => {
          assertIncludes(r.response, 'Kimutai', 'Should acknowledge the name Kimutai');
        }
      },
      {
        message: 'I support Arsenal',
        validate: (r) => {
          assertIncludes(r.response, 'Arsenal', 'Should acknowledge Arsenal');
        }
      },
      {
        message: 'actually I support Chelsea',
        validate: (r) => {
          assertIncludes(r.response, 'Chelsea', 'Should acknowledge the update to Chelsea');
        }
      },
      {
        message: 'what do I support?',
        validate: (r) => {
          assertIncludes(r.response, 'Chelsea', 'Should recall Chelsea, not Arsenal');
          assertNotIncludes(r.response, 'Arsenal', 'Should not mention Arsenal anymore');
        }
      },
      {
        message: 'forget my team',
        validate: (r) => {
          // KIM should acknowledge the forget command
          assert(r.response.length > 0, 'Should respond to forget command');
        }
      },
      {
        message: 'what do I support?',
        validate: (r) => {
          // KIM should no longer know the team
          assertNotIncludes(r.response, 'Chelsea', 'Should not recall Chelsea after forgetting');
        }
      },
      {
        message: 'what\'s my name?',
        validate: (r) => {
          assertIncludes(r.response, 'Kimutai', 'Should still remember the name Kimutai');
        }
      }
    ]
  });

  /* ---------------------------------------------------------
     SCENARIO 4: Emotional & Vague Reactions
  --------------------------------------------------------- */
  await runScenario({
    name: 'Emotional & Vague Reactions',
    uid: 'adversarial-4',
    steps: [
      {
        message: 'I just watched an insane goal 😂',
        validate: (r) => {
          assert(r.intent === 'casual' || r.intent === 'emotional_conversation', 'Should be casual/emotional');
          assertNotIncludes(r.response, 'reliable answer', 'Should not fallback');
        }
      },
      {
        message: '💀',
        validate: (r) => {
          assert(r.intent === 'casual', 'Emoji should be casual');
          assertNotIncludes(r.response, 'reliable answer', 'Should not fallback for emoji');
        }
      }
    ]
  });

  /* ---------------------------------------------------------
     FINAL REPORT
  --------------------------------------------------------- */
  console.log('\n============================================================');
  console.log(' ADVERSARIAL TEST RESULTS');
  console.log('============================================================');
  console.log(`Total Steps: ${passed + failed}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  
  if (failed === 0) {
    console.log('\n🟢 KIM CONVERSATIONAL STATUS: HUMAN-LIKE');
  } else {
    console.log('\n🟡 KIM CONVERSATIONAL STATUS: NEEDS REFINEMENT');
  }
  console.log('============================================================\n');

})();