'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — PIPELINE 33
 * FEATURE EXTRACTION
 * ============================================================
 *
 * Purpose:
 *   Transform canonical historical matches + ELO history
 *   into a machine-learning-ready feature dataset.
 *
 * Output:
 *   data/ml/features_elo.csv
 *
 * Features:
 *   match_id
 *   date
 *   home_team_id
 *   away_team_id
 *   home_elo_pre
 *   away_elo_pre
 *   elo_diff
 *   target
 *
 * Target:
 *   HOME_WIN
 *   DRAW
 *   AWAY_WIN
 *
 * IMPORTANT:
 *   Pipeline 33 is READ-ONLY against historical data and ELO.
 *   It does not modify the football backbone or ELO state.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const HISTORY_DIR = path.join(
  ROOT,
  'public_data',
  'knowledge',
  'football',
  'history'
);

const ELO_INDEX_FILE = path.join(
  ROOT,
  'data',
  'elo',
  'elo_processed_matches.json'
);

const OUTPUT_DIR = path.join(
  ROOT,
  'data',
  'ml'
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  'features_elo.csv'
);

/**
 * ------------------------------------------------------------
 * UTILITIES
 * ------------------------------------------------------------
 */

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function walkSync(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, {
    withFileTypes: true
  })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkSync(full, files);
    } else if (entry.name.endsWith('.json')) {
      files.push(full);
    }
  }

  return files;
}

function normalizeMatch(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const matchId =
    raw.canonical_match_id ??
    raw.canonical_id ??
    raw.match_id ??
    raw.id ??
    raw.fixture_id;

  const homeTeamId =
    raw.home_team_id ??
    raw.homeTeamId ??
    raw.home_team?.canonical_id ??
    raw.home?.canonical_id ??
    raw.teams?.home?.canonical_id;

  const awayTeamId =
    raw.away_team_id ??
    raw.awayTeamId ??
    raw.away_team?.canonical_id ??
    raw.away?.canonical_id ??
    raw.teams?.away?.canonical_id;

  const homeGoals =
    raw.home_goals ??
    raw.home_score ??
    raw.homeScore ??
    raw.score?.home ??
    raw.score?.fulltime?.home ??
    raw.scores?.home;

  const awayGoals =
    raw.away_goals ??
    raw.away_score ??
    raw.awayScore ??
    raw.score?.away ??
    raw.score?.fulltime?.away ??
    raw.scores?.away;

  return {
    match_id: matchId != null ? String(matchId) : null,
    date: raw.date ?? raw.match_date ?? raw.fixture_date ?? null,
    home_team_id:
      homeTeamId != null ? String(homeTeamId) : null,
    away_team_id:
      awayTeamId != null ? String(awayTeamId) : null,
    home_goals:
      homeGoals != null ? Number(homeGoals) : null,
    away_goals:
      awayGoals != null ? Number(awayGoals) : null
  };
}

/**
 * ------------------------------------------------------------
 * LOAD HISTORICAL MATCHES
 * ------------------------------------------------------------
 */

function loadHistoricalMatches() {
  const files = walkSync(HISTORY_DIR);
  const matchMap = new Map();

  for (const file of files) {
    try {
      const data = readJson(file);

      if (!Array.isArray(data.matches)) {
        continue;
      }

      for (const raw of data.matches) {
        const match = normalizeMatch(raw);

        if (!match || !match.match_id) {
          continue;
        }

        /*
         * Keep first occurrence.
         * Pipeline 32 already establishes canonical ELO chronology.
         */
        if (!matchMap.has(match.match_id)) {
          matchMap.set(match.match_id, match);
        }
      }
    } catch {
      // Ignore malformed/non-match JSON files.
    }
  }

  const matches = [...matchMap.values()];

  matches.sort((a, b) => {
    const tA = a.date
      ? Date.parse(a.date)
      : Number.MAX_SAFE_INTEGER;

    const tB = b.date
      ? Date.parse(b.date)
      : Number.MAX_SAFE_INTEGER;

    return tA - tB;
  });

  return matches;
}

/**
 * ------------------------------------------------------------
 * LOAD ELO INDEX
 * ------------------------------------------------------------
 */

