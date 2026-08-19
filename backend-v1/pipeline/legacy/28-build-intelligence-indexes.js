'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 28
 * HISTORICAL RETRIEVAL & INTELLIGENCE INDEX BUILDER (ID-BASED)
 * ============================================================
 * 
 * PURPOSE:
 * - Read the 228,957 clean canonical matches.
 * - Resolve team names to canonical club_ids using Step 24's index.
 * - Build Team Match Index (Club ID -> Sorted Matches).
 * - Build H2H Match Index (Club ID A | Club ID B -> Sorted Meetings).
 * - STRICTLY KEYED BY ID TO PREVENT NAME COLLISIONS.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HISTORY_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'history');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');

const CLUB_IDENTITY_FILE = path.join(INDEX_DIR, 'club_identity_index.json');
const TEAM_INDEX_FILE = path.join(INDEX_DIR, 'team_match_index.json');
const H2H_INDEX_FILE = path.join(INDEX_DIR, 'h2h_match_index.json');

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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 28');
  console.log(' HISTORICAL RETRIEVAL & INTELLIGENCE INDEX BUILDER');
  console.log('============================================================\n');

  if (!fs.existsSync(CLUB_IDENTITY_FILE)) {
    console.error('❌ Club identity index not found. Run Step 24 first.');
    process.exit(1);
  }

  console.log('> Loading Club Identity Index...');
  const clubIdentity = JSON.parse(fs.readFileSync(CLUB_IDENTITY_FILE, 'utf8'));
  
  // Build Reverse Lookup: Name -> Club ID
  const nameToIdMap = new Map();
  for (const [clubId, data] of Object.entries(clubIdentity)) {
    nameToIdMap.set(data.canonical_name.toLowerCase(), clubId);
    for (const alias of (data.aliases || [])) {
      nameToIdMap.set(alias.toLowerCase(), clubId);
    }
  }
  console.log(`   Loaded ${Object.keys(clubIdentity).length} clubs with ${nameToIdMap.size} name aliases.`);

  const files = walkSync(HISTORY_DIR);
  console.log(`> Scanning ${files.length} history files...`);

  const teamIndex = new Map();
  const h2hIndex = new Map();

  let totalMatches = 0;
  let unresolvedTeams = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.matches) continue;

    for (const match of data.matches) {
      totalMatches++;
      
      // Resolve IDs using the reverse lookup
      const homeId = nameToIdMap.get(String(match.home_team).toLowerCase());
      const awayId = nameToIdMap.get(String(match.away_team).toLowerCase());

      if (!homeId || !awayId) {
        unresolvedTeams++;
        continue; // Skip unresolvable matches (should be 0 due to Step 27, but safe)
      }

      // Create a lean match object for the index
      const leanMatch = {
        match_id: match.match_id,
        date: match.date,
        competition: match.competition,
        season: match.season,
        home_club_id: homeId,
        home_team: match.home_team, // Keep name for display purposes
        away_club_id: awayId,
        away_team: match.away_team,
        home_score: match.home_score,
        away_score: match.away_score
      };

      // 1. Team Index (Keyed by Club ID)
      if (!teamIndex.has(homeId)) teamIndex.set(homeId, []);
      if (!teamIndex.has(awayId)) teamIndex.set(awayId, []);
      
      teamIndex.get(homeId).push(leanMatch);
      teamIndex.get(awayId).push(leanMatch);

      // 2. H2H Index (Keyed by sorted Club IDs)
      const ids = [homeId, awayId].sort(); // Sort ensures consistency regardless of home/away
      const h2hKey = `${ids[0]}|${ids[1]}`;
      
      if (!h2hIndex.has(h2hKey)) h2hIndex.set(h2hKey, []);
      h2hIndex.get(h2hKey).push(leanMatch);
    }
  }

  console.log(`   Processed ${totalMatches.toLocaleString()} matches.`);
  if (unresolvedTeams > 0) console.warn(`   ⚠️ WARN: ${unresolvedTeams} matches skipped due to unresolved team identities.`);

  // Sort matches chronologically in the indexes
  console.log('> Sorting indexes chronologically...');
  for (const matches of teamIndex.values()) {
    matches.sort((a, b) => a.date.localeCompare(b.date));
  }
  for (const matches of h2hIndex.values()) {
    matches.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Convert Maps to Objects for JSON serialization
  const teamIndexObj = Object.fromEntries(teamIndex);
  const h2hIndexObj = Object.fromEntries(h2hIndex);

  console.log('> Writing team match index...');
  fs.writeFileSync(TEAM_INDEX_FILE, JSON.stringify(teamIndexObj), 'utf8');
  console.log(`   ✅ Saved: ${path.relative(ROOT, TEAM_INDEX_FILE)}`);

  console.log('> Writing H2H match index...');
  fs.writeFileSync(H2H_INDEX_FILE, JSON.stringify(h2hIndexObj), 'utf8');
  console.log(`   ✅ Saved: ${path.relative(ROOT, H2H_INDEX_FILE)}`);

  console.log('\n============================================================');
  console.log(' STEP 28 COMPLETE');
  console.log('============================================================');
  console.log(`Total Matches Indexed      : ${totalMatches.toLocaleString()}`);
  console.log(`Total Teams Indexed        : ${Object.keys(teamIndexObj).length.toLocaleString()}`);
  console.log(`Total H2H Rivals Indexed   : ${Object.keys(h2hIndexObj).length.toLocaleString()}`);
  console.log(`Unresolved Identities      : ${unresolvedTeams}`);
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});