'use strict';

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
  '99g-residual-team-identity-resolution-report.json'
);

function clean(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'â€™'"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value) {
  return clean(value).replace(/\s+/g, '');
}

function parseDate(value) {
  const s = String(value ?? '').trim();

  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);

  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }

  const d = new Date(s);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function exactKey(date, home, away) {
  return `${date}|${clean(home)}|${clean(away)}`;
}

function compactKey(date, home, away) {
  return `${date}|${compact(home)}|${compact(away)}`;
}

function reverseCompactKey(date, home, away) {
  return `${date}|${compact(away)}|${compact(home)}`;
}

async function readCsv(file, onRow) {
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

function verifyFiles() {
  console.log('');
  console.log('============================================================');
  console.log(' [ZK-99G] VERIFYING SOURCE FILES');
  console.log('============================================================');

  for (const file of [
    MASTER_FILE,
    APPEARANCES_FILE,
    EVENTS_FILE
  ]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing source file: ${file}`);
    }

    console.log(`[ZK-99G] OK ${path.basename(file)}`);
  }
}

async function main() {
  console.log('');
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — RESIDUAL TEAM IDENTITY RESOLUTION');
  console.log('============================================================');
  console.log(`[ZK-99G] Source: ${SOURCE_DIR}`);
  console.log('[ZK-99G] READ ONLY — NO FILES WILL BE MODIFIED.');
  console.log('[ZK-99G] TARGET: residual team-only metadata cases.');

  verifyFiles();

  /*
   * ----------------------------------------------------------
   * STEP 1 — BUILD MASTER INDEX
   * ----------------------------------------------------------
   *
   * We retain the actual MASTER rows because there are only
   * 484k of them and we need to inspect candidate metadata.
   */

  console.log('');
  console.log('============================================================');
  console.log(' [ZK-99G] [1] BUILDING MASTER CANDIDATE INDEX');
  console.log('============================================================');

  const masterRows = [];

  const exactIndex = new Map();

  const dateTeamIndex = new Map();

  await readCsv(MASTER_FILE, (row, count) => {
    const date = parseDate(row.date);

    const home = String(
      row.home_team ?? ''
    ).trim();

    const away = String(
      row.away_team ?? ''
    ).trim();

    if (!date || !home || !away) {
      return;
    }

    const record = {
      master_row: count,

      date,

      home_team: home,

      away_team: away,

      home_clean: clean(home),

      away_clean: clean(away),

      home_compact: compact(home),

      away_compact: compact(away),

      competition: row.competition ?? null,

      season: row.season ?? null,

      round: row.round ?? null,

      match_id:
        row.zokascore_match_id ??
        row.match_id ??
        row.id ??
        null
    };

    masterRows.push(record);

    const exact = exactKey(
      date,
      home,
      away
    );

    exactIndex.set(exact, true);

    for (const team of [
      record.home_compact,
      record.away_compact
    ]) {
      const key = `${date}|${team}`;

      if (!dateTeamIndex.has(key)) {
        dateTeamIndex.set(key, []);
      }

      dateTeamIndex.get(key).push(record);
    }

    if (count % 100000 === 0) {
      console.log(
        `[ZK-99G] MASTER rows indexed: ${count}`
      );
    }
  });

  console.log(
    `[ZK-99G] MASTER usable rows: ${masterRows.length}`
  );

  console.log(
    `[ZK-99G] Date/team buckets: ${dateTeamIndex.size}`
  );

  /*
   * ----------------------------------------------------------
   * STEP 2 — ANALYZE SECONDARY DATA
   * ----------------------------------------------------------
   *
   * We independently rescan both secondary files.
   *
   * We do NOT trust the limited sample section from 99F.
   * This produces the complete residual population.
   */

  const unresolved = new Map();

  function analyzeSecondary(file, label) {
    return new Promise((resolve, reject) => {
      let rows = 0;

      fs.createReadStream(file)
        .pipe(csv())
        .on('data', row => {
          rows++;

          if (rows % 250000 === 0) {
            console.log(
              `[ZK-99G] ${label} rows analyzed: ${rows}`
            );
          }

          const sourceId =
            String(
              row.zokascore_match_id ?? ''
            ).trim();

          if (!sourceId) {
            return;
          }

          const match = sourceId.match(
            /^ZK_MATCH_(\d{8})_(.+)_(.+)$/i
          );

          if (!match) {
            return;
          }

          const date = parseDate(match[1]);

          const home = match[2].trim();

          const away = match[3].trim();

          if (!date || !home || !away) {
            return;
          }

          /*
           * Exact MASTER pair.
           *
           * If present, this is not residual.
           */
          const exact = exactKey(
            date,
            home,
            away
          );

          if (exactIndex.has(exact)) {
            return;
          }

          /*
           * Look for same-date MASTER rows containing either
           * normalized team.
           */
          const homeBucket =
            dateTeamIndex.get(
              `${date}|${compact(home)}`
            ) || [];

          const awayBucket =
            dateTeamIndex.get(
              `${date}|${compact(away)}`
            ) || [];

          const candidateMap = new Map();

          for (const candidate of homeBucket) {
            candidateMap.set(
              candidate.master_row,
              candidate
            );
          }

          for (const candidate of awayBucket) {
            candidateMap.set(
              candidate.master_row,
              candidate
            );
          }

          /*
           * 99F established that the residual population has
           * team-only evidence. We therefore retain only cases
           * where at least one same-date team has MASTER evidence.
           */
          if (candidateMap.size === 0) {
            return;
          }

          const key =
            `${sourceId}|${label}`;

          if (!unresolved.has(key)) {
            unresolved.set(key, {
              source_id: sourceId,

              source_type: label,

              source_date: date,

              source_home: home,

              source_away: away,

              candidates: Array.from(
                candidateMap.values()
              ).map(candidate => ({
                master_row:
                  candidate.master_row,

                master_match_id:
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

                home_exact:
                  clean(home) ===
                  candidate.home_clean,

                away_exact:
                  clean(away) ===
                  candidate.away_clean,

                home_compact:
                  compact(home) ===
                  candidate.home_compact,

                away_compact:
                  compact(away) ===
                  candidate.away_compact,

                same_home_team:
                  compact(home) ===
                  candidate.home_compact,

                same_away_team:
                  compact(away) ===
                  candidate.away_compact,

                reversed:
                  compact(home) ===
                  candidate.away_compact &&
                  compact(away) ===
                  candidate.home_compact
              }))
            });
          }
        })
        .on('end', () => {
          console.log(
            `[ZK-99G] ${label} rows: ${rows}`
          );

          resolve(rows);
        })
        .on('error', reject);
    });
  }

  console.log('');
  console.log('============================================================');
  console.log(' [ZK-99G] [2] SCANNING APPEARANCES');
  console.log('============================================================');

  await analyzeSecondary(
    APPEARANCES_FILE,
    'APPEARANCES'
  );

  console.log('');
  console.log('============================================================');
  console.log(' [ZK-99G] [3] SCANNING EVENTS');
  console.log('============================================================');

  await analyzeSecondary(
    EVENTS_FILE,
    'EVENTS'
  );

  /*
   * ----------------------------------------------------------
   * STEP 3 — CONSOLIDATE BY SOURCE MATCH ID
   * ----------------------------------------------------------
   */

  console.log('');
  console.log('============================================================');
  console.log(' [ZK-99G] [4] CONSOLIDATING RESIDUAL CASES');
  console.log('============================================================');

  const bySourceId = new Map();

  for (const item of unresolved.values()) {
    if (!bySourceId.has(item.source_id)) {
      bySourceId.set(
        item.source_id,
        {
          source_id: item.source_id,

          source_date: item.source_date,

          source_home: item.source_home,

          source_away: item.source_away,

          sources: [],

          candidateMap: new Map()
        }
      );
    }

    const group =
      bySourceId.get(item.source_id);

    if (!group.sources.includes(item.source_type)) {
      group.sources.push(
        item.source_type
      );
    }

    for (const candidate of item.candidates) {
      group.candidateMap.set(
        candidate.master_row,
        candidate
      );
    }
  }

  const cases = [];

  for (const group of bySourceId.values()) {
    const candidates =
      Array.from(
        group.candidateMap.values()
      );

    /*
     * Give candidates a transparent evidence score.
     *
     * This is classification only.
     * It does NOT repair anything.
     */

    for (const candidate of candidates) {
      let score = 0;

      if (
        candidate.same_home_team
      ) {
        score += 1;
      }

      if (
        candidate.same_away_team
      ) {
        score += 1;
      }

      if (
        candidate.reversed
      ) {
        score += 1;
      }

      if (
        candidate.home_exact
      ) {
        score += 2;
      }

      if (
        candidate.away_exact
      ) {
        score += 2;
      }

      candidate.evidence_score = score;
    }

    candidates.sort(
      (a, b) =>
        b.evidence_score -
        a.evidence_score
    );

    let classification =
      'UNRESOLVED';

    if (candidates.length === 1) {
      classification =
        'SINGLE_MASTER_CANDIDATE';
    } else if (
      candidates.length > 1 &&
      candidates[0].evidence_score >
        candidates[1].evidence_score
    ) {
      classification =
        'BEST_CANDIDATE_EXISTS';
    } else if (
      candidates.length > 1
    ) {
      classification =
        'MULTIPLE_EQUAL_CANDIDATES';
    }

    cases.push({
      source_id:
        group.source_id,

      source_date:
        group.source_date,

      source_home:
        group.source_home,

      source_away:
        group.source_away,

      secondary_sources:
        group.sources,

      candidate_count:
        candidates.length,

      classification,

      best_candidate:
        candidates[0] || null,

      candidates
    });
  }

  cases.sort((a, b) => {
    if (
      a.classification !==
      b.classification
    ) {
      return a.classification.localeCompare(
        b.classification
      );
    }

    return a.source_id.localeCompare(
      b.source_id
    );
  });

  /*
   * ----------------------------------------------------------
   * STEP 4 — SUMMARY
   * ----------------------------------------------------------
   */

  const summary = {
    total_residual_source_ids:
      cases.length,

    single_master_candidate:
      cases.filter(
        x =>
          x.classification ===
          'SINGLE_MASTER_CANDIDATE'
      ).length,

    best_candidate_exists:
      cases.filter(
        x =>
          x.classification ===
          'BEST_CANDIDATE_EXISTS'
      ).length,

    multiple_equal_candidates:
      cases.filter(
        x =>
          x.classification ===
          'MULTIPLE_EQUAL_CANDIDATES'
      ).length,

    unresolved:
      cases.filter(
        x =>
          x.classification ===
          'UNRESOLVED'
      ).length
  };

  console.log('');
  console.log(
    `[ZK-99G] Residual source IDs: ${summary.total_residual_source_ids}`
  );

  console.log(
    `[ZK-99G] Single MASTER candidate: ${summary.single_master_candidate}`
  );

  console.log(
    `[ZK-99G] Best candidate exists: ${summary.best_candidate_exists}`
  );

  console.log(
    `[ZK-99G] Multiple equal candidates: ${summary.multiple_equal_candidates}`
  );

  console.log(
    `[ZK-99G] Unresolved: ${summary.unresolved}`
  );

  /*
   * ----------------------------------------------------------
   * STEP 5 — WRITE REPORT
   * ----------------------------------------------------------
   */

  fs.mkdirSync(
    AUDIT_DIR,
    { recursive: true }
  );

  const report = {
    generated_at:
      new Date().toISOString(),

    source:
      SOURCE_DIR,

    read_only:
      true,

    purpose:
      'Resolve all residual secondary match metadata records that have same-date evidence for at least one MASTER team.',

    master: {
      rows:
        masterRows.length,

      date_team_buckets:
        dateTeamIndex.size
    },

    summary,

    cases
  };

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      report,
      null,
      2
    ),
    'utf8'
  );

  console.log('');
  console.log('============================================================');
  console.log(' ZOKASCORE 99G — RESOLUTION FORENSICS COMPLETE');
  console.log('============================================================');

  console.log(
    `[ZK-99G] Report: ${REPORT_FILE}`
  );

  console.log('');
  console.log(
    '[ZK-99G] NO FILES MODIFIED.'
  );

  console.log(
    '[ZK-99G] ZOKASCORE_FINAL NOT MODIFIED.'
  );

  console.log(
    '[ZK-99G] public_data NOT MODIFIED.'
  );

  console.log(
    '[ZK-99G] NO IDs REWRITTEN.'
  );

  console.log(
    '[ZK-99G] NO REPAIRS PERFORMED.'
  );
}

main().catch(err => {
  console.error('');
  console.error('[ZK-99G] FATAL ERROR');
  console.error(err);
  process.exit(1);
});