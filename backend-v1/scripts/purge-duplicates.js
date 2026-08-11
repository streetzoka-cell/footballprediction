// backend-v1/scripts/purge-duplicates.js
const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

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

console.log('[Purge] Scanning for exact duplicate matches...');

const matchesFiles = findMatchesFiles(HISTORY_DIR);
const globalKeys = new Set();
let totalRemoved = 0;
let filesChanged = 0;

for (const matchesFile of matchesFiles) {
  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.matches)) continue;

    const originalLength = parsed.matches.length;
    const uniqueMatches = [];

    for (const match of parsed.matches) {
      const date = match.date;
      const homeTeam = match.home_team;
      const awayTeam = match.away_team;
      const ftHome = match.score?.ft?.home;
      const ftAway = match.score?.ft?.away;

      if (date && homeTeam && awayTeam && ftHome !== null && ftAway !== null) {
        const matchKey = `${date}|${homeTeam}|${awayTeam}|${ftHome}|${ftAway}`;
        
        if (globalKeys.has(matchKey)) {
          // Duplicate found! Skip adding it to uniqueMatches
          totalRemoved++;
          continue;
        }
        globalKeys.add(matchKey);
      }
      uniqueMatches.push(match);
    }

    if (uniqueMatches.length < originalLength) {
      parsed.matches = uniqueMatches;
      fs.writeFileSync(matchesFile, JSON.stringify(parsed, null, 2));
      filesChanged++;
    }
  } catch (e) {}
}

console.log(`\n[Purge] Done! Removed ${totalRemoved} duplicate matches across ${filesChanged} files.`);