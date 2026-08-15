'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — PIPELINE 32
 * CANONICAL INCREMENTAL ELO ENGINE
 * ============================================================
 *
 * PURPOSE
 * ------------------------------------------------------------
 * Build and maintain the canonical ELO state for ZOKASCORE.
 *
 * MODES
 * ------------------------------------------------------------
 *
 *   bootstrap
 *      Full chronological rebuild from the canonical match
 *      backbone.
 *
 *   incremental
 *      Detect and process new matches only.
 *
 *      IMPORTANT:
 *      If a newly discovered match belongs chronologically
 *      before already-processed history, the engine performs
 *      a safe rebuild instead of corrupting ELO chronology.
 *
 *   match <file>
 *      Process one canonical match.
 *
 *
 * CORE GUARANTEES
 * ------------------------------------------------------------
 *
 *   ✓ Canonical team IDs only
 *   ✓ Canonical match IDs only
 *   ✓ Idempotent match processing
 *   ✓ Duplicate match protection
 *   ✓ Chronological ELO calculation
 *   ✓ Safe future ingestion
 *   ✓ Automatic out-of-order detection
 *   ✓ Atomic persistence
 *   ✓ Directory-aware match loading
 *   ✓ Recursive fixture discovery
 *   ✓ Unresolved teams skipped
 *   ✓ Fast incremental path
 *
 *
 * IMPORTANT
 * ------------------------------------------------------------
 *
 * Entity resolution happens upstream.
 *
 * Pipeline 32 NEVER attempts to guess team identity.
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * ============================================================
 * PATHS
 * ============================================================
 */

const ENTITY_DIR = path.join(
  ROOT,
  'data_audit',
  'entity_resolution'
);

const CANONICAL_FILE = path.join(
  ENTITY_DIR,
  'canonical_teams.json'
);

const ELO_DIR = path.join(
  ROOT,
  'data',
  'elo'
);

const ELO_STATE_FILE = path.join(
  ELO_DIR,
  'elo_state.json'
);

const ELO_PROCESSED_FILE = path.join(
  ELO_DIR,
  'elo_processed_matches.json'
);

const ELO_HISTORY_FILE = path.join(
  ELO_DIR,
  'elo_history.jsonl'
);

const ELO_META_FILE = path.join(
  ELO_DIR,
  'elo_meta.json'
);

const ELO_SOURCE_INDEX_FILE = path.join(
  ELO_DIR,
  'elo_source_index.json'
);

/**
 * ============================================================
 * MATCH BACKBONE CANDIDATES
 * ============================================================
 */

const MATCH_CANDIDATES = [
  // 1. The true V2 historical backbone (138,477 matches)
  path.join(ROOT, 'public_data', 'knowledge', 'football', 'history'),
  
  // 2. Fallbacks (if history folder is ever moved/renamed)
  path.join(ROOT, 'public_data', 'matches'),
  path.join(ROOT, 'public_data', 'history', 'matches'),
  
  // 3. Raw source CSV (absolute last resort)
  path.join(ROOT, 'data', 'source', 'games.csv')
];

/**
 * ============================================================
 * ELO CONFIGURATION
 * ============================================================
 */

const CONFIG = {
  BASE_ELO: 1500,

  K_FACTOR: 20,

  HOME_ADVANTAGE: 60,

  DRAW_SCORE: 0.5,

  WIN_SCORE: 1,

  LOSS_SCORE: 0,

  CHECKPOINT_INTERVAL: 1000
};

/**
 * ============================================================
 * FILE HELPERS
 * ============================================================
 */

function ensureDirectory() {
  fs.mkdirSync(ELO_DIR, {
    recursive: true
  });
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch (error) {
    throw new Error(
      `Invalid JSON:\n${file}\n${error.message}`
    );
  }
}

