'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(
  ROOT,
  'public_data',
  'knowledge',
  'football',
  'history'
);

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file.endsWith('.json')) {
      callback(fullPath);
    }
  }
}

const counters = {
  total: 0,
  valid: 0,
  missing_date: 0,
  missing_home_id: 0,
  missing_away_id: 0,
  missing_date_only: 0,
  missing_home_only: 0,
  missing_away_only: 0,
  missing_multiple: 0
};

const examples = {
  missing_date: [],
  missing_home_id: [],
  missing_away_id: [],
  missing_multiple: []
};

function addExample(type, match, filePath) {
  if (examples[type].length >= 20) return;

  examples[type].push({
    file: path.relative(ROOT, filePath),
    match_id: match.match_id,
    date: match.date,
    home_team_id: match.home_team_id,
    away_team_id: match.away_team_id
  });
}

walkDir(HISTORY_DIR, (filePath) => {
  const data = loadJson(filePath);

  if (!data || !Array.isArray(data.matches)) return;

  for (const match of data.matches) {
    counters.total++;

    const missingDate = !match.date;
    const missingHome = !match.home_team_id;
    const missingAway = !match.away_team_id;

    if (!missingDate && !missingHome && !missingAway) {
      counters.valid++;
      continue;
    }

    if (missingDate) counters.missing_date++;
    if (missingHome) counters.missing_home_id++;
    if (missingAway) counters.missing_away_id++;

    const missingCount =
      Number(missingDate) +
      Number(missingHome) +
      Number(missingAway);

    if (missingCount === 1) {
      if (missingDate) {
        counters.missing_date_only++;
        addExample('missing_date', match, filePath);
      }

      if (missingHome) {
        counters.missing_home_only++;
        addExample('missing_home_id', match, filePath);
      }

      if (missingAway) {
        counters.missing_away_only++;
        addExample('missing_away_id', match, filePath);
      }
    } else {
      counters.missing_multiple++;
      addExample('missing_multiple', match, filePath);
    }
  }
});

console.log('\n============================================================');
console.log(' ZOKASCORE V2 — STRUCTURAL DIAGNOSTIC');
console.log('============================================================\n');

console.log(`Total matches:       ${counters.total.toLocaleString()}`);
console.log(`Fully valid:         ${counters.valid.toLocaleString()}`);
console.log(`Missing date:        ${counters.missing_date.toLocaleString()}`);
console.log(`Missing home ID:     ${counters.missing_home_id.toLocaleString()}`);
console.log(`Missing away ID:     ${counters.missing_away_id.toLocaleString()}`);
console.log(`Missing date only:   ${counters.missing_date_only.toLocaleString()}`);
console.log(`Missing home only:   ${counters.missing_home_only.toLocaleString()}`);
console.log(`Missing away only:   ${counters.missing_away_only.toLocaleString()}`);
console.log(`Missing multiple:    ${counters.missing_multiple.toLocaleString()}`);

console.log('\n--- EXAMPLES: MISSING DATE ---');
console.dir(examples.missing_date, { depth: null });

console.log('\n--- EXAMPLES: MISSING HOME ID ---');
console.dir(examples.missing_home_id, { depth: null });

console.log('\n--- EXAMPLES: MISSING AWAY ID ---');
console.dir(examples.missing_away_id, { depth: null });

console.log('\n--- EXAMPLES: MULTIPLE MISSING ---');
console.dir(examples.missing_multiple, { depth: null });

console.log('\n============================================================');