'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28C (FIX)
 * NON-DESTRUCTIVE SURGICAL ANOMALY RESOLVER
 * ============================================================
 * 
 * PURPOSE:
 * 1. Surgically remove 2 ambiguous aliases from entity_identity_index.json.
 * 2. Generate a manifest of 122 empty references for Step 28D to skip.
 * 3. DO NOT modify or delete any canonical history files.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const QUARANTINE_MANIFEST_FILE = path.join(MIGRATION_DIR, '28c-empty-references-manifest.json');

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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28C (FIX)');
  console.log(' NON-DESTRUCTIVE SURGICAL ANOMALY RESOLVER');
  console.log('============================================================\n');

  // --- PART 1: Fix Identity Collisions Non-Destructively ---
  console.log('> Loading Unified Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

  const collisionFixes = [
    { id: '6407', aliasToRemove: 'Dinamo St. Petersburg' },
    { id: '12069', aliasToRemove: 'Volga Tver' }
  ];

  for (const fix of collisionFixes) {
    if (entityIndex[fix.id] && entityIndex[fix.id].aliases) {
      const targetNorm = normalizeIdentityName(fix.aliasToRemove);
      const originalLength = entityIndex[fix.id].aliases.length;
      
      // Filter using the same normalization logic
      entityIndex[fix.id].aliases = entityIndex[fix.id].aliases.filter(a => {
        return normalizeIdentityName(a) !== targetNorm;
      });
      
      console.log(`   Fixed collision for ${fix.id}: Removed "${fix.aliasToRemove}" (${originalLength - entityIndex[fix.id].aliases.length} alias removed)`);
    }
  }

  fs.writeFileSync(ENTITY_IDENTITY_FILE, JSON.stringify(entityIndex, null, 2), 'utf8');
  console.log('   ✅ Saved updated entity_identity_index.json\n');

  // --- PART 2: Generate Empty Reference Manifest ---
  console.log('> Scanning history files to identify empty references...');
  const files = walkSync(HISTORY_DIR);
  const manifest = [];
  let emptyCount = 0;

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) { continue; }

    if (!data.matches || !Array.isArray(data.matches)) continue;

    for (const match of data.matches) {
      const homeEmpty = !String(match.home_team || '').trim();
      const awayEmpty = !String(match.away_team || '').trim();

      if (homeEmpty || awayEmpty) {
        emptyCount++;
        manifest.push({
          match_id: match.match_id,
          source_file: path.relative(ROOT, file),
          home_team: match.home_team,
          away_team: match.away_team,
          date: match.date
        });
      }
    }
  }

  fs.writeFileSync(QUARANTINE_MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`   ✅ Generated manifest with ${emptyCount} empty references.`);
  console.log(`   ✅ Manifest saved to: ${path.relative(ROOT, QUARANTINE_MANIFEST_FILE)}`);
  console.log('   (History files were NOT modified)\n');

  console.log('============================================================');
  console.log(' STEP 28C FIX COMPLETE');
  console.log('============================================================');
  console.log('The identity index is surgically cleaned of ambiguous aliases.');
  console.log('The 122 incomplete records are documented for Step 28D to skip.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});