function writeJsonAtomic(file, data) {
  const temp = `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(data, null, 2),
    'utf8'
  );

  fs.renameSync(
    temp,
    file
  );
}

function appendHistory(record) {
  fs.appendFileSync(
    ELO_HISTORY_FILE,
    JSON.stringify(record) + '\n',
    'utf8'
  );
}

function resetHistory() {
  fs.writeFileSync(
    ELO_HISTORY_FILE,
    '',
    'utf8'
  );
}

/**
 * ============================================================
 * CANONICAL TEAM INDEX
 * ============================================================
 */

function loadCanonicalTeams() {
  if (!fs.existsSync(CANONICAL_FILE)) {
    throw new Error(
      `canonical_teams.json not found:\n${CANONICAL_FILE}`
    );
  }

  const canonical = readJson(
    CANONICAL_FILE,
    []
  );

  if (!Array.isArray(canonical)) {
    throw new Error(
      'canonical_teams.json must contain an array.'
    );
  }

  const teams = new Set();

  for (const team of canonical) {
    if (
      !team ||
      team.canonical_id == null
    ) {
      continue;
    }

    teams.add(
      String(team.canonical_id)
    );
  }

  return teams;
}

/**
 * ============================================================
 * MATCH NORMALIZATION
 * ============================================================
 */

function normalizeMatch(raw) {
  if (
    !raw ||
    typeof raw !== 'object'
  ) {
    return null;
  }

  const matchId =
    raw.canonical_match_id ??
    raw.canonical_id ??
    raw.match_id ??
    raw.id ??
    raw.fixture_id;

  const homeId =
    raw.home_team_id ??
    raw.homeTeamId ??
    raw.home_team?.canonical_id ??
    raw.home?.canonical_id ??
    raw.teams?.home?.canonical_id;

  const awayId =
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
    raw.goals?.home ??
    raw.scores?.home;

  const awayGoals =
    raw.away_goals ??
    raw.away_score ??
    raw.awayScore ??
    raw.score?.away ??
    raw.goals?.away ??
    raw.scores?.away;

  const date =
    raw.date ??
    raw.match_date ??
    raw.fixture_date ??
    raw.kickoff ??
    raw.timestamp;

  if (
    matchId == null ||
    homeId == null ||
    awayId == null ||
    homeGoals == null ||
    awayGoals == null
  ) {
    return null;
  }

  const hg = Number(homeGoals);
  const ag = Number(awayGoals);

  if (
    !Number.isFinite(hg) ||
    !Number.isFinite(ag)
  ) {
    return null;
  }

  return {
    match_id: String(matchId).trim(),

    home_team_id:
      String(homeId).trim(),

    away_team_id:
      String(awayId).trim(),

    home_goals: hg,

    away_goals: ag,

    date:
      date != null
        ? String(date)
        : ''
  };
}

/**
 * ============================================================
 * MATCH FINGERPRINT
 * ============================================================
 *
 * Used to detect two different records claiming the same
 * match ID.
 * ============================================================
 */

function matchFingerprint(match) {
  return [
    match.match_id,
    match.home_team_id,
    match.away_team_id,
    match.home_goals,
    match.away_goals,
    match.date
  ].join('|');
}

/**
 * ============================================================
 * DATE / ORDER HELPERS
 * ============================================================
 */

function matchTimestamp(match) {
  if (!match.date) {
    return Number.MAX_SAFE_INTEGER;
  }

  const parsed =
    Date.parse(match.date);

  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const numeric =
    Number(match.date);

  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return Number.MAX_SAFE_INTEGER;
}

function compareMatches(a, b) {
  const dateDiff =
    matchTimestamp(a) -
    matchTimestamp(b);

  if (dateDiff !== 0) {
    return dateDiff;
  }

  return a.match_id.localeCompare(
    b.match_id,
    undefined,
    {
      numeric: true,
      sensitivity: 'base'
    }
  );
}

function sortMatches(matches) {
  return matches.sort(
    compareMatches
  );
}

/**
 * ============================================================
 * JSON MATCH LOADING
 * ============================================================
 */

function loadJsonMatches(file) {
  const data =
    readJson(file, []);

  let records = [];

  if (Array.isArray(data)) {
    records = data;
  }

  else if (
    Array.isArray(data.matches)
  ) {
    records = data.matches;
  }

  else if (
    Array.isArray(data.data)
  ) {
    records = data.data;
  }

  return records
    .map(normalizeMatch)
    .filter(Boolean);
}

/**
 * ============================================================
 * CSV PARSER
 * ============================================================
 */

function parseCsvLine(line) {
  const result = [];

  let current = '';

  let quoted = false;

  for (
    let i = 0;
    i < line.length;
    i++
  ) {
    const char =
      line[i];

    if (char === '"') {
      if (
        quoted &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (
      char === ',' &&
      !quoted
    ) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);

  return result;
}

function loadCsvMatches(file) {
  const text =
    fs.readFileSync(
      file,
      'utf8'
    );

  const lines =
    text
      .split(/\r?\n/)
      .filter(
        line => line.trim() !== ''
      );

  if (
    lines.length < 2
  ) {
    return [];
  }

  const headers =
    parseCsvLine(
      lines[0]
    ).map(
      value => value.trim()
    );

  const matches = [];

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    const values =
      parseCsvLine(
        lines[i]
      );

    const row = {};

    headers.forEach(
      (header, index) => {
        row[header] =
          values[index];
      }
    );

    const normalized =
      normalizeMatch(row);

    if (normalized) {
      matches.push(
        normalized
      );
    }
  }

  return matches;
}

/**
 * ============================================================
 * DIRECTORY LOADING
 * ============================================================
 */

function loadMatchDirectory(directory) {
  const matches = [];

  const entries =
    fs.readdirSync(
      directory,
      {
        withFileTypes: true
      }
    );

  for (
    const entry of entries
  ) {
    const fullPath =
      path.join(
        directory,
        entry.name
      );

    if (
      entry.isDirectory()
    ) {
      matches.push(
        ...loadMatchDirectory(
          fullPath
        )
      );

      continue;
    }

    if (
      !entry.isFile()
    ) {
      continue;
    }

    const lower =
      entry.name.toLowerCase();

    try {
      if (
        lower.endsWith('.json')
      ) {
        matches.push(
          ...loadJsonMatches(
            fullPath
          )
        );
      }

      else if (
        lower.endsWith('.csv')
      ) {
        matches.push(
          ...loadCsvMatches(
            fullPath
          )
        );
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not load:\n${fullPath}\n${error.message}`
      );
    }
  }

  return matches;
}

