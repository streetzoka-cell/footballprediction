// backend-v1/scripts/generate-backtest-dataset.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const OUTPUT_FILE = path.join(process.cwd(), 'public_data', 'backtest_dataset.jsonl');

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

console.log('[Backtest Data] Scanning matches...');
const matchesFiles = findMatchesFiles(HISTORY_DIR);
const writeStream = fs.createWriteStream(OUTPUT_FILE, { flags: 'w' });
let recordsWritten = 0;

for (const matchesFile of matchesFiles) {
  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.matches)) continue;

    // Extract competition from path
    const parts = matchesFile.split(path.sep);
    let competition = 'Unknown';
    if (parts.includes('clubs')) {
      const clubsIdx = parts.indexOf('clubs');
      if (parts.length > clubsIdx + 2) {
        competition = `${parts[clubsIdx+1]} ${parts[clubsIdx+2]}`.replace(/_/g, ' ');
      }
    } else if (parts.includes('history')) {
      const histIdx = parts.indexOf('history');
      if (parts.length > histIdx + 1) {
        competition = parts[histIdx + 1].replace(/_/g, ' ');
      }
    }

    for (const match of parsed.matches) {
      if (!match.pre_match_features) continue;
      
      const ftHome = match.score?.ft?.home;
      const ftAway = match.score?.ft?.away;
      if (ftHome === null || ftAway === null) continue;

      const homeOdds = match.odds?.home;
      const drawOdds = match.odds?.draw;
      const awayOdds = match.odds?.away;

      if (!homeOdds || !drawOdds || !awayOdds) continue;

      let result = 'D';
      if (parseInt(ftHome, 10) > parseInt(ftAway, 10)) result = 'H';
      else if (parseInt(ftHome, 10) < parseInt(ftAway, 10)) result = 'A';

      const record = {
        date: match.date,
        competition: competition,
        home_team: match.home_team,
        away_team: match.away_team,
        features: match.pre_match_features,
        target: { result: result },
        odds: { 
          home: homeOdds, 
          draw: drawOdds, 
          away: awayOdds,
          over_25: match.odds?.over_25 || null,
          under_25: match.odds?.under_25 || null
        }
      };

      writeStream.write(JSON.stringify(record) + '\n');
      recordsWritten++;
    }
  } catch (e) {}
}

writeStream.end();
writeStream.on('finish', () => {
  console.log(`[Backtest Data] Done! Wrote ${recordsWritten} records with odds & competitions to backtest_dataset.jsonl`);
});