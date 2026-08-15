'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const REPORT_FILE = path.join(AUDIT_DIR, 'v2_integrity_report.json');
const QUARANTINE_DIR = path.join(ROOT, 'data_audit', 'entity_resolution', 'quarantine');
const OUTPUT_FILE = path.join(QUARANTINE_DIR, 'orphan_teams_v2.json');

function main() {
  if (!fs.existsSync(REPORT_FILE)) throw new Error('v2_integrity_report.json not found.');
  
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const orphans = report.informational_findings.orphan_team_ids || [];

  console.log('🛡️ Pipeline 31i — Generate Quarantine Manifest');
  console.log('============================================================\n');
  console.log(`Quarantining ${orphans.length} unresolved entities...`);

  const manifest = orphans.map(id => ({
    teamId: String(id),
    status: 'UNRESOLVED',
    reason: 'Historical identity unavailable in current local sources',
    safeForCanonicalCalculations: false,
    safeForFutureResolution: true
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    totalQuarantined: manifest.length,
    manifest
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log(`\n✅ Quarantine manifest created.`);
  console.log(`📄 Saved to: ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: no source/backbone files modified.');
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31i failed:', e.message);
  process.exit(1);
}