/**
 * ============================================================
 * MATCH SOURCE LOADING
 * ============================================================
 */

function loadHistoricalMatches() {
  for (
    const source of MATCH_CANDIDATES
  ) {
    if (
      !fs.existsSync(source)
    ) {
      continue;
    }

    console.log(
      `📚 Match source detected: ${source}`
    );

    const stat =
      fs.statSync(source);

    if (
      stat.isDirectory()
    ) {
      const matches =
        loadMatchDirectory(
          source
        );

      if (
        matches.length > 0
      ) {
        return matches;
      }

      console.log(
        `⚠️ No usable matches found in: ${source}`
      );

      continue;
    }

    if (
      source
        .toLowerCase()
        .endsWith('.csv')
    ) {
      return loadCsvMatches(
        source
      );
    }

    if (
      source
        .toLowerCase()
        .endsWith('.json')
    ) {
      return loadJsonMatches(
        source
      );
    }
  }

  throw new Error(
    [
      'No supported match backbone found.',
      '',
      'Checked:',
      ...MATCH_CANDIDATES
    ].join('\n')
  );
}

/**
 * ============================================================
 * DEDUPLICATION
 * ============================================================
 *
 * Same ID + same data = harmless duplicate.
 *
 * Same ID + different data = conflict.
 *
 * We DO NOT silently choose between conflicting records.
 * ============================================================
 */

function deduplicateMatches(matches) {
  const map = new Map();

  let duplicates = 0;

  let conflicts = 0;

  for (
    const match of matches
  ) {
    if (
      !match ||
      !match.match_id
    ) {
      continue;
    }

    const id =
      String(
        match.match_id
      ).trim();

    const normalized = {
      ...match,
      match_id: id
    };

    if (
      !map.has(id)
    ) {
      map.set(
        id,
        normalized
      );

      continue;
    }

    const existing =
      map.get(id);

    if (
      matchFingerprint(existing) ===
      matchFingerprint(normalized)
    ) {
      duplicates++;

      continue;
    }

    conflicts++;

    console.warn(
      `⚠️ MATCH CONFLICT: ${id}`
    );

    console.warn(
      `   Existing: ${JSON.stringify(existing)}`
    );

    console.warn(
      `   New:      ${JSON.stringify(normalized)}`
    );

    /**
     * Keep the first record.
     *
     * We do not allow an arbitrary later source to silently
     * overwrite canonical historical truth.
     *
     * The conflict is surfaced for investigation upstream.
     */
  }

  if (
    duplicates > 0
  ) {
    console.log(
      `♻️ Duplicate source matches ignored: ${duplicates}`
    );
  }

  if (
    conflicts > 0
  ) {
    console.log(
      `⚠️ Conflicting match IDs detected: ${conflicts}`
    );
  }

  return [
    ...map.values()
  ];
}

