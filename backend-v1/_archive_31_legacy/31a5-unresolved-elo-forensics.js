'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'source');
const INDEX_DIR = path.join(ROOT, 'public_data_v2', 'knowledge', 'football', 'indexes');
const MIGRATION_DIR = path.join(ROOT, 'public_data_v2', 'migration');

const ENTITY_IDENTITY_FILE = path.join(INDEX_DIR, 'entity_identity_index.json');
const ELO_SOURCE_FILE = path.join(SOURCE_DIR, 'elo_ratings.jsonl');
const REPORT_FILE = path.join(MIGRATION_DIR, '31a5-unresolved-elo-report.txt');
const JSON_REPORT_FILE = path.join(MIGRATION_DIR, '31a5-unresolved-elo-data.json');

// Must match the exact resolution logic from 31A.4
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

// Levenshtein Distance for near-match finding
function getEditDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let current = [i];
    for (let j = 1; j <= b.length; j++) {
      const insert = current[j - 1] + 1;
      const remove = prev[j] + 1;
      const replace = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(insert, remove, replace);
    }
    for (let j = 0; j < current.length; j++) prev[j] = current[j];
  }
  return prev[b.length];
}

function processJSONL(file, onRow) {
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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.5');
  console.log(' UNRESOLVED ELO FORENSIC & CANDIDATE ANALYSIS');
  console.log('============================================================\n');

  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));
  
  const nameMap = new Map();
  const tokenMap = new Map();
  const allCanonicalNames = []; // For fuzzy matching

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
      
      // Store normalized name and original for fuzzy matching
      allCanonicalNames.push({ normName: nName, canonicalName: data.canonical_name, entityId });
    }
  }

  console.log('> Scanning Elo source to identify unresolved names...');
  const unresolvedNames = new Map(); // Map<clubName, count>
  let totalRows = 0;

  await processJSONL(ELO_SOURCE_FILE, (row) => {
    totalRows++;
    const clubName = row.club;
    if (!clubName) return;

    const tokens = getCoreTokens(clubName);
    const tKey = [...tokens].sort().join(' ');
    
    let entityId = null;
    if (tKey && tokenMap.has(tKey) && tokenMap.get(tKey) !== 'AMBIGUOUS') {
      entityId = tokenMap.get(tKey);
    } else if (nameMap.has(normalizeName(clubName)) && nameMap.get(normalizeName(clubName)) !== 'AMBIGUOUS') {
      entityId = nameMap.get(normalizeName(clubName));
    }
    
    if (!entityId) {
      unresolvedNames.set(clubName, (unresolvedNames.get(clubName) || 0) + 1);
    }
  });

  const unresolvedCount = [...unresolvedNames.values()].reduce((a, b) => a + b, 0);
  console.log(`   Total Elo Records: ${totalRows.toLocaleString()}`);
  console.log(`   Unresolved Records: ${unresolvedCount.toLocaleString()}`);
  console.log(`   Unique Unresolved Names: ${unresolvedNames.size.toLocaleString()}\n`);

  console.log('> Analyzing unresolved names for near candidates...');
  const categories = {
    RESERVE_TEAM: [],
    AMBIGUOUS_CORE: [],
    NEAR_MATCH: [],
    NO_CANDIDATE: []
  };

  let processed = 0;
  for (const [name, count] of unresolvedNames.entries()) {
    processed++;
    if (processed % 100 === 0) process.stdout.write(`\r   Processed ${processed}/${unresolvedNames.size}...`);

    const item = { name, count };
    const normName = normalizeName(name);
    const tokens = getCoreTokens(name);
    const tKey = [...tokens].sort().join(' ');

    // 1. Check Reserve Team
    if (/\b(b|ii|iii|u21|u19|u17|reserves|reserve|m)\b/i.test(name)) {
      categories.RESERVE_TEAM.push(item);
      continue;
    }

    // 2. Check Ambiguous Core
    if (tKey && tokenMap.get(tKey) === 'AMBIGUOUS') {
      item.reason = `Core tokens "${tKey}" map to multiple entities`;
      categories.AMBIGUOUS_CORE.push(item);
      continue;
    }

    // 3. Find Near Match (Levenshtein distance <= 2)
    let bestMatch = null;
    for (const canonical of allCanonicalNames) {
      const dist = getEditDistance(normName, canonical.normName);
      if (dist <= 2) {
        if (!bestMatch || dist < bestMatch.distance) {
          bestMatch = { ...canonical, distance: dist };
        }
      }
    }

    if (bestMatch) {
      item.candidate = bestMatch.canonicalName;
      item.entityId = bestMatch.entityId;
      item.distance = bestMatch.distance;
      categories.NEAR_MATCH.push(item);
    } else {
      categories.NO_CANDIDATE.push(item);
    }
  }

  console.log('\n   Analysis complete.\n');

  // Sort categories by count (descending)
  for (const cat of Object.keys(categories)) {
    categories[cat].sort((a, b) => b.count - a.count);
  }

  const report = [];
  report.push('ZOKASCORE V2 PIPELINE — STEP 31A.5: UNRESOLVED ELO FORENSICS');
  report.push(`Generated: ${new Date().toISOString()}\n`);
  report.push('============================================================');
  report.push(' SUMMARY');
  report.push('============================================================');
  report.push(`Total Elo Records           : ${totalRows.toLocaleString()}`);
  report.push(`Unresolved Records          : ${unresolvedCount.toLocaleString()}`);
  report.push(`Unique Unresolved Names     : ${unresolvedNames.size.toLocaleString()}`);
  report.push(`  → Reserve Teams           : ${categories.RESERVE_TEAM.length}`);
  report.push(`  → Ambiguous Cores         : ${categories.AMBIGUOUS_CORE.length}`);
  report.push(`  → Near Matches (Dist <= 2) : ${categories.NEAR_MATCH.length}`);
  report.push(`  → No Candidate            : ${categories.NO_CANDIDATE.length}`);

  report.push('\n============================================================');
  report.push(' TOP 50 NEAR MATCHES (Review Required)');
  report.push('============================================================');
  categories.NEAR_MATCH.slice(0, 50).forEach((item, i) => {
    report.push(`${i + 1}. "${item.name}" (${item.count} records)`);
    report.push(`   → Candidate: "${item.candidate}" (Dist: ${item.distance})`);
  });

  report.push('\n============================================================');
  report.push(' TOP 30 AMBIGUOUS CORES');
  report.push('============================================================');
  categories.AMBIGUOUS_CORE.slice(0, 30).forEach((item, i) => {
    report.push(`${i + 1}. "${item.name}" (${item.count} records)`);
    report.push(`   → ${item.reason}`);
  });

  report.push('\n============================================================');
  report.push(' TOP 30 NO CANDIDATE (Unknown Clubs)');
  report.push('============================================================');
  categories.NO_CANDIDATE.slice(0, 30).forEach((item, i) => {
    report.push(`${i + 1}. "${item.name}" (${item.count} records)`);
  });

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');
  fs.writeFileSync(JSON_REPORT_FILE, JSON.stringify(categories, null, 2), 'utf8');

  console.log(`   ✅ Saved forensic report: ${path.relative(ROOT, REPORT_FILE)}`);
  console.log(`   ✅ Saved JSON data: ${path.relative(ROOT, JSON_REPORT_FILE)}\n`);

  console.log('============================================================');
  console.log(' STEP 31A.5 COMPLETE');
  console.log('============================================================');
  console.log('Review the Near Matches to determine which aliases are safe to apply next.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});