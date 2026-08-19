'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');

const AUDIT_FILE = path.join(MIGRATION_DIR, '31a3-contextual-alias-audit.json');
const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const ELO_SOURCE_FILE = path.join(SOURCE_DIR, 'elo_ratings.jsonl');
const ELO_INDEX_FILE = path.join(INDEX_DIR, 'elo_history_index.json');
const TRAIL_FILE = path.join(MIGRATION_DIR, '31a4-applied-aliases-trail.json');

// --- EXACT Normalization Logic from 31A.3 ---

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandAbbreviations(name) {
  let str = normalizeName(name);
  const replacements = {
    'ath ': 'athletic ', 'atl ': 'atletico ', 'koln': 'koln', 'munster': 'munster',
    'brucken': 'brucken', 'preussen': 'preussen', 'jaroslawl': 'yaroslavl',
    'ramenskoje': 'ramenskoe', 'sg': 'saint germain', 'psg': 'saint germain'
  };
  for (const [abbr, full] of Object.entries(replacements)) {
    str = str.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  return str;
}

function getCoreTokens(name) {
  let str = expandAbbreviations(name);
  str = str.replace(/\b(1|fc|cf|ac|sc|ssc|us|as|rc|cd|real|vfl|sv|fk|rb)\b/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  return new Set(str.split(/\s+/).filter(t => t.length >= 2));
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

// Helper for atomic file writes
function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.4');
  console.log(' TRANSACTIONAL ALIAS APPLY & ELO REBUILD');
  console.log('============================================================\n');

  console.log('> Loading 31A.3 Audit Manifest...');
  const audit = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
  const approvedAliases = audit.approved || [];
  console.log(`   Found ${approvedAliases.length} approved aliases.`);

  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

  // --- 1. PRE-FLIGHT: BUILD COLLISION-AWARE TOKEN MAP ---
  console.log('\n> Building collision-aware token map...');
  const tokenMap = new Map();
  const nameMap = new Map();

  for (const [entityId, data] of Object.entries(entityIndex)) {
    if (data.type !== 'CLUB') continue;
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      const nName = normalizeName(name);
      if (nameMap.has(nName) && nameMap.get(nName) !== entityId) {
        nameMap.set(nName, 'AMBIGUOUS');
      } else if (nameMap.get(nName) !== 'AMBIGUOUS') {
        nameMap.set(nName, entityId);
      }

      const tokens = getCoreTokens(name);
      const tKey = [...tokens].sort().join(' ');
      if (tKey) {
        if (tokenMap.has(tKey) && tokenMap.get(tKey) !== entityId) {
          tokenMap.set(tKey, 'AMBIGUOUS');
        } else if (tokenMap.get(tKey) !== 'AMBIGUOUS') {
          tokenMap.set(tKey, entityId);
        }
      }
    }
  }

  // --- 2. FILTER APPROVED ALIASES FOR COLLISIONS ---
  console.log('\n> Validating approved aliases against token map...');
  const safeApproved = [];
  const rejectedByCollision = [];

  for (const item of approvedAliases) {
    const nName = normalizeName(item.eloName);
    const tokens = getCoreTokens(item.eloName);
    const tKey = [...tokens].sort().join(' ');

    const nameConflict = nameMap.get(nName) && nameMap.get(nName) !== item.entityId && nameMap.get(nName) !== 'AMBIGUOUS';
    const tokenConflict = tKey && tokenMap.get(tKey) && tokenMap.get(tKey) !== item.entityId && tokenMap.get(tKey) !== 'AMBIGUOUS';
    const ambiguousName = nameMap.get(nName) === 'AMBIGUOUS';
    const ambiguousToken = tKey && tokenMap.get(tKey) === 'AMBIGUOUS';

    if (nameConflict || tokenConflict || ambiguousName || ambiguousToken) {
      rejectedByCollision.push(item);
    } else {
      safeApproved.push(item);
      // Safely add to maps for the Elo rebuild
      nameMap.set(nName, item.entityId);
      if (tKey) tokenMap.set(tKey, item.entityId);
    }
  }

  console.log(`   ✅ Safe to apply: ${safeApproved.length}`);
  console.log(`   ❌ Rejected by collision/ambiguity: ${rejectedByCollision.length}`);
  
  if (rejectedByCollision.length > 0) {
    console.log('   (Examples rejected: ' + rejectedByCollision.slice(0, 5).map(r => r.eloName).join(', ') + ')');
  }

  // --- 3. PREPARE MUTATED INDEXES IN MEMORY ---
  console.log('\n> Preparing mutated indexes in memory...');
  const newEntityIndex = JSON.parse(JSON.stringify(entityIndex));
  const appliedTrail = [];

  for (const item of safeApproved) {
    if (newEntityIndex[item.entityId] && !newEntityIndex[item.entityId].aliases.includes(item.eloName)) {
      newEntityIndex[item.entityId].aliases.push(item.eloName);
      appliedTrail.push({
        alias: item.eloName,
        canonical: item.canonicalName,
        entityId: item.entityId,
        reason: item.reason
      });
    }
  }

  const newEloIndex = {};
  let totalRows = 0;
  let resolvedRows = 0;
  let unresolvedRows = 0;

  await processJSONL(ELO_SOURCE_FILE, (row) => {
    totalRows++;
    const clubName = row.club;
    const date = row.date;
    const elo = parseFloat(row.elo);

    if (!clubName || !date || isNaN(elo)) return;

    const tokens = getCoreTokens(clubName);
    const tKey = [...tokens].sort().join(' ');
    
    let entityId = null;
    if (tKey && tokenMap.has(tKey) && tokenMap.get(tKey) !== 'AMBIGUOUS') {
      entityId = tokenMap.get(tKey);
    } else if (nameMap.has(normalizeName(clubName)) && nameMap.get(normalizeName(clubName)) !== 'AMBIGUOUS') {
      entityId = nameMap.get(normalizeName(clubName));
    }
    
    if (entityId) {
      if (!newEloIndex[entityId]) newEloIndex[entityId] = [];
      newEloIndex[entityId].push({ date, elo });
      resolvedRows++;
    } else {
      unresolvedRows++;
    }
  });

  // Sort Elo histories
  for (const entityId in newEloIndex) {
    newEloIndex[entityId].sort((a, b) => a.date.localeCompare(b.date));
  }

  // --- 4. ATOMIC COMMIT ---
  console.log('\n> Committing changes atomically...');
  atomicWrite(ENTITY_IDENTITY_FILE, JSON.stringify(newEntityIndex, null, 2));
  atomicWrite(ELO_INDEX_FILE, JSON.stringify(newEloIndex));
  atomicWrite(TRAIL_FILE, JSON.stringify(appliedTrail, null, 2));

  console.log('   ✅ Atomic commit complete.');
  console.log(`   ✅ Applied ${appliedTrail.length} aliases safely.`);

  console.log('\n============================================================');
  console.log(' ELO RESOLUTION SUMMARY (POST-ALIAS EXPANSION)');
  console.log('============================================================');
  console.log(`Total Elo Records Processed : ${totalRows.toLocaleString()}`);
  console.log(`Resolved to Entity ID       : ${resolvedRows.toLocaleString()} (${((resolvedRows/totalRows)*100).toFixed(2)}%)`);
  console.log(`Unresolved Records          : ${unresolvedRows.toLocaleString()}`);
  console.log(`Entities with Elo History   : ${Object.keys(newEloIndex).length} / 3404\n`);
  
  console.log('============================================================');
  console.log(' STEP 31A.4 COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error('\n❌ FATAL ERROR: Mutation aborted. No files were modified.', err);
  process.exit(1);
});