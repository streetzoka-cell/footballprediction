'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const ELO_SOURCE_FILE = path.join(SOURCE_DIR, 'elo_ratings.jsonl');
const ELO_INDEX_FILE = path.join(INDEX_DIR, 'elo_history_index.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '31a-elo-index-report.txt');

function normalizeIdentityName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A');
  console.log(' ELO HISTORY INDEX BUILDER');
  console.log('============================================================\n');

  console.log('> Loading Unified Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  
  const nameToEntityId = new Map();
  for (const [entityId, data] of Object.entries(entityIndex)) {
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      nameToEntityId.set(normalizeIdentityName(name), entityId);
    }
  }

  console.log('> Processing EloRatings source data...');
  const eloIndex = {}; // entityId -> [{date, elo}, ...]
  let totalRows = 0;
  let resolvedRows = 0;
  let unresolvedRows = 0;
  const unresolvedNames = new Map();

  await processJSONL(ELO_SOURCE_FILE, (row) => {
    totalRows++;
    const clubName = row.club;
    const date = row.date;
    const elo = parseFloat(row.elo);

    if (!clubName || !date || isNaN(elo)) return;

    const entityId = nameToEntityId.get(normalizeIdentityName(clubName));
    
    if (entityId) {
      if (!eloIndex[entityId]) eloIndex[entityId] = [];
      eloIndex[entityId].push({ date, elo });
      resolvedRows++;
    } else {
      unresolvedRows++;
      unresolvedNames.set(clubName, (unresolvedNames.get(clubName) || 0) + 1);
    }
  });

  console.log(`   Processed ${totalRows.toLocaleString()} Elo records.`);
  console.log(`   Resolved: ${resolvedRows.toLocaleString()} | Unresolved: ${unresolvedRows.toLocaleString()}`);

  // Sort Elo history chronologically for each entity
  console.log('> Sorting Elo histories...');
  let entitiesWithElo = 0;
  for (const entityId in eloIndex) {
    eloIndex[entityId].sort((a, b) => a.date.localeCompare(b.date));
    entitiesWithElo++;
  }

  fs.writeFileSync(ELO_INDEX_FILE, JSON.stringify(eloIndex), 'utf8');
  console.log(`   ✅ Saved Elo history index: ${path.relative(ROOT, ELO_INDEX_FILE)}`);

  // Generate Report
  const report = [];
  report.push('ZOKASCORE V2 PIPELINE — STEP 31A: ELO INDEX REPORT');
  report.push(`Generated: ${new Date().toISOString()}\n`);
  report.push('============================================================');
  report.push(' ELO RESOLUTION SUMMARY');
  report.push('============================================================');
  report.push(`Total Elo Records Processed : ${totalRows.toLocaleString()}`);
  report.push(`Resolved to Entity ID       : ${resolvedRows.toLocaleString()}`);
  report.push(`Unresolved Records          : ${unresolvedRows.toLocaleString()}`);
  report.push(`Entities with Elo History   : ${entitiesWithElo.toLocaleString()} / 3404`);

  if (unresolvedNames.size > 0) {
    report.push('\n============================================================');
    report.push(' TOP 20 UNRESOLVED ELO NAMES');
    report.push('============================================================');
    const sortedUnresolved = [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]);
    sortedUnresolved.slice(0, 20).forEach(([name, count], i) => {
      report.push(`${i + 1}. "${name}" (${count} records)`);
    });
  }

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
  console.log(`   ✅ Saved report: ${path.relative(ROOT, REPORT_FILE)}\n`);

  console.log('============================================================');
  console.log(' STEP 31A COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});