/**
 * ============================================================
 * ELO CALCULATION
 * ============================================================
 */

function expectedScore(
  ratingA,
  ratingB
) {
  return 1 /
    (
      1 +
      Math.pow(
        10,
        (
          ratingB -
          ratingA
        ) / 400
      )
    );
}

function getResult(
  homeGoals,
  awayGoals
) {
  if (
    homeGoals >
    awayGoals
  ) {
    return {
      home: CONFIG.WIN_SCORE,
      away: CONFIG.LOSS_SCORE,
      result: 'HOME_WIN'
    };
  }

  if (
    homeGoals <
    awayGoals
  ) {
    return {
      home: CONFIG.LOSS_SCORE,
      away: CONFIG.WIN_SCORE,
      result: 'AWAY_WIN'
    };
  }

  return {
    home: CONFIG.DRAW_SCORE,
    away: CONFIG.DRAW_SCORE,
    result: 'DRAW'
  };
}

function calculateMatchElo(
  homeRating,
  awayRating,
  homeGoals,
  awayGoals
) {
  const effectiveHomeRating =
    homeRating +
    CONFIG.HOME_ADVANTAGE;

  const homeExpected =
    expectedScore(
      effectiveHomeRating,
      awayRating
    );

  const awayExpected =
    1 -
    homeExpected;

  const result =
    getResult(
      homeGoals,
      awayGoals
    );

  const homeChange =
    CONFIG.K_FACTOR *
    (
      result.home -
      homeExpected
    );

  const awayChange =
    CONFIG.K_FACTOR *
    (
      result.away -
      awayExpected
    );

  return {
    result:
      result.result,

    home_expected:
      round(homeExpected),

    away_expected:
      round(awayExpected),

    home_change:
      round(homeChange),

    away_change:
      round(awayChange),

    home_rating_after:
      round(
        homeRating +
        homeChange
      ),

    away_rating_after:
      round(
        awayRating +
        awayChange
      )
  };
}

function round(value) {
  return Math.round(
    value * 100
  ) / 100;
}

/**
 * ============================================================
 * STATE
 * ============================================================
 */

function createInitialTeamState() {
  return {
    rating:
      CONFIG.BASE_ELO,

    matches_played: 0,

    wins: 0,

    draws: 0,

    losses: 0,

    last_match_id: null,

    last_match_date: null,

    updated_at: null
  };
}

function initializeTeamState(
  eloState,
  teamId
) {
  if (
    !eloState[teamId]
  ) {
    eloState[teamId] =
      createInitialTeamState();
  }

  return eloState[teamId];
}

/**
 * ============================================================
 * APPLY MATCH
 * ============================================================
 */

