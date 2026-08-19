// pipeline/29e-quarantine-duplicate-folders.js
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

const QUARANTINE_DIR = path.join(
  ROOT,
  'public_data_v2',
  'migration',
  'quarantine',
  'duplicate_history_folders'
);

const INPUT_REPORT = path.join(
  REPORT_DIR,
  'semantic_comparison_report.json'
);

const OPERATION_LOG = path.join(
  REPORT_DIR,
  'quarantine_operation_log.json'
);

const DRY_RUN = process.argv.includes('--dry-run');


// ============================================================
// NORMALIZATION
// ============================================================

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

function createFingerprint(match) {
  const date = String(match.date || '').trim();

  const home = normalizeTeam(match.home_team);
  const away = normalizeTeam(match.away_team);

  const homeScore =
    match.home_score === null || match.home_score === undefined
      ? 'null'
      : String(match.home_score);

  const awayScore =
    match.away_score === null || match.away_score === undefined
      ? 'null'
      : String(match.away_score);

  const competition = normalizeCompetition(match.competition);

  return [
    date,
    competition,
    home,
    away,
    homeScore,
    awayScore
  ].join('|');
}

function isLegacyId(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).startsWith('INTL_')
  );
}


// ============================================================
// LOAD FOLDER
// ============================================================

function loadFolderData(folderName) {
  const folderPath = path.join(HISTORY_DIR, folderName);

  const result = {
    folder: folderName,
    matches: [],
    fingerprints: new Set(),
    canonicalIds: 0,
    legacyIds: 0
  };

  if (!fs.existsSync(folderPath)) {
    return result;
  }

  const files = fs
    .readdirSync(folderPath)
    .filter(file => file.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    try {
      const data = JSON.parse(
        fs.readFileSync(filePath, 'utf8')
      );

      if (!Array.isArray(data.matches)) {
        continue;
      }

      for (const match of data.matches) {
        if (
          !match ||
          !match.date ||
          !match.home_team ||
          !match.away_team
        ) {
          continue;
        }

        result.matches.push({
          ...match,
          __file: file
        });

        result.fingerprints.add(
          createFingerprint(match)
        );

        if (match.home_team_id) {
          if (isLegacyId(match.home_team_id)) {
            result.legacyIds++;
          } else {
            result.canonicalIds++;
          }
        }

        if (match.away_team_id) {
          if (isLegacyId(match.away_team_id)) {
            result.legacyIds++;
          } else {
            result.canonicalIds++;
          }
        }
      }
    } catch (error) {
      console.warn(
        `  ⚠️ Could not read ${folderName}/${file}: ${error.message}`
      );
    }
  }

  return result;
}


// ============================================================
// HEADER
// ============================================================

console.log('============================================================');
console.log(' ZOKASCORE V2 PIPELINE — STEP 29e');
console.log(' CONTROLLED DUPLICATE FOLDER QUARANTINE');
console.log('============================================================\n');

if (DRY_RUN) {
  console.log(
    '🏃‍♂️ DRY RUN MODE ENABLED — No files will be moved.\n'
  );
} else {
  console.log(
    '⚠️ LIVE MODE — Folders will be moved to quarantine.\n'
  );
}


// ============================================================
// REQUIRED INPUTS
// ============================================================

if (!fs.existsSync(HISTORY_DIR)) {
  console.error(
    `❌ History directory not found:\n${HISTORY_DIR}`
  );
  process.exit(1);
}

if (!fs.existsSync(INPUT_REPORT)) {
  console.error(
    `❌ Approved semantic evidence report not found:\n${INPUT_REPORT}`
  );

  console.error(
    '\nPlease run 29c first.'
  );

  process.exit(1);
}

const report = JSON.parse(
  fs.readFileSync(INPUT_REPORT, 'utf8')
);


// ============================================================
// OPERATION LOG
// ============================================================

const operationLog = {
  generatedAt: new Date().toISOString(),
  dryRun: DRY_RUN,

  methodology: {
    evidenceSource: 'semantic_comparison_report.json',
    rankingSource: 'live folder contents',
    safetyRequirement: 'DUP must contain zero unique semantic fingerprints',
    destructiveOperations: !DRY_RUN
  },

  groupsProcessed: 0,
  groupsApproved: 0,
  groupsQuarantined: 0,
  groupsFailed: 0,

  actions: []
};


if (!DRY_RUN) {
  fs.mkdirSync(QUARANTINE_DIR, {
    recursive: true
  });
}


// ============================================================
// PROCESS GROUPS
// ============================================================

