const kim = require('../src/kim/KimOrchestrator');

const tests = [
  // 1. MEMORY (Strict)
  { uid: 'strict-mem', message: 'I am bored.', expectIntent: 'casual', forbidden: ['memory_save', "I'll remember", 'reliable answer', 'football facts'] },
  { uid: 'strict-mem2', message: 'My name is Kevin and I support Chelsea.', expectIntent: 'memory_save', required: ["I'll remember"] },
  { uid: 'strict-mem2', message: 'Which team do I support?', expectIntent: 'memory_recall', required: ['Chelsea'], forbidden: ["I'll remember"] },
  
  // 2. HUMOR & CREATIVE (Strict)
  { uid: 'strict-fun', message: 'Tell me a football joke', expectIntent: 'humor', forbidden: ['reliable answer', 'football facts'] },
  { uid: 'strict-fun', message: 'Roast Arsenal 😂', expectIntent: 'humor', forbidden: ['reliable answer', 'enough reliable data'] },
  
  // 3. CASUAL (Strict)
  { uid: 'strict-conv', message: 'How are you doing?', expectIntent: 'casual', forbidden: ['statistical', 'signals', 'evidence'] },
  { uid: 'strict-conv2', message: 'Bro...', expectIntent: 'casual', forbidden: ['reliable answer', 'football facts'] },
  { uid: 'strict-conv3', message: '😂😂😂', expectIntent: 'casual', forbidden: ['reliable answer', 'football facts'] },
  
  // 4. IDENTITY (Strict)
  { uid: 'strict-id', message: 'Are you better than Google?', expectIntent: 'identity', forbidden: ['compare their numbers', 'team_comparison'] },
  
  // 5. MATCH DATA (Strict)
  { uid: 'strict-match', message: 'What was the score of Brazil vs Germany in the 2014 World Cup?', expectIntent: 'match_result', required: ['Brazil 1 - 7 Germany'] },
];

(async () => {
  console.log('============================================================');
  console.log('                 KIM STRICT QUALITY TEST                  ');
  console.log('============================================================');
  
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    console.log(`\n👤 USER: ${t.message}`);
    const r = await kim.process(t);
    
    let testPassed = true;
    const errors = [];

    // 1. Check Intent
    if (t.expectIntent && r.intent !== t.expectIntent) {
      testPassed = false;
      errors.push(`Intent expected "${t.expectIntent}" but got "${r.intent}"`);
    }

    // 2. Check Forbidden phrases
    if (t.forbidden) {
      for (const phrase of t.forbidden) {
        if (r.response.toLowerCase().includes(phrase.toLowerCase())) {
          testPassed = false;
          errors.push(`Forbidden phrase found: "${phrase}"`);
        }
      }
    }

    // 3. Check Required phrases
    if (t.required) {
      let foundRequired = false;
      for (const phrase of t.required) {
        if (r.response.toLowerCase().includes(phrase.toLowerCase())) {
          foundRequired = true;
          break;
        }
      }
      if (!foundRequired) {
        testPassed = false;
        errors.push(`Required phrase missing (expected one of: ${t.required.join(', ')})`);
      }
    }

    if (testPassed) {
      passed++;
      console.log('✅ PASS');
    } else {
      failed++;
      console.log('❌ FAIL');
      errors.forEach(e => console.log('   -', e));
    }
    
    console.log('🤖 KIM:', r.response);
    console.log('------------------------------------------------------------');
  }

  console.log('\n============================================================');
  console.log('                 STRICT TEST RESULTS                       ');
  console.log('============================================================');
  console.log(`Total: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('🟢 KIM QUALITY: PERFECT');
  } else {
    console.log('🟡 KIM QUALITY: NEEDS REFINEMENT');
  }
  console.log('============================================================\n');
})();