function applyMatch(
  match,
  eloState,
  processedMatches,
  canonicalTeams
) {
  const {
    match_id,
    home_team_id,
    away_team_id,
    home_goals,
    away_goals,
    date
  } = match;

  if (
    !canonicalTeams.has(
      home_team_id
    ) ||
    !canonicalTeams.has(
      away_team_id
    )
  ) {
    return {
      status:
        'SKIPPED_UNRESOLVED'
    };
  }

  if (
    processedMatches[match_id]
  ) {
    return {
      status:
        'ALREADY_PROCESSED'
    };
  }

  const home =
    initializeTeamState(
      eloState,
      home_team_id
    );

  const away =
    initializeTeamState(
      eloState,
      away_team_id
    );

  const calculation =
    calculateMatchElo(
      Number(home.rating),
      Number(away.rating),
      home_goals,
      away_goals
    );

  const homeBefore =
    Number(home.rating);

  const awayBefore =
    Number(away.rating);

  home.rating =
    calculation.home_rating_after;

  away.rating =
    calculation.away_rating_after;

  home.matches_played += 1;

  away.matches_played += 1;

  if (
    calculation.result ===
    'HOME_WIN'
  ) {
    home.wins += 1;
    away.losses += 1;
  }

  else if (
    calculation.result ===
    'AWAY_WIN'
  ) {
    away.wins += 1;
    home.losses += 1;
  }

  else {
    home.draws += 1;
    away.draws += 1;
  }

  const timestamp =
    new Date().toISOString();

  home.last_match_id =
    match_id;

  away.last_match_id =
    match_id;

  home.last_match_date =
    date || null;

  away.last_match_date =
    date || null;

  home.updated_at =
    timestamp;

  away.updated_at =
    timestamp;

  const record = {
    match_id,

    home_team_id,

    away_team_id,

    home_goals,

    away_goals,

    date,

    result:
      calculation.result,

    home_elo_before:
      round(homeBefore),

    away_elo_before:
      round(awayBefore),

    home_elo_after:
      round(home.rating),

    away_elo_after:
      round(away.rating),

    home_change:
      calculation.home_change,

    away_change:
      calculation.away_change,

    processed_at:
      timestamp
  };

  processedMatches[match_id] =
    record;

  return {
    status:
      'PROCESSED',

    record
  };
}

/**
 * ============================================================
 * PROCESSED HISTORY VALIDATION
 * ============================================================
 */

function getLatestProcessedDate(
  processedMatches
) {
  let latest =
    Number.MIN_SAFE_INTEGER;

  for (
    const record of Object.values(
      processedMatches
    )
  ) {
    const t =
      matchTimestamp({
        date:
          record.date || ''
      });

    if (
      t > latest
    ) {
      latest = t;
    }
  }

  return latest;
}

function hasOutOfOrderMatch(
  matches,
  processedMatches
) {
  const latestProcessed =
    getLatestProcessedDate(
      processedMatches
    );

  if (
    latestProcessed ===
    Number.MIN_SAFE_INTEGER
  ) {
    return false;
  }

  for (
    const match of matches
  ) {
    if (
      processedMatches[
        match.match_id
      ]
    ) {
      continue;
    }

    const timestamp =
      matchTimestamp(match);

    if (
      timestamp <
      latestProcessed
    ) {
      console.log(
        `⚠️ Out-of-order historical match detected: ${match.match_id}`
      );

      console.log(
        `   Match date: ${match.date}`
      );

      return true;
    }
  }

  return false;
}

/**
 * ============================================================
 * BOOTSTRAP
 * ============================================================
 */

function bootstrap() {
  console.log(
    '🧠 Pipeline 32 — ELO BOOTSTRAP'
  );

  console.log(
    '============================================================\n'
  );

  const canonicalTeams =
    loadCanonicalTeams();

  console.log(
    `🏟️ Canonical teams: ${canonicalTeams.size}`
  );

  const matches =
    deduplicateMatches(
      loadHistoricalMatches()
    );

  sortMatches(matches);

  console.log(
    `⚽ Historical matches loaded: ${matches.length}\n`
  );

  const eloState = {};

  const processedMatches = {};

  let processed = 0;

  let skipped = 0;

  let unresolved = 0;

  resetHistory();

  for (
    const match of matches
  ) {
    const result =
      applyMatch(
        match,
        eloState,
        processedMatches,
        canonicalTeams
      );

    if (
      result.status ===
      'PROCESSED'
    ) {
      processed++;
    }

    else {
      skipped++;

      if (
        result.status ===
        'SKIPPED_UNRESOLVED'
      ) {
        unresolved++;
      }
    }

    if (
      processed > 0 &&
      processed %
        CONFIG.CHECKPOINT_INTERVAL ===
        0
    ) {
      writeJsonAtomic(
        ELO_STATE_FILE,
        eloState
      );

      writeJsonAtomic(
        ELO_PROCESSED_FILE,
        processedMatches
      );

      process.stdout.write(
        `\r⏳ Processed: ${processed} / ${matches.length}`
      );
    }
  }

  writeJsonAtomic(
    ELO_STATE_FILE,
    eloState
  );

  writeJsonAtomic(
    ELO_PROCESSED_FILE,
    processedMatches
  );

  saveMeta({
    mode:
      'bootstrap',

    generated_at:
      new Date().toISOString(),

    canonical_teams:
      canonicalTeams.size,

    source_matches:
      matches.length,

    processed_matches:
      processed,

    skipped_matches:
      skipped,

    unresolved_matches:
      unresolved,

    base_elo:
      CONFIG.BASE_ELO,

    k_factor:
      CONFIG.K_FACTOR,

    home_advantage:
      CONFIG.HOME_ADVANTAGE
  });

  console.log(
    '\n\n============================================================'
  );

  console.log(
    '✅ ELO BOOTSTRAP COMPLETE'
  );

  console.log(
    `🏟️ Teams: ${Object.keys(eloState).length}`
  );

  console.log(
    `⚽ Processed: ${processed}`
  );

  console.log(
    `⏭️ Skipped: ${skipped}`
  );

  console.log(
    `🔎 Unresolved: ${unresolved}`
  );

  console.log(
    `📄 State: ${ELO_STATE_FILE}`
  );

  console.log(
    `📄 Processed index: ${ELO_PROCESSED_FILE}`
  );

  console.log(
    '============================================================'
  );
}