function loadEloIndex() {
  const raw = readJson(ELO_INDEX_FILE);

  const index = {};

  /*
   * Possible format:
   *
   * {
   *   MATCH_ID: {
   *     home_elo_before: ...,
   *     away_elo_before: ...
   *   }
   * }
   */

  if (
    raw &&
    !Array.isArray(raw) &&
    typeof raw === 'object'
  ) {
    for (const [key, value] of Object.entries(raw)) {
      if (
        value &&
        typeof value === 'object' &&
        (
          value.home_elo_before != null ||
          value.away_elo_before != null
        )
      ) {
        index[String(key)] = value;
      }
    }
  }

  /*
   * Possible format:
   *
   * [
   *   {
   *     match_id: "...",
   *     home_elo_before: ...,
   *     away_elo_before: ...
   *   }
   * ]
   */

  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (!value || typeof value !== 'object') {
        continue;
      }

      const matchId =
        value.match_id ??
        value.canonical_match_id ??
        value.id;

      if (!matchId) {
        continue;
      }

      index[String(matchId)] = value;
    }
  }

  return index;
}

/**
 * ------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------
 */

function main() {
  console.log('🧠 Pipeline 33 — FEATURE EXTRACTION');
  console.log('============================================================');

  if (!fs.existsSync(HISTORY_DIR)) {
    throw new Error(
      `Historical directory not found:\n${HISTORY_DIR}`
    );
  }

  if (!fs.existsSync(ELO_INDEX_FILE)) {
    throw new Error(
      `ELO processed index not found:\n${ELO_INDEX_FILE}`
    );
  }

  console.log(`📚 Loading historical backbone...`);

  const matches = loadHistoricalMatches();

  console.log(
    `   ✅ Loaded ${matches.length} unique matches`
  );

  console.log(`🧠 Loading ELO processed index...`);

  const eloIndex = loadEloIndex();

  console.log(
    `   ✅ ELO records available: ${Object.keys(eloIndex).length}\n`
  );

  const csvLines = [
    'match_id,date,home_team_id,away_team_id,home_elo_pre,away_elo_pre,elo_diff,target'
  ];

  let processed = 0;
  let skippedNoElo = 0;
  let skippedInvalid = 0;

  for (const m of matches) {
    const elo = eloIndex[m.match_id];

    if (!elo) {
      skippedNoElo++;
      continue;
    }

    if (
      m.home_team_id == null ||
      m.away_team_id == null ||
      !Number.isFinite(m.home_goals) ||
      !Number.isFinite(m.away_goals)
    ) {
      skippedInvalid++;
      continue;
    }

    const homeElo = Number(elo.home_elo_before);
    const awayElo = Number(elo.away_elo_before);

    if (
      !Number.isFinite(homeElo) ||
      !Number.isFinite(awayElo)
    ) {
      skippedNoElo++;
      continue;
    }

    let target;

    if (m.home_goals > m.away_goals) {
      target = 'HOME_WIN';
    } else if (m.home_goals < m.away_goals) {
      target = 'AWAY_WIN';
    } else {
      target = 'DRAW';
    }

    const eloDiff = homeElo - awayElo;

    const cleanDate = m.date
      ? String(m.date).split('T')[0]
      : '';

    csvLines.push([
      m.match_id,
      cleanDate,
      m.home_team_id,
      m.away_team_id,
      homeElo.toFixed(2),
      awayElo.toFixed(2),
      eloDiff.toFixed(2),
      target
    ].join(','));

    processed++;
  }

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  fs.writeFileSync(
    OUTPUT_FILE,
    csvLines.join('\n') + '\n',
    'utf8'
  );

  console.log('============================================================');
  console.log('✅ FEATURE EXTRACTION COMPLETE');
  console.log(`⚽ Features generated: ${processed}`);
  console.log(`⏭️ Skipped (no ELO): ${skippedNoElo}`);
  console.log(`⚠️ Skipped (invalid match): ${skippedInvalid}`);
  console.log(`📄 Saved to: ${OUTPUT_FILE}`);
  console.log('============================================================');
}

try {
  main();
} catch (error) {
  console.error(
    '❌ Pipeline 33 failed:',
    error.message
  );

  process.exit(1);
}