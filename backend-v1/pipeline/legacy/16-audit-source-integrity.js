'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 16
 * SOURCE INTEGRITY AUDIT (Pure Audit - No Modifications)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const MANIFEST_FILE = path.join(SOURCE_DIR, 'source-import-manifest.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '16-source-integrity-audit.txt');

// Helper to stream JSONL files line by line without loading into memory
async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve({ exists: false, lines: 0 });
    
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let lines = 0;

    rl.on('line', (line) => {
      if (!line.trim()) return;
      lines++;
      try {
        const row = JSON.parse(line);
        onRow(row, true);
      } catch (e) {
        onRow(null, false);
      }
    });

    rl.on('close', () => resolve({ exists: true, lines }));
    rl.on('error', reject);
  });
}

const report = [];
function reportLine(text = '') { report.push(text); }
function section(title) { reportLine('\n' + '='.repeat(60)); reportLine(title); reportLine('='.repeat(60)); }

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 16');
  console.log(' SOURCE INTEGRITY AUDIT');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });

  // Load Step 15 Manifest for expected counts
  let manifestData = { datasets: [] };
  if (fs.existsSync(MANIFEST_FILE)) {
    manifestData = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } else {
    console.warn('⚠️ Step 15 manifest not found. Expected counts will be unknown.');
  }

  reportLine('ZOKASCORE V2 PIPELINE — STEP 16: SOURCE INTEGRITY AUDIT');
  reportLine(`Generated: ${new Date().toISOString()}`);

  // 1. Load Reference ID Sets (Players, Games, Clubs)
  const playerIds = new Set();
  const gameIds = new Set();
  const clubIds = new Set();

  console.log('> Loading reference IDs (players, games, clubs)...');
  
  await processJSONL(path.join(SOURCE_DIR, 'players.jsonl'), (row, isValid) => {
    if (isValid && row.player_id) playerIds.add(String(row.player_id));
  });
  await processJSONL(path.join(SOURCE_DIR, 'games.jsonl'), (row, isValid) => {
    if (isValid && row.game_id) gameIds.add(String(row.game_id));
  });
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row, isValid) => {
    if (isValid && row.club_id) clubIds.add(String(row.club_id));
  });

  console.log(`   ✅ Found ${playerIds.size} unique players`);
  console.log(`   ✅ Found ${gameIds.size} unique games`);
  console.log(`   ✅ Found ${clubIds.size} unique clubs`);

  // For Cross-Source Reconciliation
  const matchGameIds = {
    games: gameIds,
    appearances: new Set(),
    game_events: new Set(),
    club_games: new Set()
  };

  // 2. Audit Datasets Configuration
  const datasetsToAudit = [
    { name: 'players', file: 'players.jsonl', idField: 'player_id' },
    { name: 'clubs', file: 'clubs.jsonl', idField: 'club_id' },
    { name: 'competitions', file: 'competitions.jsonl', idField: 'competition_id' },
    { name: 'former_names', file: 'former_names.jsonl', idField: null },
    { name: 'elo_ratings', file: 'elo_ratings.jsonl', idField: null },
    { name: 'rankings', file: 'rankings.jsonl', idField: null },
    { 
      name: 'game_events', file: 'game_events.jsonl', 
      checkGameId: 'game_id', checkPlayerId: 'player_id', 
      trackGameIds: 'game_events' 
    },
    { 
      name: 'player_valuations', file: 'player_valuations.jsonl', 
      checkPlayerId: 'player_id', checkClubId: 'current_club_id' 
    },
    { 
      name: 'appearances', file: 'appearances.jsonl', 
      checkGameId: 'game_id', checkPlayerId: 'player_id', 
      trackGameIds: 'appearances' 
    },
    { name: 'goalscorers', file: 'goalscorers.jsonl', idField: null },
    { name: 'shootouts', file: 'shootouts.jsonl', idField: null },
    { name: 'results', file: 'results.jsonl', idField: null },
    { name: 'matches', file: 'matches.jsonl', idField: null },
    { name: 'games', file: 'games.jsonl', idField: 'game_id' },
    { 
      name: 'club_games', file: 'club_games.jsonl', 
      checkGameId: 'game_id', checkClubId: 'club_id', 
      trackGameIds: 'club_games' 
    }
  ];

  for (const ds of datasetsToAudit) {
    section(`AUDIT: ${ds.name}`);
    console.log(`🔍 Auditing ${ds.name}...`);

    const filePath = path.join(SOURCE_DIR, ds.file);
    
    // Find expected rows from Step 15 manifest
    const manifestEntry = manifestData.datasets.find(d => d.name === ds.name);
    const sourceRows = manifestEntry ? manifestEntry.rowsRead : 'N/A';
    const expectedRows = manifestEntry ? manifestEntry.added : 'N/A';

    const stats = {
      lines: 0,
      validRows: 0,
      malformed: 0,
      duplicates: 0,
      orphanGameIds: 0,
      orphanPlayerIds: 0,
      orphanClubIds: 0
    };

    const seenKeys = new Set();

    await processJSONL(filePath, (row, isValid) => {
      stats.lines++;
      if (!isValid) { stats.malformed++; return; }
      stats.validRows++;

      if (row.__source_key) {
        if (seenKeys.has(row.__source_key)) stats.duplicates++;
        else seenKeys.add(row.__source_key);
      }

      // Referential Integrity Checks using exact field names
      if (ds.checkGameId && row[ds.checkGameId] && !gameIds.has(String(row[ds.checkGameId]))) {
        stats.orphanGameIds++;
      }
      if (ds.checkPlayerId && row[ds.checkPlayerId] && !playerIds.has(String(row[ds.checkPlayerId]))) {
        stats.orphanPlayerIds++;
      }
      if (ds.checkClubId && row[ds.checkClubId] && !clubIds.has(String(row[ds.checkClubId]))) {
        stats.orphanClubIds++;
      }

      // Track game_ids for cross-reconciliation
      if (ds.trackGameIds && row.game_id) {
        matchGameIds[ds.trackGameIds].add(String(row.game_id));
      }
    });

    const rowStatus = expectedRows === 'N/A' || expectedRows === stats.validRows ? '✅ PASS' : '❌ FAIL';
    const dupStatus = stats.duplicates === 0 ? '✅ PASS' : '❌ FAIL';
    const orphanSum = stats.orphanGameIds + stats.orphanPlayerIds + stats.orphanClubIds;
    const refStatus = orphanSum === 0 ? '✅ PASS' : '⚠️  WARN';

    reportLine(`Source Rows Read     : ${sourceRows}`);
    reportLine(`Expected V2 Rows     : ${expectedRows}`);
    reportLine(`Physical Lines       : ${stats.lines.toLocaleString()}`);
    reportLine(`Valid JSON Rows      : ${stats.validRows.toLocaleString()} ${rowStatus}`);
    reportLine(`Malformed JSON Lines : ${stats.malformed.toLocaleString()}`);
    reportLine(`Internal Duplicates  : ${stats.duplicates.toLocaleString()} ${dupStatus}`);
    
    if (ds.checkGameId) reportLine(`Orphan Game IDs      : ${stats.orphanGameIds.toLocaleString()} ${refStatus}`);
    if (ds.checkPlayerId) reportLine(`Orphan Player IDs    : ${stats.orphanPlayerIds.toLocaleString()} ${refStatus}`);
    if (ds.checkClubId) reportLine(`Orphan Club IDs      : ${stats.orphanClubIds.toLocaleString()} ${refStatus}`);

    console.log(`   Valid: ${stats.validRows.toLocaleString()} | Dups: ${stats.duplicates} | Orphans: ${stats.orphanGameIds + stats.orphanPlayerIds + stats.orphanClubIds}`);
  }

  // 3. Cross-Source Match Reconciliation
  section('CROSS-SOURCE RECONCILIATION');
  console.log('\n🔗 Calculating cross-source overlaps...');

  const calculateIntersection = (setA, setB) => {
    let count = 0;
    for (const id of setA) {
      if (setB.has(id)) count++;
    }
    return count;
  };

  const gamesWithEvents = calculateIntersection(matchGameIds.game_events, matchGameIds.games);
  const gamesWithAppearances = calculateIntersection(matchGameIds.appearances, matchGameIds.games);
  const gamesInClubGames = calculateIntersection(matchGameIds.club_games, matchGameIds.games);

  reportLine(`Total Games in games.jsonl      : ${matchGameIds.games.size.toLocaleString()}`);
  reportLine(`Games with Events               : ${gamesWithEvents.toLocaleString()}`);
  reportLine(`Games with Appearances          : ${gamesWithAppearances.toLocaleString()}`);
  reportLine(`Games represented in club_games : ${gamesInClubGames.toLocaleString()}`);

  console.log(`   Games w/ Events: ${gamesWithEvents} | w/ Appearances: ${gamesWithAppearances}`);

  section('AUDIT COMPLETE');
  console.log('\n============================================================');
  console.log(' STEP 16 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});