/**
 * ============================================================
 * INCREMENTAL
 * ============================================================
 *
 * FAST PATH:
 *
 *     New matches are after existing history.
 *
 *     Only unseen matches are applied.
 *
 * SAFE PATH:
 *
 *     A newly added historical match is older than already
 *     processed history.
 *
 *     We rebuild chronologically.
 *
 * This prevents historical ELO corruption.
 * ============================================================
 */

function incremental() {
  console.log(
    '⚡ Pipeline 32 — ELO INCREMENTAL UPDATE'
  );

  console.log(
    '============================================================\n'
  );

  if (
    !fs.existsSync(
      ELO_STATE_FILE
    ) ||
    !fs.existsSync(
      ELO_PROCESSED_FILE
    )
  ) {
    console.log(
      'ℹ️ ELO state not found.'
    );

    console.log(
      '➡️ Running initial bootstrap...\n'
    );

    return bootstrap();
  }

  const canonicalTeams =
    loadCanonicalTeams();

  const eloState =
    readJson(
      ELO_STATE_FILE,
      {}
    );

  const processedMatches =
    readJson(
      ELO_PROCESSED_FILE,
      {}
    );

  const matches =
    deduplicateMatches(
      loadHistoricalMatches()
    );

  sortMatches(matches);

  console.log(
    `📚 Current canonical matches: ${matches.length}`
  );

  console.log(
    `🧠 Previously processed: ${Object.keys(processedMatches).length}`
  );

  /**
   * ----------------------------------------------------------
   * CRITICAL CHRONOLOGY CHECK
   * ----------------------------------------------------------
   */

  if (
    hasOutOfOrderMatch(
      matches,
      processedMatches
    )
  ) {
    console.log(
      '\n🔄 Historical insertion detected.'
    );

    console.log(
      '🧠 Rebuilding ELO chronologically to preserve correctness...\n'
    );

    return bootstrap();
  }

  let processed = 0;

  let alreadyProcessed = 0;

  let skipped = 0;

  let unresolved = 0;

  /**
   * Only unseen matches reach applyMatch().
   *
   * Because matches are sorted chronologically, newly added
   * future matches are applied in the correct order.
   */

  for (
    const match of matches
  ) {
    const result =
      applyMatch(
        match,
        eloState,
        processedMatches,
        canonicalTeams
      );

    if (
      result.status ===
      'PROCESSED'
    ) {
      processed++;

      appendHistory(
        result.record
      );
    }

    else if (
      result.status ===
      'ALREADY_PROCESSED'
    ) {
      alreadyProcessed++;
    }

    else {
      skipped++;

      if (
        result.status ===
        'SKIPPED_UNRESOLVED'
      ) {
        unresolved++;
      }
    }
  }

  if (
    processed > 0
  ) {
    writeJsonAtomic(
      ELO_STATE_FILE,
      eloState
    );

    writeJsonAtomic(
      ELO_PROCESSED_FILE,
      processedMatches
    );
  }

  saveMeta({
    mode:
      'incremental',

    updated_at:
      new Date().toISOString(),

    canonical_teams:
      canonicalTeams.size,

    scanned_matches:
      matches.length,

    previously_processed:
      Object.keys(
        processedMatches
      ).length,

    newly_processed:
      processed,

    already_processed:
      alreadyProcessed,

    skipped:
      skipped,

    unresolved:
      unresolved,

    base_elo:
      CONFIG.BASE_ELO,

    k_factor:
      CONFIG.K_FACTOR,

    home_advantage:
      CONFIG.HOME_ADVANTAGE
  });

  console.log(
    '\n============================================================'
  );

  console.log(
    '✅ INCREMENTAL ELO UPDATE COMPLETE'
  );

  console.log(
    `🆕 Newly processed: ${processed}`
  );

  console.log(
    `♻️ Already processed: ${alreadyProcessed}`
  );

  console.log(
    `⏭️ Skipped: ${skipped}`
  );

  console.log(
    `🔎 Unresolved: ${unresolved}`
  );

  console.log(
    '============================================================'
  );
}

