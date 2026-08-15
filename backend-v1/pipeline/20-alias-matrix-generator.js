'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 20
 * ALIAS MATRIX & MISSING ENTITY MANIFEST
 * ============================================================
 * Reads source data and generates proposed canonical alias maps
 * for clubs and evidence manifests for missing players.
 * Does NOT modify the source JSONL files.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const V2_INDEX_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');

const CLUB_MATRIX_FILE = path.join(V2_INDEX_DIR, 'proposed_club_alias_matrix.json');
const PLAYER_MANIFEST_FILE = path.join(MIGRATION_DIR, 'missing_player_evidence_manifest.json');

async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(false);
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try { onRow(JSON.parse(line)); } catch (e) {}
    });
    rl.on('close', () => resolve(true));
    rl.on('error', reject);
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 20');
  console.log(' ALIAS MATRIX & MISSING ENTITY MANIFEST');
  console.log('============================================================\n');

  fs.mkdirSync(V2_INDEX_DIR, { recursive: true });
  fs.mkdirSync(MIGRATION_DIR, { recursive: true });

  // 1. Load Master IDs
  console.log('> Loading master IDs...');
  const masterClubs = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id) masterClubs.add(String(row.club_id));
  });

  const masterPlayers = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'players.jsonl'), (row) => {
    if (row.player_id) masterPlayers.add(String(row.player_id));
  });

  // 2. Setup Accumulators
  // Map<clubId, Map<clubName, {minDate, maxDate, count}>>
  const clubTemporalMap = new Map();
  
  // Map<playerId, {count, minDate, maxDate, clubs: Map<clubName, count>}
  const playerEvidenceMap = new Map();

  console.log('> Scanning datasets to build matrices...');
  
  // Scan game_events for Club Names + Player Evidence
  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    const clubId = row.club_id ? String(row.club_id) : null;
    const clubName = row.club_name ? String(row.club_name).trim() : null;
    const date = row.date ? String(row.date).trim() : '';

    // Club Temporal Tracking
    if (clubId && clubName && !masterClubs.has(clubId)) {
      if (!clubTemporalMap.has(clubId)) clubTemporalMap.set(clubId, new Map());
      const nameMap = clubTemporalMap.get(clubId);
      
      if (!nameMap.has(clubName)) {
        nameMap.set(clubName, { minDate: date, maxDate: date, count: 1 });
      } else {
        const entry = nameMap.get(clubName);
        entry.count++;
        if (date && date < entry.minDate) entry.minDate = date;
        if (date && date > entry.maxDate) entry.maxDate = date;
      }
    }

    // Player Evidence Tracking
    const pIds = [row.player_id, row.player_in_id, row.player_assist_id];
    pIds.forEach(pid => {
      if (pid && !masterPlayers.has(String(pid))) {
        const pIdStr = String(pid);
        if (!playerEvidenceMap.has(pIdStr)) {
          playerEvidenceMap.set(pIdStr, { count: 0, minDate: '', maxDate: '', clubs: new Map() });
        }
        const pEntry = playerEvidenceMap.get(pIdStr);
        pEntry.count++;
        if (date) {
          if (!pEntry.minDate || date < pEntry.minDate) pEntry.minDate = date;
          if (!pEntry.maxDate || date > pEntry.maxDate) pEntry.maxDate = date;
        }
        if (clubName) {
          pEntry.clubs.set(clubName, (pEntry.clubs.get(clubName) || 0) + 1);
        }
      }
    });
  });

  // 3. Build Club Alias Matrix
  console.log('> Generating Club Alias Matrix...');
  const clubMatrix = {};
  
  for (const [clubId, nameMap] of clubTemporalMap.entries()) {
    const namesArr = [...nameMap.entries()].map(([name, data]) => ({ name, ...data }));
    
    // Sort by maxDate descending to find the most recent name as Canonical
    namesArr.sort((a, b) => b.maxDate.localeCompare(a.maxDate));
    
    const canonicalName = namesArr[0].name;
    
    clubMatrix[clubId] = {
      canonical_name: canonicalName,
      total_references: namesArr.reduce((sum, n) => sum + n.count, 0),
      aliases: namesArr.map(n => ({
        name: n.name,
        start_date: n.minDate,
        end_date: n.maxDate,
        references: n.count
      }))
    };
  }

  fs.writeFileSync(CLUB_MATRIX_FILE, JSON.stringify(clubMatrix, null, 2), 'utf8');
  console.log(`   ✅ Saved proposed club aliases: ${path.relative(ROOT, CLUB_MATRIX_FILE)}`);

  // 4. Build Missing Player Evidence Manifest
  console.log('> Generating Missing Player Evidence Manifest...');
  const playerManifest = [];
  
  for (const [playerId, data] of playerEvidenceMap.entries()) {
    // Find the most frequent club for this player as a hint
    const sortedClubs = [...data.clubs.entries()].sort((a, b) => b[1] - a[1]);
    const likelyClub = sortedClubs.length > 0 ? sortedClubs[0][0] : 'Unknown';
    
    playerManifest.push({
      player_id: playerId,
      likely_club: likelyClub,
      total_event_refs: data.count,
      first_seen: data.minDate,
      last_seen: data.maxDate
    });
  }

  // Sort manifest by most references first
  playerManifest.sort((a, b) => b.total_event_refs - a.total_event_refs);

  fs.writeFileSync(PLAYER_MANIFEST_FILE, JSON.stringify(playerManifest, null, 2), 'utf8');
  console.log(`   ✅ Saved player evidence manifest: ${path.relative(ROOT, PLAYER_MANIFEST_FILE)}`);

  console.log('\n============================================================');
  console.log(' STEP 20 COMPLETE');
  console.log('============================================================');
  console.log(`Clubs mapped with aliases : ${Object.keys(clubMatrix).length}`);
  console.log(`Players logged for recovery: ${playerManifest.length}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});