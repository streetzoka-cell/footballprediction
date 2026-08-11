// backend-v1/scripts/import-club-elo-ratings.js
const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(process.cwd(), 'EloRatings.csv');
const OUTPUT_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

console.log('[Import] Reading Club Elo Ratings CSV...');

if (!fs.existsSync(INPUT_CSV)) {
  console.error(`[Import] Error: Could not find ${INPUT_CSV}`);
  process.exit(1);
}

const eloHistory = {};
const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');

if (lines.length === 0) {
  console.error('[Import] CSV is empty!');
  process.exit(1);
}

// Detect delimiter (usually comma for this file)
const firstLine = lines[0];
let delimiter = ',';
if (firstLine.includes('|')) delimiter = '|';
else if (firstLine.includes(';')) delimiter = ';';

// ★ FIX: Strip quotes from headers before matching
const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
const dateIdx = headers.indexOf('date');
const clubIdx = headers.indexOf('club');
const eloIdx = headers.indexOf('elo');

if (dateIdx === -1 || clubIdx === -1 || eloIdx === -1) {
  console.error('[Import] Could not find required columns (date, club, elo) in header!');
  console.error('[Import] Headers found:', headers);
  process.exit(1);
}

console.log(`[Import] Detected delimiter: "${delimiter}"`);
console.log(`[Import] Found columns -> Date: ${dateIdx}, Club: ${clubIdx}, Elo: ${eloIdx}`);

// Loop through data rows and extract data
for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));
  
  const date = parts[dateIdx];
  const club = parts[clubIdx];
  const elo = parseFloat(parts[eloIdx]);
  
  if (!date || !club || isNaN(elo)) continue;
  
  if (!eloHistory[club]) {
    eloHistory[club] = [];
  }
  
  eloHistory[club].push({ date, elo });
}

console.log(`[Import] Loaded Elo history for ${Object.keys(eloHistory).length} clubs.`);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Sort each club's Elo history by date ascending
for (const club in eloHistory) {
  eloHistory[club].sort((a, b) => new Date(a.date) - new Date(b.date));
}

const payload = {
  id: 'club_elo_ratings',
  name: 'Club Elo Ratings History',
  aliases: ['club elo', 'elo history', 'club ratings'],
  category: 'history',
  intents: ['definition'],
  ratings: eloHistory
};

const outputFile = path.join(OUTPUT_DIR, 'club_elo_ratings.json');
fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));

console.log(`[Import] Saved to ${path.relative(process.cwd(), outputFile)}`);
console.log('[Import] Done!');