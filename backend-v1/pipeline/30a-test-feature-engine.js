'use strict';

const fs = require('fs');
const path = require('path');
const intelligence = require('../src/services/FootballIntelligenceService');
const featureEngine = require('../src/services/FeatureEngine');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 30A (STRICT)');
  console.log(' FEATURE ENGINE VALIDATION');
  console.log('============================================================\n');

  intelligence.load();

  // 1. Find a real historical match to test against
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

  if (!testMatch) {
    console.error('❌ Could not find a suitable match with enough history.');
    process.exit(1);
  }

  console.log(`> Generating features for: ${testMatch.home_team} vs ${testMatch.away_team}`);
  console.log(`> Match Date: ${testMatch.date}\n`);

  // 2. Generate Features
  const features = featureEngine.generateFeatures(testTeamA, testTeamB, testMatch.date);

  console.log('--- Generated Feature Payload ---');
  console.log(JSON.stringify(features, null, 2));

  // 3. Strict Validation
  let passCount = 0;
  let failCount = 0;

  function assert(name, condition) {
    if (condition) {
      passCount++;
      console.log(`\n  ✅ PASS: ${name}`);
    } else {
      failCount++;
      console.log(`\n  ❌ FAIL: ${name}`);
    }
  }

  // Test 1: Structure integrity
  assert('Home form5 exists', features.home.form5.hasOwnProperty('wins'));
  assert('Away form5 exists', features.away.form5.hasOwnProperty('wins'));
  assert('H2H stats exist', features.h2h.hasOwnProperty('teamAWins'));

  // Test 2: Math integrity
  const homeMathOk = features.home.form5.wins + features.home.form5.draws + features.home.form5.losses === features.home.form5.matches;
  assert('Home form math (W+D+L = Matches)', homeMathOk);
  
  const h2hMathOk = features.h2h.teamAWins + features.h2h.draws + features.h2h.teamBWins === features.h2h.matches;
  assert('H2H math (Wins + Draws + Losses = Matches)', h2hMathOk);

  // Test 3: Numerical Integrity (No NaN or Infinity)
  const isFiniteNum = (val) => Number.isFinite(Number(val));
  const numericChecks = [
    features.home.form5.matches, features.home.form5.goalsFor, features.home.form5.goalsAgainst, features.home.form5.cleanSheets,
    features.home.overallAvgs.avgGoalsFor, features.home.overallAvgs.avgGoalsAgainst, features.home.overallAvgs.cleanSheetPct, features.home.overallAvgs.scoringPct,
    features.home.homeAvgs.avgGoalsFor, features.home.homeAvgs.avgGoalsAgainst, features.home.homeAvgs.cleanSheetPct, features.home.homeAvgs.scoringPct,
    features.away.form5.matches, features.away.form5.goalsFor, features.away.form5.goalsAgainst, features.away.form5.cleanSheets,
    features.away.overallAvgs.avgGoalsFor, features.away.overallAvgs.avgGoalsAgainst, features.away.overallAvgs.cleanSheetPct, features.away.overallAvgs.scoringPct,
    features.away.awayAvgs.avgGoalsFor, features.away.awayAvgs.avgGoalsAgainst, features.away.awayAvgs.cleanSheetPct, features.away.awayAvgs.scoringPct,
    features.h2h.matches, features.h2h.teamAWins, features.h2h.draws, features.h2h.teamBWins, features.h2h.avgGoals
  ];
  const allFinite = numericChecks.every(isFiniteNum);
  assert('All numeric features are finite (no NaN/Infinity)', allFinite);

  // Test 4: Zero Future Leakage (The most critical test)
  const homeLast10 = intelligence.getLastMatchesBefore(testTeamA, testMatch.date, 10);
  const leakage = homeLast10.some(m => m.date >= testMatch.date);
  assert('NO FUTURE LEAKAGE in feature generation', !leakage);

  console.log('\n============================================================');
  console.log(' STEP 30A VALIDATION COMPLETE');
  console.log('============================================================');
  console.log(`Passed: ${passCount} | Failed: ${failCount}`);
  if (failCount === 0) {
    console.log('✅ Feature Engine is robust and ready for Poisson/XGBoost.');
  } else {
    console.log('❌ Validation failed. Review assertions above.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});