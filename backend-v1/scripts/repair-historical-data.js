// scripts/repair-historical-data.js

const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(
  process.cwd(),
  'public_data',
  'knowledge',
  'football',
  'history'
);

/**
 * Detect and repair common UTF-8 -> Latin-1/Windows-1252 mojibake.
 *
 * Example:
 *   AtlÃ©tico -> Atlético
 *   MÃ¼nchen  -> München
 *   EspaÃ±a   -> España
 */
function fixMojibake(text) {
  if (typeof text !== 'string' || !text) return text;

  // Only attempt repair when typical mojibake markers exist.
  if (!/[ÃÂÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ]/.test(text)) {
    return text;
  }

  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8');

    // Reject obviously broken conversions.
    if (repaired.includes('\uFFFD')) {
      return text;
    }

    return repaired;
  } catch {
    return text;
  }
}

function findJSONFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) {
    console.error(`[Repair] History directory does not exist: ${dir}`);
    return fileList;
  }

  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findJSONFiles(filePath, fileList);
    } else if (file.toLowerCase().endsWith('.json')) {
      fileList.push(filePath);
    }
  }

  return fileList;
}

function processObject(value, stats) {
  if (Array.isArray(value)) {
    return value.map(item => processObject(item, stats));
  }

  if (value && typeof value === 'object') {
    const result = {};

    for (const [key, child] of Object.entries(value)) {
      result[key] = processObject(child, stats);
    }

    return result;
  }

  if (typeof value === 'string') {
    const fixed = fixMojibake(value);

    if (fixed !== value) {
      stats.stringsFixed++;
    }

    return fixed;
  }

  return value;
}

console.log(
  '[Repair] Scanning historical football knowledge files...'
);

const files = findJSONFiles(HISTORY_DIR);

console.log(`[Repair] Found ${files.length} JSON files.`);

let fixedFiles = 0;
let stringsFixed = 0;
let errors = 0;

for (const file of files) {
  try {
    const raw = fs.readFileSync(file, 'utf8');

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      errors++;
      console.error(
        `[Repair] Invalid JSON: ${file}`
      );
      console.error(`         ${error.message}`);
      continue;
    }

    const stats = {
      stringsFixed: 0
    };

    const fixedParsed = processObject(parsed, stats);

    const fixedRaw = JSON.stringify(
      fixedParsed,
      null,
      2
    ) + '\n';

    if (raw !== fixedRaw) {
      fs.writeFileSync(
        file,
        fixedRaw,
        'utf8'
      );

      fixedFiles++;
      stringsFixed += stats.stringsFixed;

      console.log(
        `[Repair] Fixed: ${path.relative(
          HISTORY_DIR,
          file
        )} (${stats.stringsFixed} strings)`
      );
    }
  } catch (error) {
    errors++;

    console.error(
      `[Repair] Error processing ${file}: ${error.message}`
    );
  }
}

console.log('\n========================================');
console.log(' HISTORICAL DATA REPAIR COMPLETE');
console.log('========================================');
console.log(`Files scanned : ${files.length}`);
console.log(`Files fixed   : ${fixedFiles}`);
console.log(`Strings fixed : ${stringsFixed}`);
console.log(`Errors        : ${errors}`);
console.log('========================================\n');