// backend-v1/scripts/generate-prediction-dataset.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_FILE = path.join(process.cwd(), 'public_data', 'prediction_dataset.jsonl');

function findMatchesFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findMatchesFiles(filePath, fileList);
    } else if (file === 'matches.json') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function run() {
  console.log('[Dataset] Starting Prediction Dataset Generation...');
  
  const matchesFiles = findMatchesFiles(HISTORY_DIR);
  
  // Open a writable stream to the JSONL file
  const writeStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });
  let recordsWritten = 0;
  let skipped = 0;

  for (const matchesFile of matchesFiles) {
    try {
      const raw = fs.readFileSync(matchesFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.matches)) continue;

      for (const match of parsed.matches) {
        // We only want matches that have pre-match features (post-1872 modern era)
        if (!match.pre_match_features) {
          skipped++;
          continue;
        }

        const ftHome = match.score?.ft?.home;
        const ftAway = match.score?.ft?.away;

        if (ftHome === null || ftAway === null) {
          skipped++;
          continue;
        }

        const homeGoals = parseInt(ftHome, 10);
        const awayGoals = parseInt(ftAway, 10);

        // Calculate Target Variables
        let result = 'D';
        if (homeGoals > awayGoals) result = 'H';
        else if (homeGoals < awayGoals) result = 'A';

        const totalGoals = homeGoals + awayGoals;
        const btts = homeGoals > 0 && awayGoals > 0;
        const over_2_5 = totalGoals > 2;

        const record = {
          match_id: `${match.date}_${match.home_team}_${match.away_team}`,
          date: match.date,
          home_team: match.home_team,
          away_team: match.away_team,
          
          // The exact state of the world before kickoff
          features: match.pre_match_features,
          
          // What actually happened (The targets for ML models)
          target: {
            home_goals: homeGoals,
            away_goals: awayGoals,
            total_goals: totalGoals,
            result: result,
            btts: btts,
            over_2_5: over_2_5
          }
        };

        // Write to JSONL (one JSON object per line)
        writeStream.write(JSON.stringify(record) + '\n');
        recordsWritten++;
      }
    } catch (e) {}
  }

  writeStream.end();
  
  writeStream.on('finish', () => {
    console.log(`\n[Dataset] Done! Wrote ${recordsWritten} records to prediction_dataset.jsonl`);
    console.log(`[Dataset] Skipped ${skipped} matches (missing features or scores).`);
    console.log(`[Dataset] File location: ${OUTPUT_FILE}`);
    console.log('\nYou can now load this file directly into Python/XGBoost to train your models!');
  });
}

run().catch(err => { console.error('[Dataset] Failed:', err); process.exit(1); });