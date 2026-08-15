// pipeline/31e-quarantine-overlapping-folders.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const REPORT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const QUARANTINE_DIR = path.join(ROOT, 'public_data', 'migration', 'quarantine', 'overlapping_history_folders');
const INPUT_REPORT = path.join(REPORT_DIR, 'folder_overlap_report.json');
const OPERATION_LOG = path.join(REPORT_DIR, 'overlap_quarantine_operation_log.json');

const DRY_RUN = process.argv.includes('--dry-run');

function walkSync(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSync(fullPath, fileList);
    else if (entry.name.endsWith('.json')) fileList.push(fullPath);
  }
  return fileList;
}

function isLegacyId(value) {
  return value !== null && value !== undefined && String(value).startsWith('INTL_');
}

function loadFolderStats(folderName) {
  const folderPath = path.join(HISTORY_DIR, folderName);
  const files = walkSync(folderPath, []);
  let canonical = 0;
  let legacy = 0;
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          if (m.home_team_id) isLegacyId(m.home_team_id) ? legacy++ : canonical++;
          if (m.away_team_id) isLegacyId(m.away_team_id) ? legacy++ : canonical++;
        }
      }
    } catch (e) {}
  }
  return { canonical, legacy };
}

console.log('============================================================');
console.log(' ZOKASCORE V2 PIPELINE — STEP 31e');
console.log(' OVERLAP-BASED FOLDER QUARANTINE');
console.log('============================================================\n');

if (DRY_RUN) {
  console.log('🏃‍♂️ DRY RUN MODE ENABLED — No files will be moved.\n');
} else {
  console.log('⚠️ LIVE MODE — Folders will be moved to quarantine.\n');
}

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(`❌ Overlap report not found: ${INPUT_REPORT}`);
  process.exit(1);
}

const overlaps = JSON.parse(fs.readFileSync(INPUT_REPORT, 'utf8'));

const operationLog = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  groupsProcessed: 0,
  groupsApproved: 0,
  groupsQuarantined: 0,
  groupsFailed: 0,
  actions: []
};

if (!DRY_RUN) {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
}

// Only process pairs with >90% overlap to be safe
const highOverlapPairs = overlaps.filter(o => o.overlapPercentage >= 90);

for (const pair of highOverlapPairs) {
  operationLog.groupsProcessed++;
  
  const statsA = loadFolderStats(pair.folderA);
  const statsB = loadFolderStats(pair.folderB);
  
  // Deterministically keep the folder with more canonical IDs
  let keepFolder = pair.folderA;
  let dupFolder = pair.folderB;
  
  if (statsB.canonical > statsA.canonical) {
    keepFolder = pair.folderB;
    dupFolder = pair.folderA;
  } else if (statsB.canonical === statsA.canonical && statsB.legacy < statsA.legacy) {
    keepFolder = pair.folderB;
    dupFolder = pair.folderA;
  }
  
  console.log(`Analyzing: ${pair.folderA} vs ${pair.folderB}`);
  console.log(`  ✅ KEEP: ${keepFolder} (Canonical: ${keepFolder === pair.folderA ? statsA.canonical : statsB.canonical})`);
  console.log(`  🗑️  QUARANTINE: ${dupFolder} (Canonical: ${dupFolder === pair.folderA ? statsA.canonical : statsB.canonical})`);
  
  operationLog.groupsApproved++;
  
  if (!DRY_RUN) {
    const sourcePath = path.join(HISTORY_DIR, dupFolder);
    const destPath = path.join(QUARANTINE_DIR, dupFolder);
    
    if (fs.existsSync(destPath)) {
      operationLog.groupsFailed++;
      console.log(`  ❌ ERROR MOVING: Quarantine destination already exists!\n`);
      operationLog.actions.push({ status: 'FAILED', reason: 'Quarantine destination already exists', dupFolder });
      continue;
    }
    
    try {
      fs.renameSync(sourcePath, destPath);
      operationLog.groupsQuarantined++;
      operationLog.actions.push({ status: 'QUARANTINED', keepFolder, dupFolder, destination: destPath });
      console.log(`  📦 MOVED to quarantine.\n`);
    } catch (err) {
      operationLog.groupsFailed++;
      console.error(`  ❌ ERROR MOVING FOLDER: ${err.message}\n`);
      operationLog.actions.push({ status: 'MOVE_ERROR', dupFolder, error: err.message });
    }
  } else {
    operationLog.actions.push({ status: 'DRY_RUN_SAFE', keepFolder, dupFolder });
    console.log(`  (Dry Run: folder NOT moved)\n`);
  }
}

fs.writeFileSync(OPERATION_LOG, JSON.stringify(operationLog, null, 2), 'utf8');

console.log('============================================================');
console.log(' STEP 31e COMPLETE');
console.log('============================================================');
console.log(`Groups Processed:  ${operationLog.groupsProcessed}`);
console.log(`Groups Approved:   ${operationLog.groupsApproved}`);
if (!DRY_RUN) {
  console.log(`Groups Quarantined:${operationLog.groupsQuarantined}`);
}
console.log(`Groups Failed:     ${operationLog.groupsFailed}`);
console.log(`\n📄 Operation log written to: ${OPERATION_LOG}`);
if (DRY_RUN) {
  console.log('\n🛡️ DRY RUN COMPLETED. No files were moved.');
} else {
  console.log('\n📦 Overlapping folders moved to quarantine.');
}