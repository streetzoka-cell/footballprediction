'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '26-history-validation-audit.txt');

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSync(fullPath, fileList);
    } else if (entry.name.endsWith('.json')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 26 (STRICT)');
  console.log(' CANONICAL HISTORY VALIDATION AUDIT');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });

  console.log('> Scanning history directory for JSON files...');
  const files = walkSync(HISTORY_DIR);
  console.log(`   Found ${files.length} history files to audit.`);

  let totalMatches = 0;
  let totalFiles = 0;
  
  const anomalies = {
    missingMatchId: 0,
    invalidDate: 0,
    nanScores: 0,
    unknownClubs: 0,
    missingCompetition: 0,
    missingSeason: 0
  };

  for (const file of files) {
    totalFiles++;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      reportLine(`❌ FATAL: Could not parse JSON in ${path.relative(ROOT, file)}: ${e.message}`);
      continue;
    }

    if (!data.matches || !Array.isArray(data.matches)) continue;

    for (const match of data.matches) {
      totalMatches++;

      if (!match.match_id) anomalies.missingMatchId++;
      if (!match.date || !/^\d{4}-\d{2}-\d{2}$/.test(match.date)) anomalies.invalidDate++;
      if (typeof match.home_score !== 'number' || typeof match.away_score !== 'number' || isNaN(match.home_score) || isNaN(match.away_score)) anomalies.nanScores++;
      if (String(match.home_team).startsWith('Unknown Club') || String(match.away_team).startsWith('Unknown Club')) anomalies.unknownClubs++;
      if (!match.competition) anomalies.missingCompetition++;
      if (!match.season) anomalies.missingSeason++;
    }
  }

  section('CANONICAL HISTORY AUDIT SUMMARY');
  reportLine(`Total Files Scanned      : ${totalFiles.toLocaleString()}`);
  reportLine(`Total Matches Validated  : ${totalMatches.toLocaleString()}`);
  
  reportLine('\n--- Anomaly Counts ---');
  reportLine(`Missing Match ID     : ${anomalies.missingMatchId.toLocaleString()}`);
  reportLine(`Invalid Date Format  : ${anomalies.invalidDate.toLocaleString()}`);
  reportLine(`NaN/Invalid Scores   : ${anomalies.nanScores.toLocaleString()}`);
  reportLine(`Unknown Clubs Found  : ${anomalies.unknownClubs.toLocaleString()}`);
  reportLine(`Missing Competition  : ${anomalies.missingCompetition.toLocaleString()}`);
  reportLine(`Missing Season       : ${anomalies.missingSeason.toLocaleString()}`);

  // STRICT CLEAN CHECK
  const isClean = 
    anomalies.missingMatchId === 0 &&
    anomalies.invalidDate === 0 &&
    anomalies.nanScores === 0 &&
    anomalies.unknownClubs === 0 &&
    anomalies.missingCompetition === 0 &&
    anomalies.missingSeason === 0;

  section('AUDIT COMPLETE');
  reportLine(`Overall Status        : ${isClean ? '✅ CLEAN - Ready for KIM' : '❌ FAIL - Contains anomalies'}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 26 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);
  console.log(`Overall Status : ${isClean ? '✅ CLEAN - Ready for KIM' : '❌ FAIL - Contains anomalies'}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});