'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source', 'ZOKASCORE_FINAL');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');

const MASTER_FILE = path.join(SOURCE_DIR, 'ZOKASCORE_PUBLIC_MASTER.csv');
const APPEARANCES_FILE = path.join(SOURCE_DIR, 'ZOKASCORE_APPEARANCES.csv');
const EVENTS_FILE = path.join(SOURCE_DIR, 'ZOKASCORE_EVENTS.csv');

const REPORT_FILE = path.join(
  AUDIT_DIR,
  '99f-no-candidate-match-metadata-report.json'
);

const SAMPLE_LIMIT = 20;

function clean(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[.'’'"]/g, '')
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

function shiftDate(dateString, days) {
  if (!dateString) return null;

  const d = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) return null;

  d.setUTCDate(d.getUTCDate() + days);

  return [
    d.getUTCFullYear(),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function pairKey(date, home, away) {
  return `${date}|${clean(home)}|${clean(away)}`;
}

function reversePairKey(date, home, away) {
  return `${date}|${clean(away)}|${clean(home)}`;
}

function compactPairKey(date, home, away) {
  return `${date}|${compact(home)}|${compact(away)}`;
}

function compactReversePairKey(date, home, away) {
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
  console.log('[ZK-99F] [0] VERIFYING SOURCE FILES');
  console.log('============================================================');

  for (const file of [
    MASTER_FILE,
    APPEARANCES_FILE,
    EVENTS_FILE
  ]) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing source file: ${file}`);
    }

    console.log(`[ZK-99F] ✅ ${path.basename(file)}`);
  }
}

function makeStats() {
  return {
    rows: 0,

    noExactPair: 0,

    foundDatePlusEitherTeam: 0,
    foundDatePlusBothTeamsNormalized: 0,
    foundDatePlusBothTeamsCompact: 0,

    dateMinusOne: 0,
    datePlusOne: 0,

    reversedFixture: 0,

    teamOnlyEvidence: 0,

    genuinelyAbsent: 0,

    samples: {
      datePlusEitherTeam: [],
      normalized: [],
      compact: [],
      dateOffset: [],
      reversed: [],
      genuinelyAbsent: []
    }
  };
}

function addSample(bucket, value) {
  if (bucket.length < SAMPLE_LIMIT) {
    bucket.push(value);
  }
}

async function main() {
  console.log('');
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — NO-CANDIDATE MATCH METADATA FORENSICS');
  console.log('============================================================');
  console.log(`[ZK-99F] Source: ${SOURCE_DIR}`);
  console.log('[ZK-99F] READ ONLY — NO FILES WILL BE MODIFIED.');

  verifyFiles();

  /*
   * MASTER INDEX
   *
   * We deliberately maintain several compact indexes.
   * We do NOT load complete master rows into memory.
   */

  console.log('');
  console.log('============================================================');
  console.log('[ZK-99F] [1] BUILDING MASTER FORENSIC INDEX');
  console.log('============================================================');

  const exactIndex = new Map();
  const normalizedIndex = new Map();
  const compactIndex = new Map();

  const dateTeamIndex = new Map();
  const dateIndex = new Map();

  let masterRows = 0;

  await readCsv(MASTER_FILE, row => {
    masterRows++;

    const date = parseDate(row.date);
    const home = row.home_team || '';
    const away = row.away_team || '';

    if (!date || !home || !away) return;

    const exact = pairKey(date, home, away);
    const normalized = compactPairKey(date, home, away);
    const reverse = compactReversePairKey(date, home, away);

    exactIndex.set(exact, true);
    normalizedIndex.set(normalized, true);
    normalizedIndex.set(reverse, true);

    compactIndex.set(compactPairKey(date, home, away), true);
    compactIndex.set(compactReversePairKey(date, home, away), true);

    const teams = [
      compact(home),
      compact(away)
    ];

    for (const team of teams) {
      const key = `${date}|${team}`;

      if (!dateTeamIndex.has(key)) {
        dateTeamIndex.set(key, 0);
      }

      dateTeamIndex.set(
        key,
        dateTeamIndex.get(key) + 1
      );
    }

    if (!dateIndex.has(date)) {
      dateIndex.set(date, 0);
    }

    dateIndex.set(
      date,
      dateIndex.get(date) + 1
    );

    if (masterRows % 100000 === 0) {
      console.log(
        `[ZK-99F] MASTER rows indexed: ${masterRows}`
      );
    }
  });

  console.log(`[ZK-99F] MASTER rows: ${masterRows}`);
  console.log(`[ZK-99F] Exact keys: ${exactIndex.size}`);
  console.log(`[ZK-99F] Normalized keys: ${normalizedIndex.size}`);
  console.log(`[ZK-99F] Compact keys: ${compactIndex.size}`);
  console.log(`[ZK-99F] Date/team keys: ${dateTeamIndex.size}`);
  console.log(`[ZK-99F] Date buckets: ${dateIndex.size}`);

  /*
   * Analyze one secondary file.
   *
   * IMPORTANT:
   * This script is designed specifically to investigate
   * records that the previous forensic stage considered
   * "no candidate".
   *
   * We therefore report evidence without modifying anything.
   */

  function analyzeFile(file, label) {
    return new Promise((resolve, reject) => {
      const stats = makeStats();

      fs.createReadStream(file)
        .pipe(csv())
        .on('data', row => {
          stats.rows++;

          if (stats.rows % 250000 === 0) {
            console.log(
              `[ZK-99F] ${label} rows analyzed: ${stats.rows}`
            );
          }

          const id = row.zokascore_match_id || '';

          const match = id.match(
            /^ZK_MATCH_(\d{8})_(.+)_(.+)$/i
          );

          if (!match) {
            return;
          }

          const rawDate = match[1];
          const rawHome = match[2];
          const rawAway = match[3];

          const date = parseDate(rawDate);

          const home = rawHome.trim();
          const away = rawAway.trim();

          const exact = pairKey(date, home, away);

          /*
           * If this record is actually present under the exact
           * metadata key, it isn't a true no-candidate case.
           */
          if (exactIndex.has(exact)) {
            return;
          }

          stats.noExactPair++;

          const normalized = compactPairKey(
            date,
            home,
            away
          );

          const reversedNormalized = compactReversePairKey(
            date,
            home,
            away
          );

          /*
           * 1. Exact date + normalized teams.
           */
          if (
            normalizedIndex.has(normalized) ||
            normalizedIndex.has(reversedNormalized)
          ) {
            stats.foundDatePlusBothTeamsNormalized++;

            if (
              normalizedIndex.has(reversedNormalized) &&
              !normalizedIndex.has(normalized)
            ) {
              stats.reversedFixture++;

              addSample(
                stats.samples.reversed,
                {
                  source_id: id,
                  date,
                  home,
                  away,
                  reason: 'normalized reversed fixture'
                }
              );
            } else {
              addSample(
                stats.samples.normalized,
                {
                  source_id: id,
                  date,
                  home,
                  away,
                  reason: 'normalized team names'
                }
              );
            }

            return;
          }

          /*
           * 2. Compact representation.
           */
          if (
            compactIndex.has(
              compactPairKey(date, home, away)
            ) ||
            compactIndex.has(
              compactReversePairKey(date, home, away)
            )
          ) {
            stats.foundDatePlusBothTeamsCompact++;

            addSample(
              stats.samples.compact,
              {
                source_id: id,
                date,
                home,
                away,
                reason: 'compact team normalization'
              }
            );

            return;
          }

          /*
           * 3. Same date + either team.
           */
          const homeKey = `${date}|${compact(home)}`;
          const awayKey = `${date}|${compact(away)}`;

          const homeEvidence =
            dateTeamIndex.has(homeKey);

          const awayEvidence =
            dateTeamIndex.has(awayKey);

          if (homeEvidence || awayEvidence) {
            stats.foundDatePlusEitherTeam++;

            addSample(
              stats.samples.datePlusEitherTeam,
              {
                source_id: id,
                date,
                home,
                away,
                master_home_evidence: homeEvidence,
                master_away_evidence: awayEvidence
              }
            );
          }

          /*
           * 4. Date +/- 1 day.
           */
          const previousDate = shiftDate(date, -1);
          const nextDate = shiftDate(date, 1);

          let previousEvidence = false;
          let nextEvidence = false;

          if (previousDate) {
            previousEvidence =
              compactIndex.has(
                compactPairKey(
                  previousDate,
                  home,
                  away
                )
              ) ||
              compactIndex.has(
                compactReversePairKey(
                  previousDate,
                  home,
                  away
                )
              );
          }

          if (nextDate) {
            nextEvidence =
              compactIndex.has(
                compactPairKey(
                  nextDate,
                  home,
                  away
                )
              ) ||
              compactIndex.has(
                compactReversePairKey(
                  nextDate,
                  home,
                  away
                )
              );
          }

          if (previousEvidence) {
            stats.dateMinusOne++;

            addSample(
              stats.samples.dateOffset,
              {
                source_id: id,
                source_date: date,
                candidate_date: previousDate,
                home,
                away,
                reason: 'MASTER date is one day earlier'
              }
            );

            return;
          }

          if (nextEvidence) {
            stats.datePlusOne++;

            addSample(
              stats.samples.dateOffset,
              {
                source_id: id,
                source_date: date,
                candidate_date: nextDate,
                home,
                away,
                reason: 'MASTER date is one day later'
              }
            );

            return;
          }

          /*
           * 5. Team evidence without same-date pair.
           */
          if (homeEvidence || awayEvidence) {
            stats.teamOnlyEvidence++;
            return;
          }

          /*
           * 6. No evidence at all.
           */
          stats.genuinelyAbsent++;

          addSample(
            stats.samples.genuinelyAbsent,
            {
              source_id: id,
              date,
              home,
              away,
              reason: 'no MASTER evidence found'
            }
          );
        })
        .on('end', () => resolve(stats))
        .on('error', reject);
    });
  }

  console.log('');
  console.log('============================================================');
  console.log('[ZK-99F] [2] ANALYZING APPEARANCES');
  console.log('============================================================');

  const appearanceStats =
    await analyzeFile(
      APPEARANCES_FILE,
      'APPEARANCES'
    );

  console.log('');
  console.log('============================================================');
  console.log('[ZK-99F] [3] ANALYZING EVENTS');
  console.log('============================================================');

  const eventStats =
    await analyzeFile(
      EVENTS_FILE,
      'EVENTS'
    );

  const combined = makeStats();

  combined.rows =
    appearanceStats.rows +
    eventStats.rows;

  combined.noExactPair =
    appearanceStats.noExactPair +
    eventStats.noExactPair;

  combined.foundDatePlusEitherTeam =
    appearanceStats.foundDatePlusEitherTeam +
    eventStats.foundDatePlusEitherTeam;

  combined.foundDatePlusBothTeamsNormalized =
    appearanceStats.foundDatePlusBothTeamsNormalized +
    eventStats.foundDatePlusBothTeamsNormalized;

  combined.foundDatePlusBothTeamsCompact =
    appearanceStats.foundDatePlusBothTeamsCompact +
    eventStats.foundDatePlusBothTeamsCompact;

  combined.dateMinusOne =
    appearanceStats.dateMinusOne +
    eventStats.dateMinusOne;

  combined.datePlusOne =
    appearanceStats.datePlusOne +
    eventStats.datePlusOne;

  combined.reversedFixture =
    appearanceStats.reversedFixture +
    eventStats.reversedFixture;

  combined.teamOnlyEvidence =
    appearanceStats.teamOnlyEvidence +
    eventStats.teamOnlyEvidence;

  combined.genuinelyAbsent =
    appearanceStats.genuinelyAbsent +
    eventStats.genuinelyAbsent;

  console.log('');
  console.log('============================================================');
  console.log('[ZK-99F] [4] FORENSIC RESULT');
  console.log('============================================================');

  function printStats(label, stats) {
    console.log('');
    console.log(`[ZK-99F] ${label}`);
    console.log(`  Rows: ${stats.rows}`);
    console.log(`  No exact pair: ${stats.noExactPair}`);
    console.log(
      `  Date + normalized teams: ${stats.foundDatePlusBothTeamsNormalized}`
    );
    console.log(
      `  Date + compact teams: ${stats.foundDatePlusBothTeamsCompact}`
    );
    console.log(
      `  Date + either team evidence: ${stats.foundDatePlusEitherTeam}`
    );
    console.log(
      `  Date -1 day: ${stats.dateMinusOne}`
    );
    console.log(
      `  Date +1 day: ${stats.datePlusOne}`
    );
    console.log(
      `  Reversed fixture evidence: ${stats.reversedFixture}`
    );
    console.log(
      `  Team-only evidence: ${stats.teamOnlyEvidence}`
    );
    console.log(
      `  No MASTER evidence: ${stats.genuinelyAbsent}`
    );
  }

  printStats('APPEARANCES', appearanceStats);
  printStats('EVENTS', eventStats);
  printStats('COMBINED', combined);

  /*
   * Save compact forensic report.
   */

  fs.mkdirSync(AUDIT_DIR, { recursive: true });

  const report = {
    generated_at: new Date().toISOString(),

    source: SOURCE_DIR,

    read_only: true,

    master: {
      rows: masterRows,
      exact_keys: exactIndex.size,
      normalized_keys: normalizedIndex.size,
      compact_keys: compactIndex.size,
      date_team_keys: dateTeamIndex.size,
      date_buckets: dateIndex.size
    },

    appearances: appearanceStats,
    events: eventStats,

    combined,

    interpretation: {
      purpose:
        'Determine why secondary match metadata cannot currently be linked to MASTER.',

      no_candidate_problem:
        'This report investigates metadata evidence without rewriting IDs.',

      repair_required:
        'No repair was performed by this script.'
    }
  };

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('');
  console.log('============================================================');
  console.log(' ZOKASCORE 99F — FORENSICS COMPLETE');
  console.log('============================================================');

  console.log(`[ZK-99F] Report: ${REPORT_FILE}`);

  console.log('');
  console.log('[ZK-99F] 🔒 NO FILES MODIFIED.');
  console.log('[ZK-99F] 🔒 ZOKASCORE_FINAL WAS NOT MODIFIED.');
  console.log('[ZK-99F] 🔒 public_data WAS NOT MODIFIED.');
  console.log('[ZK-99F] 🔒 NO REPAIRS WERE PERFORMED.');
  console.log('[ZK-99F] 🔒 NO IDs WERE REWRITTEN.');
}

main().catch(err => {
  console.error('');
  console.error('[ZK-99F] FATAL ERROR');
  console.error(err);
  process.exit(1);
});