'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const ELO_INDEX_FILE = path.join(
  ROOT,
  'data',
  'elo',
  'elo_processed_matches.json'
);

const OUTPUT_DIR = path.join(ROOT, 'data', 'ml');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'features_v3.csv');

const ALPHA = 0.20;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanId(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function createTeamState() {
  return {
    // Overall recent performance
    points: 1.0,
    goalDiff: 0.0,
    goalsFor: 1.0,
    goalsAgainst: 1.0,

    // Home-only recent performance
    homePoints: 1.0,
    homeGoalDiff: 0.0,
    homeGoalsFor: 1.0,
    homeGoalsAgainst: 1.0,

    // Away-only recent performance
    awayPoints: 1.0,
    awayGoalDiff: 0.0,
    awayGoalsFor: 1.0,
    awayGoalsAgainst: 1.0,

    matches: 0,
    homeMatches: 0,
    awayMatches: 0
  };
}

function getTeamState(teamStates, teamId) {
  if (!teamStates.has(teamId)) {
    teamStates.set(teamId, createTeamState());
  }

  return teamStates.get(teamId);
}

function ewma(previous, current) {
  return (ALPHA * current) + ((1 - ALPHA) * previous);
}

function updateOverall(state, points, gf, ga) {
  state.points = ewma(state.points, points);
  state.goalDiff = ewma(state.goalDiff, gf - ga);
  state.goalsFor = ewma(state.goalsFor, gf);
  state.goalsAgainst = ewma(state.goalsAgainst, ga);
  state.matches++;
}

function updateHome(state, points, gf, ga) {
  state.homePoints = ewma(state.homePoints, points);
  state.homeGoalDiff = ewma(state.homeGoalDiff, gf - ga);
  state.homeGoalsFor = ewma(state.homeGoalsFor, gf);
  state.homeGoalsAgainst = ewma(state.homeGoalsAgainst, ga);
  state.homeMatches++;
}

function updateAway(state, points, gf, ga) {
  state.awayPoints = ewma(state.awayPoints, points);
  state.awayGoalDiff = ewma(state.awayGoalDiff, gf - ga);
  state.awayGoalsFor = ewma(state.awayGoalsFor, gf);
  state.awayGoalsAgainst = ewma(state.awayGoalsAgainst, ga);
  state.awayMatches++;
}

async function main() {
  console.log(
    '⚽ ZOKASCORE V2 — Pipeline 40: Advanced Form (EWMA) Extraction'
  );
  console.log('============================================================\n');

  if (!fs.existsSync(ELO_INDEX_FILE)) {
    throw new Error(
      'ELO index not found. Run Pipeline 32 first.'
    );
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('📚 Loading ELO processed index...');

  const eloIndex = readJson(ELO_INDEX_FILE);

  let matches = Object.values(eloIndex);

  // ----------------------------------------------------------
  // CHRONOLOGICAL ORDER
  // ----------------------------------------------------------

  matches.sort((a, b) => {
    const timeA = a.date ? Date.parse(a.date) : 0;
    const timeB = b.date ? Date.parse(b.date) : 0;

    return timeA - timeB;
  });

  console.log(
    `   ✅ Loaded ${matches.length.toLocaleString()} chronological matches.\n`
  );

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------

  const teamStates = new Map();

  const csvLines = [
    [
      'match_id',
      'date',
      'home_team_id',
      'away_team_id',

      'home_elo_pre',
      'away_elo_pre',
      'elo_diff',

      'home_ewma_points',
      'away_ewma_points',

      'home_ewma_gd',
      'away_ewma_gd',

      'home_ewma_gf',
      'away_ewma_gf',

      'home_ewma_ga',
      'away_ewma_ga',

      'home_ewma_home_points',
      'away_ewma_away_points',

      'home_ewma_home_gd',
      'away_ewma_away_gd',

      'home_ewma_home_gf',
      'away_ewma_away_gf',

      'home_ewma_home_ga',
      'away_ewma_away_ga',

      'home_matches_before',
      'away_matches_before',

      'home_home_matches_before',
      'away_away_matches_before',

      'target'
    ].join(',')
  ];

  let processed = 0;
  let skipped = 0;

  // ----------------------------------------------------------
  // PROCESS MATCHES
  // ----------------------------------------------------------

  for (const m of matches) {
    const homeId = cleanId(m.home_team_id);
    const awayId = cleanId(m.away_team_id);

    const homeGoals = toNumber(m.home_goals, NaN);
    const awayGoals = toNumber(m.away_goals, NaN);

    const homeElo = toNumber(m.home_elo_before, NaN);
    const awayElo = toNumber(m.away_elo_before, NaN);

    const result = m.result;

    // Reject malformed matches rather than writing corrupt ML data.
    if (
      !homeId ||
      !awayId ||
      !Number.isFinite(homeGoals) ||
      !Number.isFinite(awayGoals) ||
      !Number.isFinite(homeElo) ||
      !Number.isFinite(awayElo) ||
      !['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(result)
    ) {
      skipped++;
      continue;
    }

    const homeState = getTeamState(teamStates, homeId);
    const awayState = getTeamState(teamStates, awayId);

    // --------------------------------------------------------
    // IMPORTANT:
    // Everything below is PRE-MATCH information.
    //
    // We read the states BEFORE updating them with this match.
    // Therefore the current result cannot leak into the features.
    // --------------------------------------------------------

    const eloDiff = homeElo - awayElo;

    const cleanDate = m.date
      ? String(m.date).split('T')[0]
      : '';

    csvLines.push([
      m.match_id,
      cleanDate,
      homeId,
      awayId,

      homeElo.toFixed(2),
      awayElo.toFixed(2),
      eloDiff.toFixed(2),

      homeState.points.toFixed(4),
      awayState.points.toFixed(4),

      homeState.goalDiff.toFixed(4),
      awayState.goalDiff.toFixed(4),

      homeState.goalsFor.toFixed(4),
      awayState.goalsFor.toFixed(4),

      homeState.goalsAgainst.toFixed(4),
      awayState.goalsAgainst.toFixed(4),

      homeState.homePoints.toFixed(4),
      awayState.awayPoints.toFixed(4),

      homeState.homeGoalDiff.toFixed(4),
      awayState.awayGoalDiff.toFixed(4),

      homeState.homeGoalsFor.toFixed(4),
      awayState.awayGoalsFor.toFixed(4),

      homeState.homeGoalsAgainst.toFixed(4),
      awayState.awayGoalsAgainst.toFixed(4),

      homeState.matches,
      awayState.matches,

      homeState.homeMatches,
      awayState.awayMatches,

      result
    ].join(','));

    // --------------------------------------------------------
    // UPDATE STATE AFTER THE MATCH
    // --------------------------------------------------------

    let homePoints;
    let awayPoints;

    if (result === 'HOME_WIN') {
      homePoints = 3;
      awayPoints = 0;
    } else if (result === 'DRAW') {
      homePoints = 1;
      awayPoints = 1;
    } else {
      homePoints = 0;
      awayPoints = 3;
    }

    // Overall form
    updateOverall(
      homeState,
      homePoints,
      homeGoals,
      awayGoals
    );

    updateOverall(
      awayState,
      awayPoints,
      awayGoals,
      homeGoals
    );

    // Venue-specific form
    updateHome(
      homeState,
      homePoints,
      homeGoals,
      awayGoals
    );

    updateAway(
      awayState,
      awayPoints,
      awayGoals,
      homeGoals
    );

    processed++;

    if (processed % 20000 === 0) {
      process.stdout.write(
        `\r⏳ Processed ${processed.toLocaleString()} / ${matches.length.toLocaleString()}...`
      );
    }
  }

  // ----------------------------------------------------------
  // WRITE OUTPUT
  // ----------------------------------------------------------

  fs.writeFileSync(
    OUTPUT_FILE,
    csvLines.join('\n') + '\n',
    'utf8'
  );

  console.log('\n\n============================================================');
  console.log('✅ EWMA FEATURE EXTRACTION COMPLETE');
  console.log(`⚽ Features generated: ${processed.toLocaleString()}`);
  console.log(`⏭️ Skipped:             ${skipped.toLocaleString()}`);
  console.log(`📐 EWMA alpha:          ${ALPHA}`);
  console.log(`📊 Feature columns:     28`);
  console.log(`📄 Saved to: ${OUTPUT_FILE}`);
  console.log('============================================================');
}

main().catch((error) => {
  console.error('\n❌ Pipeline 40 failed:', error.message);
  process.exit(1);
});