'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'v2_integrity');

const REPORT_FILE = path.join(
  AUDIT_DIR,
  'v2_integrity_report.json'
);

const OUTPUT_FILE = path.join(
  AUDIT_DIR,
  'orphan_historical_fingerprint_report.json'
);

const ENTITY_DIR = path.join(
  ROOT,
  'data_audit',
  'entity_resolution'
);

const CANONICAL_FILE = path.join(
  ENTITY_DIR,
  'canonical_teams.json'
);

const GAMES_CSV = path.join(
  ROOT,
  'data',
  'source',
  'games.csv'
);


// ============================================================
// LOAD JSON
// ============================================================

const loadJson = (file) => {
  try {
    return JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch {
    return null;
  }
};


// ============================================================
// DATE NORMALIZATION
// ============================================================

function normalizeDate(value) {
  if (!value) return null;

  const s = String(value).trim();

  if (!s) return null;

  // YYYY-MM-DD
  const iso = s.match(
    /^(\d{4}-\d{2}-\d{2})/
  );

  if (iso) {
    return iso[1];
  }

  // DD/MM/YYYY
  const dmy = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  // DD-MM-YYYY
  const dashDmy = s.match(
    /^(\d{2})-(\d{2})-(\d{4})/
  );

  if (dashDmy) {
    return `${dashDmy[3]}-${dashDmy[2]}-${dashDmy[1]}`;
  }

  return s;
}


// ============================================================
// CSV READER
// ============================================================

function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {

    if (!fs.existsSync(file)) {
      return reject(
        new Error(`File not found: ${file}`)
      );
    }

    let count = 0;

    fs.createReadStream(file, {
      encoding: 'utf8'
    })
      .pipe(csv())

      .on('data', row => {
        count++;

        try {
          onRow(row);
        } catch {
          // Preserve existing audit behavior:
          // malformed rows do not kill the scan.
        }
      })

      .on('end', () => resolve(count))

      .on('error', reject);
  });
}


// ============================================================
// FINGERPRINT STRUCTURE
// ============================================================

function createFingerprint() {
  return {
    gameCount: 0,

    opponents: new Set(),

    seasons: new Set(),

    competitions: new Set(),

    stadiums: new Set(),

    managers: new Set(),

    // D|Opponent|Date
    // R|Opponent|Season|Competition|Round
    // S|Opponent|Season|Competition|Side
    matchSignatures: new Set()
  };
}


// ============================================================
// UPDATE FINGERPRINT
// ============================================================

function updateFingerprint(
  fp,
  row,
  side,
  opponentId
) {
  fp.gameCount++;

  if (opponentId) {
    fp.opponents.add(opponentId);
  }

  if (row.season) {
    fp.seasons.add(
      String(row.season).trim()
    );
  }

  if (row.competition_id) {
    fp.competitions.add(
      String(row.competition_id).trim()
    );
  }

  if (row.stadium) {
    fp.stadiums.add(
      String(row.stadium).trim()
    );
  }

  const manager =
    row[`${side}_club_manager_name`];

  if (manager) {
    fp.managers.add(
      String(manager).trim()
    );
  }


  // ==========================================================
  // ULTIMATE MATCH SIGNATURE
  //
  // Priority:
  //
  // 1. Opponent + Date
  // 2. Opponent + Round + Season + Competition
  // 3. Opponent + Season + Competition + Side
  // ==========================================================

  if (!opponentId) {
    return;
  }

  const date = normalizeDate(row.date);

  if (date) {

    fp.matchSignatures.add(
      `D|${opponentId}|${date}`
    );

  } else if (
    row.round &&
    row.season &&
    row.competition_id
  ) {

    fp.matchSignatures.add(
      `R|${opponentId}|${row.season}|${row.competition_id}|${row.round}`
    );

  } else if (
    row.season &&
    row.competition_id
  ) {

    fp.matchSignatures.add(
      `S|${opponentId}|${row.season}|${row.competition_id}|${side}`
    );
  }
}


// ============================================================
// SIGNATURE TYPE
// ============================================================

