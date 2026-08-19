// pipeline/29c-semantic-compare-duplicate-records.js
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const HISTORY_DIR = path.join(
  ROOT,
  'public_data_v2',
  'knowledge',
  'football',
  'history'
);

const REPORT_DIR = path.join(
  ROOT,
  'data_audit',
  'v2_integrity'
);

const REPORT_FILE = path.join(
  REPORT_DIR,
  'semantic_comparison_report.json'
);

// ============================================================
// NORMALIZATION
// ============================================================

const slugify = (str) =>
  String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function normalizeTeam(name) {
  if (!name) return '';

  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompetition(name) {
  if (!name) return '';

  return String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLegacyId(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).startsWith('INTL_')
  );
}

// ============================================================
// DATA QUALITY
// ============================================================

function hasGoals(match) {
  return Array.isArray(match.goals) && match.goals.length > 0;
}

function hasShootout(match) {
  return (
    match.shootout !== null &&
    match.shootout !== undefined
  );
}

function hasAttendance(match) {
  return (
    match.attendance !== null &&
    match.attendance !== undefined &&
    match.attendance !== ''
  );
}

function hasStadium(match) {
  return (
    match.stadium !== null &&
    match.stadium !== undefined &&
    String(match.stadium).trim() !== ''
  );
}

function hasRound(match) {
  return (
    match.round !== null &&
    match.round !== undefined &&
    String(match.round).trim() !== ''
  );
}

function hasCompetitionId(match) {
  return (
    match.competition_id !== null &&
    match.competition_id !== undefined &&
    String(match.competition_id).trim() !== ''
  );
}

function calculateRichness(match) {
  let score = 0;

  // Canonical team IDs
  if (
    match.home_team_id &&
    !isLegacyId(match.home_team_id)
  ) {
    score += 2;
  }

  if (
    match.away_team_id &&
    !isLegacyId(match.away_team_id)
  ) {
    score += 2;
  }

  // Match details
  if (hasGoals(match)) score += 3;
  if (hasShootout(match)) score += 2;
  if (hasStadium(match)) score += 1;
  if (hasAttendance(match)) score += 1;
  if (hasRound(match)) score += 1;
  if (hasCompetitionId(match)) score += 1;

  return score;
}

// ============================================================
// SEMANTIC FINGERPRINT
// ============================================================

function createFingerprint(match) {
  const date = String(match.date || '').trim();

  const home = normalizeTeam(match.home_team);
  const away = normalizeTeam(match.away_team);

  const homeScore =
    match.home_score === null ||
    match.home_score === undefined
      ? 'null'
      : String(match.home_score);

  const awayScore =
    match.away_score === null ||
    match.away_score === undefined
      ? 'null'
      : String(match.away_score);

  const competition =
    normalizeCompetition(match.competition);

  return [
    date,
    competition,
    home,
    away,
    homeScore,
    awayScore
  ].join('|');
}

// ============================================================
// LOAD FOLDER
// ============================================================

function loadFolderMatches(folderPath) {
  const matches = [];

  const files = fs
    .readdirSync(folderPath)
    .filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const fullPath = path.join(folderPath, file);
      const data = JSON.parse(
        fs.readFileSync(fullPath, 'utf8')
      );

      if (!Array.isArray(data.matches)) continue;

      for (const match of data.matches) {
        if (
          match &&
          match.date &&
          match.home_team &&
          match.away_team
        ) {
          matches.push({
            ...match,
            __folder: path.basename(folderPath),
            __file: file,
            __fingerprint: createFingerprint(match)
          });
        }
      }
    } catch (error) {
      console.warn(
        `⚠️ Could not read ${folderPath}: ${error.message}`
      );
    }
  }

  return matches;
}

// ============================================================
// MAIN
// ============================================================

console.log(
  '🔍 Starting Semantic Comparison of Duplicate Folders...\n'
);

