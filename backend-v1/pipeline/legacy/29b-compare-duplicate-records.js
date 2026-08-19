// pipeline/29b-compare-duplicate-records.js
'use strict';

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

const REPORT_DIR = path.join(
  ROOT,
  'data_audit',
  'v2_integrity'
);

const REPORT_FILE = path.join(
  REPORT_DIR,
  'duplicate_record_comparison.json'
);

const slugify = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

console.log('🔍 Starting Record-Level Comparison of Duplicate Folders...\n');

if (!fs.existsSync(HISTORY_DIR)) {
  console.error(`❌ History directory not found:\n${HISTORY_DIR}`);
  process.exit(1);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

/* ============================================================
   LOAD FOLDERS
============================================================ */

const folders = fs
  .readdirSync(HISTORY_DIR)
  .filter((f) => {
    const fullPath = path.join(HISTORY_DIR, f);
    return fs.statSync(fullPath).isDirectory();
  });

const slugMap = new Map();

for (const folder of folders) {
  const slug = slugify(folder);

  if (!slugMap.has(slug)) {
    slugMap.set(slug, []);
  }

  slugMap.get(slug).push(folder);
}

/* ============================================================
   LOAD MATCHES
============================================================ */

function loadFolderMatches(folderPath) {
  const matches = new Map();

  const files = fs
    .readdirSync(folderPath)
    .filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(raw);

      if (!Array.isArray(data.matches)) {
        continue;
      }

      for (const match of data.matches) {
        if (!match || !match.match_id) {
          continue;
        }

        matches.set(String(match.match_id), {
          ...match,
          __file: file
        });
      }
    } catch (error) {
      console.warn(`⚠️ Could not read ${filePath}`);
      console.warn(`   ${error.message}`);
    }
  }

  return matches;
}

/* ============================================================
   FIELD HELPERS
============================================================ */

function isLegacyId(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).startsWith('INTL_')
  );
}

function countIds(matches) {
  let canonical = 0;
  let legacy = 0;

  for (const match of matches.values()) {
    if (match.home_team_id) {
      if (isLegacyId(match.home_team_id)) {
        legacy++;
      } else {
        canonical++;
      }
    }

    if (match.away_team_id) {
      if (isLegacyId(match.away_team_id)) {
        legacy++;
      } else {
        canonical++;
      }
    }
  }

  return { canonical, legacy };
}

/*
 * Fields that are useful for integrity comparison.
 *
 * __file is deliberately excluded because two folders naturally
 * may organize the same record into different files.
 */
const COMPARE_FIELDS = [
  'date',
  'competition',
  'competition_id',
  'season',
  'home_team',
  'home_team_id',
  'away_team',
  'away_team_id',
  'home_score',
  'away_score',
  'round',
  'stadium',
  'goals',
  'shootout',
  'source'
];

