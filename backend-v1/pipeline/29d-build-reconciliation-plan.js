// pipeline/29d-build-reconciliation-plan.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const REPORT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');

const INPUT_REPORT = path.join(REPORT_DIR, 'semantic_comparison_report.json');
const OUTPUT_PLAN = path.join(REPORT_DIR, 'reconciliation_plan.json');

console.log('🏗️  Building Historical Reconciliation Plan...\n');

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(`❌ Input report not found: ${INPUT_REPORT}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(INPUT_REPORT, 'utf8'));
const plan = {
  generatedAt: new Date().toISOString(),
  totalActions: 0,
  actions: []
};

function loadMatch(folder, file, matchId) {
  const filePath = path.join(HISTORY_DIR, folder, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return data.matches.find(m => m.match_id === matchId);
  } catch (e) {
    return null;
  }
}

for (const group of report.groups) {
  for (const semGroup of group.semanticGroups) {
    if (semGroup.versions.length < 2) continue;

    // Find the base record (highest richness)
    const baseVersion = semGroup.recommendedRichestVersion;
    if (!baseVersion) continue;

    const baseMatch = loadMatch(baseVersion.folder, baseVersion.file, baseVersion.match_id);
    if (!baseMatch) continue;

    let actionTaken = false;
    const fieldsToMerge = {};

    // Compare against all other versions
    for (const version of semGroup.versions) {
      if (version.match_id === baseVersion.match_id && version.folder === baseVersion.folder) continue;

      const otherMatch = loadMatch(version.folder, version.file, version.match_id);
      if (!otherMatch) continue;

      // Field-level merge logic
      const mergeFields = ['goals', 'shootout', 'attendance', 'round', 'competition_id'];
      
      for (const field of mergeFields) {
        const baseVal = baseMatch[field];
        const otherVal = otherMatch[field];
        
        const baseHasData = (Array.isArray(baseVal) ? baseVal.length > 0 : (baseVal !== null && baseVal !== undefined && baseVal !== ''));
        const otherHasData = (Array.isArray(otherVal) ? otherVal.length > 0 : (otherVal !== null && otherVal !== undefined && otherVal !== ''));

        if (!baseHasData && otherHasData) {
          fieldsToMerge[field] = {
            value: otherVal,
            sourceFolder: version.folder,
            sourceFile: version.file,
            sourceMatchId: version.match_id
          };
          actionTaken = true;
        }
      }
    }

    if (actionTaken) {
      plan.totalActions++;
      plan.actions.push({
        targetFolder: baseVersion.folder,
        targetFile: baseVersion.file,
        targetMatchId: baseVersion.match_id,
        fieldsToMerge
      });
    }
  }
}

fs.writeFileSync(OUTPUT_PLAN, JSON.stringify(plan, null, 2), 'utf8');

console.log('============================================================');
console.log(' RECONCILIATION PLAN COMPLETE');
console.log('============================================================');
console.log(`Total matches targeted for field-level merge: ${plan.totalActions}`);
console.log('\n📄 Plan written to:');
console.log(OUTPUT_PLAN);
console.log('\n🛡️ NO FILES WERE MODIFIED. Review the plan before running 29e.');