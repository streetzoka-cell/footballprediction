
'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — PIPELINE 35
 * FORM & H2H FEATURE EXTRACTION
 * ============================================================
 *
 * Purpose:
 *   Transform chronological ELO history into richer
 *   pre-match football intelligence features.
 *
 * IMPORTANT:
 *   Every feature is calculated BEFORE the current match.
 *
 *   The current match result is added to state only AFTER
 *   its feature row has been generated.
 *
 * This prevents future-data leakage.
 *
 * Output:
 *   data/ml/features_v2.csv
 *
 * Features:
 *
 *   ELO
 *   - home_elo_pre
 *   - away_elo_pre
 *   - elo_diff
 *
 *   Overall recent form
 *   - home_form_pts
 *   - away_form_pts
 *
 *   Venue-specific form
 *   - home_home_pts
 *   - away_away_pts
 *
 *   Recent goals
 *   - home_gf_avg
 *   - away_gf_avg
 *   - home_ga_avg
 *   - away_ga_avg
 *
 *   Head-to-head
 *   - h2h_hw_rate
 *   - h2h_d_rate
 *   - h2h_aw_rate
 *   - h2h_matches
 *
 * Target:
 *   HOME_WIN
 *   DRAW
 *   AWAY_WIN
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

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
  'features_v2.csv'
);

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, 'utf8')
  );
}

/**
 * Keep only the most recent records needed for feature
 * extraction. This prevents unnecessary memory growth.
 */
function pushRecent(map, teamId, record) {
  if (!map.has(teamId)) {
    map.set(teamId, []);
  }

  const history = map.get(teamId);

  history.push(record);

  /*
   * We only need the recent five matches for this pipeline.
   * Keep a small safety buffer because venue filtering may
   * require looking through recent records.
   */
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }
}

/**
 * ============================================================
 * RECENT FORM
 * ============================================================
 */

function getRecentStats(
  teamRecent,
  teamId,
  venue = null
) {
  const history =
    teamRecent.get(teamId) || [];

  const relevant = venue
    ? history.filter(
        match => match.venue === venue
      )
    : history;

  const last5 = relevant.slice(-5);

  /*
   * No previous information.
   *
   * Neutral prior prevents NaN values while making sure
   * unknown history does not accidentally become a strong
   * positive or negative signal.
   */
  if (last5.length === 0) {
    return {
      matches: 0,
      pts: 0,
      gf_avg: 1.0,
      ga_avg: 1.0
    };
  }

  let pts = 0;
  let gf = 0;
  let ga = 0;

  for (const match of last5) {
    pts += Number(match.pts) || 0;
    gf += Number(match.gf) || 0;
    ga += Number(match.ga) || 0;
  }

  return {
    matches: last5.length,
    pts,
    gf_avg: gf / last5.length,
    ga_avg: ga / last5.length
  };
}

/**
 * ============================================================
 * H2H
 * ============================================================
 *
 * Store matchup independently of venue orientation.
 *
 * Example:
 *
 *   A vs B
 *   B vs A
 *
 * Both belong to:
 *
 *   A|B
 *
 * But each result is stored from the perspective of the
 * canonical first team.
 * ============================================================
 */

function getH2HKey(teamA, teamB) {
  return [
    String(teamA),
    String(teamB)
  ].sort().join('|');
}

function getH2HStats(
  h2hState,
  homeId,
  awayId
) {
  const key = getH2HKey(
    homeId,
    awayId
  );

  const state =
    h2hState.get(key) || {
      teamA: key.split('|')[0],
      teamB: key.split('|')[1],
      teamA_wins: 0,
      draws: 0,
      teamB_wins: 0
    };

  const total =
    state.teamA_wins +
    state.draws +
    state.teamB_wins;

  if (total === 0) {
    return {
      hw_rate: 0.0,
      d_rate: 0.0,
      aw_rate: 0.0,
      matches: 0
    };
  }

  const homeIsTeamA =
    String(homeId) === state.teamA;

  return {
    hw_rate: homeIsTeamA
      ? state.teamA_wins / total
      : state.teamB_wins / total,

    d_rate:
      state.draws / total,

    aw_rate: homeIsTeamA
      ? state.teamB_wins / total
      : state.teamA_wins / total,

    matches: total
  };
}