for (const group of report.groups) {

  operationLog.groupsProcessed++;

  console.log(
    '============================================================'
  );

  console.log(
    `Analyzing Group: ${group.slug}`
  );


  // ----------------------------------------------------------
  // SAFETY CHECK 1
  // ----------------------------------------------------------
  //
  // The semantic report must explicitly say there are no
  // true conflicts.
  //

  const trueConflicts =
    Number(
      group.trueConflicts ??
      group.semanticConflictsFound ??
      0
    );

  if (trueConflicts > 0) {

    operationLog.groupsFailed++;

    console.log(
      `  ❌ FAILED: ${trueConflicts} true conflicts detected.`
    );

    operationLog.actions.push({
      slug: group.slug,
      status: 'FAILED',
      reason: `True data conflicts detected: ${trueConflicts}`
    });

    continue;
  }


  // ----------------------------------------------------------
  // VALIDATE FOLDER LIST
  // ----------------------------------------------------------

  if (!Array.isArray(group.folders)) {

    operationLog.groupsFailed++;

    console.log(
      '  ❌ FAILED: Invalid folder list in semantic report.'
    );

    operationLog.actions.push({
      slug: group.slug,
      status: 'FAILED',
      reason: 'group.folders is not an array'
    });

    continue;
  }


  if (group.folders.length < 2) {

    console.log(
      '  ℹ️ Skipping: fewer than 2 folders.'
    );

    continue;
  }


  // ----------------------------------------------------------
  // LOAD ACTUAL FOLDER DATA
  // ----------------------------------------------------------

  const folderData = group.folders.map(
    folderName => loadFolderData(folderName)
  );


  // ----------------------------------------------------------
  // RANK FOLDERS
  // ----------------------------------------------------------
  //
  // Priority:
  //
  // 1. More canonical IDs
  // 2. Fewer legacy IDs
  // 3. More matches
  // 4. Alphabetical deterministic fallback
  //
  // IMPORTANT:
  // This ranking is calculated from the ACTUAL folders,
  // not assumed fields from the semantic report.
  //

  folderData.sort((a, b) => {

    if (b.canonicalIds !== a.canonicalIds) {
      return b.canonicalIds - a.canonicalIds;
    }

    if (a.legacyIds !== b.legacyIds) {
      return a.legacyIds - b.legacyIds;
    }

    if (b.matches.length !== a.matches.length) {
      return b.matches.length - a.matches.length;
    }

    return a.folder.localeCompare(b.folder);
  });


  const keepFolder = folderData[0];


  console.log(
    `  ✅ KEEP: ${keepFolder.folder}`
  );

  console.log(
    `     Matches: ${keepFolder.matches.length}`
  );

  console.log(
    `     Canonical IDs: ${keepFolder.canonicalIds}`
  );

  console.log(
    `     Legacy IDs: ${keepFolder.legacyIds}`
  );


  // ----------------------------------------------------------
  // SAFETY CHECK 2
  // ----------------------------------------------------------
  //
  // Every quarantine candidate must have ZERO semantic records
  // that don't exist in KEEP.
  //

  let groupHadFailure = false;


  for (let i = 1; i < folderData.length; i++) {

    const dupFolder = folderData[i];


    let uniqueInDup = 0;

    for (const fingerprint of dupFolder.fingerprints) {

      if (!keepFolder.fingerprints.has(fingerprint)) {
        uniqueInDup++;
      }
    }


    // --------------------------------------------------------
    // UNIQUE RECORD SAFETY FAILURE
    // --------------------------------------------------------

    if (uniqueInDup > 0) {

      groupHadFailure = true;

      operationLog.groupsFailed++;

      console.log(
        `  ❌ FAILED SAFETY CHECK: ${dupFolder.folder}`
      );

      console.log(
        `     ${uniqueInDup} semantic records exist only in DUP.`
      );

      console.log(
        '     Folder will NOT be quarantined.\n'
      );

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'FAILED',

        reason:
          `DUP contains ${uniqueInDup} unique semantic fingerprints.`,

        keepStats: {
          matches: keepFolder.matches.length,
          canonicalIds: keepFolder.canonicalIds,
          legacyIds: keepFolder.legacyIds
        },

        duplicateStats: {
          matches: dupFolder.matches.length,
          canonicalIds: dupFolder.canonicalIds,
          legacyIds: dupFolder.legacyIds
        }
      });

      continue;
    }


    // --------------------------------------------------------
    // SAFETY CHECK 3
    // --------------------------------------------------------
    //
    // DUP must not contain MORE canonical IDs than KEEP.
    //

    if (
      dupFolder.canonicalIds >
      keepFolder.canonicalIds
    ) {

      groupHadFailure = true;

      operationLog.groupsFailed++;

      console.log(
        `  ❌ FAILED CANONICAL-ID SAFETY CHECK: ${dupFolder.folder}`
      );

      console.log(
        `     DUP canonical IDs: ${dupFolder.canonicalIds}`
      );

      console.log(
        `     KEEP canonical IDs: ${keepFolder.canonicalIds}`
      );

      console.log(
        '     Folder will NOT be quarantined.\n'
      );

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'FAILED',

        reason:
          'DUP contains more canonical IDs than KEEP.'
      });

      continue;
    }


    // --------------------------------------------------------
    // APPROVED
    // --------------------------------------------------------

    operationLog.groupsApproved++;

    console.log(
      `  ✅ SAFE TO QUARANTINE: ${dupFolder.folder}`
    );

    console.log(
      `     Matches: ${dupFolder.matches.length}`
    );

    console.log(
      `     Canonical IDs: ${dupFolder.canonicalIds}`
    );

    console.log(
      `     Legacy IDs: ${dupFolder.legacyIds}`
    );

    console.log(
      '     Unique semantic records: 0'
    );


    // --------------------------------------------------------
    // DRY RUN
    // --------------------------------------------------------

    if (DRY_RUN) {

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'DRY_RUN_SAFE',

        keepStats: {
          matches: keepFolder.matches.length,
          canonicalIds: keepFolder.canonicalIds,
          legacyIds: keepFolder.legacyIds
        },

        duplicateStats: {
          matches: dupFolder.matches.length,
          canonicalIds: dupFolder.canonicalIds,
          legacyIds: dupFolder.legacyIds
        }
      });

      console.log(
        '     (Dry Run: folder NOT moved)\n'
      );

      continue;
    }


    // --------------------------------------------------------
    // LIVE MODE
    // --------------------------------------------------------

    const sourcePath = path.join(
      HISTORY_DIR,
      dupFolder.folder
    );

    const destinationPath = path.join(
      QUARANTINE_DIR,
      dupFolder.folder
    );


    // --------------------------------------------------------
    // DESTINATION COLLISION CHECK
    // --------------------------------------------------------

    if (fs.existsSync(destinationPath)) {

      operationLog.groupsFailed++;

      console.log(
        '  ❌ MOVE BLOCKED: quarantine destination already exists.'
      );

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'FAILED',

        reason:
          'Quarantine destination already exists',

        destination: destinationPath
      });

      continue;
    }


    // --------------------------------------------------------
    // MOVE
    // --------------------------------------------------------

    try {

      fs.renameSync(
        sourcePath,
        destinationPath
      );

      operationLog.groupsQuarantined++;

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'QUARANTINED',

        destination: destinationPath
      });

      console.log(
        `     📦 MOVED → ${destinationPath}\n`
      );

    } catch (error) {

      operationLog.groupsFailed++;

      console.error(
        `  ❌ ERROR MOVING FOLDER: ${error.message}\n`
      );

      operationLog.actions.push({
        slug: group.slug,

        keepFolder: keepFolder.folder,
        dupFolder: dupFolder.folder,

        status: 'MOVE_ERROR',

        error: error.message
      });
    }
  }


  if (!groupHadFailure) {
    console.log(
      `  🛡️ Group ${group.slug}: all duplicate candidates passed safety checks.\n`
    );
  }
}


// ============================================================
// WRITE LOG
// ============================================================

fs.writeFileSync(
  OPERATION_LOG,
  JSON.stringify(operationLog, null, 2),
  'utf8'
);


// ============================================================
// FINAL REPORT
// ============================================================

console.log(
  '============================================================'
);

console.log(
  ' STEP 29e COMPLETE'
);

console.log(
  '============================================================'
);

console.log(
  `Groups Processed:  ${operationLog.groupsProcessed}`
);

console.log(
  `Groups Approved:   ${operationLog.groupsApproved}`
);

if (!DRY_RUN) {

  console.log(
    `Groups Quarantined:${operationLog.groupsQuarantined}`
  );
}

console.log(
  `Groups Failed:     ${operationLog.groupsFailed}`
);

console.log(
  `\n📄 Operation log written to:`
);

console.log(
  OPERATION_LOG
);

if (DRY_RUN) {

  console.log(
    '\n🛡️ DRY RUN COMPLETED. No files were moved.'
  );

} else {

  console.log(
    '\n📦 Approved duplicate folders moved to quarantine.'
  );
}