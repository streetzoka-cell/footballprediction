
// backend-v1/pipeline/46-build-market-targets.js
// ZOKASCORE V2 — STEP 46: BUILD MARKET TARGETS (UNIFIED)
// JS + PY identical output → data/ml/features_v4_unified.csv
// Fallback-safe: if PY fails, JS produces same file
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const FEATURE_CANDIDATES = [
  path.join(ROOT, 'data', 'ml', 'features_v3.csv'),
  path.join(ROOT, 'data', 'ml', 'features_v3_unique.csv'),
  path.join(ROOT, 'data', 'ml', 'features_v2.csv'),
  path.join(ROOT, 'data', 'ml', 'features_elo.csv'),
];
const MASTER_FILE = path.join(ROOT, 'data', 'processed', 'master_with_elo.csv');
const OUTPUT_FILE = path.join(ROOT, 'data', 'ml', 'features_v4_unified.csv');
const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';

const VALID_1X2 = new Set(['HOME_WIN','DRAW','AWAY_WIN']);

function findFeaturesFile(){
  for(const p of FEATURE_CANDIDATES){
    if(fs.existsSync(p)) return p;
  }
  throw new Error('No features file found. Tried: ' + FEATURE_CANDIDATES.join('\n'));
}

async function loadMasterGoals(){
  console.log('   ↳ Loading goals from Master...');
  const goalsMap = new Map();
  return new Promise((resolve, reject)=>{
    fs.createReadStream(MASTER_FILE)
      .pipe(csv())
      .on('data',(row)=>{
        const id = String(row.zokascore_match_id || row.match_id || '').trim();
        if(id){
          goalsMap.set(id, {
            home_goals: parseInt(row.home_score,10)||0,
            away_goals: parseInt(row.away_score,10)||0
          });
        }
      })
      .on('end',()=>{
        console.log(`   ↳ Loaded ${goalsMap.size} goals`);
        resolve(goalsMap);
      })
      .on('error',reject);
  });
}