/**
 * ============================================================
 * UPDATE H2H STATE
 * ============================================================
 */

function updateH2H(
  h2hState,
  homeId,
  awayId,
  result
) {
  const key = getH2HKey(
    homeId,
    awayId
  );

  if (!h2hState.has(key)) {
    h2hState.set(key, {
      teamA: key.split('|')[0],
      teamB: key.split('|')[1],
      teamA_wins: 0,
      draws: 0,
      teamB_wins: 0
    });
  }

  const state = h2hState.get(key);

  const homeIsTeamA =
    String(homeId) === state.teamA;

  if (result === 'DRAW') {
    state.draws++;
    return;
  }

  const homeWon =
    result === 'HOME_WIN';

  const teamAWon =
    homeIsTeamA
      ? homeWon
      : !homeWon;

  if (teamAWon) {
    state.teamA_wins++;
  } else {
    state.teamB_wins++;
  }
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {
  console.log(
    '⚽ ZOKASCORE V2 — Pipeline 35: Form & H2H Feature Extraction'
  );

  console.log(
    '============================================================\n'
  );

  /**
   * ----------------------------------------------------------
   * Validate inputs
   * ----------------------------------------------------------
   */

  if (!fs.existsSync(ELO_INDEX_FILE)) {
    throw new Error(
      'ELO index not found. Run Pipeline 32 first.'
    );
  }

  fs.mkdirSync(
    OUTPUT_DIR,
    { recursive: true }
  );

  /**
   * ----------------------------------------------------------
   * Load ELO processed matches
   * ----------------------------------------------------------
   */

  console.log(
    '📚 Loading ELO processed index...'
  );

  const eloIndex =
    readJson(ELO_INDEX_FILE);

  let matches =
    Object.values(eloIndex);

  /**
   * ----------------------------------------------------------
   * Chronological ordering
   * ----------------------------------------------------------
   *
   * This is essential.
   *
   * Feature state must only contain information from
   * matches that happened BEFORE the current match.
   */

  matches.sort((a, b) => {
    const tA = a.date
      ? Date.parse(a.date)
      : Number.MAX_SAFE_INTEGER;

    const tB = b.date
      ? Date.parse(b.date)
      : Number.MAX_SAFE_INTEGER;

    return tA - tB;
  });

  console.log(
    `   ✅ Loaded ${matches.length.toLocaleString()} chronological matches.\n`
  );

  /**
   * ----------------------------------------------------------
   * State
   * ----------------------------------------------------------
   */

  const teamRecent = new Map();

  const h2hState = new Map();

  /**
   * ----------------------------------------------------------
   * CSV HEADER
   * ----------------------------------------------------------
   */

  const csvLines = [
    [
      'match_id',
      'date',
      'home_team_id',
      'away_team_id',

      'home_elo_pre',
      'away_elo_pre',
      'elo_diff',

      'home_form_pts',
      'away_form_pts',

      'home_home_pts',
      'away_away_pts',

      'home_gf_avg',
      'away_gf_avg',

      'home_ga_avg',
      'away_ga_avg',

      'h2h_hw_rate',
      'h2h_d_rate',
      'h2h_aw_rate',
      'h2h_matches',

      'target'
    ].join(',')
  ];

  /**
   * ----------------------------------------------------------
   * PROCESS
   * ----------------------------------------------------------
   */

  let processed = 0;
  let skipped = 0;

  for (const m of matches) {

    /**
     * --------------------------------------------------------
     * Validate match
     * --------------------------------------------------------
     */

    if (
      !m ||
      m.home_team_id == null ||
      m.away_team_id == null ||
      m.home_goals == null ||
      m.away_goals == null ||
      !m.result
    ) {
      skipped++;
      continue;
    }

    const homeId =
      String(m.home_team_id);

    const awayId =
      String(m.away_team_id);

    /**
     * --------------------------------------------------------
     * PRE-MATCH FORM
     * --------------------------------------------------------
     *
     * IMPORTANT:
     *
     * These are calculated BEFORE the current match is
     * inserted into state.
     */

    const homeOverall =
      getRecentStats(
        teamRecent,
        homeId,
        null
      );

    const awayOverall =
      getRecentStats(
        teamRecent,
        awayId,
        null
      );

    const homeHome =
      getRecentStats(
        teamRecent,
        homeId,
        'home'
      );

    const awayAway =
      getRecentStats(
        teamRecent,
        awayId,
        'away'
      );

    /**
     * --------------------------------------------------------
     * PRE-MATCH H2H
     * --------------------------------------------------------
     */

    const h2h =
      getH2HStats(
        h2hState,
        homeId,
        awayId
      );

    /**
     * --------------------------------------------------------
     * ELO
     * --------------------------------------------------------
     */

    const homeElo =
      Number(m.home_elo_before);

    const awayElo =
      Number(m.away_elo_before);

    if (
      !Number.isFinite(homeElo) ||
      !Number.isFinite(awayElo)
    ) {
      skipped++;
      continue;
    }

    const eloDiff =
      homeElo - awayElo;

    /**
     * --------------------------------------------------------
     * DATE
     * --------------------------------------------------------
     */

    const cleanDate =
      m.date
        ? String(m.date).split('T')[0]
        : '';

    /**
     * --------------------------------------------------------
     * CSV ROW
     * --------------------------------------------------------
     */

    csvLines.push([
      m.match_id,
      cleanDate,

      homeId,
      awayId,

      homeElo.toFixed(2),
      awayElo.toFixed(2),
      eloDiff.toFixed(2),

      homeOverall.pts,
      awayOverall.pts,

      homeHome.pts,
      awayAway.pts,

      homeOverall.gf_avg.toFixed(2),
      awayOverall.gf_avg.toFixed(2),

      homeOverall.ga_avg.toFixed(2),
      awayOverall.ga_avg.toFixed(2),

      h2h.hw_rate.toFixed(4),
      h2h.d_rate.toFixed(4),
      h2h.aw_rate.toFixed(4),
      h2h.matches,

      m.result
    ].join(','));

    /**
     * --------------------------------------------------------
     * UPDATE TEAM STATE
     * --------------------------------------------------------
     *
     * Only AFTER feature extraction.
     */

    pushRecent(
      teamRecent,
      homeId,
      {
        gf: Number(m.home_goals),
        ga: Number(m.away_goals),

        pts:
          m.result === 'HOME_WIN'
            ? 3
            : m.result === 'DRAW'
              ? 1
              : 0,

        venue: 'home'
      }
    );

    pushRecent(
      teamRecent,
      awayId,
      {
        gf: Number(m.away_goals),
        ga: Number(m.home_goals),

        pts:
          m.result === 'AWAY_WIN'
            ? 3
            : m.result === 'DRAW'
              ? 1
              : 0,

        venue: 'away'
      }
    );

    /**
     * --------------------------------------------------------
     * UPDATE H2H STATE
     * --------------------------------------------------------
     */

    updateH2H(
      h2hState,
      homeId,
      awayId,
      m.result
    );

    processed++;

    if (
      processed % 20000 === 0
    ) {
      process.stdout.write(
        `\r⏳ Processed ${processed.toLocaleString()} / ${matches.length.toLocaleString()}...`
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * WRITE OUTPUT
   * ----------------------------------------------------------
   */

  fs.writeFileSync(
    OUTPUT_FILE,
    csvLines.join('\n') + '\n',
    'utf8'
  );

  /**
   * ----------------------------------------------------------
   * COMPLETE
   * ----------------------------------------------------------
   */

  console.log(
    '\n\n============================================================'
  );

  console.log(
    '✅ FEATURE EXTRACTION (V2) COMPLETE'
  );

  console.log(
    `⚽ Features generated: ${processed.toLocaleString()}`
  );

  console.log(
    `⏭️ Skipped:             ${skipped.toLocaleString()}`
  );

  console.log(
    `📄 Saved to: ${OUTPUT_FILE}`
  );

  console.log(
    '============================================================'
  );
}

main().catch(error => {
  console.error(
    '❌ Pipeline 35 failed:',
    error.message
  );

  process.exit(1);
});