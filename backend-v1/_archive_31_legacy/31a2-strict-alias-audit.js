'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'source'
);
const INDEX_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'indexes'
);
const MIGRATION_DIR = path.join(
  ROOT,
  'public_data_v2',
  'migration'
);

const ENTITY_IDENTITY_FILE = path.join(
  INDEX_DIR,
  'entity_identity_index.json'
);

const SUGGESTIONS_FILE = path.join(
  MIGRATION_DIR,
  '31a1-elo-alias-suggestions.json'
);

const ELO_SOURCE_FILE = path.join(
  SOURCE_DIR,
  'elo_ratings.jsonl'
);

const ELO_INDEX_FILE = path.join(
  INDEX_DIR,
  'elo_history_index.json'
);

const AUDIT_FILE = path.join(
  MIGRATION_DIR,
  '31a2-strict-alias-audit.json'
);

const REPORT_FILE = path.join(
  MIGRATION_DIR,
  '31a2-strict-alias-report.txt'
);

/**
 * Conservative normalization.
 *
 * IMPORTANT:
 * Do not aggressively rewrite names here.
 * Identity evidence should be based on the actual words.
 */
function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.'’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Remove common football structural prefixes/suffixes
 * ONLY for secondary comparison.
 */
function comparisonName(name) {
  let value = normalizeName(name);

  value = value
    .replace(/\b1\.?fc\b/g, '')
    .replace(/\bfc\b/g, '')
    .replace(/\bcf\b/g, '')
    .replace(/\bac\b/g, '')
    .replace(/\bsc\b/g, '')
    .replace(/\bssc\b/g, '')
    .replace(/\bas\b/g, '')
    .replace(/\bus\b/g, '')
    .replace(/\brc\b/g, '')
    .replace(/\bcd\b/g, '')
    .replace(/\breal\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return value;
}

/**
 * Levenshtein distance.
 */
function getEditDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from(
    { length: b.length + 1 },
    (_, i) => i
  );

  for (let i = 1; i <= a.length; i++) {
    let current = [i];

    for (let j = 1; j <= b.length; j++) {
      const insert = current[j - 1] + 1;
      const remove = prev[j] + 1;
      const replace =
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);

      current[j] = Math.min(
        insert,
        remove,
        replace
      );
    }

    for (let j = 0; j < current.length; j++) {
      prev[j] = current[j];
    }
  }

  return prev[b.length];
}

/**
 * Extract meaningful tokens.
 */
function getTokens(name) {
  return new Set(
    comparisonName(name)
      .split(/\s+/)
      .filter(token => token.length >= 3)
  );
}

/**
 * Returns shared tokens of length >= 3.
 */
function getSharedTokens(a, b) {
  const tokensA = getTokens(a);
  const tokensB = getTokens(b);

  const shared = [];

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared.push(token);
    }
  }

  return shared;
}

/**
 * Strict identity confidence.
 *
 * REQUIREMENTS:
 *   distance <= 2
 *   AND:
 *      shared token >= 3
 *      OR direct substring
 */
function evaluateCandidate(
  eloName,
  canonicalName,
  distance
) {
  if (distance > 2) {
    return {
      approved: false,
      reason: 'DISTANCE_GT_2',
      sharedTokens: [],
      substring: false
    };
  }

  const elo = comparisonName(eloName);
  const canonical = comparisonName(canonicalName);

  const substring =
    elo.length >= 3 &&
    (
      elo.includes(canonical) ||
      canonical.includes(elo)
    );

  const sharedTokens = getSharedTokens(
    eloName,
    canonicalName
  );

  if (!substring && sharedTokens.length === 0) {
    return {
      approved: false,
      reason: 'NO_SHARED_IDENTITY_EVIDENCE',
      sharedTokens,
      substring
    };
  }

  return {
    approved: true,
    reason: substring
      ? 'DIRECT_SUBSTRING'
      : 'SHARED_TOKEN',
    sharedTokens,
    substring
  };
}

