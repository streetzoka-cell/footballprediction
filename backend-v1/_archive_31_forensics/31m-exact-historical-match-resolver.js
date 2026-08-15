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

const INPUT_FILE = path.join(
  AUDIT_DIR,
  'unresolved_orphan_deep_evidence.json'
);

const OUTPUT_FILE = path.join(
  AUDIT_DIR,
  'orphan_exact_match_resolver_report.json'
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

const ALIAS_FILE = path.join(
  ENTITY_DIR,
  'team_alias_map.json'
);

const SOURCE_DIR = path.join(
  ROOT,
  'data',
  'source'
);

const GAMES_CSV = path.join(
  SOURCE_DIR,
  'games.csv'
);

const MATCHES_CSV = path.join(
  SOURCE_DIR,
  'matches.csv'
);

const RESULTS_CSV = path.join(
  SOURCE_DIR,
  'results.csv'
);


// ============================================================
// HELPERS
// ============================================================

function loadJson(file) {
  try {
    return JSON.parse(
      fs.readFileSync(file, 'utf8')
    );
  } catch {
    return null;
  }
}


function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeDate(value) {
  if (!value) return null;

  const s = String(value).trim();

  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);

  if (iso) {
    return iso[1];
  }

  const dmy = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})/
  );

  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  return s;
}


function normalizeRound(value) {
  return normalize(value);
}


function normalizeCompetition(value) {
  return normalize(value);
}


function readCsv(file, onRow) {
  return new Promise((resolve, reject) => {

    if (!fs.existsSync(file)) {
      return resolve(0);
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
          // Intentionally ignore malformed individual rows.
        }
      })
      .on('end', () => resolve(count))
      .on('error', reject);
  });
}


function addToMapSet(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }

  map.get(key).push(value);
}


