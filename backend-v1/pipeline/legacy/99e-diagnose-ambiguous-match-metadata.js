'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — AMBIGUOUS MATCH METADATA FORENSICS
 * ============================================================
 *
 * Purpose:
 *   Investigate MASTER matches where secondary ZK_MATCH_* metadata
 *   maps to more than one MASTER candidate.
 *
 * IMPORTANT:
 *   - READ ONLY
 *   - NO files modified
 *   - NO IDs rewritten
 *   - NO repairs performed
 *   - NO fuzzy matching
 *
 * Input:
 *   data/source/ZOKASCORE_FINAL/
 *
 * Output:
 *   data_audit/v2_integrity/
 *     99e-ambiguous-match-metadata-report.json
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const SOURCE_DIR = path.join(
  ROOT,
  'data',
  'source',
  'ZOKASCORE_FINAL'
);

const AUDIT_DIR = path.join(
  ROOT,
  'data_audit',
  'v2_integrity'
);

const MASTER_FILE = path.join(
  SOURCE_DIR,
  'ZOKASCORE_PUBLIC_MASTER.csv'
);

const APPEARANCES_FILE = path.join(
  SOURCE_DIR,
  'ZOKASCORE_APPEARANCES.csv'
);

const EVENTS_FILE = path.join(
  SOURCE_DIR,
  'ZOKASCORE_EVENTS.csv'
);

const REPORT_FILE = path.join(
  AUDIT_DIR,
  '99e-ambiguous-match-metadata-report.json'
);

const SAMPLE_LIMIT = 100;
const TOP_KEY_LIMIT = 100;

console.log('');
console.log('============================================================');
console.log(' ZOKASCORE V2 — AMBIGUOUS MATCH METADATA FORENSICS');
console.log('============================================================');
console.log(`[ZK-99E] Source: ${SOURCE_DIR}`);
console.log('[ZK-99E] READ ONLY — NO FILES WILL BE MODIFIED.');
console.log('');

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeDate(value) {
  const raw = String(value ?? '').trim();

  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const m1 = raw.match(/^(\d{4})[\/.](\d{2})[\/.](\d{2})$/);

  if (m1) {
    return `${m1[1]}-${m1[2]}-${m1[3]}`;
  }

  const m2 = raw.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (m2) {
    return `${m2[1]}-${m2[2]}-${m2[3]}`;
  }

  return raw;
}

function parseZkMatchId(id) {
  const raw = String(id ?? '').trim();

  if (!raw.startsWith('ZK_MATCH_')) {
    return null;
  }

  const remainder = raw.slice('ZK_MATCH_'.length);

  const match = remainder.match(/^(\d{8})_(.+)$/);

  if (!match) {
    return null;
  }

  const dateRaw = match[1];

  const date =
    `${dateRaw.slice(0, 4)}-` +
    `${dateRaw.slice(4, 6)}-` +
    `${dateRaw.slice(6, 8)}`;

  const teamPart = match[2];

  const parts = teamPart.split('_');

  if (parts.length < 2) {
    return null;
  }

  /*
   * The source IDs use:
   *
   * ZK_MATCH_YYYYMMDD_HOME_AWAY
   *
   * We deliberately use the LAST underscore as the separator.
   * This preserves underscores that may occur inside a team name.
   */
  const homeRaw = parts.slice(0, -1).join('_');
  const awayRaw = parts[parts.length - 1];

  return {
    raw,
    date,
    homeRaw,
    awayRaw,
    homeNormalized: normalizeTeamFromId(homeRaw),
    awayNormalized: normalizeTeamFromId(awayRaw),
    homeCompact: compactText(normalizeTeamFromId(homeRaw)),
    awayCompact: compactText(normalizeTeamFromId(awayRaw))
  };
}

