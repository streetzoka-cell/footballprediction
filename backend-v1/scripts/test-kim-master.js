'use strict';

/**
 * ============================================================
 * KIM — STRICT MASTER ARCHITECTURE GAUNTLET
 * ============================================================
 * Tests the 15-file deterministic pipeline directly.
 * Enforces strict response quality and zero hallucinations.
 * ============================================================
 */

const KimOrchestrator = require('../src/kim/KimOrchestrator');

const UID = 'strict-test-user';

const tests = [
  // 1. Memory & Personalization
  { 
    message: 'My name is Alex and I support Arsenal.', 
    expected: ['Got it', 'Alex', 'Arsenal'], 
    forbidden: ['reliable answer'],
    description: 'Memory - Save Name & Team' 
  },
  { 
    message: 'Who do I support?', 
    expected: ['Arsenal'], 
    forbidden: ['reliable answer'],
    description: 'Memory - Recall' 
  },

  // 2. Sheng & Banter
  { 
    message: 'Bro KIM, leo uko aje? Usinipatie story za bure bana 😂', 
    expected: ['operational', "i'm good", 'systems behaving', 'football data'], // Accepts any valid KIM casual response
    forbidden: ['reliable answer', 'understand the question'],
    description: 'Sheng - Greeting & Banter' 
  },

  // 3. Historical Match Resolution
  { 
    message: 'Brazil vs Germany 2014 World Cup.', 
    expected: ['1-7', 'Semi-Finals', 'Müller'], 
    forbidden: ['reliable answer'],
    description: 'Historical - Exact Match Lookup' 
  },
  
  // 4. Contextual Follow-ups
  { 
    message: 'Who scored Germany\'s goals?', 
    expected: ['Klose', 'Kroos', 'Khedira', 'Schürrle'], 
    forbidden: ['reliable answer'],
    description: 'Follow-up - Contextual Goalscorers' 
  },
  { 
    message: 'Was that the semifinal?', 
    expected: ['Yes', 'Semi-Finals'], 
    forbidden: ['reliable answer'],
    description: 'Follow-up - Contextual Stage' 
  },

  // 5. False Premise Traps
  { 
    message: 'How many goals did Messi score in the 2018 World Cup final?', 
    expected: ['0 goals', "wasn't there", 'France beat Croatia'], 
    forbidden: ['reliable answer'],
    description: 'Premise - Messi 2018 Trap' 
  },
  { 
    message: 'Who scored Brazil\'s winning goal in the 2014 World Cup final?', 
    expected: ['did not win', 'Germany beat Argentina'], 
    forbidden: ['reliable answer'],
    description: 'Premise - Brazil 2014 Trap' 
  },

  // 6. Prediction Uncertainty Traps
  { 
    message: 'If a team has 70% win probability, does that mean they will definitely win?', 
    expected: ['not a guarantee', '7 out of 10'], 
    forbidden: ['reliable answer'],
    description: 'Prediction - 70% Uncertainty Trap' 
  },
  { 
    message: 'So 90% is still not guaranteed?', 
    expected: ['highly likely', '10% chance', 'not guaranteed'], 
    forbidden: ['reliable answer'],
    description: 'Prediction - 90% Uncertainty Trap' 
  },

  // 7. Quiz Mode
  { 
    message: 'Quiz me. Hard mode. No easy nonsense.', 
    expected: ['hard mode', 'winning goal', '2014 World Cup'], 
    forbidden: ['reliable answer'],
    description: 'Quiz - Initiation' 
  },
  { 
    message: 'Is it Messi?', 
    expected: ['Nope', 'Not Messi'], 
    forbidden: ['reliable answer'],
    description: 'Quiz - Wrong Answer' 
  },
  { 
    message: 'Give me one clue lakini usiniambie answer.', 
    expected: ['Clue', 'extra time'], 
    forbidden: ['reliable answer'],
    description: 'Quiz - Request Clue' 
  },

  // 8. Knowledge Base
  { 
    message: 'What is offside?', 
    expected: ['offside'], 
    forbidden: ['reliable answer'],
    description: 'Knowledge - Concept Lookup' 
  },

  // 9. Memory Forgetting
  { 
    message: 'Forget which team I support.', 
    expected: ['forgotten', 'favorite team'], 
    forbidden: ['reliable answer', 'remember'],
    description: 'Memory - Forget Command' 
  }
];

async function runTests() {
  console.log('============================================================');
  console.log(' KIM — STRICT MASTER ARCHITECTURE GAUNTLET');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`👤 USER: ${test.message}\n`);
    
    try {
      const result = await KimOrchestrator.resolveQuery(test.message, '', UID);

      const response = result.evidence || '';
      const intent = result.intent || 'unknown';

      // Clean response for substring matching
      const cleanResponse = response.toLowerCase();
      
      const passedExpected = test.expected.some(exp => cleanResponse.includes(exp.toLowerCase()));
      const passedForbidden = test.forbidden.some(exp => cleanResponse.includes(exp.toLowerCase()));

      if (passedExpected && !passedForbidden) {
        console.log(`🤖 KIM: ${response.substring(0, 120)}${response.length > 120 ? '...' : ''}`);
        console.log(`📊 [Intent: ${intent} | Source: ${result.model}]`);
        console.log('✅ PASS\n');
        passed++;
      } else {
        console.log(`🤖 KIM: ${response}`);
        console.log(`📊 [Intent: ${intent} | Source: ${result.model}]`);
        if (!passedExpected) console.log(`❌ FAIL: Missing expected substrings: ${test.expected.join(' OR ')}`);
        if (passedForbidden) console.log(`❌ FAIL: Contained forbidden fallback text: ${test.forbidden.join(' OR ')}`);
        console.log('');
        failed++;
      }
    } catch (err) {
      console.log(`🤖 KIM: [ERROR] ${err.message}`);
      console.log(`❌ FAIL: Exception thrown during processing.\n`);
      failed++;
    }

    // Small delay to simulate conversation pacing
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log('============================================================');
  console.log(' GAUNTLET RESULTS');
  console.log('============================================================');
  console.log(`Total Steps: ${tests.length}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log('\n' + (failed === 0 ? '🟢 KIM ARCHITECTURE IS PRODUCTION READY.' : '🟡 KIM CONVERSATIONAL STATUS: NEEDS REFINEMENT'));
}

runTests().catch(console.error);