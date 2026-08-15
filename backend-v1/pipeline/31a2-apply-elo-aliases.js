'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data', 'migration');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const SUGGESTIONS_FILE = path.join(MIGRATION_DIR, '31a1-elo-alias-suggestions.json');
const ELO_SOURCE_FILE = path.join(SOURCE_DIR, 'elo_ratings.jsonl');
const ELO_INDEX_FILE = path.join(INDEX_DIR, 'elo_history_index.json');

function normalizeIdentityName(name) {
  let str = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const replacements = {
    'ath ': 'athletic ', 'atl ': 'atletico ', 'fc ': '', 'cf ': '', 'ac ': '',
    'ssc ': '', 'us ': '', 'sc ': '', 'as ': '', 'rc ': '', 'cd ': '', 'real ': '',
    'sporting ': '', 'wolves': 'wolverhampton', 'spurs': 'tottenham',
    'cardiff': 'cardiff city', 'bournemouth': 'afc bournemouth',
    'west brom': 'west bromwich albion', 'west ham': 'west ham united',
    'man city': 'manchester city', 'man united': 'manchester united',
    'man utd': 'manchester united', 'psg': 'paris saint germain', 'rbl': 'rb leipzig'
  };
  for (const [abbr, full] of Object.entries(replacements)) {
    str = str.replace(new RegExp(`\\b${abbr}`, 'g'), full);
  }
  return str.trim();
}

// Strict Confidence Check
function isConfidentMatch(eloName, canonicalName, distance) {
  if (distance > 2) return false;
  
  const normElo = normalizeIdentityName(eloName);
  const normCanon = normalizeIdentityName(canonicalName);

  // Check 1: Substring match (e.g. "arsenal" in "arsenal fc")
  if (normElo.includes(normCanon) || normCanon.includes(normElo)) return true;

  // Check 2: Share a token of length >= 3
  const tokens1 = new Set(normElo.split(/\s+/).filter(t => t.length >= 3));
  const tokens2 = new Set(normCanon.split(/\s+/).filter(t => t.length >= 3));
  
  for (const t of tokens1) {
    if (tokens2.has(t)) return true;
  }

  return false;
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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.2');
  console.log(' APPLY APPROVED ELO ALIASES & REBUILD INDEX');
  console.log('============================================================\n');

  // 1. Load Identity Index and Suggestions
  console.log('> Loading Entity Identity Index and Suggestions...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  const suggestions = JSON.parse(fs.readFileSync(SUGGESTIONS_FILE, 'utf8'));

  // 2. Apply Strict Aliases
  let appliedCount = 0;
  const appliedAliases = [];

  for (const s of suggestions) {
    if (s.suggestions.length > 0) {
      const bestMatch = s.suggestions[0];
      if (isConfidentMatch(s.eloName, bestMatch.canonicalName, bestMatch.distance)) {
        const entityId = bestMatch.entityId;
        if (!entityIndex[entityId].aliases.includes(s.eloName)) {
          entityIndex[entityId].aliases.push(s.eloName);
          appliedCount++;
          appliedAliases.push({ eloName: s.eloName, canonical: bestMatch.canonicalName, entityId });
        }
      }
    }
  }

  fs.writeFileSync(ENTITY_IDENTITY_FILE, JSON.stringify(entityIndex, null, 2), 'utf8');
  console.log(`   ✅ Applied ${appliedCount} strict aliases to entity_identity_index.json`);

  // 3. Rebuild Reverse Lookup Map with New Aliases
  const nameToEntityId = new Map();
  for (const [entityId, data] of Object.entries(entityIndex)) {
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      nameToEntityId.set(normalizeIdentityName(name), entityId);
    }
  }

  // 4. Rebuild Elo History Index
  console.log('> Rebuilding Elo History Index with expanded aliases...');
  const eloIndex = {};
  let totalRows = 0;
  let resolvedRows = 0;
  let unresolvedRows = 0;

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
    }
  });

  // Sort Elo histories
  for (const entityId in eloIndex) {
    eloIndex[entityId].sort((a, b) => a.date.localeCompare(b.date));
  }

  fs.writeFileSync(ELO_INDEX_FILE, JSON.stringify(eloIndex), 'utf8');
  console.log(`   ✅ Saved updated Elo history index: ${path.relative(ROOT, ELO_INDEX_FILE)}\n`);

  console.log('============================================================');
  console.log(' ELO RESOLUTION SUMMARY (AFTER ALIAS EXPANSION)');
  console.log('============================================================');
  console.log(`Total Elo Records Processed : ${totalRows.toLocaleString()}`);
  console.log(`Resolved to Entity ID       : ${resolvedRows.toLocaleString()} (${((resolvedRows/totalRows)*100).toFixed(2)}%)`);
  console.log(`Unresolved Records          : ${unresolvedRows.toLocaleString()}`);
  console.log(`Entities with Elo History   : ${Object.keys(eloIndex).length} / 3404\n`);
  
  console.log('============================================================');
  console.log(' STEP 31A.2 COMPLETE');
  console.log('============================================================');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});