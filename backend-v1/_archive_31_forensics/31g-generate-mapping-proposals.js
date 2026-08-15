'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');
const REPORT_FILE = path.join(AUDIT_DIR, 'orphan_team_forensics_report.json');
const ALIAS_FILE = path.join(ROOT, 'data_audit', 'entity_resolution', 'team_alias_map.json');
const OUTPUT_FILE = path.join(AUDIT_DIR, 'orphan_mapping_proposals.json');

const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function cleanIntl(id) {
  let s = String(id).replace(/^INTL_/, '').replace(/_/g, ' ');
  const fixes = { 's o tom and pr ncipe': 'São Tomé and Príncipe', 'sz kely': 'Székely', 'k rp talja': 'Kárpátalja', 'd lvid k': 'Délvidék', 'ry ky': 'Ryūkyū', 'fr ya': 'Frøya', 'ynys m n': 'Ynys Môn' };
  for (const [a, b] of Object.entries(fixes)) s = s.replace(new RegExp(a, 'gi'), b);
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function main() {
  if (!fs.existsSync(REPORT_FILE)) throw new Error('Forensics report not found.');
  if (!fs.existsSync(ALIAS_FILE)) throw new Error('Alias map not found.');

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
  const aliasMap = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));

  console.log('🔍 Pipeline 31g — Generate Mapping Proposals');
  console.log('============================================================\n');

  const proposals = [];
  let alreadyExists = 0;
  let newProposed = 0;

  for (const f of report.findings) {
    if (f.recommendation === 'MAP_TO_EXISTING' && f.canonicalMatchId) {
      let key;
      
      if (f.type === 'INTL') {
        // Use the cleaned, normalized version of the INTL name
        const cleanedName = cleanIntl(f.orphanId);
        key = normalize(cleanedName);
      } else {
        // Numeric IDs are just strings
        key = String(f.orphanId);
      }

      const value = String(f.canonicalMatchId);

      if (aliasMap[key]) {
        // It already exists in the alias map. 
        // We note it, but we won't propose overwriting it to prevent accidental data loss.
        alreadyExists++;
      } else {
        proposals.push({ key, value, type: f.type, orphanId: f.orphanId });
        newProposed++;
      }
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      totalEvaluated: report.findings.length,
      alreadyExistsInMap: alreadyExists,
      newMappingsProposed: newProposed
    },
    proposals
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');

  console.log(`Already Exist in Map:  ${alreadyExists}`);
  console.log(`New Mappings Proposed: ${newProposed}`);
  console.log(`\nSample Proposals (First 10):`);
  proposals.slice(0, 10).forEach(p => {
    console.log(`  [${p.type}] ${p.key}  ->  ${p.value}`);
  });
  
  console.log(`\n📄 Full proposal list: ${OUTPUT_FILE}`);
  console.log('🛡️ READ-ONLY: team_alias_map.json was NOT modified.');
}

try {
  main();
} catch (e) {
  console.error('❌ Pipeline 31g failed:', e.message);
  process.exit(1);
}