'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'source_audit');

const CSV_FILES = [
  'appearances.csv',
  'clubs.csv',
  'competitions.csv',
  'former_names.csv',
  'game_events.csv',
  'games.csv',
  'goalscorers.csv',
  'goalscorers_update.csv',
  'matches.csv',
  'player_valuations.csv',
  'players.csv',
  'ranking.csv',
  'results.csv',
  'results_update.csv',
  'shootouts.csv',
  'shootouts_update.csv',
  'EloRatings.csv'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function isBlank(value) {
  return (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  );
}

async function auditFile(filename) {
  const filePath = path.join(SOURCE_DIR, filename);

  const report = {
    file: filename,
    exists: false,
    sizeBytes: 0,
    sha256: null,
    modifiedAt: null,

    headers: [],
    columnCount: 0,

    totalRows: 0,
    sampleRows: [],

    duplicateHeaders: [],
    blankHeaders: [],

    columnStats: {},

    parseErrors: []
  };

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Missing: ${filename}`);
    return report;
  }

  report.exists = true;

  const stat = fs.statSync(filePath);

  report.sizeBytes = stat.size;
  report.modifiedAt = stat.mtime.toISOString();
  report.sha256 = await sha256File(filePath);

  console.log(`\n🔍 Auditing ${filename}...`);
  console.log(`   Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   SHA256: ${report.sha256}`);

  return new Promise((resolve, reject) => {
    let rowNumber = 0;
    let headerCaptured = false;

    const parser = csv({
      skipLines: 0,
      strict: false
    });

    parser.on('headers', headers => {
      report.headers = headers.map(h => String(h).trim());
      report.columnCount = report.headers.length;

      const seen = new Set();

      for (const header of report.headers) {
        if (!header) {
          report.blankHeaders.push(header);
          continue;
        }

        const normalized = header.toLowerCase();

        if (seen.has(normalized)) {
          report.duplicateHeaders.push(header);
        }

        seen.add(normalized);

        report.columnStats[header] = {
          nonEmpty: 0,
          empty: 0
        };
      }

      headerCaptured = true;
    });

    parser.on('data', row => {
      rowNumber++;
      report.totalRows = rowNumber;

      // Keep only first 5 rows
      if (report.sampleRows.length < 5) {
        report.sampleRows.push(row);
      }

      // Column-level population statistics
      for (const header of report.headers) {
        const value = row[header];

        if (isBlank(value)) {
          report.columnStats[header].empty++;
        } else {
          report.columnStats[header].nonEmpty++;
        }
      }
    });

    parser.on('error', err => {
      report.parseErrors.push(err.message);
      reject(err);
    });

    parser.on('end', () => {
      if (!headerCaptured) {
        report.parseErrors.push('No CSV headers detected.');
      }

      console.log(
        `   ✅ ${report.totalRows.toLocaleString()} rows × ${report.columnCount} columns`
      );

      resolve(report);
    });

    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(parser);
  });
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 1');
  console.log(' SOURCE CSV FORENSIC AUDIT');
  console.log('============================================================');

  console.log(`\n📂 Source: ${SOURCE_DIR}`);
  console.log(`📁 Audit:  ${AUDIT_DIR}`);

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error('\n❌ SOURCE DIRECTORY DOES NOT EXIST');
    console.error(`   ${SOURCE_DIR}`);
    process.exit(1);
  }

  ensureDir(AUDIT_DIR);

  const auditResults = [];

  for (const file of CSV_FILES) {
    try {
      const result = await auditFile(file);
      auditResults.push(result);
    } catch (error) {
      console.error(
        `❌ Failed to audit ${file}: ${error.message}`
      );

      auditResults.push({
        file,
        exists: fs.existsSync(path.join(SOURCE_DIR, file)),
        error: error.message
      });
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),

    sourceDirectory: 'data/source',

    filesExpected: CSV_FILES.length,

    filesFound: auditResults.filter(x => x.exists).length,

    filesMissing: auditResults.filter(x => !x.exists).length,

    totalRows: auditResults.reduce(
      (sum, x) => sum + (x.totalRows || 0),
      0
    ),

    files: auditResults
  };

  const reportPath = path.join(
    AUDIT_DIR,
    'source-audit-report.json'
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  // Create a compact summary for humans
  const summaryPath = path.join(
    AUDIT_DIR,
    'source-audit-summary.json'
  );

  const compact = auditResults.map(file => ({
    file: file.file,
    exists: file.exists,
    sizeMB: file.sizeBytes
      ? Number((file.sizeBytes / 1024 / 1024).toFixed(2))
      : 0,
    rows: file.totalRows || 0,
    columns: file.columnCount || 0,
    sha256: file.sha256,
    duplicateHeaders: file.duplicateHeaders || [],
    blankHeaders: file.blankHeaders || [],
    parseErrors: file.parseErrors || []
  }));

  fs.writeFileSync(
    summaryPath,
    JSON.stringify(compact, null, 2),
    'utf8'
  );

  console.log('\n============================================================');
  console.log(' STEP 1 COMPLETE');
  console.log('============================================================');

  console.log(
    `📊 Files found: ${summary.filesFound}/${summary.filesExpected}`
  );

  console.log(
    `📊 Total source rows: ${summary.totalRows.toLocaleString()}`
  );

  console.log(`\n📋 Full report:`);
  console.log(`   ${reportPath}`);

  console.log(`\n📋 Compact summary:`);
  console.log(`   ${summaryPath}`);

  console.log('\n🔒 SOURCE DATA WAS NOT MODIFIED.');
  console.log('🔒 public_data WAS NOT MODIFIED.');
  console.log('🔒 No V2 files were generated.');
}

run().catch(error => {
  console.error('\n❌ SOURCE AUDIT FAILED');
  console.error(error);
  process.exit(1);
});