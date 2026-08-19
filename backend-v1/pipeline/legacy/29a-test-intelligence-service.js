'use strict';

// Corrected path assuming services are in backend-v1/src/services/
const intelligence = require('../../src/services/FootballIntelligenceService');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 29A (STRICT)');
  console.log(' INTELLIGENCE SERVICE VALIDATION');
  console.log('============================================================\n');

  intelligence.load();

  // 1. Find a valid H2H pair and a date to test against
  const h2hKeys = Object.keys(intelligence.h2hIndex);
  let testPair, testBeforeDate;

  for (const key of h2hKeys) {
    const matches = intelligence.h2hIndex[key];
    if (matches.length >= 10) {
      testPair = key.split('|');
      // Pick a date exactly in the middle of the historical timeline
      const midIndex = Math.floor(matches.length / 2);
      testBeforeDate = matches[midIndex].date;
      break;
    }
  }

  if (!testPair) {
    console.error('❌ Could not find a valid H2H pair with >= 10 matches.');
    process.exit(1);
  }

  const [teamA, teamB] = testPair;
  console.log(`> Testing with Entities: ${teamA} vs ${teamB}`);
  console.log(`> Date Cutoff (BeforeDate): ${testBeforeDate}\n`);

  let passCount = 0;
  let failCount = 0;

  function assert(name, condition) {
    if (condition) {
      passCount++;
      console.log(`  ✅ PASS: ${name}`);
    } else {
      failCount++;
      console.log(`  ❌ FAIL: ${name}`);
    }
  }

  // --- Test 1: Standard Queries & Limits ---
  console.log('\n--- Test 1: Standard Queries & Limits ---');
  const last5 = intelligence.getLastMatches(teamA, 5);
  assert('Limit enforcement (5)', last5.length <= 5);
  
  const dates = last5.map(m => m.date);
  assert('Chronological ordering', dates.every((d, i) => i === 0 || dates[i-1] <= d));

  // --- Test 2: Date-Aware Queries (No Future Leakage) ---
  console.log('\n--- Test 2: Date-Aware Queries (BeforeDate) ---');
  const last5Before = intelligence.getLastMatchesBefore(teamA, testBeforeDate, 5);
  const beforeDates = last5Before.map(m => m.date);
  assert('All matches are strictly before BeforeDate', beforeDates.every(d => d < testBeforeDate));
  assert('Cutoff match itself is excluded', !beforeDates.includes(testBeforeDate));
  assert('BeforeDate limit enforcement', last5Before.length <= 5);

  const h2hBefore = intelligence.getH2HBefore(teamA, teamB, testBeforeDate, 10);
  const h2hBeforeDates = h2hBefore.map(m => m.date);
  assert('H2H BeforeDate no future leakage', h2hBeforeDates.every(d => d < testBeforeDate));

  // --- Test 3: Defensive Form Calculation & Score Integrity ---
  console.log('\n--- Test 3: Defensive Form Calculation & Score Integrity ---');
  
  // Check score integrity on ALL returned matches (not just the slice)
  const allReturnedMatches = [...last5, ...last5Before, ...h2hBefore];
  let scoresAreValid = true;
  for (const m of allReturnedMatches) {
    if (!Number.isFinite(Number(m.home_score)) || !Number.isFinite(Number(m.away_score))) {
      scoresAreValid = false;
      break;
    }
  }
  assert('All returned scores are finite numbers', scoresAreValid);

  const formBefore = intelligence.getTeamFormBefore(teamA, testBeforeDate, 5);
  assert('Form math (W+D+L = Matches)', formBefore.wins + formBefore.draws + formBefore.losses === formBefore.matches);
  assert('Form string length', formBefore.formString.length === formBefore.matches);
  
  // Check for NaN propagation
  const hasNaN = isNaN(formBefore.goalsFor) || isNaN(formBefore.goalsAgainst);
  assert('No NaN in goal calculations', !hasNaN);

  // --- Test 4: Home/Away Filters ---
  console.log('\n--- Test 4: Home/Away Filters ---');
  const homeMatches = intelligence.getLastHomeMatchesBefore(teamA, testBeforeDate, 5);
  assert('Home filter correctness', homeMatches.every(m => m.home_club_id === teamA));

  const awayMatches = intelligence.getLastAwayMatchesBefore(teamA, testBeforeDate, 5);
  assert('Away filter correctness', awayMatches.every(m => m.away_club_id === teamA));

  // --- Test 5: Edge Cases ---
  console.log('\n--- Test 5: Edge Cases ---');
  const missingTeam = intelligence.getLastMatches('FAKE_ID_999', 5);
  assert('Missing team returns empty array', missingTeam.length === 0);

  const missingH2H = intelligence.getH2H('FAKE_A', 'FAKE_B', 5);
  assert('Missing H2H returns empty array', missingH2H.length === 0);

  console.log('\n============================================================');
  console.log(' STEP 29A VALIDATION COMPLETE');
  console.log('============================================================');
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  if (failCount === 0) {
    console.log('✅ Intelligence Service is robust and ready for Step 30.');
  } else {
    console.log('❌ Validation failed. Review assertions above.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});