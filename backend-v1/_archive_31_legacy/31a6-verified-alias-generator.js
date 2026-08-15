'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');

const FORENSIC_FILE = path.join(MIGRATION_DIR, '31a5-unresolved-elo-data.json');
const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const TEMPLATE_FILE = path.join(MIGRATION_DIR, '31a6-manual-alias-template.json');

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.6');
  console.log(' GENERATE MANUAL REVIEW TEMPLATE (READ-ONLY)');
  console.log('============================================================\n');

  console.log('> Loading 31A.5 Forensic Data...');
  const forensic = JSON.parse(fs.readFileSync(FORENSIC_FILE, 'utf8'));
  
  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

  // Build a lookup of canonical names by entityId for reference
  const entityLookup = {};
  for (const [entityId, data] of Object.entries(entityIndex)) {
    entityLookup[entityId] = {
      canonicalName: data.canonical_name,
      type: data.type
    };
  }

  // Collect all unresolved names from all categories
  const allUnresolved = [];
  
  for (const item of forensic.NO_CANDIDATE || []) {
    allUnresolved.push({ ...item, category: 'NO_CANDIDATE' });
  }
  for (const item of forensic.NEAR_MATCH || []) {
    allUnresolved.push({ ...item, category: 'NEAR_MATCH' });
  }
  for (const item of forensic.AMBIGUOUS_CORE || []) {
    allUnresolved.push({ ...item, category: 'AMBIGUOUS_CORE' });
  }
  for (const item of forensic.RESERVE_TEAM || []) {
    allUnresolved.push({ ...item, category: 'RESERVE_TEAM' });
  }

  // Sort by record count descending (most impactful first)
  allUnresolved.sort((a, b) => b.count - a.count);

  console.log(`   Found ${allUnresolved.length} unique unresolved names.`);

  // Generate template
  const template = {
    instructions: [
      "MANUAL ALIAS CURATION TEMPLATE",
      "================================",
      "For each unresolved Elo name, fill in the 'entityId' field with the correct canonical entity ID.",
      "Leave 'entityId' as null if the name should remain unresolved.",
      "Set 'status' to one of: SAFE, REVIEW, REJECT",
      "Only entries with status='SAFE' and a valid entityId will be applied in Step 31A.7.",
      "",
      "How to find the correct entityId:",
      "1. Search entity_identity_index.json for the club's canonical name",
      "2. Verify the entity type is 'CLUB' (not NATIONAL_TEAM)",
      "3. Verify it's the correct club (check country, aliases, etc.)",
      "4. Copy the entityId into this template",
      "",
      "Examples of SAFE mappings:",
      "  'Ajax' -> entityId of 'AFC Ajax'",
      "  'Dortmund' -> entityId of 'Borussia Dortmund'",
      "  'Ath Madrid' -> entityId of 'Atlético Madrid'",
      "",
      "Examples of REJECT:",
      "  'Barcelona B' -> Reserve team, not alias of FC Barcelona",
      "  'Betis' -> Too ambiguous, could be multiple clubs",
      "  'Inter' -> Could be Inter Milan, Inter Turku, etc."
    ],
    total_unresolved: allUnresolved.length,
    total_records_at_stake: allUnresolved.reduce((sum, item) => sum + item.count, 0),
    aliases: []
  };

  for (const item of allUnresolved) {
    template.aliases.push({
      eloName: item.name,
      recordCount: item.count,
      forensicCategory: item.category,
      candidate: item.candidate || null,
      candidateEntityId: item.entityId || null,
      candidateDistance: item.distance || null,
      
      // Fields to fill in manually:
      entityId: null,
      canonicalName: null,
      status: "REVIEW",
      notes: ""
    });
  }

  fs.writeFileSync(TEMPLATE_FILE, JSON.stringify(template, null, 2), 'utf8');
  
  console.log(`\n   ✅ Saved manual review template: ${path.relative(ROOT, TEMPLATE_FILE)}`);
  console.log(`   Total records at stake: ${template.total_records_at_stake.toLocaleString()}`);
  console.log(`   Total names to review: ${template.aliases.length}\n`);
  
  console.log('============================================================');
  console.log(' STEP 31A.6 COMPLETE');
  console.log('============================================================');
  console.log('Open the template file and manually curate the aliases.');
  console.log('Set status="SAFE" and fill in entityId for confident matches.');
  console.log('Set status="REJECT" for ambiguous or dangerous matches.');
  console.log('Then run Step 31A.7 to apply only the SAFE aliases.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});