async function processStream(goalsMap, featuresFile){
  return new Promise((resolve, reject)=>{
    const writeStream = fs.createWriteStream(TEMP_OUTPUT_FILE, {encoding:'utf8'});
    
    let headerWritten = false;
    let rowCount = 0;
    let missingGoals = 0;
    let mismatchFixed = 0;
    let bttsYes = 0;
    let over25 = 0;
    let columns = [];

    fs.createReadStream(featuresFile)
      .pipe(csv())
      .on('data',(row)=>{
        const matchId = String(row.match_id || '').trim();
        if(!matchId) return;
        const goals = goalsMap.get(matchId);
        if(!goals){
          missingGoals++;
          return;
        }

        const totalGoals = goals.home_goals + goals.away_goals;
        
        // Derive 1X2 from goals to verify/fix
        let derived = 'DRAW';
        if(goals.home_goals > goals.away_goals) derived = 'HOME_WIN';
        else if(goals.home_goals < goals.away_goals) derived = 'AWAY_WIN';
        
        let target = row.target;
        if(!VALID_1X2.has(target)){
          target = derived;
        }
        if(target !== derived){
          // Fix to canonical (same as PY)
          target = derived;
          mismatchFixed++;
        }

        const ou_0_5 = totalGoals > 0.5 ? 'OVER' : 'UNDER';
        const ou_1_5 = totalGoals > 1.5 ? 'OVER' : 'UNDER';
        const ou_2_5 = totalGoals > 2.5 ? 'OVER' : 'UNDER';
        const ou_3_5 = totalGoals > 3.5 ? 'OVER' : 'UNDER';
        const btts = (goals.home_goals > 0 && goals.away_goals > 0) ? 'YES' : 'NO';
        
        if(btts==='YES') bttsYes++;
        if(ou_2_5==='OVER') over25++;

        if(!headerWritten){
          columns = Object.keys(row);
          // Ensure required cols exist
          if(!columns.includes('match_id')) columns.unshift('match_id');
          // Build header: original cols + goal cols + market cols
          const existing = new Set(columns);
          const extra = [];
          if(!existing.has('home_goals')) extra.push('home_goals');
          if(!existing.has('away_goals')) extra.push('away_goals');
          if(!existing.has('total_goals')) extra.push('total_goals');
          if(!existing.has('ou_0_5')) extra.push('ou_0_5','ou_1_5','ou_2_5','ou_3_5','btts');
          
          const header = [...columns.filter(c=>!['home_goals','away_goals','total_goals','ou_0_5','ou_1_5','ou_2_5','ou_3_5','btts'].includes(c)), 'home_goals','away_goals','total_goals','ou_0_5','ou_1_5','ou_2_5','ou_3_5','btts'];
          // Fix target column position
          const finalHeader = header.map(h=>h==='target' ? 'target' : h);
          // Write header
          writeStream.write(finalHeader.join(',')+'\n');
          columns = finalHeader;
          headerWritten = true;
        }

        // Build row in same order as header
        const out = {};
        for(const k of Object.keys(row)){
          out[k]=row[k];
        }
        out['target']=target;
        out['home_goals']=goals.home_goals;
        out['away_goals']=goals.away_goals;
        out['total_goals']=totalGoals;
        out['ou_0_5']=ou_0_5;
        out['ou_1_5']=ou_1_5;
        out['ou_2_5']=ou_2_5;
        out['ou_3_5']=ou_3_5;
        out['btts']=btts;

        const line = columns.map(col=>{
          const v = out[col];
          if(v===undefined||v===null) return '';
          const s = String(v);
          // Escape comma
          if(s.includes(',')||s.includes('"')){
            return '"' + s.replace(/"/g,'""') + '"';
          }
          return s;
        }).join(',');

        writeStream.write(line+'\n');
        rowCount++;
      })
      .on('end',()=>{
        writeStream.end(()=>{
          resolve({rowCount, missingGoals, mismatchFixed, bttsYes, over25});
        });
      })
      .on('error',reject);
  });
}

async function main(){
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 46: BUILD MARKET TARGETS (UNIFIED)');
  console.log(' JS + PY identical output → features_v4_unified.csv');
  console.log('============================================================\n');

  const featuresFile = findFeaturesFile();
  console.log(`[1/2] Features: ${path.basename(featuresFile)}`);
  console.log(`[2/2] Master: ${path.basename(MASTER_FILE)}\n`);

  console.log('[1/2] Loading Master Goals...');
  const goalsMap = await loadMasterGoals();

  console.log('[2/2] Streaming features + engineering markets...');
  const stats = await processStream(goalsMap, featuresFile);

  fs.renameSync(TEMP_OUTPUT_FILE, OUTPUT_FILE);

  console.log('\n============================================================');
  console.log(' STEP 46 COMPLETE: PASS (JS)');
  console.log('============================================================');
  console.log(`📊 Unified records:    ${stats.rowCount.toLocaleString()}`);
  console.log(`⚠ Skipped (no goals): ${stats.missingGoals.toLocaleString()}`);
  console.log(`🔧 Fixed 1X2 mismatches: ${stats.mismatchFixed}`);
  console.log(`🤝 BTTS YES: ${(stats.bttsYes/stats.rowCount*100).toFixed(1)}%`);
  console.log(`📈 Over2.5: ${(stats.over25/stats.rowCount*100).toFixed(1)}%`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🔄 PY fallback can produce identical file`);
  console.log('');
}

main().catch(err=>{
  if(fs.existsSync(TEMP_OUTPUT_FILE)) fs.unlinkSync(TEMP_OUTPUT_FILE);
  console.error('\n❌ PIPELINE 46 FAILED (JS)');
  console.error('------------------------------------------------------------');
  console.error(err.message);
  console.error('------------------------------------------------------------');
  process.exit(1);
});
