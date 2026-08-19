'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const CLUB_INDEX_FILE = path.join(INDEX_DIR, 'club_identity_index.json');

async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(0);
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!line.trim()) return;
      try { onRow(JSON.parse(line)); } catch (e) {}
    });
    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 24');
  console.log(' CANONICAL CLUB IDENTITY BUILDER');
  console.log('============================================================\n');

  fs.mkdirSync(INDEX_DIR, { recursive: true });

  const clubIndex = {};

  // 1. Load Master Clubs
  console.log('> Loading master clubs...');
  let masterCount = 0;
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id && row.name) {
      clubIndex[String(row.club_id)] = {
        canonical_name: row.name,
        aliases: [row.name]
      };
      masterCount++;
    }
  });
  console.log(`   Loaded ${masterCount} master clubs.`);

  // 2. Merge Missing Clubs (from Step 20)
  const matrixFile = path.join(INDEX_DIR, 'proposed_club_alias_matrix.json');
  if (fs.existsSync(matrixFile)) {
    console.log('> Merging missing clubs with historical aliases...');
    const matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf8'));
    let missingCount = 0;
    
    for (const [clubId, data] of Object.entries(matrix)) {
      if (!clubIndex[clubId]) {
        clubIndex[clubId] = {
          canonical_name: data.canonical_name,
          aliases: data.aliases.map(a => a.name) // Extract just the names
        };
        missingCount++;
      } else {
        // Master club exists, but maybe we found new historical aliases
        const existing = clubIndex[clubId];
        data.aliases.forEach(a => {
          if (!existing.aliases.includes(a.name)) {
            existing.aliases.push(a.name);
          }
        });
      }
    }
    console.log(`   Merged ${missingCount} missing clubs.`);
  }

  // 3. Write Unified Index
  fs.writeFileSync(CLUB_INDEX_FILE, JSON.stringify(clubIndex, null, 2), 'utf8');
  console.log(`\n   ✅ Saved unified club identity index: ${path.relative(ROOT, CLUB_INDEX_FILE)}`);
  console.log(`   Total Canonical Clubs: ${Object.keys(clubIndex).length}`);
  
  console.log('\n============================================================');
  console.log(' STEP 24 COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});