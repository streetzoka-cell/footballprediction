// pipeline/30c-duplicate-folder-cluster-audit.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'folder_overlap_report.json');
const OUTPUT_REPORT = path.join(ROOT, 'data_audit', 'v2_integrity', 'duplicate_cluster_report.json');

console.log('🔬 Building Duplicate Folder Clusters from Complete Matrix...\n');

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(`❌ Input report not found: ${INPUT_REPORT}`);
  process.exit(1);
}

const overlaps = JSON.parse(fs.readFileSync(INPUT_REPORT, 'utf8'));

// 1. Union-Find to group folders into connected clusters
const parent = {};
function find(i) {
  if (parent[i] === i) return i;
  parent[i] = find(parent[i]);
  return parent[i];
}
function union(i, j) {
  const rootI = find(i);
  const rootJ = find(j);
  if (rootI !== rootJ) parent[rootI] = rootJ;
}

const allFolders = new Set();
for (const o of overlaps) {
  allFolders.add(o.folderA);
  allFolders.add(o.folderB);
}
for (const f of allFolders) parent[f] = f;

for (const o of overlaps) {
  union(o.folderA, o.folderB);
}

const clusterMap = new Map();
for (const f of allFolders) {
  const root = find(f);
  if (!clusterMap.has(root)) clusterMap.set(root, []);
  clusterMap.get(root).push(f);
}

const clusters = [];

// 2. Analyze each cluster
for (const [root, folders] of clusterMap.entries()) {
  if (folders.length < 2) continue;

  // Gather all pairwise relationships within this cluster
  const relationships = overlaps.filter(o => 
    folders.includes(o.folderA) && folders.includes(o.folderB)
  );

  // Calculate folder stats accurately by taking the max match count seen across all relationships
  const folderStats = {};
  for (const f of folders) folderStats[f] = 0;
  
  for (const r of relationships) {
    folderStats[r.folderA] = Math.max(folderStats[r.folderA], r.matchesA);
    folderStats[r.folderB] = Math.max(folderStats[r.folderB], r.matchesB);
  }

  // Determine the "largest" folder
  let largestFolder = folders[0];
  let maxMatches = -1;
  for (const f of folders) {
    if (folderStats[f] > maxMatches) {
      maxMatches = folderStats[f];
      largestFolder = f;
    }
  }

  // Classify the cluster based on relationship topology
  let exactClonePairs = 0;
  let containsPartialOverlap = false;
  let containsContainment = false; // 100% overlap but different sizes
  
  for (const r of relationships) {
    if (r.overlapPercentage === 100 && r.matchesA === r.matchesB) {
      exactClonePairs++;
    } else if (r.overlapPercentage === 100 && r.matchesA !== r.matchesB) {
      containsContainment = true;
    } else if (r.overlapPercentage < 100) {
      containsPartialOverlap = true;
    }
  }

  let classification = 'UNKNOWN';
  let recommendedAction = 'MANUAL_REVIEW';

  // If every relationship is a 100% exact clone
  if (exactClonePairs === relationships.length) {
    classification = 'A_EXACT_DUPLICATE';
    recommendedAction = 'SAFE_QUARANTINE_CANDIDATE';
  } 
  // If there are exact clones but also containments (e.g., A=B, A⊂C)
  else if (containsContainment && !containsPartialOverlap) {
    classification = 'C_CONTAINMENT_NETWORK';
    recommendedAction = 'MANUAL_REVIEW';
  } 
  // If there are partial overlaps (e.g., 86% shared)
  else if (containsPartialOverlap) {
    classification = 'B_MIXED_OVERLAP';
    recommendedAction = 'MANUAL_REVIEW';
  }

  clusters.push({
    clusterId: `CLUSTER_${clusters.length + 1}`,
    classification,
    largestFolder,
    recommendedAction,
    folders: folders.map(f => ({ folder: f, matchCount: folderStats[f] })),
    relationships
  });
}

// Sort clusters by size (largest match count in cluster)
clusters.sort((a, b) => {
  const aMax = Math.max(...a.folders.map(f => f.matchCount));
  const bMax = Math.max(...b.folders.map(f => f.matchCount));
  return bMax - aMax;
});

const report = {
  generatedAt: new Date().toISOString(),
  totalClusters: clusters.length,
  safeQuarantineCandidates: clusters.filter(c => c.classification === 'A_EXACT_DUPLICATE').length,
  manualReviewRequired: clusters.filter(c => c.classification !== 'A_EXACT_DUPLICATE').length,
  clusters
};

fs.writeFileSync(OUTPUT_REPORT, JSON.stringify(report, null, 2), 'utf8');

console.log('============================================================');
console.log(' DUPLICATE FOLDER CLUSTER AUDIT COMPLETE');
console.log('============================================================');
console.log(`Total Clusters Found: ${clusters.length}`);
console.log(`Safe Quarantine Candidates (Exact Duplicates): ${report.safeQuarantineCandidates}`);
console.log(`Manual Review Required (Mixed/Containment): ${report.manualReviewRequired}\n`);

clusters.forEach(c => {
  console.log(`------------------------------------------------------------`);
  console.log(`${c.clusterId} [${c.classification}] → ${c.recommendedAction}`);
  console.log(`Largest Folder: ${c.largestFolder}`);
  c.folders.forEach(f => {
    const isLargest = f.folder === c.largestFolder ? '👑 ' : '   ';
    console.log(`${isLargest}${f.folder} (${f.matchCount} matches)`);
  });
  console.log(`Relationships:`);
  c.relationships.forEach(r => {
    console.log(`   ${r.folderA} ↔ ${r.folderB} | ${r.sharedMatches}/${r.matchesA > r.matchesB ? r.matchesB : r.matchesA} (${r.overlapPercentage}%)`);
  });
  console.log('');
});

console.log(`📄 Report written to: ${OUTPUT_REPORT}`);
console.log('🛡️ NO FILES WERE MODIFIED.');