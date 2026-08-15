'use strict';

const KimOrchestrator = require('../src/kim/KimOrchestrator');

const UID = 'league-test-user';

const tests = [
  // 1. Premier League
  { 
    message: 'Who has won the most Premier League titles?', 
    expected: ['manchester united', 'man utd', 'united'], 
    forbidden: ['reliable answer'],
    description: 'Premier League - Historical Record' 
  },
  { 
    message: 'What is the Premier League?', 
    expected: ['top', 'english', 'football'], 
    forbidden: ['reliable answer'],
    description: 'Premier League - Concept' 
  },

  // 2. La Liga
  { 
    message: 'Who has won the most La Liga titles?', 
    expected: ['real madrid'], 
    forbidden: ['reliable answer'],
    description: 'La Liga - Historical Record' 
  },
  { 
    message: 'What is tiki taka?', 
    expected: ['possession', 'passing', 'barcelona'], 
    forbidden: ['reliable answer'],
    description: 'La Liga - Tactical Concept' 
  },

  // 3. Serie A
  { 
    message: 'Who has won the most Serie A titles?', 
    expected: ['juventus'], 
    forbidden: ['reliable answer'],
    description: 'Serie A - Historical Record' 
  },
  { 
    message: 'What is catenaccio?', 
    expected: ['defensive', 'tactical', 'italian'], 
    forbidden: ['reliable answer'],
    description: 'Serie A - Tactical Concept' 
  },

  // 4. Bundesliga
  { 
    message: 'Who has won the most Bundesliga titles?', 
    expected: ['bayern munich', 'bayern'], 
    forbidden: ['reliable answer'],
    description: 'Bundesliga - Historical Record' 
  },
  { 
    message: 'What is gegenpressing?', 
    expected: ['press', 'counter', 'german', 'klopp'], 
    forbidden: ['reliable answer'],
    description: 'Bundesliga - Tactical Concept' 
  },

  // 5. UEFA Champions League
  { 
    message: 'Who has won the most Champions League titles?', 
    expected: ['real madrid'], 
    forbidden: ['reliable answer'],
    description: 'UCL - Historical Record' 
  },
  { 
    message: 'What is the Champions League?', 
    expected: ['europe', 'uefa', 'club'], 
    forbidden: ['reliable answer'],
    description: 'UCL - Concept' 
  },

  // 6. FIFA World Cup
  { 
    message: 'Who has won the most World Cups?', 
    expected: ['brazil'], 
    forbidden: ['reliable answer'],
    description: 'World Cup - Historical Record' 
  },
  { 
    message: 'What is the World Cup?', 
    expected: ['fifa', 'international', 'global', 'tournament'], 
    forbidden: ['reliable answer'],
    description: 'World Cup - Concept' 
  },

  // 7. AFCON
  { 
    message: 'Who has won the most AFCON titles?', 
    expected: ['egypt'], 
    forbidden: ['reliable answer'],
    description: 'AFCON - Historical Record' 
  },
  { 
    message: 'What is AFCON?', 
    expected: ['africa', 'african', 'nations'], 
    forbidden: ['reliable answer'],
    description: 'AFCON - Concept' 
  },

  // 8. Zero-Hallucination Trap (Unknown League)
  { 
    message: 'Who won the ZOKA Super League in 2025?', 
    expected: ['don\'t have', 'reliable answer', 'don\'t have verified', 'invent'], 
    forbidden: ['real madrid', 'manchester city', 'bayern munich'],
    description: 'Zero-Hallucination - Fake Competition' 
  }
];

async function runTests() {
  console.log('============================================================');
  console.log(' KIM — MASTER MULTI-LEAGUE GAUNTLET');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`👤 USER: ${test.message}\n`);
    
    try {
      const result = await KimOrchestrator.resolveQuery(test.message, '', UID);

      const response = result.evidence || '';
      const intent = result.intent || 'unknown';

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
        if (passedForbidden) console.log(`❌ FAIL: Contained forbidden text: ${test.forbidden.join(' OR ')}`);
        console.log('');
        failed++;
      }
    } catch (err) {
      console.log(`🤖 KIM: [ERROR] ${err.message}`);
      console.log(`❌ FAIL: Exception thrown during processing.\n`);
      failed++;
    }

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