function unique(values) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map(String)
    )
  ];
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  const report = loadJson(REPORT_FILE);
  const deepEvidence = loadJson(INPUT_FILE);
  const canonical = loadJson(CANONICAL_FILE) || [];
  const aliasMap = loadJson(ALIAS_FILE) || {};

  if (
    !report?.informational_findings?.orphan_team_ids
  ) {
    throw new Error(
      'orphan_team_ids not found in v2_integrity_report.json'
    );
  }

  if (!deepEvidence?.evidence) {
    throw new Error(
      'Missing unresolved_orphan_deep_evidence.json'
    );
  }


  console.log(
    '🔍 Pipeline 31m — Exact Historical Match Resolver'
  );

  console.log(
    '============================================================\n'
  );


  // ==========================================================
  // 1. CANONICAL ENTITY INDEXES
  // ==========================================================

  const canonicalSet = new Set(
    canonical.map(c =>
      String(c.canonical_id)
    )
  );


  const primaryLookup = new Map();

  for (const team of canonical) {

    const id = String(
      team.canonical_id
    );

    const names = [
      team.primary_name,
      team.name,
      team.team_name
    ];

    for (const name of names) {

      const n = normalize(name);

      if (n) {
        primaryLookup.set(n, id);
      }
    }
  }


  const aliasLookup = new Map();

  for (
    const [name, id] of Object.entries(aliasMap)
  ) {

    const normalizedName = normalize(name);

    if (
      normalizedName &&
      canonicalSet.has(String(id))
    ) {
      aliasLookup.set(
        normalizedName,
        String(id)
      );
    }
  }


  const orphans =
    report
      .informational_findings
      .orphan_team_ids
      .map(String)
      .filter(id => /^\d+$/.test(id));


  const orphanSet = new Set(orphans);


  console.log(
    `🎯 Orphans: ${orphans.length}`
  );

  console.log(
    `🏛️ Canonical teams: ${canonical.length}\n`
  );


  // ==========================================================
  // 2. BUILD AUTHORITATIVE GAMES INDEX
  //
  // We index EVERY game, not just canonical games.
  //
  // This is important because an orphan can appear in games.csv
  // while its name is missing.
  // ==========================================================

  const gamesByDate = new Map();

  const gamesByOpponentDate = new Map();

  let gamesScanned = 0;


  console.log(
    '🔎 Indexing games.csv...'
  );


  await readCsv(
    GAMES_CSV,
    row => {

      gamesScanned++;

      const date =
        normalizeDate(row.date);

      if (!date) return;


      const homeId =
        String(row.home_club_id || '').trim();

      const awayId =
        String(row.away_club_id || '').trim();


      if (!homeId || !awayId) return;


      const game = {
        gameId: String(row.game_id || ''),
        date,

        season: String(
          row.season || ''
        ).trim(),

        round: String(
          row.round || ''
        ).trim(),

        competitionId: String(
          row.competition_id || ''
        ).trim(),

        competitionType: String(
          row.competition_type || ''
        ).trim(),

        homeId,
        awayId,

        homeName: String(
          row.home_club_name || ''
        ).trim(),

        awayName: String(
          row.away_club_name || ''
        ).trim(),

        stadium: String(
          row.stadium || ''
        ).trim(),

        homeManager: String(
          row.home_club_manager_name || ''
        ).trim(),

        awayManager: String(
          row.away_club_manager_name || ''
        ).trim()
      };


      addToMapSet(
        gamesByDate,
        date,
        game
      );


      // Index from BOTH sides.
      //
      // date + teamId
      //
      // This allows us to retrieve the exact game
      // for an orphan immediately.

      addToMapSet(
        gamesByOpponentDate,
        `${date}|${homeId}`,
        game
      );

      addToMapSet(
        gamesByOpponentDate,
        `${date}|${awayId}`,
        game
      );
    }
  );


  console.log(
    `✅ games.csv rows scanned: ${gamesScanned}`
  );

  console.log(
    `📅 Indexed dates: ${gamesByDate.size}\n`
  );


  // ==========================================================
  // 3. SECONDARY DATASET INDEX
  //
  // matches.csv / results.csv are corroboration only.
  // ==========================================================

  const secondaryMatches = new Map();


  console.log(
    '🔎 Indexing matches.csv...'
  );


  let matchesRows = 0;

  await readCsv(
    MATCHES_CSV,
    row => {

      matchesRows++;

      const date =
        normalizeDate(row.date);

      if (!date) return;


      const homeName =
        normalize(row.home_club_name);

      const awayName =
        normalize(row.away_club_name);


      if (
        !homeName &&
        !awayName
      ) {
        return;
      }


      const entry = {
        source: 'matches.csv',
        date,

        homeName:
          String(row.home_club_name || '').trim(),

        awayName:
          String(row.away_club_name || '').trim(),

        homeId:
          String(row.home_club_id || '').trim(),

        awayId:
          String(row.away_club_id || '').trim(),

        season:
          String(row.season || '').trim(),

        round:
          String(row.round || '').trim(),

        competitionId:
          String(row.competition_id || '').trim()
      };


      if (homeName) {
        addToMapSet(
          secondaryMatches,
          `${date}|${homeName}`,
          entry
        );
      }

      if (awayName) {
        addToMapSet(
          secondaryMatches,
          `${date}|${awayName}`,
          entry
        );
      }
    }
  );


  console.log(
    `✅ matches.csv rows scanned: ${matchesRows}`
  );


  console.log(
    '🔎 Indexing results.csv...'
  );


  let resultsRows = 0;

  await readCsv(
    RESULTS_CSV,
    row => {

      resultsRows++;

      const date =
        normalizeDate(row.date);

      if (!date) return;


      const homeName =
        normalize(row.home_team);

      const awayName =
        normalize(row.away_team);


      const entry = {
        source: 'results.csv',
        date,

        homeName:
          String(row.home_team || '').trim(),

        awayName:
          String(row.away_team || '').trim(),

        homeId: '',
        awayId: '',

        season:
          String(row.season || '').trim(),

        round:
          String(row.round || '').trim(),

        competitionId:
          String(row.competition_id || '').trim()
      };


      if (homeName) {
        addToMapSet(
          secondaryMatches,
          `${date}|${homeName}`,
          entry
        );
      }

      if (awayName) {
        addToMapSet(
          secondaryMatches,
          `${date}|${awayName}`,
          entry
        );
      }
    }
  );


  console.log(
    `✅ results.csv rows scanned: ${resultsRows}\n`
  );


  // ==========================================================
  // 4. EXACT ORPHAN RESOLUTION
  // ==========================================================

  console.log(
    '🔎 Resolving orphan historical identities...\n'
  );


  const summary = {
    HIGH_CONFIDENCE: 0,
    MEDIUM_CONFIDENCE: 0,
    LOW_CONFIDENCE: 0,
    CONFLICT: 0,
    UNRESOLVED: 0
  };


  const reportFindings = [];


  for (const orphanId of orphans) {

    const orphanGames =
      gamesByOpponentDate.get(
        `${orphanId}|${orphanId}`
      );


    /*
     * The actual key is date|teamId, so we need to
     * search all dates for this orphan.
     */

    const exactGames = [];

    for (
      const [key, games] of gamesByOpponentDate.entries()
    ) {

      if (
        key.endsWith(`|${orphanId}`)
      ) {
        exactGames.push(...games);
      }
    }


    const uniqueGames = [
      ...new Map(
        exactGames.map(game => [
          game.gameId,
          game
        ])
      ).values()
    ];


    const candidates = new Map();

    const orphanEvidence = [];


    // ========================================================
    // PROCESS EVERY ORPHAN GAME
    // ========================================================

    for (const game of uniqueGames) {

      const isHome =
        game.homeId === orphanId;

      const opponentId =
        isHome
          ? game.awayId
          : game.homeId;

      const opponentName =
        isHome
          ? game.awayName
          : game.homeName;


      const opponentCanonical =
        canonicalSet.has(opponentId);


      const opponentCanonicalByName =
        primaryLookup.get(
          normalize(opponentName)
        ) ||
        aliasLookup.get(
          normalize(opponentName)
        );


      const canonicalOpponentId =
        opponentCanonical
          ? opponentId
          : opponentCanonicalByName || null;


      // ======================================================
      // If opponent itself is not canonical, this match
      // cannot provide absolute identity proof yet.
      // ======================================================

      if (!canonicalOpponentId) {

        orphanEvidence.push({
          gameId: game.gameId,
          date: game.date,
          opponentId,
          opponentName,
          competitionId: game.competitionId,
          round: game.round,
          side: isHome ? 'home' : 'away',
          status: 'OPPONENT_NOT_CANONICAL'
        });

        continue;
      }


      // ======================================================
      // SECONDARY NAME CORROBORATION
      // ======================================================

      const normalizedOpponent =
        normalize(opponentName);


      const secondary =
        normalizedOpponent
          ? secondaryMatches.get(
              `${game.date}|${normalizedOpponent}`
            ) || []
          : [];


      // ======================================================
      // We now search secondary datasets for the
      // OTHER team's identity.
      // ======================================================

      const candidateNames = new Map();


      for (const entry of secondary) {

        const homeIsOpponent =
          normalize(entry.homeName) ===
          normalizedOpponent;

        const otherName =
          homeIsOpponent
            ? entry.awayName
            : entry.homeName;

        if (!otherName) continue;


        const normalizedOther =
          normalize(otherName);


        let candidateId =
          primaryLookup.get(
            normalizedOther
          ) ||
          aliasLookup.get(
            normalizedOther
          );


        // If the secondary dataset itself gives
        // a canonical ID, prefer it.
        const directOtherId =
          homeIsOpponent
            ? entry.awayId
            : entry.homeId;


        if (
          directOtherId &&
          canonicalSet.has(directOtherId)
        ) {
          candidateId = directOtherId;
        }


        if (!candidateId) {
          continue;
        }


        if (!candidates.has(candidateId)) {

          candidates.set(
            candidateId,
            {
              exactGameCount: 0,
              secondarySources: new Set(),
              names: new Set(),
              dates: new Set(),
              competitions: new Set(),
              rounds: new Set()
            }
          );
        }


        const candidate =
          candidates.get(candidateId);


        candidate.exactGameCount++;

        candidate.secondarySources.add(
          entry.source
        );

        candidate.names.add(
          otherName
        );

        candidate.dates.add(
          game.date
        );

        if (game.competitionId) {
          candidate.competitions.add(
            game.competitionId
          );
        }

        if (game.round) {
          candidate.rounds.add(
            game.round
          );
        }
      }


      // ======================================================
      // ALSO inspect canonical IDs directly from secondary
      // records when available.
      // ======================================================

      for (const entry of secondary) {

        const entryIds = [
          entry.homeId,
          entry.awayId
        ]
          .filter(Boolean)
          .filter(id =>
            canonicalSet.has(id)
          );


        for (const candidateId of entryIds) {

          // We don't want the known opponent itself.
          if (
            candidateId === canonicalOpponentId
          ) {
            continue;
          }


          if (!candidates.has(candidateId)) {

            candidates.set(
              candidateId,
              {
                exactGameCount: 0,
                secondarySources: new Set(),
                names: new Set(),
                dates: new Set(),
                competitions: new Set(),
                rounds: new Set()
              }
            );
          }


          const candidate =
            candidates.get(candidateId);


          candidate.exactGameCount++;

          candidate.secondarySources.add(
            entry.source
          );

          candidate.dates.add(
            game.date
          );

          if (game.competitionId) {
            candidate.competitions.add(
              game.competitionId
            );
          }

          if (game.round) {
            candidate.rounds.add(
              game.round
            );
          }
        }
      }


      orphanEvidence.push({
        gameId: game.gameId,
        date: game.date,
        season: game.season,
        round: game.round,
        competitionId: game.competitionId,
        stadium: game.stadium,
        orphanSide:
          isHome ? 'home' : 'away',
        opponentId,
        opponentName,
        canonicalOpponentId,
        status: 'CANONICAL_OPPONENT_CONFIRMED'
      });
    }


    // ========================================================
    // 5. RANK CANDIDATES
    // ========================================================

    const rankedCandidates = [
      ...candidates.entries()
    ]
      .map(([candidateId, data]) => {

        let score = 0;

        score +=
          data.exactGameCount * 100;

        score +=
          data.secondarySources.size * 25;

        score +=
          data.dates.size * 20;

        score +=
          data.competitions.size * 10;

        score +=
          data.rounds.size * 10;


        return {
          candidateId,
          score,

          evidence: {
            exactGameCount:
              data.exactGameCount,

            secondarySources:
              [...data.secondarySources],

            names:
              [...data.names],

            dates:
              [...data.dates],

            competitions:
              [...data.competitions],

            rounds:
              [...data.rounds]
          }
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score
      );


    // ========================================================
    // 6. CLASSIFICATION
    // ========================================================

    let classification =
      'UNRESOLVED';

    let confidence = 0;

    let candidateCanonicalId =
      null;

    let action =
      'HOLD_FOR_REVIEW';

    const reasons = [];


    if (
      rankedCandidates.length === 1
    ) {

      const best =
        rankedCandidates[0];

      candidateCanonicalId =
        best.candidateId;


      /*
       * The critical proof:
       *
       * orphan appears in an exact historical match
       * against a canonical opponent, while a secondary
       * historical source identifies the other participant.
       */

      if (
        best.evidence.exactGameCount >= 1 &&
        best.evidence.secondarySources.length >= 1
      ) {

        classification =
          'HIGH_CONFIDENCE';

        confidence =
          0.99;

        action =
          'CANDIDATE_FOR_MAPPING';

        reasons.push(
          'Exact historical match identified against a canonical opponent.'
        );

        reasons.push(
          `Canonical candidate uniquely identified as ${candidateCanonicalId}.`
        );

        reasons.push(
          `Corroborated by ${best.evidence.secondarySources.join(', ')}.`
        );

      } else {

        classification =
          'MEDIUM_CONFIDENCE';

        confidence =
          0.75;

        action =
          'MANUAL_REVIEW_REQUIRED';

        reasons.push(
          'Historical match evidence exists, but independent name/identity corroboration is incomplete.'
        );
      }

    } else if (
      rankedCandidates.length > 1
    ) {

      const first =
        rankedCandidates[0];

      const second =
        rankedCandidates[1];


      /*
       * A real conflict requires genuinely comparable
       * candidate evidence.
       */

      if (
        first.score > 0 &&
        second.score / first.score >= 0.80
      ) {

        classification =
          'CONFLICT';

        confidence =
          0;

        action =
          'MANUAL_REVIEW_REQUIRED';

        reasons.push(
          `Multiple canonical candidates have comparable exact-match evidence: ${first.candidateId}, ${second.candidateId}.`
        );

      } else {

        classification =
          'HIGH_CONFIDENCE';

        confidence =
          0.95;

        candidateCanonicalId =
          first.candidateId;

        action =
          'CANDIDATE_FOR_MAPPING';

        reasons.push(
          'Strongest exact historical candidate clearly outranks alternatives.'
        );
      }

    } else {

      /*
       * We still distinguish between:
       *
       * 1. orphan has games but no resolvable identity
       * 2. orphan has no games at all.
       */

      if (uniqueGames.length > 0) {

        classification =
          'LOW_CONFIDENCE';

        confidence =
          0.25;

        action =
          'HOLD_FOR_REVIEW';

        reasons.push(
          'Historical appearances exist, but no unique canonical identity could be established.'
        );

      } else {

        classification =
          'UNRESOLVED';

        confidence =
          0;

        action =
          'HOLD_FOR_REVIEW';

        reasons.push(
          'No historical games found for orphan.'
        );
      }
    }


    summary[classification] =
      (summary[classification] || 0) + 1;


    reportFindings.push({

      orphanId,

      orphanGameCount:
        uniqueGames.length,

      classification,

      confidence,

      candidateCanonicalId,

      action,

      reasons,

      candidates:
        rankedCandidates.slice(0, 5),

      historicalEvidence:
        orphanEvidence
    });
  }


  // ==========================================================
  // 7. OUTPUT
  // ==========================================================

  const output = {

    generatedAt:
      new Date().toISOString(),

    readOnly:
      true,

    pipeline:
      '31m',

    methodology: {

      primarySource:
        'games.csv',

      secondarySources: [
        'matches.csv',
        'results.csv'
      ],

      exactIdentityKey: [
        'date',
        'canonical opponent',
        'competition',
        'round',
        'side'
      ],

      sourceFilesModified:
        false
    },

    scanned: {

      gamesCsvRows:
        gamesScanned,

      matchesCsvRows:
        matchesRows,

      resultsCsvRows:
        resultsRows,

      orphanTeams:
        orphans.length,

      canonicalTeams:
        canonical.length
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
  // 8. CONSOLE REPORT
  // ==========================================================

  console.log(
    '============================================================'
  );

  console.log(
    ' PIPELINE 31m COMPLETE'
  );

  console.log(
    '============================================================'
  );

  console.log(
    `HIGH_CONFIDENCE:   ${summary.HIGH_CONFIDENCE} (Exact historical identity)`
  );

  console.log(
    `MEDIUM_CONFIDENCE: ${summary.MEDIUM_CONFIDENCE} (Strong but incomplete evidence)`
  );

  console.log(
    `LOW_CONFIDENCE:    ${summary.LOW_CONFIDENCE} (Historical match, identity unresolved)`
  );

  console.log(
    `CONFLICT:          ${summary.CONFLICT} (Comparable canonical candidates)`
  );

  console.log(
    `UNRESOLVED:        ${summary.UNRESOLVED} (No usable historical evidence)`
  );

  console.log(
    `\n📄 ${OUTPUT_FILE}`
  );

  console.log(
    '🛡️ READ-ONLY: no source/entity files modified.'
  );
}


main().catch(error => {

  console.error(
    '❌ Pipeline 31m failed:',
    error.stack || error.message
  );

  process.exit(1);
});