'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const OLD = path.join(ROOT, 'public_data');
const V2 = path.join(ROOT, 'public_data');

const REPORT_DIR = path.join(V2, 'migration');
const REPORT_FILE = path.join(REPORT_DIR, 'v2-migration-audit.txt');

fs.mkdirSync(REPORT_DIR, { recursive: true });

function walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return [];

  const out = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      out.push(...walk(full, base));
    } else {
      out.push(path.relative(base, full));
    }
  }

  return out;
}

const oldFiles = walk(OLD);
const v2Files = new Set(walk(V2));

const categories = {
  'Football knowledge': [],
  'Stats': [],
  'Fixtures': [],
  'Results': [],
  'Prediction data': [],
  'Runtime': [],
  'Other': []
};

function category(file) {
  const f = file.replace(/\\/g, '/').toLowerCase();

  if (f.startsWith('knowledge/football/')) {
    return 'Football knowledge';
  }

  if (f.startsWith('stats/')) {
    return 'Stats';
  }

  if (f.startsWith('fixtures/')) {
    return 'Fixtures';
  }

  if (f.startsWith('results/')) {
    return 'Results';
  }

  if (
    f.includes('prediction') ||
    f.includes('backtest') ||
    f.includes('xgboost') ||
    f.includes('poisson')
  ) {
    return 'Prediction data';
  }

  if (
    f === 'live.json' ||
    f.startsWith('leaderboard/') ||
    f.startsWith('zokapicks/') ||
    f.startsWith('featured/')
  ) {
    return 'Runtime';
  }

  return 'Other';
}

let alreadyInV2 = 0;
let missingFromV2 = 0;
let temporaryIgnored = 0;

for (const file of oldFiles) {
  const normalized = file.replace(/\\/g, '/');

  // Never consider temporary atomic-write files for migration.
  if (normalized.includes('.tmp')) {
    temporaryIgnored++;
    continue;
  }

  const cat = category(file);

  const existsInV2 =
    v2Files.has(file) ||
    v2Files.has(normalized);

  if (existsInV2) {
    categories[cat].push({
      status: 'EXISTS_IN_V2',
      file: normalized
    });

    alreadyInV2++;
  } else {
    categories[cat].push({
      status: 'MISSING_IN_V2',
      file: normalized
    });

    missingFromV2++;
  }
}

const lines = [];

lines.push('==============================================================');
lines.push('             ZOKASCORE V2 MIGRATION AUDIT');
lines.push('==============================================================');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('');
lines.push(`Source : ${OLD}`);
lines.push(`Target : ${V2}`);
lines.push('');
lines.push('--------------------------------------------------------------');
lines.push('SUMMARY');
lines.push('--------------------------------------------------------------');
lines.push(`Old files scanned : ${oldFiles.length}`);
lines.push(`Already in V2     : ${alreadyInV2}`);
lines.push(`Missing from V2   : ${missingFromV2}`);
lines.push(`Temporary ignored : ${temporaryIgnored}`);
lines.push('');

for (const [name, files] of Object.entries(categories)) {
  const existing = files.filter(
    item => item.status === 'EXISTS_IN_V2'
  );

  const missing = files.filter(
    item => item.status === 'MISSING_IN_V2'
  );

  lines.push('');
  lines.push('==============================================================');
  lines.push(`CATEGORY: ${name}`);
  lines.push('==============================================================');
  lines.push('');
  lines.push(`Already represented in V2: ${existing.length}`);
  lines.push(`Missing from V2          : ${missing.length}`);
  lines.push('');

  if (missing.length) {
    lines.push('--- MISSING FROM V2 ---');

    for (const item of missing) {
      lines.push(`[MISSING] ${item.file}`);
    }

    lines.push('');
  }

  if (existing.length) {
    lines.push('--- ALREADY IN V2 ---');

    for (const item of existing) {
      lines.push(`[EXISTS]  ${item.file}`);
    }

    lines.push('');
  }
}

lines.push('');
lines.push('==============================================================');
lines.push('TEMPORARY FILES IGNORED');
lines.push('==============================================================');
lines.push('');
lines.push('Files containing ".tmp" were intentionally excluded from');
lines.push('migration analysis because they appear to be temporary');
lines.push('atomic-write/intermediate files.');
lines.push('');

lines.push('==============================================================');
lines.push('IMPORTANT MIGRATION RULE');
lines.push('==============================================================');
lines.push('');
lines.push('THIS SCRIPT DOES NOT:');
lines.push('  - copy files');
lines.push('  - move files');
lines.push('  - delete files');
lines.push('  - overwrite files');
lines.push('  - modify public_data');
lines.push('  - modify public_data');
lines.push('');
lines.push('The report is AUDIT ONLY.');
lines.push('');
lines.push('Do NOT blindly copy files marked MISSING.');
lines.push('Some legacy files may be raw/dirty source data that was');
lines.push('already processed into cleaner V2 datasets.');
lines.push('');
lines.push('==============================================================');

fs.writeFileSync(
  REPORT_FILE,
  lines.join('\n'),
  'utf8'
);

console.log('');
console.log('======================================================');
console.log(' ZOKASCORE V2 MIGRATION AUDIT COMPLETE');
console.log('======================================================');
console.log('');
console.log(`Old files scanned : ${oldFiles.length}`);
console.log(`Already in V2     : ${alreadyInV2}`);
console.log(`Missing from V2   : ${missingFromV2}`);
console.log(`Temporary ignored : ${temporaryIgnored}`);
console.log('');
console.log('FULL REPORT:');
console.log(REPORT_FILE);
console.log('');
console.log('Nothing was copied, moved, deleted, or modified.');
console.log('======================================================');