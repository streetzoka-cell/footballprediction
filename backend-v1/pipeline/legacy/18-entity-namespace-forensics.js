'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 PIPELINE — STEP 18
 * ENTITY RECONCILIATION & NAMESPACE FORENSICS
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');
const REPORT_FILE = path.join(MIGRATION_DIR, '18-entity-namespace-forensics.txt');

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

function classifyEntity(profile, isClub = false) {
  if (!profile.names.size) return 'E - Unknown (No name found)';
  
  const namesArr = [...profile.names];
  
  // Check for Special pseudo-entities
  if (namesArr.some(n => /without club|unknown|n\/a|null/i.test(n))) {
    return 'D - Special pseudo-entity';
  }
  
  // Check for ID Reuse/Collision
  // If it has more than 2 completely distinct names, we flag it as collision
  // (Historical renames usually only have 2-3, collisions often have many unrelated ones)
  if (profile.names.size > 3) {
    return 'C - Possible ID reuse/Collision';
  }
  
  if (profile.names.size > 1) {
    return 'B - Historical rename/Multiple names';
  }
  
  return 'A - Clean missing entity';
}

function updateProfile(map, id, dataset, date, name = null, comp = null) {
  if (!id) return;
  const idStr = String(id).trim();
  if (!idStr) return;

  if (!map.has(idStr)) {
    map.set(idStr, {
      datasets: new Set(),
      count: 0,
      minDate: '',
      maxDate: '',
      names: new Set(),
      comps: new Set()
    });
  }

  const entry = map.get(idStr);
  entry.datasets.add(dataset);
  entry.count++;

  const dateStr = date ? String(date).trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (!entry.minDate || dateStr < entry.minDate) entry.minDate = dateStr;
    if (!entry.maxDate || dateStr > entry.maxDate) entry.maxDate = dateStr;
  }

  if (name && entry.names.size < 5) entry.names.add(String(name).trim());
  if (comp && entry.comps.size < 5) entry.comps.add(String(comp).trim());
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 18');
  console.log(' ENTITY RECONCILIATION & NAMESPACE FORENSICS');
  console.log('============================================================\n');

  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
  reportLine('ZOKASCORE V2 PIPELINE — STEP 18: ENTITY RECONCILIATION & NAMESPACE FORENSICS');
  reportLine(`Generated: ${new Date().toISOString()}`);

  // 1. Load Master IDs
  console.log('> Loading master IDs...');
  const masterPlayers = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'players.jsonl'), (row) => {
    if (row.player_id) masterPlayers.add(String(row.player_id));
  });

  const masterClubs = new Set();
  await processJSONL(path.join(SOURCE_DIR, 'clubs.jsonl'), (row) => {
    if (row.club_id) masterClubs.add(String(row.club_id));
  });

  // 2. Prepare Maps for Missing Entity Profiles
  const missingPlayerProfiles = new Map();
  const missingClubProfiles = new Map();

  // 3. Stream datasets to build profiles
  console.log('> Scanning datasets to build missing entity profiles...');

  await processJSONL(path.join(SOURCE_DIR, 'game_events.jsonl'), (row) => {
    const date = row.date;
    const clubName = row.club_name;
    
    updateProfile(missingPlayerProfiles, row.player_id, 'game_events', date, null, null);
    updateProfile(missingPlayerProfiles, row.player_in_id, 'game_events (in)', date, null, null);
    updateProfile(missingPlayerProfiles, row.player_assist_id, 'game_events (assist)', date, null, null);
    
    updateProfile(missingClubProfiles, row.club_id, 'game_events', date, clubName, null);
  });

  await processJSONL(path.join(SOURCE_DIR, 'appearances.jsonl'), (row) => {
    updateProfile(missingPlayerProfiles, row.player_id, 'appearances', row.date, row.player_name, row.competition_id);
    updateProfile(missingClubProfiles, row.player_club_id, 'appearances', row.date, null, row.competition_id);
  });

  await processJSONL(path.join(SOURCE_DIR, 'player_valuations.jsonl'), (row) => {
    updateProfile(missingPlayerProfiles, row.player_id, 'valuations', row.date, null, null);
    updateProfile(missingClubProfiles, row.current_club_id, 'valuations', row.date, row.current_club_name, null);
  });

  await processJSONL(path.join(SOURCE_DIR, 'club_games.jsonl'), (row) => {
    updateProfile(missingClubProfiles, row.club_id, 'club_games', null, null, null);
    updateProfile(missingClubProfiles, row.opponent_id, 'club_games (opp)', null, null, null);
  });

  // Filter out valid master IDs
  for (const id of missingPlayerProfiles.keys()) {
    if (masterPlayers.has(id)) missingPlayerProfiles.delete(id);
  }
  for (const id of missingClubProfiles.keys()) {
    if (masterClubs.has(id)) missingClubProfiles.delete(id);
  }

  // 4. Target IDs for Deep Dive
  const targetClubs = ['31614', '10625', '119', '279', '540', '2784', '2481', '1008', '22220', '829', '713', '2976', '1064', '790', '515'];
  const targetPlayers = ['153999', '261020', '46612', '47474', '62983', '74935', '265822', '179236', '178195', '129806', '69184', '144781', '132732', '669959'];

  // 5. Generate Deep Dive Reports
  section('DEEP DIVE: TARGET CLUBS');
  console.log('Analyzing target clubs...');
  for (const id of targetClubs) {
    const profile = missingClubProfiles.get(id);
    if (!profile) {
      reportLine(`\nClub ID: ${id} - Not found in missing profiles (may have been resolved).`);
      continue;
    }
    
    const classification = classifyEntity(profile, true);
    reportLine(`\nClub ID: ${id} (Refs: ${profile.count})`);
    reportLine(`   Classification : ${classification}`);
    reportLine(`   Found in       : ${[...profile.datasets].join(', ')}`);
    reportLine(`   Date Range     : ${profile.minDate || 'N/A'} → ${profile.maxDate || 'N/A'}`);
    reportLine(`   Distinct Names : ${[...profile.names].join(' | ')}`);
    if (profile.comps.size > 0) reportLine(`   Competitions   : ${[...profile.comps].join(' | ')}`);
  }

  section('DEEP DIVE: TARGET PLAYERS');
  console.log('Analyzing target players...');
  for (const id of targetPlayers) {
    const profile = missingPlayerProfiles.get(id);
    if (!profile) {
      reportLine(`\nPlayer ID: ${id} - Not found in missing profiles.`);
      continue;
    }
    
    const classification = classifyEntity(profile, false);
    reportLine(`\nPlayer ID: ${id} (Refs: ${profile.count})`);
    reportLine(`   Classification : ${classification}`);
    reportLine(`   Found in       : ${[...profile.datasets].join(', ')}`);
    reportLine(`   Date Range     : ${profile.minDate || 'N/A'} → ${profile.maxDate || 'N/A'}`);
    reportLine(`   Distinct Names : ${[...profile.names].join(' | ')}`);
  }

  // 6. Global Classification Summary
  section('GLOBAL CLASSIFICATION SUMMARY');
  console.log('Calculating global classifications...');

  const playerClasses = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const profile of missingPlayerProfiles.values()) {
    const c = classifyEntity(profile, false)[0];
    if (playerClasses[c] !== undefined) playerClasses[c]++;
  }

  const clubClasses = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const profile of missingClubProfiles.values()) {
    const c = classifyEntity(profile, true)[0];
    if (clubClasses[c] !== undefined) clubClasses[c]++;
  }

  reportLine('Missing Player Reference IDs Classification:');
  reportLine(`   A - Clean missing entity      : ${playerClasses.A.toLocaleString()}`);
  reportLine(`   B - Historical rename/Multiple: ${playerClasses.B.toLocaleString()}`);
  reportLine(`   C - Possible ID reuse/Collision: ${playerClasses.C.toLocaleString()}`);
  reportLine(`   D - Special pseudo-entity     : ${playerClasses.D.toLocaleString()}`);
  reportLine(`   E - Unknown (No name found)   : ${playerClasses.E.toLocaleString()}`);

  reportLine('\nMissing Club Reference IDs Classification:');
  reportLine(`   A - Clean missing entity      : ${clubClasses.A.toLocaleString()}`);
  reportLine(`   B - Historical rename/Multiple: ${clubClasses.B.toLocaleString()}`);
  reportLine(`   C - Possible ID reuse/Collision: ${clubClasses.C.toLocaleString()}`);
  reportLine(`   D - Special pseudo-entity     : ${clubClasses.D.toLocaleString()}`);
  reportLine(`   E - Unknown (No name found)   : ${clubClasses.E.toLocaleString()}`);

  section('FORENSICS COMPLETE');
  console.log('\n============================================================');
  console.log(' STEP 18 COMPLETE');
  console.log('============================================================');
  console.log(`📄 FULL REPORT: ${REPORT_FILE}`);

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});