if (!fs.existsSync(HISTORY_DIR)) {
  console.error(
    `❌ History directory not found:\n${HISTORY_DIR}`
  );
  process.exit(1);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const folders = fs
  .readdirSync(HISTORY_DIR)
  .filter(folder =>
    fs.statSync(
      path.join(HISTORY_DIR, folder)
    ).isDirectory()
  );

const slugMap = new Map();

for (const folder of folders) {
  const slug = slugify(folder);

  if (!slugMap.has(slug)) {
    slugMap.set(slug, []);
  }

  slugMap.get(slug).push(folder);
}

// ============================================================
// REPORT
// ============================================================

const report = {
  generatedAt: new Date().toISOString(),

  methodology: {
    fingerprint:
      'date + competition + normalized home team + normalized away team + home score + away score',

    purpose:
      'Identify historically equivalent records across duplicate folder variants without modifying data.',

    destructiveOperations:
      false
  },

  groupsAnalyzed: 0,

  semanticMatchesFound: 0,

  distinctMatchIdConflicts: 0,

  mergeCandidates: 0,

  trueConflicts: 0,

  missingEquivalentRecords: 0,

  groups: []
};

// ============================================================
// ANALYZE DUPLICATE FOLDER GROUPS
// ============================================================

for (const [slug, folderList] of slugMap.entries()) {
  if (folderList.length < 2) continue;

  report.groupsAnalyzed++;

  console.log(
    '============================================================'
  );

  console.log(
    `Analyzing Group: ${slug}`
  );

  const allMatches = [];

  for (const folder of folderList) {
    const folderMatches = loadFolderMatches(
      path.join(HISTORY_DIR, folder)
    );

    allMatches.push(...folderMatches);

    console.log(
      `  ${folder}: ${folderMatches.length} matches loaded`
    );
  }

  // ==========================================================
  // GROUP BY SEMANTIC FINGERPRINT
  // ==========================================================

  const semanticMap = new Map();

  for (const match of allMatches) {
    const fingerprint = match.__fingerprint;

    if (!semanticMap.has(fingerprint)) {
      semanticMap.set(fingerprint, []);
    }

    semanticMap.get(fingerprint).push(match);
  }

  let groupSemanticMatches = 0;
  let groupIdConflicts = 0;
  let groupMergeCandidates = 0;
  let groupTrueConflicts = 0;
  let groupMissingEquivalent = 0;

  const semanticGroups = [];

  // ==========================================================
  // EVALUATE SEMANTIC GROUPS
  // ==========================================================

  for (const [fingerprint, versions] of semanticMap.entries()) {
    const foldersPresent = new Set(
      versions.map(v => v.__folder)
    );

    // Important:
    // A semantic match is only interesting when the same
    // fingerprint exists in more than one duplicate folder.
    if (foldersPresent.size < 2) continue;

    groupSemanticMatches++;
    report.semanticMatchesFound++;

    const uniqueMatchIds = new Set(
      versions.map(v => v.match_id).filter(Boolean)
    );

    if (uniqueMatchIds.size > 1) {
      groupIdConflicts++;
      report.distinctMatchIdConflicts++;
    }

    const evaluated = versions.map(v => ({
      match_id: v.match_id || null,

      folder: v.__folder,
      file: v.__file,

      date: v.date,
      competition: v.competition,

      home_team: v.home_team,
      away_team: v.away_team,

      home_score: v.home_score,
      away_score: v.away_score,

      home_team_id: v.home_team_id || null,
      away_team_id: v.away_team_id || null,

      canonical_home_id:
        !!v.home_team_id &&
        !isLegacyId(v.home_team_id),

      canonical_away_id:
        !!v.away_team_id &&
        !isLegacyId(v.away_team_id),

      has_goals: hasGoals(v),
      has_shootout: hasShootout(v),
      has_stadium: hasStadium(v),
      has_attendance: hasAttendance(v),
      has_round: hasRound(v),
      has_competition_id: hasCompetitionId(v),

      stadium: v.stadium || null,

      richness: calculateRichness(v)
    }));

    // ----------------------------------------------------------
    // Determine whether information is split between versions
    // ----------------------------------------------------------

    const hasCanonical = evaluated.some(
      e =>
        e.canonical_home_id &&
        e.canonical_away_id
    );

    const hasGoalsData = evaluated.some(
      e => e.has_goals
    );

    const hasShootoutData = evaluated.some(
      e => e.has_shootout
    );

    const richest = [...evaluated]
      .sort((a, b) => b.richness - a.richness)[0];

    const informationIsSplit =
      evaluated.length > 1 &&
      (
        (
          hasCanonical &&
          !evaluated.every(
            e =>
              e.canonical_home_id &&
              e.canonical_away_id
          )
        ) ||
        (
          hasGoalsData &&
          !evaluated.every(
            e => e.has_goals
          )
        ) ||
        (
          hasShootoutData &&
          !evaluated.every(
            e => e.has_shootout
          )
        )
      );

    if (informationIsSplit) {
      groupMergeCandidates++;
      report.mergeCandidates++;
    }

    // ----------------------------------------------------------
    // Detect contradictory data
    // ----------------------------------------------------------

    const uniqueScores = new Set(
      versions.map(
        v =>
          `${v.home_score}|${v.away_score}`
      )
    );

    const uniqueDates = new Set(
      versions.map(v => v.date)
    );

    const uniqueCompetitions = new Set(
      versions.map(
        v => normalizeCompetition(v.competition)
      )
    );

    const uniqueHomeTeams = new Set(
      versions.map(
        v => normalizeTeam(v.home_team)
      )
    );

    const uniqueAwayTeams = new Set(
      versions.map(
        v => normalizeTeam(v.away_team)
      )
    );

    const contradictory =
      uniqueScores.size > 1 ||
      uniqueDates.size > 1 ||
      uniqueCompetitions.size > 1 ||
      uniqueHomeTeams.size > 1 ||
      uniqueAwayTeams.size > 1;

    if (contradictory) {
      groupTrueConflicts++;
      report.trueConflicts++;
    }

    semanticGroups.push({
      fingerprint,

      versions: evaluated,

      uniqueMatchIds: [...uniqueMatchIds],

      distinctMatchIds:
        uniqueMatchIds.size,

      informationIsSplit,

      contradictory,

      recommendedRichestVersion:
        richest
          ? {
              match_id: richest.match_id,
              folder: richest.folder,
              file: richest.file,
              richness: richest.richness
            }
          : null
    });
  }

  // ==========================================================
  // REPORT GROUP
  // ==========================================================

  console.log(
    `  Semantic Matches Found: ${groupSemanticMatches}`
  );

  console.log(
    `  Distinct Match ID Conflicts: ${groupIdConflicts}`
  );

  console.log(
    `  Merge Candidates: ${groupMergeCandidates}`
  );

  console.log(
    `  True Data Conflicts: ${groupTrueConflicts}\n`
  );

  report.groups.push({
    slug,

    folders: folderList,

    totalMatchesAnalyzed:
      allMatches.length,

    semanticMatchesFound:
      groupSemanticMatches,

    distinctMatchIdConflicts:
      groupIdConflicts,

    mergeCandidates:
      groupMergeCandidates,

    trueConflicts:
      groupTrueConflicts,

    semanticGroups
  });
}

// ============================================================
// WRITE REPORT
// ============================================================

fs.writeFileSync(
  REPORT_FILE,
  JSON.stringify(report, null, 2),
  'utf8'
);

console.log(
  '\n============================================================'
);

console.log(
  ' SEMANTIC COMPARISON COMPLETE'
);

console.log(
  '============================================================'
);

console.log(
  `Groups Analyzed: ${report.groupsAnalyzed}`
);

console.log(
  `Semantic Matches Found: ${report.semanticMatchesFound}`
);

console.log(
  `Distinct Match ID Conflicts: ${report.distinctMatchIdConflicts}`
);

console.log(
  `Merge Candidates: ${report.mergeCandidates}`
);

console.log(
  `True Data Conflicts: ${report.trueConflicts}`
);

console.log(
  '\n📄 Report written to:'
);

console.log(REPORT_FILE);

console.log(
  '\n🛡️ NO FILES WERE MODIFIED, MOVED, OR DELETED.'
);