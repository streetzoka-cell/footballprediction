// pipeline/31d-apply-shootout-repair.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const PLAN_FILE = path.join(ROOT, 'data_audit', 'v2_integrity', 'shootout_repair_plan.json');

console.log('🛠️  Applying Shootout Repair Plan...\n');

if (!fs.existsSync(PLAN_FILE)) {
  console.error(`❌ Repair plan not found: ${PLAN_FILE}`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));

if (plan.totalActions === 0 || plan.actions.length === 0) {
  console.log('✅ Plan contains no actions. Nothing to repair.');
  process.exit(0);
}

let appliedCount = 0;

for (const action of plan.actions) {
  const filePath = path.join(ROOT, action.targetFile);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Target file not found: ${action.targetFile}`);
    continue;
  }

  try {
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const matchIdx = fileData.matches.findIndex(m => m.match_id === action.targetMatchId);
    
    if (matchIdx === -1) {
      console.error(`❌ Match ${action.targetMatchId} not found in ${action.targetFile}`);
      continue;
    }

    const match = fileData.matches[matchIdx];
    const currentScoreStr = `${match.home_score}-${match.away_score}`;

    // Safety check: Only apply if the score hasn't changed since the plan was made
    if (currentScoreStr !== action.currentScore) {
      console.log(`⚠️ Skipping ${action.targetMatchId}: Score is already ${currentScoreStr}, not ${action.currentScore}.`);
      continue;
    }

    // Apply the repair
    const [proposedHome, proposedAway] = action.proposedScore.split('-').map(Number);
    
    match.home_score = proposedHome;
    match.away_score = proposedAway;
    match.shootout = action.proposedShootout;

    // Save the file
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf8');
    console.log(`✅ Repaired ${action.targetMatchId}: ${action.currentScore} -> ${action.proposedScore} (Pens: ${action.proposedShootout.home}-${action.proposedShootout.away})`);
    appliedCount++;
    
  } catch (err) {
    console.error(`❌ Error applying repair to ${action.targetFile}: ${err.message}`);
  }
}

console.log('\n============================================================');
console.log(' SHOOTOUT REPAIR EXECUTION COMPLETE');
console.log('============================================================');
console.log(`Total matches repaired: ${appliedCount} / ${plan.totalActions}`);
console.log('\n💡 Next step: Re-run Step 9 Integrity Audit to verify conflicts are resolved.');