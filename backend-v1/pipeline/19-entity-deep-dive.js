'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 19
 * ENTITY DEEP-DIVE & TEMPORAL ANALYSIS
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '19-entity-deep-dive.txt');

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

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 19');
  console.log(' ENTITY DEEP-DIVE & TEMPORAL ANALYSIS');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  reportLine('ZOKASCORE V2 PIPELINE — STEP 19: ENTITY DEEP-DIVE & TEMPORAL ANALYSIS');
  reportLine(`Generated: ${new Date().toISOString()}`);

  // 1. Load Master IDs to know what to ignore
  console.log('> Loading master IDs...');
  const masterClubs = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id) masterClubs.add(String(row.club_id));
  });

  // 2. Setup trackers for Class-C Clubs (Collisions)
  // Map<clubId, Map<clubName, {minDate, maxDate, count}>>
  const clubTemporalMap = new Map();
  
  // 3. Setup trackers for Top Missing Players
  // We will collect raw sample events for the top 20 most referenced missing IDs
  const targetPlayerIds = ['153999', '261020', '46612', '47474', '62983', '74935', '265822', '179236', '178195', '129806', '69184', '144781', '132732', '669959', '365201', '109212', '44790', '55461', '155689', '349264'];
  const playerSamples = new Map(); // Map<playerId, [sampleRow1, sampleRow2...]>

  // Initialize player sample array
  targetPlayerIds.forEach(id => playerSamples.set(id, []));

  console.log('> Scanning game_events for temporal club data & player samples...');

  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    const clubId = row.club_id ? String(row.club_id) : null;
    const clubName = row.club_name ? String(row.club_name).trim() : null;
    const date = row.date ? String(row.date).trim() : '';

    // Track Club Temporal Data if it's a missing club
    if (clubId && clubName && !masterClubs.has(clubId)) {
      if (!clubTemporalMap.has(clubId)) {
        clubTemporalMap.set(clubId, new Map());
      }
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

    // Track Player Samples
    const playerId = row.player_id ? String(row.player_id) : null;
    if (playerId && targetPlayerIds.includes(playerId)) {
      const samples = playerSamples.get(playerId);
      if (samples.length < 3) {
        // Store a lean version of the row for context
        samples.push({
          date: row.date,
          game_id: row.game_id,
          minute: row.minute,
          type: row.type,
          club_name: row.club_name,
          description: row.description
        });
      }
    }
  });

  // 4. Filter down to ONLY the Class-C Collisions (>2 names)
  const collisionClubs = [];
  for (const [clubId, nameMap] of clubTemporalMap.entries()) {
    if (nameMap.size > 2) {
      collisionClubs.push({ clubId, nameMap });
    }
  }

  // Sort collisions by number of names descending
  collisionClubs.sort((a, b) => b.nameMap.size - a.nameMap.size);

  // 5. Generate Reports
  section('CLASS-C CLUB COLLISIONS: TEMPORAL BREAKDOWN');
  console.log(`Found ${collisionClubs.length} Class-C collisions. Generating temporal breakdown...`);
  reportLine(`Total Class-C Collisions Found: ${collisionClubs.length}`);
  
  // Report top 20 collisions
  collisionClubs.slice(0, 20).forEach((entry, i) => {
    reportLine(`\n----------------------------------------------------------`);
    reportLine(`Collision #${i + 1}: Club ID: ${entry.clubId}`);
    reportLine(`Distinct Names Found: ${entry.nameMap.size}`);
    
    // Sort names by minDate to see the progression
    const namesByDate = [...entry.nameMap.entries()].sort((a, b) => a[1].minDate.localeCompare(b[1].minDate));
    
    namesByDate.forEach(([name, data]) => {
      reportLine(`  → ${name}`);
      reportLine(`     Dates: ${data.minDate || 'N/A'} → ${data.maxDate || 'N/A'} (Refs: ${data.count})`);
    });
  });

  section('TOP 20 MISSING PLAYERS: CONTEXTUAL EVIDENCE');
  console.log('Generating player contextual evidence...');
  
  for (const playerId of targetPlayerIds) {
    const samples = playerSamples.get(playerId);
    reportLine(`\n----------------------------------------------------------`);
    reportLine(`Player ID: ${playerId}`);
    
    if (samples.length === 0) {
      reportLine(`  No event samples found in game_events.jsonl.`);
      continue;
    }

    reportLine(`Contextual Samples:`);
    samples.forEach((s, idx) => {
      reportLine(`  Sample ${idx + 1}:`);
      reportLine(`    Date       : ${s.date}`);
      reportLine(`    Game ID    : ${s.game_id}`);
      reportLine(`    Club       : ${s.club_name}`);
      reportLine(`    Minute/Type: ${s.minute}' ${s.type}`);
      reportLine(`    Description: ${s.description}`);
    });
  }

  section('DEEP-DIVE COMPLETE');
  console.log('\n============================================================');
  console.log(' STEP 19 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});