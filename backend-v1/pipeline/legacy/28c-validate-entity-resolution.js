'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28C
 * UNIFIED ENTITY RESOLUTION VALIDATION (Normalized)
 * ============================================================
 * 
 * PURPOSE:
 * - Scan 228,957 canonical matches.
 * - Attempt to resolve all 457,914 team references using entity_identity_index.json.
 * - Use robust Unicode/whitespace normalization.
 * - Detect duplicate aliases mapping to different IDs.
 * - STRICTLY READ-ONLY.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '28c-entity-resolution-validation.txt');

// Robust normalization function
function normalizeIdentityName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
    .trim()
    .replace(/\s+/g, ' ')            // Collapse multiple spaces
    .toLowerCase();
}

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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28C');
  console.log(' UNIFIED ENTITY RESOLUTION VALIDATION');
  console.log('============================================================\n');

  if (!fs.existsSync(ENTITY_IDENTITY_FILE)) {
    console.error('❌ Entity identity index not found. Run Step 28B first.');
    process.exit(1);
  }

  console.log('> Loading Unified Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  console.log(`   Loaded ${Object.keys(entityIndex).length} entities.`);

  const nameToEntityId = new Map();
  const duplicateAliases = [];

  for (const [entityId, data] of Object.entries(entityIndex)) {
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      const normalizedName = normalizeIdentityName(name);
      if (nameToEntityId.has(normalizedName) && nameToEntityId.get(normalizedName) !== entityId) {
        duplicateAliases.push({
          alias: name,
          normalized: normalizedName,
          id1: nameToEntityId.get(normalizedName),
          id2: entityId
        });
      } else {
        nameToEntityId.set(normalizedName, entityId);
      }
    }
  }
  console.log(`   Built reverse lookup map with ${nameToEntityId.size} unique normalized names.`);

  const files = walkSync(HISTORY_DIR);
  console.log(`> Scanning ${files.length} history files to validate resolution...\n`);

  let totalMatches = 0;
  let totalReferences = 0;
  let resolvedReferences = 0;
  const unresolvedNames = new Map(); // Map<Name, Count>

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.matches) continue;

    for (const match of data.matches) {
      totalMatches++;
      
      const homeName = String(match.home_team);
      const awayName = String(match.away_team);

      // Check Home
      totalReferences++;
      if (nameToEntityId.has(normalizeIdentityName(homeName))) {
        resolvedReferences++;
      } else {
        unresolvedNames.set(homeName, (unresolvedNames.get(homeName) || 0) + 1);
      }

      // Check Away
      totalReferences++;
      if (nameToEntityId.has(normalizeIdentityName(awayName))) {
        resolvedReferences++;
      } else {
        unresolvedNames.set(awayName, (unresolvedNames.get(awayName) || 0) + 1);
      }
    }
  }

  const unresolvedCount = totalReferences - resolvedReferences;
  const resolutionRate = ((resolvedReferences / totalReferences) * 100).toFixed(4);

  const report = [];
  report.push('ZOKASCORE V2 PIPELINE — STEP 28C: UNIFIED ENTITY RESOLUTION VALIDATION');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('\n============================================================');
  report.push(' RESOLUTION SUMMARY');
  report.push('============================================================');
  report.push(`Total Matches Scanned       : ${totalMatches.toLocaleString()}`);
  report.push(`Total Team References        : ${totalReferences.toLocaleString()}`);
  report.push(`Resolved References          : ${resolvedReferences.toLocaleString()}`);
  report.push(`Unresolved References        : ${unresolvedCount.toLocaleString()}`);
  report.push(`Resolution Rate              : ${resolutionRate}%`);

  report.push('\n============================================================');
  report.push(' IDENTITY INTEGRITY');
  report.push('============================================================');
  report.push(`Duplicate Aliases Found      : ${duplicateAliases.length}`);
  if (duplicateAliases.length > 0) {
    report.push('--- Duplicate Aliases ---');
    duplicateAliases.slice(0, 20).forEach(d => reportLine(report, `  "${d.alias}" (${d.normalized}) maps to both ${d.id1} and ${d.id2}`));
  }

  if (unresolvedCount > 0) {
    report.push('\n============================================================');
    report.push(' TOP 20 UNRESOLVED NAMES');
    report.push('============================================================');
    const sortedUnresolved = [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]);
    sortedUnresolved.slice(0, 20).forEach(([name, count], i) => {
      reportLine(report, `${i + 1}. "${name}" (${count} occurrences)`);
    });
  }

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log('============================================================');
  console.log(' STEP 28C COMPLETE');
  console.log('============================================================');
  console.log(`Total References   : ${totalReferences.toLocaleString()}`);
  console.log(`Resolved           : ${resolvedReferences.toLocaleString()}`);
  console.log(`Unresolved         : ${unresolvedCount.toLocaleString()}`);
  console.log(`Resolution Rate    : ${resolutionRate}%`);
  console.log(`Duplicate Aliases  : ${duplicateAliases.length}`);
  console.log(`📄 FULL REPORT      : ${REPORT_FILE}`);
  
  if (unresolvedCount === 0 && duplicateAliases.length === 0) {
    console.log('\n✅ CLEAN - Ready to rebuild intelligence indexes.');
  } else {
    console.log('\n⚠️ WARN - Contains anomalies. Review report before proceeding.');
  }
}

function reportLine(arr, text = '') { arr.push(text); }

main().catch(err => {
  console.error(err);
  process.exit(1);
});