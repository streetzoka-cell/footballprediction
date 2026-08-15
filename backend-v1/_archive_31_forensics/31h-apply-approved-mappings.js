'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const PROPOSALS_FILE = path.join(AUDIT_DIR, 'orphan_mapping_proposals.json');
const ALIAS_FILE = path.join(ROOT, 'data_audit', 'entity_resolution', 'team_alias_map.json');

function main() {
  if (!fs.existsSync(PROPOSALS_FILE)) throw new Error('Proposals file not found.');
  if (!fs.existsSync(ALIAS_FILE)) throw new Error('Alias map not found.');

  const proposals = JSON.parse(fs.readFileSync(PROPOSALS_FILE, 'utf8'));
  const aliasMap = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));

  console.log('🔧 Pipeline 31h — Apply Approved Mappings');
  console.log('============================================================\n');

  let applied = 0;

  for (const p of proposals.proposals) {
    // Final safety check: never overwrite an existing mapping
    if (!aliasMap[p.key]) {
      aliasMap[p.key] = String(p.value);
      applied++;
    }
  }

  fs.writeFileSync(ALIAS_FILE, JSON.stringify(aliasMap, null, 2), 'utf8');

  console.log(`Mappings Applied:  ${applied}`);
  console.log(`🛡️ team_alias_map.json has been updated.`);
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31h failed:', e.message);
  process.exit(1);
}