'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28C (AUDIT)
 * ENTITY ANOMALY INVESTIGATION
 * ============================================================
 * 
 * PURPOSE:
 * - Audit 122 empty team references (match_id, date, comp, etc.).
 * - Audit duplicate alias collisions (identify conflicting canonical names).
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
const EMPTY_REPORT_FILE = path.join(MIGRATION_DIR, '28c-a-empty-references.txt');
const COLLISION_REPORT_FILE = path.join(MIGRATION_DIR, '28c-b-identity-collisions.txt');

function normalizeIdentityName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28C (AUDIT)');
  console.log(' ENTITY ANOMALY INVESTIGATION');
  console.log('============================================================\n');

  if (!fs.existsSync(ENTITY_IDENTITY_FILE)) {
    console.error('❌ Entity identity index not found.');
    process.exit(1);
  }

  console.log('> Loading Unified Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  
  // 1. Detect Collisions & Build Reverse Lookup
  const nameToEntityIds = new Map(); // Map<normalizedName, Set<entityIds>>
  for (const [entityId, data] of Object.entries(entityIndex)) {
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      const norm = normalizeIdentityName(name);
      if (!nameToEntityIds.has(norm)) nameToEntityIds.set(norm, new Set());
      nameToEntityIds.get(norm).add(entityId);
    }
  }

  const collisions = [];
  for (const [name, ids] of nameToEntityIds.entries()) {
    if (ids.size > 1) {
      const conflictingEntities = [...ids].map(id => ({
        id,
        canonical_name: entityIndex[id]?.canonical_name || 'UNKNOWN',
        type: entityIndex[id]?.type || 'UNKNOWN'
      }));
      collisions.push({ alias: name, entities: conflictingEntities });
    }
  }

  const collisionReport = [];
  collisionReport.push('ZOKASCORE V2 PIPELINE — STEP 28C-B: IDENTITY COLLISIONS');
  collisionReport.push(`Generated: ${new Date().toISOString()}`);
  collisionReport.push('\n============================================================');
  collisionReport.push(' COLLISION SUMMARY');
  collisionReport.push('============================================================');
  collisionReport.push(`Total Conflicting Aliases : ${collisions.length}\n`);

  collisions.forEach((c, i) => {
    collisionReport.push(`------------------------------------------------------------`);
    collisionReport.push(`Conflict #${i + 1}: "${c.alias}"`);
    c.entities.forEach(e => {
      collisionReport.push(`  → Maps to ID: ${e.id}`);
      collisionReport.push(`    Canonical Name: ${e.canonical_name}`);
      collisionReport.push(`    Entity Type:    ${e.type}`);
    });
  });

  fs.writeFileSync(COLLISION_REPORT_FILE, collisionReport.join('\n') + '\n', 'utf8');
  console.log(`   ✅ Saved identity collision report: ${path.relative(ROOT, COLLISION_REPORT_FILE)}`);

  // 2. Audit Empty References in History
  console.log('\n> Scanning history files for empty team references...');
  const files = walkSync(HISTORY_DIR);
  
  const emptyReport = [];
  emptyReport.push('ZOKASCORE V2 PIPELINE — STEP 28C-A: EMPTY REFERENCES');
  emptyReport.push(`Generated: ${new Date().toISOString()}`);
  emptyReport.push('\n============================================================');
  emptyReport.push(' EMPTY REFERENCE RECORDS');
  emptyReport.push('============================================================\n');

  let emptyCount = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.matches) continue;

    for (const match of data.matches) {
      const homeEmpty = !String(match.home_team || '').trim();
      const awayEmpty = !String(match.away_team || '').trim();

      if (homeEmpty || awayEmpty) {
        emptyCount++;
        emptyReport.push(`Match ID   : ${match.match_id}`);
        emptyReport.push(`Date       : ${match.date}`);
        emptyReport.push(`Competition: ${match.competition}`);
        emptyReport.push(`Season     : ${match.season}`);
        emptyReport.push(`Home Team  : "${match.home_team}" ${homeEmpty ? '<-- EMPTY' : ''}`);
        emptyReport.push(`Away Team  : "${match.away_team}" ${awayEmpty ? '<-- EMPTY' : ''}`);
        emptyReport.push(`Source File: ${path.relative(ROOT, file)}\n`);
      }
    }
  }

  emptyReport.push('------------------------------------------------------------');
  emptyReport.push(`Total Empty References Found: ${emptyCount}`);

  fs.writeFileSync(EMPTY_REPORT_FILE, emptyReport.join('\n') + '\n', 'utf8');
  console.log(`   ✅ Saved empty references report: ${path.relative(ROOT, EMPTY_REPORT_FILE)}`);

  console.log('\n============================================================');
  console.log(' STEP 28C AUDIT COMPLETE');
  console.log('============================================================');
  console.log(`Empty References    : ${emptyCount}`);
  console.log(`Identity Collisions : ${collisions.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});