/**
 * ============================================================
 * SINGLE MATCH MODE
 * ============================================================
 */

function processSingleMatch(file) {
  if (
    !fs.existsSync(file)
  ) {
    throw new Error(
      `Match file not found:\n${file}`
    );
  }

  if (
    !fs.existsSync(
      ELO_STATE_FILE
    )
  ) {
    throw new Error(
      'ELO state does not exist. Run bootstrap first.'
    );
  }

  const raw =
    readJson(
      file,
      null
    );

  const match =
    normalizeMatch(raw);

  if (!match) {
    throw new Error(
      'Could not normalize supplied match.'
    );
  }

  const canonicalTeams =
    loadCanonicalTeams();

  const eloState =
    readJson(
      ELO_STATE_FILE,
      {}
    );

  const processedMatches =
    readJson(
      ELO_PROCESSED_FILE,
      {}
    );

  /**
   * If this match is older than the latest processed
   * historical match, do NOT blindly apply it.
   */

  if (
    !processedMatches[
      match.match_id
    ]
  ) {
    const latest =
      getLatestProcessedDate(
        processedMatches
      );

    const current =
      matchTimestamp(match);

    if (
      current <
      latest
    ) {
      console.log(
        '⚠️ Single match is historically out of order.'
      );

      console.log(
        '➡️ Use incremental mode so Pipeline 32 can rebuild safely.'
      );

      return incremental();
    }
  }

  const result =
    applyMatch(
      match,
      eloState,
      processedMatches,
      canonicalTeams
    );

  if (
    result.status ===
    'PROCESSED'
  ) {
    writeJsonAtomic(
      ELO_STATE_FILE,
      eloState
    );

    writeJsonAtomic(
      ELO_PROCESSED_FILE,
      processedMatches
    );

    appendHistory(
      result.record
    );
  }

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );
}

/**
 * ============================================================
 * META
 * ============================================================
 */

function saveMeta(meta) {
  writeJsonAtomic(
    ELO_META_FILE,
    meta
  );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

function main() {
  ensureDirectory();

  const command =
    process.argv[2];

  if (
    command ===
    'bootstrap'
  ) {
    return bootstrap();
  }

  if (
    command ===
    'incremental'
  ) {
    return incremental();
  }

  if (
    command ===
    'match'
  ) {
    const file =
      process.argv[3];

    if (!file) {
      throw new Error(
        'Usage: node 32-elo-engine.js match <match.json>'
      );
    }

    return processSingleMatch(
      path.resolve(file)
    );
  }

  console.log(
    '🧠 ZOKASCORE V2 — ELO ENGINE'
  );

  console.log(
    '============================================================'
  );

  console.log(
    '\nUsage:'
  );

  console.log(
    '  node 32-elo-engine.js bootstrap'
  );

  console.log(
    '  node 32-elo-engine.js incremental'
  );

  console.log(
    '  node 32-elo-engine.js match <match.json>'
  );

  console.log(
    '\nBootstrap   = complete chronological rebuild'
  );

  console.log(
    'Incremental = fast update for new matches'
  );

  console.log(
    'Match       = safely process one canonical match'
  );
}

/**
 * ============================================================
 * EXECUTION
 * ============================================================
 */

try {
  main();
} catch (error) {
  console.error(
    '\n❌ Pipeline 32 failed:'
  );

  console.error(
    error.stack || error.message
  );

  process.exit(1);
}