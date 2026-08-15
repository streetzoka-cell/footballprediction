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
const AUDIT_FILE = path.join(MIGRATION_DIR, '31a3-contextual-alias-audit.json');
const REPORT_FILE = path.join(MIGRATION_DIR, '31a3-contextual-alias-report.txt');

// Conservative normalizer
function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Hardcoded safe abbreviation expander
function expandAbbreviations(name) {
  let str = normalizeName(name);
  const replacements = {
    'ath ': 'athletic ',
    'atl ': 'atletico ',
    'koln': 'koln', // normalization handles ö -> o, so just ensure it's there
    'munster': 'munster',
    'brucken': 'brucken',
    'preussen': 'preussen',
    'jaroslawl': 'yaroslavl',
    'ramenskoje': 'ramenskoe',
    'sg': 'saint germain',
    'psg': 'saint germain'
  };
  for (const [abbr, full] of Object.entries(replacements)) {
    str = str.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  }
  return str;
}

// Extracts meaningful tokens, stripping generic prefixes
function getCoreTokens(name) {
  let str = expandAbbreviations(name);
  // Strip generic football prefixes/suffixes
  str = str.replace(/\b(1|fc|cf|ac|sc|ssc|us|as|rc|cd|real|vfl|sv|fk|rb)\b/g, '');
  str = str.replace(/\s+/g, ' ').trim();
  
  return new Set(str.split(/\s+/).filter(t => t.length >= 2));
}

// Strict reserve team checker
function isReserveTeam(name, entityData) {
  // Check the provided name
  if (/\b(b|ii|iii|u21|u19|u17|reserves|reserve|m)\b/i.test(name)) return true;
  
  // Check canonical name and all aliases
  if (entityData) {
    const allNames = [entityData.canonical_name, ...(entityData.aliases || [])];
    for (const alias of allNames) {
      if (/\b(b|ii|iii|u21|u19|u17|reserves|reserve|m)\b/i.test(alias)) return true;
    }
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
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.3');
  console.log(' ULTRA-STRICT CONTEXTUAL IDENTITY VALIDATION');
  console.log('============================================================\n');

  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(fs.readFileSync(ENTITY_IDENTITY_FILE, 'utf8'));

  // Build lookup of all canonical names and aliases for CLUBS only
  const canonicalLookup = []; // { normName, entityId, canonicalName, data }
  for (const [entityId, data] of Object.entries(entityIndex)) {
    if (data.type !== 'CLUB') continue; // Elo source is club-only
    
    const names = [data.canonical_name, ...(data.aliases || [])];
    for (const name of names) {
      canonicalLookup.push({
        normName: normalizeName(name),
        entityId,
        canonicalName: data.canonical_name,
        data
      });
    }
  }

  console.log('> Scanning Elo source for unresolved names...');
  const unresolvedNames = new Set();
  const exactMatchMap = new Map();
  
  for (const item of canonicalLookup) {
    exactMatchMap.set(item.normName, item.entityId);
  }

  await processJSONL(ELO_SOURCE_FILE, (row) => {
    const clubName = row.club;
    if (!clubName) return;
    const norm = normalizeName(clubName);
    if (!exactMatchMap.has(norm)) {
      unresolvedNames.add(clubName);
    }
  });

  console.log(`   Found ${unresolvedNames.size} unresolved Elo names.`);
  console.log('> Applying ultra-strict validation rules...\n');

  let approved = [];
  let rejected = [];
  let ambiguous = [];

  for (const eloName of unresolvedNames) {
    const eloTokens = getCoreTokens(eloName);
    if (eloTokens.size === 0) continue; // Skip if no meaningful tokens
    
    let candidates = [];

    for (const canonical of canonicalLookup) {
      // Context Guard 1: No Reserve Teams (Check Elo name and Entity aliases)
      if (isReserveTeam(eloName, canonical.data)) continue;

      // Rule: IDENTICAL_CORE_TOKENS (with abbreviation expansion)
      const canonicalTokens = getCoreTokens(canonical.canonicalName);
      if (canonicalTokens.size === 0) continue;

      if (eloTokens.size === canonicalTokens.size) {
        let setsEqual = true;
        for (const t of eloTokens) {
          if (!canonicalTokens.has(t)) { setsEqual = false; break; }
        }
        if (setsEqual) {
          candidates.push({
            entityId: canonical.entityId,
            canonicalName: canonical.canonicalName,
            reason: 'IDENTICAL_CORE_TOKENS'
          });
        }
      }
    }

    if (candidates.length === 0) {
      rejected.push({ eloName, reason: 'NO_CONTEXTUAL_MATCH' });
    } else if (candidates.length > 1) {
      // Deduplicate by entityId
      const uniqueIds = new Set(candidates.map(c => c.entityId));
      if (uniqueIds.size > 1) {
        ambiguous.push({ eloName, candidates });
      } else {
        approved.push({ eloName, ...candidates[0] });
      }
    } else {
      approved.push({ eloName, ...candidates[0] });
    }
  }

  // Output Results
  console.log('============================================================');
  console.log(' CONTEXTUAL VALIDATION SUMMARY');
  console.log('============================================================');
  console.log(`Total Unresolved : ${unresolvedNames.size}`);
  console.log(`✅ Approved      : ${approved.length}`);
  console.log(`❌ Rejected      : ${rejected.length}`);
  console.log(`⚠️ Ambiguous     : ${ambiguous.length}\n`);

  const audit = {
    pipeline_step: '31A.3',
    generated_at: new Date().toISOString(),
    policy: {
      club_only: true,
      no_reserve_teams: true,
      rules: ['IDENTICAL_CORE_TOKENS (with abbreviation expansion)'],
      modify_identity_index: false
    },
    summary: {
      total_unresolved: unresolvedNames.size,
      approved: approved.length,
      rejected: rejected.length,
      ambiguous: ambiguous.length
    },
    approved,
    rejected,
    ambiguous
  };

  fs.writeFileSync(AUDIT_FILE, JSON.stringify(audit, null, 2), 'utf8');

  const report = [];
  report.push('ZOKASCORE V2 PIPELINE — STEP 31A.3: ULTRA-STRICT CONTEXTUAL VALIDATION');
  report.push(`Generated: ${new Date().toISOString()}\n`);
  report.push('============================================================');
  report.push('SUMMARY');
  report.push('============================================================');
  report.push(`Total Unresolved : ${unresolvedNames.size}`);
  report.push(`Strictly Approved : ${approved.length}`);
  report.push(`Rejected          : ${rejected.length}`);
  report.push(`Ambiguous         : ${ambiguous.length}`);

  report.push('\n============================================================');
  report.push('APPROVED ALIASES');
  report.push('============================================================');
  approved.forEach((item, i) => {
    report.push(`${i + 1}. "${item.eloName}" → "${item.canonicalName}" [${item.reason}]`);
  });

  fs.writeFileSync(REPORT_FILE, report.join('\n') + '\n', 'utf8');

  console.log(`   ✅ Saved contextual audit: ${path.relative(ROOT, AUDIT_FILE)}`);
  console.log(`   ✅ Saved report: ${path.relative(ROOT, REPORT_FILE)}\n`);
  console.log('============================================================');
  console.log(' STEP 31A.3 COMPLETE');
  console.log('============================================================');
  console.log('Review the approved list. NO FILES WERE MODIFIED.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});