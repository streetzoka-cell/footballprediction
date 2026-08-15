'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28D
 * HISTORICAL INTELLIGENCE INDEX BUILDER (Hardened + Enrichment)
 * ============================================================
 * 
 * PURPOSE:
 * - Read the 228,957 clean canonical matches (IMMUTABLE).
 * - Resolve team names to canonical entity_ids.
 * - ENRICH raw history files by writing missing IDs back to disk.
 * - Guard against normalized identity collisions.
 * - Track and report any unexpected unresolved names.
 * - Build Team Match Index and H2H Match Index.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const TEAM_INDEX_FILE = path.join(INDEX_DIR, 'team_match_index.json');
const H2H_INDEX_FILE = path.join(INDEX_DIR, 'h2h_match_index.json');

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
  const entries = fs.readdirSync(dir, { withFileTypes: true }); // Fixed typo here
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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28D');
  console.log(' HISTORICAL INTELLIGENCE INDEX BUILDER (ENRICHMENT ENABLED)');
  console.log('============================================================\n');

  if (!fs.existsSync(ENTITY_IDENTITY_FILE)) {
    console.error('❌ Entity identity index not found. Run Step 28B first.');
    process.exit(1);
  }

  console.log('> Loading Unified Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  
  // 1. Build O(1) Reverse Lookup Map with Normalization & Collision Guard
  const nameToEntityId = new Map();
  const collisions = new Map(); // normName -> Set<entityIds>

  for (const [entityId, data] of Object.entries(entityIndex)) {
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      const norm = normalizeIdentityName(name);
      
      if (nameToEntityId.has(norm) && nameToEntityId.get(norm) !== entityId) {
        if (!collisions.has(norm)) collisions.set(norm, new Set());
        collisions.get(norm).add(nameToEntityId.get(norm));
        collisions.get(norm).add(entityId);
      } else {
        nameToEntityId.set(norm, entityId);
      }
    }
  }

  if (collisions.size > 0) {
    console.error(`\n❌ FATAL: ${collisions.size} normalized identity collisions detected!`);
    console.error('Cannot safely build indexes. Fix entity_identity_index.json first.');
    for (const [norm, ids] of collisions.entries()) {
      console.error(`  "${norm}" maps to: ${[...ids].join(', ')}`);
    }
    process.exit(1);
  }
  console.log(`   Loaded ${Object.keys(entityIndex).length} entities (0 collisions).`);

  const files = walkSync(HISTORY_DIR);
  console.log(`> Scanning ${files.length} history files...`);

  const teamIndex = new Map();
  const h2hIndex = new Map();

  let totalMatches = 0;
  let indexedMatches = 0;
  let skippedEmpty = 0;
  let skippedUnresolved = 0;
  let filesEnriched = 0;
  const unresolvedNames = new Map(); // Track unexpected unresolved names

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.matches) continue;

    let fileModified = false;

    for (const match of data.matches) {
      totalMatches++;
      
      const homeName = String(match.home_team || '').trim();
      const awayName = String(match.away_team || '').trim();

      // Skip incomplete records (the 122 known empties)
      if (!homeName || !awayName) {
        skippedEmpty++;
        continue;
      }

      const homeId = nameToEntityId.get(normalizeIdentityName(homeName));
      const awayId = nameToEntityId.get(normalizeIdentityName(awayName));

      // Track unexpected unresolved names
      if (!homeId || !awayId) {
        skippedUnresolved++;
        if (!homeId) unresolvedNames.set(homeName, (unresolvedNames.get(homeName) || 0) + 1);
        if (!awayId) unresolvedNames.set(awayName, (unresolvedNames.get(awayName) || 0) + 1);
        continue;
      }

      // --- ENRICHMENT LOGIC ---
      // If the raw history file is missing the IDs, write them back!
      if (!match.home_team_id || !match.away_team_id) {
        match.home_team_id = homeId;
        match.away_team_id = awayId;
        fileModified = true;
      }

      // Create a lean match object for the index
      const leanMatch = {
        match_id: match.match_id,
        date: match.date,
        competition: match.competition,
        season: match.season,
        home_club_id: homeId,
        home_team: match.home_team,
        away_club_id: awayId,
        away_team: match.away_team,
        home_score: match.home_score,
        away_score: match.away_score
      };

      // 2. Team Index
      if (!teamIndex.has(homeId)) teamIndex.set(homeId, []);
      if (!teamIndex.has(awayId)) teamIndex.set(awayId, []);
      
      teamIndex.get(homeId).push(leanMatch);
      teamIndex.get(awayId).push(leanMatch);

      // 3. H2H Index
      const ids = [homeId, awayId].sort(); // Sort ensures consistency
      const h2hKey = `${ids[0]}|${ids[1]}`;
      
      if (!h2hIndex.has(h2hKey)) h2hIndex.set(h2hKey, []);
      h2hIndex.get(h2hKey).push(leanMatch);
      
      indexedMatches++;
    }

    // Save the enriched matches back to the raw history file
    if (fileModified) {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      filesEnriched++;
    }
  }

  console.log(`\n> Processed ${totalMatches.toLocaleString()} matches.`);
  console.log(`  Indexed: ${indexedMatches.toLocaleString()} | Skipped Empty: ${skippedEmpty} | Skipped Unresolved: ${skippedUnresolved}`);
  console.log(`  📁 Raw history files enriched with IDs: ${filesEnriched.toLocaleString()}`);

  if (unresolvedNames.size > 0) {
    console.warn('\n⚠️ Unexpected Unresolved Names:');
    const sortedUnresolved = [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]);
    sortedUnresolved.forEach(([name, count]) => console.warn(`   "${name}" (${count} occurrences)`));
  }

  console.log('\n> Sorting indexes chronologically...');
  for (const matches of teamIndex.values()) {
    matches.sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const matches of h2hIndex.values()) {
    matches.sort((a, b) => a.date.localeCompare(b.date));
  }

  const teamIndexObj = Object.fromEntries(teamIndex);
  const h2hIndexObj = Object.fromEntries(h2hIndex);

  console.log('> Writing team match index...');
  fs.writeFileSync(TEAM_INDEX_FILE, JSON.stringify(teamIndexObj), 'utf8');
  console.log(`   ✅ Saved: ${path.relative(ROOT, TEAM_INDEX_FILE)}`);

  console.log('> Writing H2H match index...');
  fs.writeFileSync(H2H_INDEX_FILE, JSON.stringify(h2hIndexObj), 'utf8');
  console.log(`   ✅ Saved: ${path.relative(ROOT, H2H_INDEX_FILE)}`);

  console.log('\n============================================================');
  console.log(' STEP 28D COMPLETE');
  console.log('============================================================');
  console.log(`Total Matches Indexed   : ${indexedMatches.toLocaleString()}`);
  console.log(`Total Entities Indexed  : ${Object.keys(teamIndexObj).length.toLocaleString()}`);
  console.log(`Total H2H Rivals Indexed : ${Object.keys(h2hIndexObj).length.toLocaleString()}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});