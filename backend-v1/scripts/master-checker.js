// backend-v1/scripts/master-checker.js
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

console.log('[Checker] Starting Master Data Verification...\n');

const matchesFiles = findMatchesFiles(HISTORY_DIR);
const uniqueMatches = new Set();
const years = {};

let totalMatches = 0;
let duplicateCount = 0;
let minDate = '9999-12-31';
let maxDate = '0000-01-01';

let withFeatures = 0;
let withGoals = 0;
let withPlayerStats = 0;
let withShootout = 0;

for (const matchesFile of matchesFiles) {
  try {
    const raw = fs.readFileSync(matchesFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.matches)) continue;

    for (const match of parsed.matches) {
      totalMatches++;
      
      const date = match.date;
      const homeTeam = match.home_team;
      const awayTeam = match.away_team;
      const ftHome = match.score?.ft?.home;
      const ftAway = match.score?.ft?.away;

      // Track Date Range
      if (date) {
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;
        
        const year = date.substring(0, 4);
        years[year] = (years[year] || 0) + 1;
      }

      // Check Duplicates
      if (date && homeTeam && awayTeam && ftHome !== null && ftAway !== null) {
        const matchKey = `${date}|${homeTeam}|${awayTeam}|${ftHome}|${ftAway}`;
        if (uniqueMatches.has(matchKey)) {
          duplicateCount++;
        } else {
          uniqueMatches.add(matchKey);
        }
      }

      // Check Enrichments
      if (match.pre_match_features) withFeatures++;
      if (match.goals && match.goals.length > 0) withGoals++;
      if (match.player_stats && match.player_stats.length > 0) withPlayerStats++;
      if (match.shootout) withShootout++;
    }
  } catch (e) {}
}

console.log('========================================');
console.log('📊 ZOKASCORE MASTER DATA REPORT');
console.log('========================================');
console.log(`Total Match Files Scanned : ${matchesFiles.length}`);
console.log(`Total Matches Processed  : ${totalMatches}`);
console.log(`Unique Matches           : ${uniqueMatches.size}`);
console.log(`Duplicate Matches Found  : ${duplicateCount}`);
console.log('----------------------------------------');
console.log(`📅 Date Range             : ${minDate} to ${maxDate}`);
console.log('----------------------------------------');
console.log('🧠 Enrichment Coverage:');
console.log(`  - With Pre-Match Features: ${withFeatures} (${((withFeatures/totalMatches)*100).toFixed(1)}%)`);
console.log(`  - With Goalscorers       : ${withGoals} (${((withGoals/totalMatches)*100).toFixed(1)}%)`);
console.log(`  - With Player Stats      : ${withPlayerStats} (${((withPlayerStats/totalMatches)*100).toFixed(1)}%)`);
console.log(`  - With Shootout Data     : ${withShootout} (${((withShootout/totalMatches)*100).toFixed(1)}%)`);
console.log('----------------------------------------');
console.log('📅 Matches per Year (Gaps Check):');
// Sort years
const sortedYears = Object.keys(years).sort();
for (const year of sortedYears) {
  // Simple bar chart
  const bar = '█'.repeat(Math.min(Math.round(years[year] / 1000), 30));
  console.log(`  ${year}: ${years[year].toString().padStart(6)} ${bar}`);
}
console.log('========================================\n');

if (duplicateCount > 0) {
  console.warn(`⚠️ WARNING: Found ${duplicateCount} duplicate matches! You may need to run a deduplication script.`);
} else {
  console.log('✅ SUCCESS: Zero duplicate matches found. Data is perfectly clean!');
}