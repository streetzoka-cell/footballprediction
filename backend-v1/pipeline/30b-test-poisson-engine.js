'use strict';

const intelligence = require('../src/services/FootballIntelligenceService');
const featureEngine = require('../src/services/FeatureEngine');
const poissonEngine = require('../src/services/PoissonPredictionEngine');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 30B (RIGOROUS)');
  console.log(' POISSON ENGINE VALIDATION');
  console.log('============================================================\n');

  intelligence.load();

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

  const isFiniteNum = (val) => Number.isFinite(Number(val));

  // --- TEST 1: Real Historical Match ---
  console.log('\n--- Test 1: Real Historical Match ---');
  const h2hKeys = Object.keys(intelligence.h2hIndex);
  let testMatch, testTeamA, testTeamB;

  for (const key of h2hKeys) {
    const matches = intelligence.h2hIndex[key];
    if (matches.length > 20) {
      const midMatch = matches[Math.floor(matches.length / 2)];
      const teamAMatches = intelligence._getMatches(midMatch.home_club_id);
      const teamBMatches = intelligence._getMatches(midMatch.away_club_id);
      if (teamAMatches.length > 20 && teamBMatches.length > 20) {
        testMatch = midMatch;
        testTeamA = midMatch.home_club_id;
        testTeamB = midMatch.away_club_id;
        break;
      }
    }
  }

  console.log(`> Generating prediction for: ${testMatch.home_team} vs ${testMatch.away_team}`);
  const features = featureEngine.generateFeatures(testTeamA, testTeamB, testMatch.date);
  const prediction = poissonEngine.predict(features);

  console.log('\n--- Prediction Payload ---');
  console.log(JSON.stringify(prediction, null, 2));

  // 1X2 Normalization
  const probSum = prediction.probabilities.homeWin + prediction.probabilities.draw + prediction.probabilities.awayWin;
  assert('1X2 Probabilities sum to 100% (±0.1%)', probSum > 99.9 && probSum < 100.1);

  // Over/Under Normalization
  const ouSum = prediction.probabilities.over2_5 + prediction.probabilities.under2_5;
  assert('Over/Under 2.5 sums to 100% (±0.1%)', ouSum > 99.9 && ouSum < 100.1);

  // BTTS Normalization
  const bttsSum = prediction.probabilities.btts + prediction.probabilities.bttsNo;
  assert('BTTS Yes/No sums to 100% (±0.1%)', bttsSum > 99.9 && bttsSum < 100.1);

  // Expected Goals Bounds
  assert('Expected Home Goals > 0 and <= 5', prediction.expectedGoals.home > 0 && prediction.expectedGoals.home <= 5);
  assert('Expected Away Goals > 0 and <= 5', prediction.expectedGoals.away > 0 && prediction.expectedGoals.away <= 5);

  // Fair Odds Math
  const homeOddsCheck = 100 / prediction.probabilities.homeWin;
  assert('Fair Odds math is correct', Math.abs(homeOddsCheck - prediction.fairOdds.homeWin) < 0.1);

  // All values finite
  const allVals = [
    ...Object.values(prediction.expectedGoals),
    ...Object.values(prediction.probabilities),
    ...Object.values(prediction.fairOdds)
  ];
  assert('All numeric outputs are finite (no NaN/Infinity)', allVals.every(isFiniteNum));


  // --- TEST 2: Zero-History Teams ---
  console.log('\n--- Test 2: Zero-History Teams ---');
  const zeroFeatures = {
    home: {
      homeAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 0 },
      overallAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 0 },
      form5: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, matches: 0, formString: '' }
    },
    away: {
      awayAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 0 },
      overallAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 0 },
      form5: { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, matches: 0, formString: '' }
    },
    h2h: { matches: 0 }
  };
  
  let zeroCrashed = false;
  let zeroPrediction;
  try {
    zeroPrediction = poissonEngine.predict(zeroFeatures);
  } catch (e) {
    zeroCrashed = true;
  }
  assert('Zero-history teams do not crash engine', !zeroCrashed);
  if (!zeroCrashed) {
    const zSum = zeroPrediction.probabilities.homeWin + zeroPrediction.probabilities.draw + zeroPrediction.probabilities.awayWin;
    assert('Zero-history 1X2 sums to 100%', zSum > 99.9 && zSum < 100.1);
  }


  // --- TEST 3: Extreme Values ---
  console.log('\n--- Test 3: Extreme Attacking/Defensive Values ---');
  const extremeFeatures = {
    home: {
      homeAvgs: { avgGoalsFor: 10, avgGoalsAgainst: 0 },
      overallAvgs: { avgGoalsFor: 10, avgGoalsAgainst: 0 },
      form5: { wins: 5, draws: 0, losses: 0, goalsFor: 50, goalsAgainst: 0, cleanSheets: 5, matches: 5, formString: 'WWWWW' }
    },
    away: {
      awayAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 10 },
      overallAvgs: { avgGoalsFor: 0, avgGoalsAgainst: 10 },
      form5: { wins: 0, draws: 0, losses: 5, goalsFor: 0, goalsAgainst: 50, cleanSheets: 0, matches: 5, formString: 'LLLLL' }
    },
    h2h: { matches: 0 }
  };

  let extremeCrashed = false;
  let extremePrediction;
  try {
    extremePrediction = poissonEngine.predict(extremeFeatures);
  } catch (e) {
    extremeCrashed = true;
  }
  assert('Extreme values do not crash engine', !extremeCrashed);
  if (!extremeCrashed) {
    assert('Extreme λH is clamped to 5.0', extremePrediction.expectedGoals.home === 5.0);
    assert('Extreme λA is clamped to 0.1', extremePrediction.expectedGoals.away === 0.1);
    const eSum = extremePrediction.probabilities.homeWin + extremePrediction.probabilities.draw + extremePrediction.probabilities.awayWin;
    assert('Extreme 1X2 sums to 100%', eSum > 99.9 && eSum < 100.1);
  }

  // --- TEST 4: Deterministic Output ---
  console.log('\n--- Test 4: Deterministic Output ---');
  const prediction2 = poissonEngine.predict(features);
  const isDeterministic = JSON.stringify(prediction) === JSON.stringify(prediction2);
  assert('Engine produces deterministic output', isDeterministic);

  console.log('\n============================================================');
  console.log(' STEP 30B VALIDATION COMPLETE');
  console.log('============================================================');
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  if (failCount === 0) {
    console.log('✅ Poisson Engine is robust and ready for Backtesting (Step 30C).');
  } else {
    console.log('❌ Validation failed. Review assertions above.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});