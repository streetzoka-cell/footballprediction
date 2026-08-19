// pipeline/31d-repair-tahiti-conflict.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE_PATH = path.join(ROOT, 'public_data', 'knowledge', 'football', 'history', 'friendly', '1974.json');
const AUDIT_LOG = path.join(ROOT, 'data_audit', 'v2_integrity', 'tahiti_conflict_repair_log.json');

console.log('🛠️  Starting Surgical Repair for Tahiti/New Caledonia 1974 Conflict...');

if (!fs.existsSync(FILE_PATH)) {
  console.error(`❌ File not found: ${FILE_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
const originalLength = data.matches.length;

// Remove the erroneous 2-1 record
data.matches = data.matches.filter(m => {
  const isTarget = m.match_id === 'INTL_1974-02-17_tahiti_new_caledonia' && 
                   Number(m.home_score) === 2 && 
                   Number(m.away_score) === 1;
  return !isTarget;
});

const newLength = data.matches.length;

if (originalLength !== newLength) {
  data.total_matches = newLength;
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
  
  const log = {
    timestamp: new Date().toISOString(),
    action: 'REMOVED_ERRONEOUS_SOURCE_DUPLICATE',
    file: FILE_PATH,
    target_match_id: 'INTL_1974-02-17_tahiti_new_caledonia',
    removed_score: '2-1 (Tahiti win)',
    preserved_score: '1-2 (New Caledonia win)',
    historical_verification: 'Tahiti 1-2 New Caledonia (Feb 17, 1974)'
  };
  
  fs.writeFileSync(AUDIT_LOG, JSON.stringify(log, null, 2), 'utf8');
  console.log('✅ Erroneous 2-1 record removed. Correct 1-2 record preserved.');
  console.log(`📄 Audit log saved to: ${AUDIT_LOG}`);
} else {
  console.log('⚠️ Target record not found. No changes made.');
}