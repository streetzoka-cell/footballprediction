// backend-v1/scripts/import-rankings.js
const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(process.cwd(), 'ranking.csv'); // Ensure your file is named ranking.csv
const OUTPUT_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

console.log('[Import] Reading rankings CSV...');

if (!fs.existsSync(INPUT_CSV)) {
  console.error(`[Import] Error: Could not find ${INPUT_CSV}`);
  process.exit(1);
}

const rankingsByCountry = {};
const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');

if (lines.length === 0) {
  console.error('[Import] CSV is empty!');
  process.exit(1);
}

// 1. Detect delimiter (pipe, comma, or semicolon)
const firstLine = lines[0];
let delimiter = ',';
if (firstLine.includes('|')) delimiter = '|';
else if (firstLine.includes(';')) delimiter = ';';

console.log(`[Import] Detected delimiter: "${delimiter}"`);

// 2. Find the column indices from the header row
const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase());
const countryIdx = headers.indexOf('country_full');
const rankDateIdx = headers.indexOf('rank_date');
const rankIdx = headers.indexOf('rank');
const pointsIdx = headers.indexOf('total_points');
const confederationIdx = headers.indexOf('confederation');

if (countryIdx === -1 || rankDateIdx === -1) {
  console.error('[Import] Could not find required columns (country_full, rank_date) in header!');
  console.error('[Import] Headers found:', headers);
  process.exit(1);
}

console.log(`[Import] Found columns -> Country: ${countryIdx}, Date: ${rankDateIdx}, Rank: ${rankIdx}, Points: ${pointsIdx}`);

// 3. Loop through data rows and extract data
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));
  
  const country = parts[countryIdx];
  const rankDate = parts[rankDateIdx];
  
  if (!country || !rankDate) continue;
  
  if (!rankingsByCountry[country]) {
    rankingsByCountry[country] = [];
  }
  
  rankingsByCountry[country].push({
    date: rankDate,
    rank: rankIdx !== -1 ? parseInt(parts[rankIdx], 10) || null : null,
    points: pointsIdx !== -1 ? parseFloat(parts[pointsIdx]) || 0 : 0,
    confederation: confederationIdx !== -1 ? parts[confederationIdx] : null
  });
}

console.log(`[Import] Loaded rankings for ${Object.keys(rankingsByCountry).length} countries.`);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sort each country's rankings by date ascending
for (const country in rankingsByCountry) {
  rankingsByCountry[country].sort((a, b) => new Date(a.date) - new Date(b.date));
}

const payload = {
  id: 'fifa_rankings',
  name: 'FIFA World Rankings History',
  aliases: ['fifa ranking', 'world ranking', 'ranking history'],
  category: 'history',
  intents: ['definition'],
  rankings: rankingsByCountry
};

const outputFile = path.join(OUTPUT_DIR, 'fifa_rankings.json');
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));

console.log(`[Import] Saved to ${path.relative(process.cwd(), outputFile)}`);
console.log('[Import] Done!');