function valuesEqual(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function compareMatch(keepMatch, duplicateMatch) {
  const differences = [];

  for (const field of COMPARE_FIELDS) {
    if (!valuesEqual(keepMatch[field], duplicateMatch[field])) {
      differences.push({
        field,
        keep: keepMatch[field] ?? null,
        duplicate: duplicateMatch[field] ?? null
      });
    }
  }

  return differences;
}

/* ============================================================
   GLOBAL COUNTERS
============================================================ */

const totals = {
  duplicateGroups: 0,
  foldersCompared: 0,

  keepMatches: 0,
  duplicateMatches: 0,

  commonMatches: 0,
  missingFromDuplicate: 0,
  extraInDuplicate: 0,

  exactCopies: 0,

  idMismatches: 0,
  scoreMismatches: 0,
  metadataMismatches: 0,

  recordsWithMultipleDifferences: 0
};

const report = {
  generatedAt: new Date().toISOString(),
  historyDirectory: HISTORY_DIR,
  duplicateGroups: [],
  totals
};

/* ============================================================
   PROCESS DUPLICATE GROUPS
============================================================ */

for (const [slug, folderList] of slugMap.entries()) {
  if (folderList.length < 2) {
    continue;
  }

  totals.duplicateGroups++;

  console.log('============================================================');
  console.log(`Comparing Group: ${slug}`);
  console.log(`Folders: ${folderList.join(', ')}`);

  const folderData = {};

  for (const folder of folderList) {
    const folderPath = path.join(HISTORY_DIR, folder);
    const matches = loadFolderMatches(folderPath);
    const ids = countIds(matches);

    folderData[folder] = {
      matches,
      canonical: ids.canonical,
      legacy: ids.legacy
    };

    console.log(
      `  ${folder}: ${matches.size} matches | ` +
      `${ids.canonical} canonical IDs | ` +
      `${ids.legacy} legacy IDs`
    );
  }

  /*
   * Select the folder with the strongest canonical profile.
   *
   * Canonical IDs are weighted positively.
   * Legacy IDs are weighted negatively.
   * Match count is used as a secondary tie-breaker.
   */
  const rankedFolders = [...folderList].sort((a, b) => {
    const A = folderData[a];
    const B = folderData[b];

    const scoreA = A.canonical - A.legacy;
    const scoreB = B.canonical - B.legacy;

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    return B.matches.size - A.matches.size;
  });

  const keepFolder = rankedFolders[0];
  const keepMatches = folderData[keepFolder].matches;

  console.log(`\n  ✅ REFERENCE / KEEP: ${keepFolder}`);

  const groupReport = {
    slug,
    keepFolder,
    folders: [],
    comparisons: []
  };

  for (const folder of folderList) {
    const data = folderData[folder];

    groupReport.folders.push({
      folder,
      matchCount: data.matches.size,
      canonicalIds: data.canonical,
      legacyIds: data.legacy
    });
  }

  /* ==========================================================
     COMPARE EVERY OTHER FOLDER
  ========================================================== */

  for (const duplicateFolder of folderList) {
    if (duplicateFolder === keepFolder) {
      continue;
    }

    totals.foldersCompared++;

    const duplicateMatches =
      folderData[duplicateFolder].matches;

    totals.keepMatches += keepMatches.size;
    totals.duplicateMatches += duplicateMatches.size;

    const comparison = {
      duplicateFolder,
      keepFolder,

      keepMatchCount: keepMatches.size,
      duplicateMatchCount: duplicateMatches.size,

      commonMatches: 0,
      missingFromDuplicate: [],
      extraInDuplicate: [],

      exactCopies: 0,
      idMismatches: 0,
      scoreMismatches: 0,
      metadataMismatches: 0,
      recordsWithMultipleDifferences: 0,

      samples: []
    };

    /* --------------------------------------------------------
       Compare records existing in KEEP
    -------------------------------------------------------- */

    for (const [matchId, keepMatch] of keepMatches.entries()) {
      const duplicateMatch = duplicateMatches.get(matchId);

      if (!duplicateMatch) {
        comparison.missingFromDuplicate.push(matchId);
        continue;
      }

      comparison.commonMatches++;
      totals.commonMatches++;

      const differences =
        compareMatch(keepMatch, duplicateMatch);

      if (differences.length === 0) {
        comparison.exactCopies++;
        totals.exactCopies++;
        continue;
      }

      let hasIdMismatch = false;
      let hasScoreMismatch = false;
      let hasMetadataMismatch = false;

      for (const diff of differences) {
        if (
          diff.field === 'home_team_id' ||
          diff.field === 'away_team_id'
        ) {
          hasIdMismatch = true;
        }

        if (
          diff.field === 'home_score' ||
          diff.field === 'away_score'
        ) {
          hasScoreMismatch = true;
        }

        if (
          ![
            'home_team_id',
            'away_team_id',
            'home_score',
            'away_score'
          ].includes(diff.field)
        ) {
          hasMetadataMismatch = true;
        }
      }

      if (hasIdMismatch) {
        comparison.idMismatches++;
        totals.idMismatches++;
      }

      if (hasScoreMismatch) {
        comparison.scoreMismatches++;
        totals.scoreMismatches++;
      }

      if (hasMetadataMismatch) {
        comparison.metadataMismatches++;
        totals.metadataMismatches++;
      }

      if (differences.length > 1) {
        comparison.recordsWithMultipleDifferences++;
        totals.recordsWithMultipleDifferences++;
      }

      /*
       * Keep only a few detailed samples so the report doesn't
       * become enormous.
       */
      if (comparison.samples.length < 10) {
        comparison.samples.push({
          matchId,
          differences
        });
      }

      /*
       * Console output for first few mismatches.
       */
      if (comparison.samples.length <= 3) {
        console.log(`\n  [DIFFERENCE] ${matchId}`);

        for (const diff of differences) {
          console.log(
            `    ${diff.field}:`,
            JSON.stringify(diff.keep),
            '→',
            JSON.stringify(diff.duplicate)
          );
        }
      }
    }

    /* --------------------------------------------------------
       Find records existing only in duplicate folder
    -------------------------------------------------------- */

    for (const matchId of duplicateMatches.keys()) {
      if (!keepMatches.has(matchId)) {
        comparison.extraInDuplicate.push(matchId);
      }
    }

    comparison.missingFromDuplicate.forEach(() => {
      totals.missingFromDuplicate++;
    });

    comparison.extraInDuplicate.forEach(() => {
      totals.extraInDuplicate++;
    });

    console.log('\n  Comparison Summary:');
    console.log(`    Common matches: ${comparison.commonMatches}`);
    console.log(`    Exact copies: ${comparison.exactCopies}`);
    console.log(`    ID mismatches: ${comparison.idMismatches}`);
    console.log(`    Score mismatches: ${comparison.scoreMismatches}`);
    console.log(`    Metadata mismatches: ${comparison.metadataMismatches}`);
    console.log(
      `    Multiple-field differences: ${comparison.recordsWithMultipleDifferences}`
    );
    console.log(
      `    Missing from duplicate: ${comparison.missingFromDuplicate.length}`
    );
    console.log(
      `    Extra in duplicate: ${comparison.extraInDuplicate.length}`
    );

    groupReport.comparisons.push(comparison);
  }

  report.duplicateGroups.push(groupReport);
}

/* ============================================================
   SAVE REPORT
============================================================ */

fs.writeFileSync(
  REPORT_FILE,
  JSON.stringify(report, null, 2),
  'utf8'
);

/* ============================================================
   FINAL OUTPUT
============================================================ */

console.log('\n============================================================');
console.log(' RECORD-LEVEL COMPARISON COMPLETE');
console.log('============================================================');

console.log(`Duplicate folder groups: ${totals.duplicateGroups}`);
console.log(`Folder comparisons: ${totals.foldersCompared}`);
console.log(`Common matches: ${totals.commonMatches}`);
console.log(`Exact copies: ${totals.exactCopies}`);
console.log(`ID mismatches: ${totals.idMismatches}`);
console.log(`Score mismatches: ${totals.scoreMismatches}`);
console.log(`Metadata mismatches: ${totals.metadataMismatches}`);
console.log(
  `Records with multiple differences: ${totals.recordsWithMultipleDifferences}`
);
console.log(`Missing from duplicate: ${totals.missingFromDuplicate}`);
console.log(`Extra in duplicate: ${totals.extraInDuplicate}`);

console.log('\n📄 Report written to:');
console.log(REPORT_FILE);

console.log('\n🛡️ NO FILES WERE MODIFIED, MOVED, OR DELETED.');