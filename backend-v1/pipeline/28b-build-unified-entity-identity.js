'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const CLUB_IDENTITY_FILE = path.join(INDEX_DIR, 'club_identity_index.json');
const UNRESOLVED_AUDIT_FILE = path.join(MIGRATION_DIR, '28a-unresolved-identity-audit.json');
const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');

const slugify = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28B');
  console.log(' SAFE UNIFIED ENTITY IDENTITY BUILDER');
  console.log('============================================================\n');

  if (!fs.existsSync(CLUB_IDENTITY_FILE) || !fs.existsSync(UNRESOLVED_AUDIT_FILE)) {
    console.error('❌ Required files from Steps 24 and 28A not found.');
    process.exit(1);
  }

  console.log('> Loading existing Club Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(CLUB_IDENTITY_FILE, 'utf8'));
  
  // Build O(1) Reverse Lookup Map
  const nameToEntityId = new Map();
  
  for (const [entityId, data] of Object.entries(entityIndex)) {
    // Enrich existing clubs with namespace/status
    data.type = 'CLUB';
    data.namespace = 'DOMESTIC';
    data.status = 'ACTIVE';
    
    nameToEntityId.set(data.canonical_name.toLowerCase(), entityId);
    for (const alias of (data.aliases || [])) {
      nameToEntityId.set(alias.toLowerCase(), entityId);
    }
  }
  console.log(`   Loaded ${Object.keys(entityIndex).length} clubs.`);

  console.log('> Loading Unresolved Identity Audit...');
  const unresolved = JSON.parse(fs.readFileSync(UNRESOLVED_AUDIT_FILE, 'utf8'));
  console.log(`   Loaded ${unresolved.length} unresolved names.`);

  let addedCount = 0;

  for (const item of unresolved) {
    const name = item.name;
    if (!name || name.trim() === '' || name.startsWith('Unknown Club')) continue;

    const lowerName = name.toLowerCase();
    if (!nameToEntityId.has(lowerName)) {
      const newId = `INTL_${slugify(name)}`;
      let id = newId;
      let counter = 1;
      // Prevent ID collisions
      while (entityIndex[id]) {
        id = `${newId}_${counter++}`;
      }

      // Broad classification for now. Historical status can be refined later 
      // without breaking the match index, because the canonical ID is stable.
      entityIndex[id] = {
        canonical_name: name,
        aliases: [name],
        type: 'NATIONAL_TEAM',
        namespace: 'INTERNATIONAL',
        status: 'ACTIVE' 
      };
      nameToEntityId.set(lowerName, id);
      addedCount++;
    }
  }

  console.log(`   Added ${addedCount} new international/historical entities.`);

  fs.writeFileSync(ENTITY_IDENTITY_FILE, JSON.stringify(entityIndex, null, 2), 'utf8');
  console.log(`\n   ✅ Saved unified entity identity index: ${path.relative(ROOT, ENTITY_IDENTITY_FILE)}`);
  console.log(`   Total Entities: ${Object.keys(entityIndex).length}`);
  
  console.log('\n============================================================');
  console.log(' STEP 28B COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});