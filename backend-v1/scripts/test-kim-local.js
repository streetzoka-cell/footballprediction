const kimEngine = require('../src/services/KimLocalEngine');

const testSuite = [
  // --- World Cup History (Phase 2) ---
  { query: "Who won the 2014 World Cup?", expected: "Germany" },
  { query: "Who hosted the 2018 World Cup?", expected: "Russia" },
  { query: "Who won the first World Cup?", expected: "Uruguay" },
  { query: "What was the 2022 World Cup final score?", expected: "3 - 3" },
  { query: "Who has won the World Cup most?", expected: "Brazil" },
  { query: "How many teams played in the 1998 World Cup?", expected: "32" },
  { query: "How many matches were played in 2022?", expected: "64" },
  
  // --- Tactics & Formations (Phase 1) ---
  { query: "What is gegenpressing?", expected: "win the ball back" },
  { query: "Explain a false 9", expected: "striker" },
  { query: "What are the weaknesses of a low block?", expected: "territorial control" },
  { query: "4-3-3 vs 4-4-2", expected: "Tactical Comparison" },
  { query: "What is build-up play?", expected: "defensive third" },
  { query: "What does PPDA mean?", expected: "Passes Per Defensive Action" },
  
  // --- IFAB Laws (Phase 1) ---
  { query: "Can a goal be scored directly from a corner kick?", expected: "score directly" },
  { query: "What is the minimum number of players required?", expected: "seven" },
  { query: "If the ball bursts during a penalty kick, what happens?", expected: "retaken" },
  { query: "What is the offside rule?", expected: "second-last opponent" },
  { query: "Can a player tape over their wedding ring?", expected: "No" }
];

async function runTests() {
  console.log('🧠 Starting Kim Local Master Test Suite...\n');
  let passed = 0;
  let failed = 0;

  for (const test of testSuite) {
    const result = await kimEngine.resolveQuery(test.query);
    
    const isLocal = result.status === "ANSWERED_LOCALLY";
    const hasExpected = result.evidence.toLowerCase().includes(test.expected.toLowerCase());
    
    if (isLocal && hasExpected) {
      console.log(`✅ PASSED | "${test.query}"`);
      passed++;
    } else {
      console.log(`❌ FAILED | "${test.query}"`);
      console.log(`   -> Status: ${result.status} | Expected: "${test.expected}"`);
      if (!isLocal) console.log('   -> Reason: Did not answer locally (would hit Gemini).');
      if (!hasExpected) console.log(`   -> Reason: Evidence did not contain expected concept. Evidence: ${result.evidence.substring(0, 100)}...`);
      failed++;
    }
  }

  console.log(`\n=== FINAL RESULTS ===`);
  console.log(`Total Tests: ${testSuite.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed === 0) {
    console.log('\n🏆 PERFECT SCORE! Kim is a flawless local football genius.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the routing logic or JSON data.');
  }
}

runTests().catch(console.error);