'use strict';

const intelligence = require('../../src/services/FootballIntelligenceService');
const featureEngine = require('../../src/services/FeatureEngine');
const poissonEngine = require('../../src/services/PoissonPredictionEngine');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 30C (FULL)');
  console.log(' OFFICIAL HISTORICAL BASELINE BACKTEST');
  console.log('============================================================\n');

  intelligence.load();

  console.log('> Flattening historical matches...');
  const allMatches = [];
  const seenIds = new Set();
  const matchIdCounts = new Map(); // To detect collisions

  for (const [teamId, matches] of Object.entries(intelligence.teamIndex)) {
    for (const m of matches) {
      matchIdCounts.set(m.match_id, (matchIdCounts.get(m.match_id) || 0) + 1);
      if (!seenIds.has(m.match_id)) {
        seenIds.add(m.match_id);
        allMatches.push(m);
      }
    }
  }
  
  allMatches.sort((a, b) => a.date.localeCompare(b.date));
  
  // Count how many IDs appear more than twice (Home + Away = 2 is normal)
  let collisionCount = 0;
  for (const [id, count] of matchIdCounts.entries()) {
    if (count > 2) collisionCount++;
  }

  console.log(`   Total unique matches in timeline: ${allMatches.length.toLocaleString()}`);
  console.log(`   Match ID collisions detected    : ${collisionCount.toLocaleString()} (IDs appearing > 2 times)`);
  console.log(`> Starting FULL walk-forward backtest...\n`);

  let evaluated = 0;
  let skipped = 0;
  
  let correct1x2 = 0;
  let logLoss1x2 = 0;
  let brier1x2 = 0;
  
  let correctOU = 0;
  let logLossOU = 0;
  
  let correctBtts = 0;
  let logLossBtts = 0;

  const startTime = Date.now();

  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    
    if ((i + 1) % 25000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const progress = ((i / allMatches.length) * 100).toFixed(1);
      process.stdout.write(`\r   Processed ${i.toLocaleString()}/${allMatches.length.toLocaleString()} (${progress}%) - ${elapsed}s...`);
    }

    const homeId = m.home_club_id;
    const awayId = m.away_club_id;
    const date = m.date;
    
    const hs = Number(m.home_score);
    const as = Number(m.away_score);

    if (!homeId || !awayId || isNaN(hs) || isNaN(as)) {
      skipped++;
      continue;
    }

    try {
      const features = featureEngine.generateFeatures(homeId, awayId, date);
      const pred = poissonEngine.predict(features);
      
      // --- Evaluate 1X2 ---
      let actualOutcome = 'Draw';
      if (hs > as) actualOutcome = 'Home';
      else if (hs < as) actualOutcome = 'Away';
      
      const pHome = pred.probabilities.homeWin / 100;
      const pDraw = pred.probabilities.draw / 100;
      const pAway = pred.probabilities.awayWin / 100;
      
      const predOutcome = Math.max(pHome, pDraw, pAway) === pHome ? 'Home' :
                          Math.max(pHome, pDraw, pAway) === pAway ? 'Away' : 'Draw';
                          
      if (predOutcome === actualOutcome) correct1x2++;
      
      const eps = 1e-15;
      const actualPH = actualOutcome === 'Home' ? pHome : 0;
      const actualPD = actualOutcome === 'Draw' ? pDraw : 0;
      const actualPA = actualOutcome === 'Away' ? pAway : 0;
      logLoss1x2 += -Math.log(Math.max(actualPH + actualPD + actualPA, eps));
      
      const yHome = actualOutcome === 'Home' ? 1 : 0;
      const yDraw = actualOutcome === 'Draw' ? 1 : 0;
      const yAway = actualOutcome === 'Away' ? 1 : 0;
      brier1x2 += Math.pow(pHome - yHome, 2) + Math.pow(pDraw - yDraw, 2) + Math.pow(pAway - yAway, 2);

      // --- Evaluate Over/Under 2.5 ---
      const totalGoals = hs + as;
      const actualOver = totalGoals > 2.5;
      const predOver = pred.probabilities.over2_5 >= 50;
      
      if (predOver === actualOver) correctOU++;
      
      // Strictly clean O/U Log Loss calculation
      logLossOU += actualOver 
        ? -Math.log(Math.max(pred.probabilities.over2_5 / 100, eps)) 
        : -Math.log(Math.max(pred.probabilities.under2_5 / 100, eps));

      // --- Evaluate BTTS ---
      const actualBtts = hs > 0 && as > 0;
      const predBtts = pred.probabilities.btts >= 50;
      
      if (predBtts === actualBtts) correctBtts++;
      logLossBtts += actualBtts 
        ? -Math.log(Math.max(pred.probabilities.btts / 100, eps)) 
        : -Math.log(Math.max(pred.probabilities.bttsNo / 100, eps));

      evaluated++;
    } catch (err) {
      skipped++;
    }
  }

  const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n\n> Full Backtest complete in ${elapsedTotal}s`);
  console.log(`   Evaluated: ${evaluated.toLocaleString()} | Skipped: ${skipped.toLocaleString()}\n`);

  const acc1x2 = (correct1x2 / evaluated) * 100;
  const ll1x2 = logLoss1x2 / evaluated;
  const bs1x2 = brier1x2 / evaluated;
  
  const accOU = (correctOU / evaluated) * 100;
  const llOU = logLossOU / evaluated;
  
  const accBtts = (correctBtts / evaluated) * 100;
  const llBtts = logLossBtts / evaluated;

  console.log('============================================================');
  console.log(' OFFICIAL BACKTEST RESULTS (POISSON BASELINE)');
  console.log('============================================================');
  
  console.log('\n--- 1X2 Market ---');
  console.log(`Accuracy     : ${acc1x2.toFixed(2)}%`);
  console.log(`Log Loss     : ${ll1x2.toFixed(4)} (Lower is better)`);
  console.log(`Brier Score  : ${bs1x2.toFixed(4)} (Lower is better)`);

  console.log('\n--- Over/Under 2.5 Market ---');
  console.log(`Accuracy     : ${accOU.toFixed(2)}%`);
  console.log(`Log Loss     : ${llOU.toFixed(4)} (Lower is better)`);

  console.log('\n--- BTTS Market ---');
  console.log(`Accuracy     : ${accBtts.toFixed(2)}%`);
  console.log(`Log Loss     : ${llBtts.toFixed(4)} (Lower is better)`);

  console.log('\n============================================================');
  console.log(' STEP 30C (FULL) COMPLETE');
  console.log('============================================================');
  console.log('This establishes the official historical Poisson baseline.');
  console.log('Future models must be evaluated against this baseline using the same walk-forward methodology.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});