// pipeline/30d-exact-duplicate-verification.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const INPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'duplicate_cluster_report.json');
const OUTPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'exact_duplicate_verification_report.json');

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

function loadFolderData(folderName) {
  const folderPath = path.join(HISTORY_DIR, folderName);
  const files = walkSync(folderPath, []);
  const matchesMap = new Map();
  let duplicateIdCount = 0;
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          if (m.match_id) {
            if (matchesMap.has(m.match_id)) {
              duplicateIdCount++;
            } else {
              matchesMap.set(m.match_id, m);
            }
          }
        }
      }
    } catch (e) {}
  }
  
  return {
    files: files.map(f => path.basename(f)).sort(),
    fileCount: files.length,
    matchesMap,
    matchCount: matchesMap.size,
    duplicateIdCount
  };
}

// Robust recursive canonicalization for nested objects/arrays
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((obj, key) => {
        obj[key] = canonicalize(value[key]);
        return obj;
      }, {});
  }
  return value;
}

function hashRecord(obj) {
  const canonical = canonicalize(obj);
  const str = JSON.stringify(canonical);
  return crypto
    .createHash('sha256')
    .update(str)
    .digest('hex');
}

console.log('🔬 Starting Strict Exact Duplicate Verification...\n');

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(`❌ Input report not found: ${INPUT_REPORT}`);
  process.exit(1);
}

const clusterReport = JSON.parse(fs.readFileSync(INPUT_REPORT, 'utf8'));
const candidateClusters = clusterReport.clusters.filter(c => c.classification === 'A_EXACT_DUPLICATE');

const verifications = [];

for (const cluster of candidateClusters) {
  console.log(`Verifying ${cluster.clusterId} (${cluster.folders[0].folder} vs ${cluster.folders[1].folder})...`);
  
  const folderA = cluster.folders[0].folder;
  const folderB = cluster.folders[1].folder;
  
  const dataA = loadFolderData(folderA);
  const dataB = loadFolderData(folderB);
  
  let missingInB = 0;
  let extraInB = 0;
  let idMatchButContentDiffers = 0;
  let exactRecordMatches = 0;
  
  // Check A against B
  for (const [id, matchA] of dataA.matchesMap.entries()) {
    const matchB = dataB.matchesMap.get(id);
    if (!matchB) {
      missingInB++;
    } else {
      if (hashRecord(matchA) === hashRecord(matchB)) {
        exactRecordMatches++;
      } else {
        idMatchButContentDiffers++;
      }
    }
  }
  
  // Check B against A for extra records
  for (const id of dataB.matchesMap.keys()) {
    if (!dataA.matchesMap.has(id)) {
      extraInB++;
    }
  }
  
  const filenamesMatch = JSON.stringify(dataA.files) === JSON.stringify(dataB.files);
  
  let classification = 'NOT_SAFE';
  if (missingInB === 0 && extraInB === 0 && idMatchButContentDiffers === 0 && filenamesMatch && dataA.fileCount === dataB.fileCount) {
    classification = 'VERIFIED_EXACT_DUPLICATE';
  } else if (missingInB === 0 && extraInB === 0 && idMatchButContentDiffers > 0) {
    classification = 'SAME_IDS_BUT_CONTENT_DIFFERS';
  } else {
    classification = 'STRUCTURAL_DIFFERENCE';
  }
  
  verifications.push({
    clusterId: cluster.clusterId,
    largestFolder: cluster.largestFolder,
    folderA,
    folderB,
    classification,
    stats: {
      fileCountA: dataA.fileCount,
      fileCountB: dataB.fileCount,
      matchCountA: dataA.matchCount,
      matchCountB: dataB.matchCount,
      duplicateIdsA: dataA.duplicateIdCount,
      duplicateIdsB: dataB.duplicateIdCount,
      filenamesMatch,
      exactRecordMatches,
      idMatchButContentDiffers,
      missingInB,
      extraInB
    }
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  totalClustersVerified: verifications.length,
  verifiedExactDuplicates: verifications.filter(v => v.classification === 'VERIFIED_EXACT_DUPLICATE').length,
  contentDifferences: verifications.filter(v => v.classification === 'SAME_IDS_BUT_CONTENT_DIFFERS').length,
  structuralDifferences: verifications.filter(v => v.classification === 'STRUCTURAL_DIFFERENCE').length,
  verifications
};

fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), 'utf8');

console.log('\n============================================================');
console.log(' STRICT EXACT DUPLICATE VERIFICATION COMPLETE');
console.log('============================================================');
console.log(`Total Clusters Verified: ${verifications.length}`);
console.log(`Verified Exact Duplicates: ${report.verifiedExactDuplicates}`);
console.log(`Same IDs But Content Differs: ${report.contentDifferences}`);
console.log(`Structural Differences: ${report.structuralDifferences}`);
console.log(`\n📄 Report written to: ${OUTPUT_REPORT}`);
console.log('🛡️ NO FILES WERE MODIFIED.');