/**
 * Process JSONL.
 */
async function processJSONL(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) {
      resolve(0);
      return;
    }

    const stream = fs.createReadStream(file, {
      encoding: 'utf8'
    });

    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    rl.on('line', line => {
      if (!line.trim()) return;

      try {
        onRow(JSON.parse(line));
      } catch (_) {
        // Ignore malformed source rows.
      }
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 31A.2');
  console.log(' STRICT ELO ALIAS VALIDATION');
  console.log('============================================================\n');

  console.log('> Loading Entity Identity Index...');
  const entityIndex = JSON.parse(
    fs.readFileSync(
      ENTITY_IDENTITY_FILE,
      'utf8'
    )
  );

  console.log('> Loading diagnostic suggestions...');
  const suggestions = JSON.parse(
    fs.readFileSync(
      SUGGESTIONS_FILE,
      'utf8'
    )
  );

  /**
   * Build entity lookup.
   */
  const validEntities = new Set(
    Object.keys(entityIndex)
  );

  let approved = [];
  let rejected = [];
  let ambiguous = [];

  /**
   * Evaluate every suggestion.
   */
  for (const suggestion of suggestions) {
    const candidates = Array.isArray(
      suggestion.suggestions
    )
      ? suggestion.suggestions
      : [];

    const validCandidates = candidates.filter(
      candidate =>
        candidate &&
        validEntities.has(candidate.entityId)
    );

    if (validCandidates.length === 0) {
      rejected.push({
        eloName: suggestion.eloName,
        reason: 'NO_VALID_ENTITY_CANDIDATE',
        candidates: []
      });

      continue;
    }

    const evaluated = validCandidates.map(
      candidate => {
        const evidence = evaluateCandidate(
          suggestion.eloName,
          candidate.canonicalName,
          candidate.distance
        );

        return {
          ...candidate,
          ...evidence
        };
      }
    );

    const approvedCandidates =
      evaluated.filter(c => c.approved);

    /**
     * No candidate has enough identity evidence.
     */
    if (approvedCandidates.length === 0) {
      rejected.push({
        eloName: suggestion.eloName,
        reason: 'NO_STRICT_MATCH',
        candidates: evaluated
      });

      continue;
    }

    /**
     * More than one entity passes the strict rule.
     * Do NOT guess.
     */
    const entityIds = new Set(
      approvedCandidates.map(
        candidate => candidate.entityId
      )
    );

    if (entityIds.size > 1) {
      ambiguous.push({
        eloName: suggestion.eloName,
        reason: 'MULTIPLE_STRICT_CANDIDATES',
        candidates: approvedCandidates
      });

      continue;
    }

    /**
     * One entity survives.
     */
    const best = approvedCandidates
      .sort((a, b) => {
        if (a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        if (
          a.sharedTokens.length !==
          b.sharedTokens.length
        ) {
          return (
            b.sharedTokens.length -
            a.sharedTokens.length
          );
        }

        return 0;
      })[0];

    approved.push({
      eloName: suggestion.eloName,
      canonicalName: best.canonicalName,
      entityId: best.entityId,
      distance: best.distance,
      reason: best.reason,
      sharedTokens: best.sharedTokens,
      substring: best.substring
    });
  }

  /**
   * Deduplicate aliases.
   */
  const seenAliases = new Set();

  approved = approved.filter(item => {
    const key = normalizeName(item.eloName);

    if (seenAliases.has(key)) {
      return false;
    }

    seenAliases.add(key);
    return true;
  });

  console.log('\n============================================================');
  console.log(' STRICT VALIDATION SUMMARY');
  console.log('============================================================');

  console.log(
    `Total Suggestions        : ${suggestions.length.toLocaleString()}`
  );

  console.log(
    `Strictly Approved        : ${approved.length.toLocaleString()}`
  );

  console.log(
    `Rejected                 : ${rejected.length.toLocaleString()}`
  );

  console.log(
    `Ambiguous                : ${ambiguous.length.toLocaleString()}`
  );

  /**
   * Save audit.
   *
   * IMPORTANT:
   * This step does NOT modify entity_identity_index.json.
   */
  const audit = {
    pipeline_step: '31A.2',
    generated_at: new Date().toISOString(),
    policy: {
      max_levenshtein_distance: 2,
      minimum_shared_token_length: 3,
      allow_direct_substring: true,
      reject_ambiguous_matches: true,
      modify_identity_index: false
    },
    summary: {
      total_suggestions: suggestions.length,
      approved: approved.length,
      rejected: rejected.length,
      ambiguous: ambiguous.length
    },
    approved,
    rejected,
    ambiguous
  };

  fs.writeFileSync(
    AUDIT_FILE,
    JSON.stringify(audit, null, 2),
    'utf8'
  );

  /**
   * Human-readable report.
   */
  const report = [];

  report.push(
    'ZOKASCORE V2 PIPELINE — STEP 31A.2'
  );
  report.push(
    'STRICT ELO ALIAS VALIDATION REPORT'
  );
  report.push(
    `Generated: ${new Date().toISOString()}\n`
  );

  report.push(
    '============================================================'
  );
  report.push('SUMMARY');
  report.push(
    '============================================================'
  );

  report.push(
    `Total Suggestions : ${suggestions.length}`
  );

  report.push(
    `Strictly Approved : ${approved.length}`
  );

  report.push(
    `Rejected          : ${rejected.length}`
  );

  report.push(
    `Ambiguous         : ${ambiguous.length}`
  );

  report.push('\n============================================================');
  report.push('APPROVED ALIASES');
  report.push('============================================================');

  approved.forEach((item, index) => {
    report.push(
      `${index + 1}. "${item.eloName}" → "${item.canonicalName}" ` +
      `[${item.reason}, distance=${item.distance}]`
    );

    if (item.sharedTokens.length) {
      report.push(
        `   Shared tokens: ${item.sharedTokens.join(', ')}`
      );
    }
  });

  report.push('\n============================================================');
  report.push('AMBIGUOUS — DO NOT AUTO-APPLY');
  report.push('============================================================');

  ambiguous.slice(0, 100).forEach((item, index) => {
    report.push(
      `${index + 1}. "${item.eloName}"`
    );

    item.candidates.forEach(candidate => {
      report.push(
        `   → ${candidate.canonicalName} ` +
        `(ID ${candidate.entityId}, ` +
        `distance=${candidate.distance}, ` +
        `${candidate.reason})`
      );
    });
  });

  report.push('\n============================================================');
  report.push('REJECTED EXAMPLES');
  report.push('============================================================');

  rejected.slice(0, 100).forEach((item, index) => {
    report.push(
      `${index + 1}. "${item.eloName}" → ${item.reason}`
    );
  });

  report.push('\n============================================================');
  report.push('IMPORTANT');
  report.push('============================================================');
  report.push(
    'This step is READ-ONLY.'
  );
  report.push(
    'entity_identity_index.json was NOT modified.'
  );
  report.push(
    'Review the approved list before applying aliases.'
  );

  fs.writeFileSync(
    REPORT_FILE,
    report.join('\n') + '\n',
    'utf8'
  );

  console.log(
    `\n   ✅ Saved strict audit: ${path.relative(ROOT, AUDIT_FILE)}`
  );

  console.log(
    `   ✅ Saved report: ${path.relative(ROOT, REPORT_FILE)}`
  );

  console.log('\n============================================================');
  console.log(' STEP 31A.2 COMPLETE');
  console.log('============================================================');
  console.log(
    'No identity files were modified.'
  );
  console.log(
    'Review 31a2-strict-alias-report.txt before applying changes.'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});