'use strict';

const KimOrchestrator = require('../src/kim/KimOrchestrator');

const UID = 'kim-v2-integration-test';

const tests = [
  // Team Analysis
  { message: 'Tell me about Arsenal', expected: ['Arsenal', 'Matches:', 'Wins:'], description: 'Team Analysis (Arsenal)' },
  { message: 'How many matches has Arsenal played?', expected: ['Matches:'], description: 'Team Stat Query (Arsenal)' },
  
  // Seasonal Stats
  { message: 'How did Arsenal perform in 2023?', expected: ['2023', 'Matches:', 'Wins:'], description: 'Seasonal Stats (Arsenal 2023)' },
  
  // H2H
  { message: "What's the H2H between Arsenal and Liverpool?", expected: ['Head-to-Head', 'Total Matches:', 'Wins:'], description: 'H2H Query (Arsenal vs Liverpool)' },
  
  // Player Analysis
  { message: 'How many goals did Miroslav Klose score?', expected: ['Miroslav Klose', 'Total Goals:', 'Matches Scored In:'], description: 'Player Stats (Klose)' },
  { message: 'Tell me about René Adler', expected: ['René Adler', 'Total Goals: 0'], description: 'Zero-Goal Player (Adler)' },
  
  // Negative/Hallucination Trap
  { message: 'Who won the 2018 World Cup final for Argentina?', expected: ['Messi did not play', 'eliminated by France'], description: 'Premise Correction Trap' },
];

async function runTests() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 14: KIM KNOWLEDGE INTEGRATION');
  console.log('============================================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`👤 USER: ${test.message}\n`);
    try {
      const result = await KimOrchestrator.resolveQuery(test.message, '', UID);
      
      // Safely extract the answer string
      const answer = String(result?.evidence ?? result?.response ?? '');
      const answerLower = answer.toLowerCase();
      
      const passedAssertions = test.expected.every(exp => answerLower.includes(exp.toLowerCase()));

      if (passedAssertions) {
        console.log(`🤖 KIM: ${answer.substring(0, 150)}...`);
        console.log(`   Intent: ${result?.intent || 'unknown'}`);
        console.log(`   Confidence: ${result?.confidence ?? 'unknown'}`);
        console.log(`✅ PASS: ${test.description}\n`);
        passed++;
      } else {
        console.log(`🤖 KIM: ${answer}`);
        console.log(`   Intent: ${result?.intent || 'unknown'}`);
        console.log(`❌ FAIL: ${test.description} - Missing: ${test.expected.join(', ')}\n`);
        failed++;
      }
    } catch (err) {
      console.log(`🤖 KIM: [ERROR] ${err.message}`);
      console.log(`❌ FAIL: ${test.description}\n`);
      failed++;
    }
  }

  console.log('============================================================');
  console.log(' STEP 14 COMPLETE');
  console.log('============================================================');
  console.log(`📊 Tests Passed: ${passed}`);
  console.log(`❌ Tests Failed: ${failed}`);

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);