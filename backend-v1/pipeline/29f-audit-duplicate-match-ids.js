// pipeline/29f-audit-duplicate-match-ids.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history');
const REPORT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const REPORT_FILE = path.join(REPORT_DIR, 'duplicate_match_id_audit.json');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walkDir(fullPath, callback);
    else if (file.endsWith('.json')) callback(fullPath);
  }
}

console.log('🔍 Starting Duplicate Match ID Forensic Audit...\n');

const matchMap = new Map();

walkDir(HISTORY_DIR, (filePath) => {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data.matches)) return;

    for (const match of data.matches) {
      if (!match.match_id) continue;
      
      if (!matchMap.has(match.match_id)) {
        matchMap.set(match.match_id, []);
      }
      
      matchMap.get(match.match_id).push({
        ...match,
        __file: path.relative(ROOT, filePath)
      });
    }
  } catch (e) {}
});

const duplicates = [];
for (const [id, records] of matchMap.entries()) {
  if (records.length > 1) {
    duplicates.push({ match_id: id, records });
  }
}

const classification = {
  EXACT_DUPLICATE: 0,
  METADATA_DIFFERENCE: 0,
  ID_DIFFERENCE: 0,
  SCORE_OR_TEAM_CONFLICT: 0,
  TOTAL_DUPLICATE_IDS: duplicates.length
};

const reportDetails = [];

for (const dup of duplicates) {
  const records = dup.records;
  const first = records[0];
  
  // Compare fields
  const scoresMatch = records.every(r => r.home_score === first.home_score && r.away_score === first.away_score);
  const teamsMatch = records.every(r => r.home_team === first.home_team && r.away_team === first.away_team);
  const datesMatch = records.every(r => r.date === first.date);
  const idsMatch = records.every(r => r.home_team_id === first.home_team_id && r.away_team_id === first.away_team_id);
  
  const metadataFields = ['competition', 'season', 'round', 'stadium', 'goals', 'shootout', 'attendance', 'competition_id'];
  const metadataMatch = records.every(r => metadataFields.every(f => JSON.stringify(r[f]) === JSON.stringify(first[f])));

  let type = 'UNKNOWN';
  
  if (scoresMatch && teamsMatch && datesMatch && idsMatch && metadataMatch) {
    type = 'EXACT_DUPLICATE';
  } else if (scoresMatch && teamsMatch && datesMatch && idsMatch && !metadataMatch) {
    type = 'METADATA_DIFFERENCE';
  } else if (scoresMatch && teamsMatch && datesMatch && !idsMatch && metadataMatch) {
    type = 'ID_DIFFERENCE';
  } else if (!scoresMatch || !teamsMatch || !datesMatch) {
    type = 'SCORE_OR_TEAM_CONFLICT';
  } else {
    // Mixed ID and Metadata differences
    type = 'METADATA_DIFFERENCE';
  }

  classification[type]++;

  if (reportDetails.length < 20) {
    reportDetails.push({
      match_id: dup.match_id,
      type,
      occurrences: records.length,
      files: records.map(r => r.__file),
      home_team: first.home_team,
      away_team: first.away_team,
      home_team_id_variants: [...new Set(records.map(r => r.home_team_id))],
      away_team_id_variants: [...new Set(records.map(r => r.away_team_id))],
      score_variants: [...new Set(records.map(r => `${r.home_score}-${r.away_score}`))]
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  classification,
  details: reportDetails
};

fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');

console.log('============================================================');
console.log(' DUPLICATE MATCH ID AUDIT COMPLETE');
console.log('============================================================');
console.log(`Total Duplicate IDs Found: ${classification.TOTAL_DUPLICATE_IDS}`);
console.log(`  - Exact Duplicates:       ${classification.EXACT_DUPLICATE}`);
console.log(`  - Metadata Differences:   ${classification.METADATA_DIFFERENCE}`);
console.log(`  - ID Differences:         ${classification.ID_DIFFERENCE}`);
console.log(`  - Score/Team Conflicts:   ${classification.SCORE_OR_TEAM_CONFLICT}`);
console.log(`\n📄 Report written to: ${REPORT_FILE}`);
console.log('\n🛡️ NO FILES WERE MODIFIED.');