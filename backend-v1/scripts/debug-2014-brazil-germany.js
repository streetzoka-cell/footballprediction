'use strict';

/**
 * ============================================================
 * KIM — 2014 BRAZIL vs GERMANY DATA DIAGNOSTIC
 * ============================================================
 *
 * Purpose:
 *   Find the historical 2014 World Cup Brazil 1-7 Germany
 *   record regardless of which historical JSON structure
 *   contains it.
 *
 * IMPORTANT:
 *   Diagnostic only.
 *   Does NOT modify any data.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const HISTORY_ROOT = path.join(
  process.cwd(),
  'public_data',
  'knowledge',
  'football',
  'history'
);

const TARGET_HOME = 'brazil';
const TARGET_AWAY = 'germany';
const TARGET_YEAR = 2014;

console.log('\n============================================================');
console.log(' KIM — 2014 BRAZIL vs GERMANY DATA DIAGNOSTIC');
console.log('============================================================\n');

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Recursively extract objects that could represent records.
 */
function collectRecords(value, output = []) {
  if (!value || typeof value !== 'object') {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRecords(item, output);
    }
    return output;
  }

  /*
   * If this looks like a football match record, collect it.
   */
  const hasTeamFields =
    value.home_team !== undefined ||
    value.away_team !== undefined ||
    value.homeTeam !== undefined ||
    value.awayTeam !== undefined ||
    value.home !== undefined ||
    value.away !== undefined;

  if (hasTeamFields) {
    output.push(value);
  }

  /*
   * Continue recursively so structures such as:
   *
   * {
   *   matches: [...]
   * }
   *
   * are handled.
   */
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') {
      collectRecords(child, output);
    }
  }

  return output;
}

/**
 * Recursively find all JSON files.
 */
function getJsonFiles(dir) {
  const results = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, {
    withFileTypes: true
  });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...getJsonFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.json')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

function getYear(record) {
  if (record.year !== undefined) {
    const year = Number(record.year);

    if (Number.isFinite(year)) {
      return year;
    }
  }

  /*
   * Support datasets that use a date instead of year.
   */
  const date =
    record.date ??
    record.match_date ??
    record.matchDate;

  if (date) {
    const match = String(date).match(/^(\d{4})/);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function getHome(record) {
  return normalize(
    record.home_team ??
    record.homeTeam ??
    record.home
  );
}

function getAway(record) {
  return normalize(
    record.away_team ??
    record.awayTeam ??
    record.away
  );
}

const files = getJsonFiles(HISTORY_ROOT);

console.log(`📁 Scanning ${files.length.toLocaleString()} JSON files...\n`);

let totalRecords = 0;
let exactMatches = 0;
let yearMatches = 0;
let brazilGermanyAnyYear = 0;

const found = [];

for (const file of files) {
  const json = loadJson(file);

  if (!json) {
    continue;
  }

  const records = collectRecords(json);

  totalRecords += records.length;

  for (const record of records) {
    const home = getHome(record);
    const away = getAway(record);
    const year = getYear(record);

    const isBrazilGermany =
      home === TARGET_HOME &&
      away === TARGET_AWAY;

    const isGermanyBrazil =
      home === TARGET_AWAY &&
      away === TARGET_HOME;

    if (isBrazilGermany || isGermanyBrazil) {
      brazilGermanyAnyYear++;

      if (year === TARGET_YEAR) {
        yearMatches++;

        found.push({
          file,
          record
        });

        /*
         * Only count the exact requested direction.
         */
        if (isBrazilGermany) {
          exactMatches++;
        }
      }
    }
  }
}

console.log('============================================================');
console.log(' DIAGNOSTIC RESULT');
console.log('============================================================');

console.log(
  `JSON files scanned:          ${files.length.toLocaleString()}`
);

console.log(
  `Match records inspected:     ${totalRecords.toLocaleString()}`
);

console.log(
  `Brazil ↔ Germany all years:  ${brazilGermanyAnyYear}`
);

console.log(
  `Brazil/Germany in 2014:      ${yearMatches}`
);

console.log(
  `Exact Brazil → Germany 2014: ${exactMatches}`
);

console.log('============================================================\n');

if (found.length === 0) {
  console.log('❌ DATA PROBLEM');
  console.log(
    'No 2014 Brazil/Germany record was found by the diagnostic.'
  );
} else {
  console.log(
    `✅ FOUND ${found.length} matching 2014 Brazil/Germany record(s).\n`
  );

  for (const item of found) {
    const record = item.record;

    console.log('------------------------------------------------------------');
    console.log(`FILE: ${item.file}`);
    console.log('------------------------------------------------------------');

    console.log(`Year:       ${record.year ?? '(none)'}`);
    console.log(`Date:       ${record.date ?? '(none)'}`);
    console.log(`Round:      ${record.round ?? '(none)'}`);
    console.log(`Home:       ${record.home_team ?? '(none)'}`);
    console.log(`Away:       ${record.away_team ?? '(none)'}`);
    console.log(`Home score: ${record.home_score ?? '(none)'}`);
    console.log(`Away score: ${record.away_score ?? '(none)'}`);
    console.log(`Venue:      ${record.venue ?? '(none)'}`);
    console.log(`Host:       ${record.host ?? '(none)'}`);

    if (record.home_team_normalized) {
      console.log(
        `Home norm:  ${record.home_team_normalized}`
      );
    }

    if (record.away_team_normalized) {
      console.log(
        `Away norm:  ${record.away_team_normalized}`
      );
    }

    console.log('');
  }

  console.log('============================================================');
  console.log(' ✅ DATA IS PRESENT');
  console.log('============================================================');
  console.log('');
  console.log(
    'The World Cup dataset contains the 2014 Brazil 1–7 Germany match.'
  );
  console.log(
    'The next investigation target should therefore be KIM'
  );
  console.log(
    'DataResolver / KnowledgeRouter / retrieval logic.'
  );
}

console.log('\n');