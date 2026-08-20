// backend-v1/pipeline/46-build-market-targets.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const FEATURES_FILE = path.join(ROOT, 'data', 'ml', 'features_elo.csv');
const MASTER_FILE = path.join(ROOT, 'data', 'processed', 'master_with_elo.csv');
const OUTPUT_FILE = path.join(ROOT, 'data', 'ml', 'features_v4_unified.csv');
const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';

async function loadMasterGoals() {
  console.log('   ↳ Loading goals from Master CSV into memory...');
  const goalsMap = new Map();
  return new Promise((resolve, reject) => {
    fs.createReadStream(MASTER_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const matchId = String(row.zokascore_match_id || '').trim();
        if (matchId) {
          goalsMap.set(matchId, {
            home_goals: parseInt(row.home_score, 10) || 0,
            away_goals: parseInt(row.away_score, 10) || 0
          });
        }
      })
      .on('end', () => {
        console.log(`   ↳ Loaded ${goalsMap.size} goals from Master.`);
        resolve(goalsMap);
      })
      .on('error', reject);
  });
}

async function processStream(goalsMap) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(TEMP_OUTPUT_FILE, { encoding: 'utf8' });
    // Carry over existing columns + add goal/market columns
    writeStream.write('match_id,date,home_team_id,away_team_id,home_elo_pre,away_elo_pre,elo_diff,target,home_goals,away_goals,total_goals,ou_0_5,ou_1_5,ou_2_5,ou_3_5,btts\n');

    let rowCount = 0;
    let missingGoals = 0;

    fs.createReadStream(FEATURES_FILE)
      .pipe(csv())
      .on('data', (row) => {
        const matchId = String(row.match_id || '').trim();
        const goals = goalsMap.get(matchId);
        
        if (!goals) {
          missingGoals++;
          return; // Skip if we don't have goal data for this match
        }

        const totalGoals = goals.home_goals + goals.away_goals;
        
        const ou_0_5 = totalGoals > 0.5 ? 'OVER' : 'UNDER';
        const ou_1_5 = totalGoals > 1.5 ? 'OVER' : 'UNDER';
        const ou_2_5 = totalGoals > 2.5 ? 'OVER' : 'UNDER';
        const ou_3_5 = totalGoals > 3.5 ? 'OVER' : 'UNDER';
        const btts = (goals.home_goals > 0 && goals.away_goals > 0) ? 'YES' : 'NO';

        const outputRow = [
          row.match_id, row.date, row.home_team_id, row.away_team_id,
          row.home_elo_pre, row.away_elo_pre, row.elo_diff, row.target,
          goals.home_goals, goals.away_goals, totalGoals,
          ou_0_5, ou_1_5, ou_2_5, ou_3_5, btts
        ].join(',');
        
        writeStream.write(outputRow + '\n');
        rowCount++;
      })
      .on('end', () => {
        writeStream.end(() => {
          resolve({ rowCount, missingGoals });
        });
      })
      .on('error', reject);
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 46: BUILD MARKET TARGETS (MEMORY SAFE)');
  console.log('============================================================\n');

  if (!fs.existsSync(FEATURES_FILE)) {
    throw new Error(`Features file not found: ${FEATURES_FILE}. Run Step 33 first.`);
  }

  console.log('[1/2] Loading Master Goals...');
  const goalsMap = await loadMasterGoals();

  console.log('[2/2] Streaming features and engineering market targets...');
  const stats = await processStream(goalsMap);

  fs.renameSync(TEMP_OUTPUT_FILE, OUTPUT_FILE);

  console.log('\n============================================================');
  console.log(' STEP 46 COMPLETE: PASS');
  console.log('============================================================');
  console.log(`📊 Unified records:    ${stats.rowCount.toLocaleString()}`);
  console.log(`⚠️ Skipped (no goals): ${stats.missingGoals.toLocaleString()}`);
  console.log(`📁 Output:             ${OUTPUT_FILE}\n`);
}

main().catch(err => {
  if (fs.existsSync(TEMP_OUTPUT_FILE)) fs.unlinkSync(TEMP_OUTPUT_FILE);
  console.error('\n❌ PIPELINE 46 FAILED');
  console.error('------------------------------------------------------------');
  console.error(err.message);
  console.error('------------------------------------------------------------');
  process.exit(1);
});