function normalizeTeamFromId(value) {
  let text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  /*
   * Important source-specific normalization.
   *
   * We do NOT perform broad fuzzy transformations.
   * Only obvious formatting artifacts are handled.
   */

  text = text
    .replace(/\bfc(?=[a-z])/g, 'fc ')
    .replace(/\bafc(?=[a-z])/g, 'afc ')
    .replace(/\bsc(?=[a-z])/g, 'sc ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function makeExactKey(date, home, away) {
  return [
    normalizeDate(date),
    normalizeText(home),
    normalizeText(away)
  ].join('|');
}

function makeCompactKey(date, home, away) {
  return [
    normalizeDate(date),
    compactText(home),
    compactText(away)
  ].join('|');
}

function makeReverseCompactKey(date, home, away) {
  return [
    normalizeDate(date),
    compactText(away),
    compactText(home)
  ].join('|');
}

function readCsv(file) {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(file)
      .pipe(csv())
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function streamCsv(file, onRow) {
  return new Promise((resolve, reject) => {
    let count = 0;

    fs.createReadStream(file)
      .pipe(csv())
      .on('data', row => {
        count++;

        try {
          onRow(row, count);
        } catch (err) {
          reject(err);
        }
      })
      .on('end', () => resolve(count))
      .on('error', reject);
  });
}

function ensureFiles() {
  console.log(
    '[ZK-99E] ============================================================'
  );
  console.log('[ZK-99E] [0] VERIFYING SOURCE FILES');
  console.log(
    '[ZK-99E] ============================================================'
  );

  const files = [
    MASTER_FILE,
    APPEARANCES_FILE,
    EVENTS_FILE
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing source file: ${file}`);
    }

    console.log(`[ZK-99E] ✅ ${path.basename(file)}`);
  }

  console.log('');
}

function classifyCandidateRelationship(source, candidate) {
  const sourceHome = source.homeCompact;
  const sourceAway = source.awayCompact;

  const candidateHome = compactText(candidate.home_team);
  const candidateAway = compactText(candidate.away_team);

  const direct =
    sourceHome === candidateHome &&
    sourceAway === candidateAway;

  const reverse =
    sourceHome === candidateAway &&
    sourceAway === candidateHome;

  if (direct) {
    return 'DIRECT_COMPACT';
  }

  if (reverse) {
    return 'REVERSED_HOME_AWAY';
  }

  const sourceHomeNorm = normalizeText(source.homeNormalized);
  const sourceAwayNorm = normalizeText(source.awayNormalized);

  const candidateHomeNorm = normalizeText(candidate.home_team);
  const candidateAwayNorm = normalizeText(candidate.away_team);

  if (
    sourceHomeNorm === candidateHomeNorm &&
    sourceAwayNorm === candidateAwayNorm
  ) {
    return 'DIRECT_NORMALIZED';
  }

  if (
    sourceHomeNorm === candidateAwayNorm &&
    sourceAwayNorm === candidateHomeNorm
  ) {
    return 'REVERSED_HOME_AWAY_NORMALIZED';
  }

  return 'OTHER_VARIATION';
}

async function main() {
  ensureFiles();

  /*
   * ============================================================
   * 1. BUILD MASTER INDEX
   * ============================================================
   */

  console.log(
    '============================================================'
  );
  console.log('[ZK-99E] [1] BUILDING MASTER CANDIDATE INDEX');
  console.log(
    '============================================================'
  );

  const masterByCompact = new Map();
  const masterByDate = new Map();

  let masterRows = 0;

  await streamCsv(MASTER_FILE, row => {
    masterRows++;

    const date = normalizeDate(row.date);
    const home = normalizeText(row.home_team);
    const away = normalizeText(row.away_team);

    if (!date || !home || !away) {
      return;
    }

    const candidate = {
      zokascore_match_id:
        row.zokascore_match_id || '',

      match_id:
        row.match_id || '',

      date,

      home_team:
        row.home_team || '',

      away_team:
        row.away_team || '',

      competition:
        row.competition || '',

      season:
        row.season || '',

      round:
        row.round || '',

      home_score:
        row.home_score || '',

      away_score:
        row.away_score || ''
    };

    const compactKey = makeCompactKey(
      date,
      home,
      away
    );

    const reverseKey = makeReverseCompactKey(
      date,
      home,
      away
    );

    if (!masterByCompact.has(compactKey)) {
      masterByCompact.set(compactKey, []);
    }

    masterByCompact.get(compactKey).push(candidate);

    /*
     * Also index by date only so we can understand whether
     * ambiguity comes from many matches on the same day.
     */

    if (!masterByDate.has(date)) {
      masterByDate.set(date, []);
    }

    masterByDate.get(date).push(candidate);

    if (masterRows % 100000 === 0) {
      console.log(
        `[ZK-99E] MASTER rows indexed: ${masterRows}`
      );
    }
  });

  console.log(`[ZK-99E] MASTER rows: ${masterRows}`);
  console.log(
    `[ZK-99E] Compact candidate keys: ${masterByCompact.size}`
  );
  console.log(
    `[ZK-99E] Date buckets: ${masterByDate.size}`
  );
  console.log('');

  /*
   * ============================================================
   * 2. ANALYZE SECONDARY DATA
   * ============================================================
   */

  const global = {
    rows: 0,
    parsed: 0,
    malformed: 0,

    ambiguousRows: 0,
    uniqueCandidateRows: 0,
    noCandidateRows: 0,

    directRows: 0,
    reversedRows: 0,
    otherVariationRows: 0,

    ambiguousKeys: 0,

    candidateDistribution: {
      '0': 0,
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5+': 0
    }
  };

  const ambiguityByKey = new Map();

  const sourceStats = {
    appearances: {
      rows: 0,
      ambiguous: 0,
      unique: 0,
      none: 0
    },

    events: {
      rows: 0,
      ambiguous: 0,
      unique: 0,
      none: 0
    }
  };

  const sampleAmbiguous = [];
  const sampleNoCandidate = [];

  function recordCandidateDistribution(count) {
    if (count === 0) {
      global.candidateDistribution['0']++;
    } else if (count === 1) {
      global.candidateDistribution['1']++;
    } else if (count === 2) {
      global.candidateDistribution['2']++;
    } else if (count === 3) {
      global.candidateDistribution['3']++;
    } else if (count === 4) {
      global.candidateDistribution['4']++;
    } else {
      global.candidateDistribution['5+']++;
    }
  }

  function analyzeSecondaryRow(row, sourceName) {
    global.rows++;
    sourceStats[sourceName].rows++;

    const parsed = parseZkMatchId(
      row.zokascore_match_id
    );

    if (!parsed) {
      global.malformed++;
      return;
    }

    global.parsed++;

    const key = makeCompactKey(
      parsed.date,
      parsed.homeNormalized,
      parsed.awayNormalized
    );

    const candidates =
      masterByCompact.get(key) || [];

    recordCandidateDistribution(candidates.length);

    if (candidates.length === 0) {
      global.noCandidateRows++;
      sourceStats[sourceName].none++;

      if (sampleNoCandidate.length < SAMPLE_LIMIT) {
        sampleNoCandidate.push({
          source: sourceName,
          source_id: row.zokascore_match_id,
          date: parsed.date,
          home: parsed.homeNormalized,
          away: parsed.awayNormalized
        });
      }

      return;
    }

    if (candidates.length === 1) {
      global.uniqueCandidateRows++;
      sourceStats[sourceName].unique++;

      const relation =
        classifyCandidateRelationship(
          parsed,
          candidates[0]
        );

      if (
        relation === 'DIRECT_COMPACT' ||
        relation === 'DIRECT_NORMALIZED'
      ) {
        global.directRows++;
      } else if (
        relation === 'REVERSED_HOME_AWAY' ||
        relation === 'REVERSED_HOME_AWAY_NORMALIZED'
      ) {
        global.reversedRows++;
      } else {
        global.otherVariationRows++;
      }

      return;
    }

    /*
     * AMBIGUOUS
     */

    global.ambiguousRows++;
    sourceStats[sourceName].ambiguous++;

    const existing =
      ambiguityByKey.get(key);

    if (existing) {
      existing.rowCount++;
    } else {
      const record = {
        key,
        rowCount: 1,
        sourceIds: new Set(),
        candidates: candidates.map(candidate => ({
          zokascore_match_id:
            candidate.zokascore_match_id,

          match_id:
            candidate.match_id,

          date:
            candidate.date,

          home_team:
            candidate.home_team,

          away_team:
            candidate.away_team,

          competition:
            candidate.competition,

          season:
            candidate.season,

          round:
            candidate.round,

          home_score:
            candidate.home_score,

          away_score:
            candidate.away_score
        }))
      };

      record.sourceIds.add(
        row.zokascore_match_id
      );

      ambiguityByKey.set(
        key,
        record
      );

      if (sampleAmbiguous.length < SAMPLE_LIMIT) {
        sampleAmbiguous.push({
          source: sourceName,
          source_id: row.zokascore_match_id,
          date: parsed.date,
          home: parsed.homeNormalized,
          away: parsed.awayNormalized,
          candidate_count: candidates.length,
          candidates: record.candidates
        });
      }

      return;
    }

    existing.sourceIds.add(
      row.zokascore_match_id
    );
  }

  console.log(
    '============================================================'
  );
  console.log('[ZK-99E] [2] ANALYZING APPEARANCES');
  console.log(
    '============================================================'
  );

  await streamCsv(
    APPEARANCES_FILE,
    row => {
      analyzeSecondaryRow(row, 'appearances');

      if (
        sourceStats.appearances.rows % 250000 === 0
      ) {
        console.log(
          `[ZK-99E] APPEARANCES rows analyzed: ${sourceStats.appearances.rows}`
        );
      }
    }
  );

  console.log(
    `[ZK-99E] APPEARANCES rows: ${sourceStats.appearances.rows}`
  );
  console.log(
    `[ZK-99E] APPEARANCES ambiguous: ${sourceStats.appearances.ambiguous}`
  );
  console.log(
    `[ZK-99E] APPEARANCES unique: ${sourceStats.appearances.unique}`
  );
  console.log(
    `[ZK-99E] APPEARANCES no candidate: ${sourceStats.appearances.none}`
  );

  console.log('');

  console.log(
    '============================================================'
  );
  console.log('[ZK-99E] [3] ANALYZING EVENTS');
  console.log(
    '============================================================'
  );

  await streamCsv(
    EVENTS_FILE,
    row => {
      analyzeSecondaryRow(row, 'events');

      if (
        sourceStats.events.rows % 250000 === 0
      ) {
        console.log(
          `[ZK-99E] EVENTS rows analyzed: ${sourceStats.events.rows}`
        );
      }
    }
  );

  console.log(
    `[ZK-99E] EVENTS rows: ${sourceStats.events.rows}`
  );
  console.log(
    `[ZK-99E] EVENTS ambiguous: ${sourceStats.events.ambiguous}`
  );
  console.log(
    `[ZK-99E] EVENTS unique: ${sourceStats.events.unique}`
  );
  console.log(
    `[ZK-99E] EVENTS no candidate: ${sourceStats.events.none}`
  );

  /*
   * ============================================================
   * 4. CLASSIFY AMBIGUITY
   * ============================================================
   */

  console.log('');
  console.log(
    '============================================================'
  );
  console.log('[ZK-99E] [4] CLASSIFYING AMBIGUOUS CASES');
  console.log(
    '============================================================'
  );

  const ambiguityClassification = {
    sameDateSameTeamsDifferentCompetition: 0,
    sameDateSameTeamsDifferentSeason: 0,
    sameDateSameTeamsDifferentRound: 0,
    identicalMasterRows: 0,
    reversedCandidates: 0,
    genuinelyDifferentCandidates: 0
  };

  const detailedAmbiguities = [];

  for (const record of ambiguityByKey.values()) {
    global.ambiguousKeys++;

    const candidates = record.candidates;

    const signatures = new Set(
      candidates.map(candidate =>
        [
          candidate.date,
          compactText(candidate.home_team),
          compactText(candidate.away_team),
          candidate.competition,
          candidate.season,
          candidate.round,
          candidate.home_score,
          candidate.away_score
        ].join('|')
      )
    );

    if (signatures.size === 1) {
      ambiguityClassification.identicalMasterRows++;
    }

    const competitions = new Set(
      candidates.map(c => c.competition)
    );

    const seasons = new Set(
      candidates.map(c => c.season)
    );

    const rounds = new Set(
      candidates.map(c => c.round)
    );

    if (competitions.size > 1) {
      ambiguityClassification
        .sameDateSameTeamsDifferentCompetition++;
    }

    if (seasons.size > 1) {
      ambiguityClassification
        .sameDateSameTeamsDifferentSeason++;
    }

    if (rounds.size > 1) {
      ambiguityClassification
        .sameDateSameTeamsDifferentRound++;
    }

    let hasReverse = false;

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];

        const aHome = compactText(a.home_team);
        const aAway = compactText(a.away_team);

        const bHome = compactText(b.home_team);
        const bAway = compactText(b.away_team);

        if (
          aHome === bAway &&
          aAway === bHome
        ) {
          hasReverse = true;
        }
      }
    }

    if (hasReverse) {
      ambiguityClassification.reversedCandidates++;
    }

    if (signatures.size > 1) {
      ambiguityClassification.genuinelyDifferentCandidates++;
    }

    if (
      detailedAmbiguities.length < TOP_KEY_LIMIT
    ) {
      detailedAmbiguities.push({
        key: record.key,
        row_count: record.rowCount,
        source_ids: Array.from(record.sourceIds),
        candidate_count: candidates.length,
        candidates
      });
    }
  }

  /*
   * Sort highest-frequency ambiguous keys first.
   */

  detailedAmbiguities.sort(
    (a, b) =>
      b.row_count - a.row_count
  );

  /*
   * ============================================================
   * 5. DATE BUCKET ANALYSIS
   * ============================================================
   */

  console.log('');
  console.log(
    '============================================================'
  );
  console.log('[ZK-99E] [5] DATE-BUCKET ANALYSIS');
  console.log(
    '============================================================'
  );

  const dateBucketSamples = [];

  for (const item of sampleAmbiguous) {
    const bucket =
      masterByDate.get(item.date) || [];

    dateBucketSamples.push({
      source_id: item.source_id,
      date: item.date,
      home: item.home,
      away: item.away,
      total_master_matches_on_date:
        bucket.length
    });
  }

  /*
   * ============================================================
   * 6. REPORT
   * ============================================================
   */

  const report = {
    metadata: {
      tool: '99e-diagnose-ambiguous-match-metadata',
      version: '1.0.0',
      generated_at: new Date().toISOString(),
      read_only: true,
      repairs_performed: false,
      ids_rewritten: false,
      fuzzy_matching_used: false
    },

    source: {
      directory: SOURCE_DIR,
      master_file: MASTER_FILE,
      appearances_file: APPEARANCES_FILE,
      events_file: EVENTS_FILE
    },

    master: {
      rows: masterRows,
      compact_candidate_keys:
        masterByCompact.size,
      date_buckets:
        masterByDate.size
    },

    totals: {
      secondary_rows: global.rows,
      parsed: global.parsed,
      malformed: global.malformed,

      unique_candidate_rows:
        global.uniqueCandidateRows,

      ambiguous_rows:
        global.ambiguousRows,

      no_candidate_rows:
        global.noCandidateRows,

      direct_rows:
        global.directRows,

      reversed_rows:
        global.reversedRows,

      other_variation_rows:
        global.otherVariationRows,

      ambiguous_keys:
        global.ambiguousKeys
    },

    candidate_distribution:
      global.candidateDistribution,

    source_breakdown:
      sourceStats,

    ambiguity_classification:
      ambiguityClassification,

    top_ambiguous_keys:
      detailedAmbiguities,

    sample_ambiguous_rows:
      sampleAmbiguous,

    sample_no_candidate_rows:
      sampleNoCandidate,

    sample_date_bucket_analysis:
      dateBucketSamples,

    interpretation: [
      'Ambiguous means the normalized date/home/away key maps to more than one MASTER row.',
      'This report does not select a winner.',
      'Identical MASTER rows may indicate duplication inside the MASTER namespace.',
      'Different competition/season/round values may indicate legitimate multiple records sharing the same date and teams.',
      'Reversed candidates may indicate the same fixture represented with opposite home/away orientation.',
      'No candidate cases are intentionally not repaired by this step.',
      'No fuzzy matching was performed.'
    ]
  };

  fs.mkdirSync(
    AUDIT_DIR,
    { recursive: true }
  );

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(report, null, 2),
    'utf8'
  );

  /*
   * ============================================================
   * 7. TERMINAL SUMMARY
   * ============================================================
   */

  console.log('');
  console.log(
    '============================================================'
  );
  console.log(' ZOKASCORE 99E — FORENSICS COMPLETE');
  console.log(
    '============================================================'
  );

  console.log(
    `[ZK-99E] MASTER rows: ${masterRows}`
  );

  console.log(
    `[ZK-99E] Secondary rows: ${global.rows}`
  );

  console.log(
    `[ZK-99E] Unique candidate rows: ${global.uniqueCandidateRows}`
  );

  console.log(
    `[ZK-99E] Ambiguous rows: ${global.ambiguousRows}`
  );

  console.log(
    `[ZK-99E] Ambiguous unique keys: ${global.ambiguousKeys}`
  );

  console.log(
    `[ZK-99E] No candidate rows: ${global.noCandidateRows}`
  );

  console.log('');

  console.log(
    '[ZK-99E] AMBIGUITY CLASSIFICATION'
  );

  console.log(
    `  Identical MASTER rows: ${ambiguityClassification.identicalMasterRows}`
  );

  console.log(
    `  Different competition: ${ambiguityClassification.sameDateSameTeamsDifferentCompetition}`
  );

  console.log(
    `  Different season: ${ambiguityClassification.sameDateSameTeamsDifferentSeason}`
  );

  console.log(
    `  Different round: ${ambiguityClassification.sameDateSameTeamsDifferentRound}`
  );

  console.log(
    `  Reversed candidates: ${ambiguityClassification.reversedCandidates}`
  );

  console.log(
    `  Genuinely different candidates: ${ambiguityClassification.genuinelyDifferentCandidates}`
  );

  console.log('');
  console.log(
    `[ZK-99E] Report: ${REPORT_FILE}`
  );

  console.log('');
  console.log(
    '[ZK-99E] 🔒 NO FILES MODIFIED.'
  );

  console.log(
    '[ZK-99E] 🔒 ZOKASCORE_FINAL WAS NOT MODIFIED.'
  );

  console.log(
    '[ZK-99E] 🔒 public_data WAS NOT MODIFIED.'
  );

  console.log(
    '[ZK-99E] 🔒 NO REPAIRS WERE PERFORMED.'
  );

  console.log('');
}

main().catch(err => {
  console.error('');
  console.error(
    '[ZK-99E] ❌ FORENSICS FAILED'
  );
  console.error(err);
  process.exit(1);
});