function signatureType(signature) {

  if (signature.startsWith('D|')) {
    return 'DATE';
  }

  if (signature.startsWith('R|')) {
    return 'ROUND';
  }

  if (signature.startsWith('S|')) {
    return 'SEASON';
  }

  return 'UNKNOWN';
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  const report = loadJson(REPORT_FILE);

  const canonical =
    loadJson(CANONICAL_FILE) || [];


  if (
    !report?.informational_findings
      ?.orphan_team_ids
  ) {
    throw new Error(
      'orphan_team_ids not found'
    );
  }


  // ==========================================================
  // ORPHANS
  // ==========================================================

  const orphans =
    report
      .informational_findings
      .orphan_team_ids
      .map(String)
      .filter(id => /^\d+$/.test(id));

  const orphanSet =
    new Set(orphans);


  // ==========================================================
  // CANONICAL IDS
  // ==========================================================

  const canonicalSet =
    new Set(
      canonical.map(
        c => String(c.canonical_id)
      )
    );


  console.log(
    '🔍 Pipeline 31l — Historical Match Fingerprint Resolver'
  );

  console.log(
    '============================================================\n'
  );

  console.log(
    `Building fingerprints for ${orphans.length} orphans and ${canonical.length} canonical teams...`
  );


  // ==========================================================
  // INITIALIZE ORPHAN FINGERPRINTS
  // ==========================================================

  const orphanFingerprints =
    new Map();

  for (const id of orphans) {

    orphanFingerprints.set(
      id,
      createFingerprint()
    );
  }


  // ==========================================================
  // INITIALIZE CANONICAL FINGERPRINTS
  // ==========================================================

  const canonicalFingerprints =
    new Map();

  for (const id of canonicalSet) {

    canonicalFingerprints.set(
      id,
      createFingerprint()
    );
  }


  // ==========================================================
  // SINGLE PASS THROUGH games.csv
  // ==========================================================

  const rowsRead =
    await readCsv(
      GAMES_CSV,
      row => {

        const homeId =
          String(
            row.home_club_id || ''
          );

        const awayId =
          String(
            row.away_club_id || ''
          );


        // ------------------------------------------------------
        // ORPHAN HOME
        // ------------------------------------------------------

        if (orphanSet.has(homeId)) {

          updateFingerprint(
            orphanFingerprints.get(homeId),
            row,
            'home',
            awayId
          );
        }


        // ------------------------------------------------------
        // ORPHAN AWAY
        // ------------------------------------------------------

        if (orphanSet.has(awayId)) {

          updateFingerprint(
            orphanFingerprints.get(awayId),
            row,
            'away',
            homeId
          );
        }


        // ------------------------------------------------------
        // CANONICAL HOME
        // ------------------------------------------------------

        if (canonicalSet.has(homeId)) {

          updateFingerprint(
            canonicalFingerprints.get(homeId),
            row,
            'home',
            awayId
          );
        }


        // ------------------------------------------------------
        // CANONICAL AWAY
        // ------------------------------------------------------

        if (canonicalSet.has(awayId)) {

          updateFingerprint(
            canonicalFingerprints.get(awayId),
            row,
            'away',
            homeId
          );
        }
      }
    );


  console.log(
    `📊 games.csv rows scanned: ${rowsRead}`
  );

  console.log(
    '🔎 Comparing exact match signatures...\n'
  );


  // ==========================================================
  // RESULT STRUCTURES
  // ==========================================================

  const reportFindings = [];

  const summary = {
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    LOW_CONFIDENCE: 0,
    CONFLICT: 0,
    UNRESOLVED: 0
  };


  // ==========================================================
  // RESOLVE EACH ORPHAN
  // ==========================================================

  for (const orphanId of orphans) {

    const oFp =
      orphanFingerprints.get(
        orphanId
      );

    let bestCandidates = [];


    // ========================================================
    // COMPARE AGAINST EVERY CANONICAL TEAM
    // ========================================================

    for (
      const [cId, cFp]
      of canonicalFingerprints.entries()
    ) {

      // ------------------------------------------------------
      // EXACT MATCH SIGNATURE INTERSECTION
      // ------------------------------------------------------

      const sharedMatchSignatures =
        [
          ...oFp.matchSignatures
        ].filter(
          sig =>
            cFp.matchSignatures.has(sig)
        );


      // ------------------------------------------------------
      // OPPONENT INTERSECTION
      // ------------------------------------------------------

      const sharedOpps =
        [
          ...oFp.opponents
        ].filter(
          opp =>
            cFp.opponents.has(opp)
        );


      // ------------------------------------------------------
      // NO RELATIONSHIP
      // ------------------------------------------------------

      if (
        sharedOpps.length === 0 &&
        sharedMatchSignatures.length === 0
      ) {
        continue;
      }


      // ------------------------------------------------------
      // SECONDARY SIGNALS
      // ------------------------------------------------------

      const sharedStadiums =
        [
          ...oFp.stadiums
        ].filter(
          stadium =>
            cFp.stadiums.has(stadium)
        );


      const sharedManagers =
        [
          ...oFp.managers
        ].filter(
          manager =>
            cFp.managers.has(manager)
        );


      const sharedSeasons =
        [
          ...oFp.seasons
        ].filter(
          season =>
            cFp.seasons.has(season)
        );


      const sharedComps =
        [
          ...oFp.competitions
        ].filter(
          competition =>
            cFp.competitions.has(competition)
        );


      // ======================================================
      // WEIGHTED SCORE
      // ======================================================

      let score = 0;

      let dateSignatureCount = 0;
      let roundSignatureCount = 0;
      let seasonSignatureCount = 0;


      for (
        const signature
        of sharedMatchSignatures
      ) {

        const type =
          signatureType(signature);

        if (type === 'DATE') {

          score += 100;
          dateSignatureCount++;

        } else if (type === 'ROUND') {

          score += 50;
          roundSignatureCount++;

        } else if (type === 'SEASON') {

          score += 20;
          seasonSignatureCount++;
        }
      }


      // Secondary historical evidence

      score +=
        sharedOpps.length * 10;

      score +=
        sharedStadiums.length * 5;

      score +=
        sharedManagers.length * 5;


      bestCandidates.push({

        candidateId: cId,

        score,

        signals: {

          sharedMatchSignatures,

          sharedOpponents:
            sharedOpps,

          sharedStadiums,

          sharedManagers,

          sharedSeasons,

          sharedCompetitions:
            sharedComps,

          dateSignatureCount,

          roundSignatureCount,

          seasonSignatureCount
        }
      });
    }


    // ========================================================
    // SORT CANDIDATES
    // ========================================================

    bestCandidates.sort(
      (a, b) =>
        b.score - a.score
    );


    const topCandidates =
      bestCandidates.slice(0, 3);


    // ========================================================
    // DEFAULT CLASSIFICATION
    // ========================================================

    let classification =
      'UNRESOLVED';

    let confidence =
      0.0;

    let action =
      'HOLD_FOR_REVIEW';

    let bestCandidateId =
      null;


    // ========================================================
    // CLASSIFICATION
    // ========================================================

    if (topCandidates.length > 0) {

      const first =
        topCandidates[0];

      const exactDateMatches =
        first.signals
          .dateSignatureCount;

      const exactRoundMatches =
        first.signals
          .roundSignatureCount;

      const exactSeasonMatches =
        first.signals
          .seasonSignatureCount;


      const hasStadium =
        first.signals
          .sharedStadiums.length > 0;

      const hasManager =
        first.signals
          .sharedManagers.length > 0;

      const hasCorroboration =
        hasStadium ||
        hasManager;


      // ======================================================
      // HIGH CONFIDENCE
      //
      // One exact date match is extremely strong.
      //
      // Also:
      // 2+ round signatures + corroboration.
      // ======================================================

      if (
        exactDateMatches >= 1
        ||
        (
          exactRoundMatches >= 2 &&
          hasCorroboration
        )
      ) {

        classification =
          'HIGH_CONFIDENCE';

        confidence =
          0.99;

        action =
          'CANDIDATE_FOR_MAPPING';

        bestCandidateId =
          first.candidateId;
      }


      // ======================================================
      // MEDIUM CONFIDENCE
      //
      // One round signature
      // OR
      // multiple signatures + corroboration
      // ======================================================

      else if (
        exactRoundMatches >= 1
        ||
        (
          first.signals
            .sharedMatchSignatures
            .length >= 2 &&
          hasCorroboration
        )
        ||
        (
          exactSeasonMatches >= 2 &&
          hasCorroboration
        )
      ) {

        classification =
          'MEDIUM_CONFIDENCE';

        confidence =
          0.75;

        action =
          'MANUAL_REVIEW_REQUIRED';

        bestCandidateId =
          first.candidateId;
      }


      // ======================================================
      // LOW CONFIDENCE
      //
      // Opponent overlap without strong signature evidence.
      // ======================================================

      else if (
        first.signals
          .sharedOpponents.length > 0
      ) {

        classification =
          'LOW_CONFIDENCE';

        confidence =
          0.40;

        action =
          'HOLD_FOR_REVIEW';

        bestCandidateId =
          first.candidateId;
      }


      // ======================================================
      // CONFLICT DETECTION
      //
      // IMPORTANT:
      //
      // A weaker opponent-only candidate must NOT override
      // a genuine date-level candidate.
      //
      // If both candidates have comparable signature strength,
      // then the 80% rule applies.
      // ======================================================

      if (
        topCandidates.length > 1 &&
        first.score >= 50
      ) {

        const second =
          topCandidates[1];


        const firstHasDate =
          first.signals
            .sharedMatchSignatures
            .some(
              s =>
                s.startsWith('D|')
            );


        const secondHasDate =
          second.signals
            .sharedMatchSignatures
            .some(
              s =>
                s.startsWith('D|')
            );


        const firstHasRound =
          first.signals
            .sharedMatchSignatures
            .some(
              s =>
                s.startsWith('R|')
            );


        const secondHasRound =
          second.signals
            .sharedMatchSignatures
            .some(
              s =>
                s.startsWith('R|')
            );


        // Comparable evidence means:
        //
        // DATE vs DATE
        // ROUND vs ROUND
        // SEASON vs SEASON
        //
        // A date candidate is not treated as conflicted merely
        // because another team shares the opponent.
        const comparableDateEvidence =
          firstHasDate ===
          secondHasDate;


        const comparableRoundEvidence =
          firstHasRound ===
          secondHasRound;


        const comparableEvidence =
          comparableDateEvidence &&
          comparableRoundEvidence;


        if (
          comparableEvidence &&
          second.score / first.score >= 0.8
        ) {

          classification =
            'CONFLICT';

          confidence =
            0.0;

          action =
            'MANUAL_REVIEW_REQUIRED';

          bestCandidateId =
            null;
        }
      }
    }


    // ========================================================
    // SUMMARY
    // ========================================================

    summary[classification] =
      (summary[classification] || 0) + 1;


    // ========================================================
    // OUTPUT RECORD
    // ========================================================

    reportFindings.push({

      orphanId,

      orphanGameCount:
        oFp.gameCount,

      matchSignatureCount:
        oFp.matchSignatures.size,

      classification,

      confidence,

      candidateCanonicalId:
        bestCandidateId,

      action,

      topCandidates,

      orphanFingerprint: {

        opponents:
          [...oFp.opponents],

        seasons:
          [...oFp.seasons],

        competitions:
          [...oFp.competitions],

        stadiums:
          [...oFp.stadiums],

        managers:
          [...oFp.managers],

        matchSignatures:
          [...oFp.matchSignatures]
      }
    });
  }


  // ==========================================================
  // FINAL OUTPUT
  // ==========================================================

  const output = {

    generatedAt:
      new Date().toISOString(),

    readOnly:
      true,

    pipeline:
      '31l',

    methodology: {

      primarySignature:
        'Opponent + normalized Date',

      fallbackSignature:
        'Opponent + Round + Season + Competition',

      secondaryFallback:
        'Opponent + Season + Competition + Side',

      dateWeight:
        100,

      roundWeight:
        50,

      seasonWeight:
        20,

      opponentWeight:
        10,

      stadiumWeight:
        5,

      managerWeight:
        5,

      highConfidence:
        'Exact date match OR 2+ exact round matches with corroboration',

      mediumConfidence:
        'Exact round match OR multiple historical signatures with corroboration',

      lowConfidence:
        'Opponent overlap without strong signature evidence',

      conflictRule:
        'Comparable candidates within 80% score'
    },

    summary,

    report:
      reportFindings
  };


  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ),
    'utf8'
  );


  // ==========================================================
  // CONSOLE SUMMARY
  // ==========================================================

  console.log(
    '\n============================================================'
  );

  console.log(
    ' PIPELINE 31l COMPLETE'
  );

  console.log(
    '============================================================'
  );

  console.log(
    `HIGH_CONFIDENCE:   ${summary.HIGH_CONFIDENCE} (Exact Date / strong Round proof)`
  );

  console.log(
    `MEDIUM_CONFIDENCE: ${summary.MEDIUM_CONFIDENCE} (Strong historical evidence)`
  );

  console.log(
    `LOW_CONFIDENCE:    ${summary.LOW_CONFIDENCE} (Opponent overlap only)`
  );

  console.log(
    `CONFLICT:          ${summary.CONFLICT} (Comparable candidates within 80%)`
  );

  console.log(
    `UNRESOLVED:        ${summary.UNRESOLVED} (No meaningful overlap)`
  );

  console.log(
    `\n📄 ${OUTPUT_FILE}`
  );

  console.log(
    '🛡️ READ-ONLY: no source/entity files modified.'
  );
}


// ============================================================
// ERROR HANDLING
// ============================================================

main().catch(e => {

  console.error(
    '❌ Pipeline 31l failed:',
    e.stack || e.message
  );

  process.exit(1);
});