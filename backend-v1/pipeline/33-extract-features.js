const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');


// ============================================================
// ZOKASCORE V2 — STEP 33
// CANONICAL ELO FEATURE EXTRACTION
// ============================================================
//
// Source of truth:
//   data/processed/master_with_elo.csv
//
// Output:
//   data/ml/features_elo.csv
//
// CONTRACT:
//
//   Step 33 is a PURE projection of the validated Step 32
//   master_with_elo.csv dataset.
//
// It does NOT:
//   - rebuild historical data
//   - scan historical JSON
//   - resolve team identities
//   - recalculate ELO
//   - use another ELO source
//   - silently drop malformed rows
//   - use a hard-coded row count
//
// Population:
//   Dynamically inherited from the validated Step 32 source.
//
// Every valid Step 32 match must produce exactly one Step 33
// feature row.
// ============================================================


const ROOT = path.join(__dirname, '..');

const SOURCE_FILE = path.join(
  ROOT,
  'data',
  'processed',
  'master_with_elo.csv'
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

const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';


// ============================================================
// SOURCE CONTRACT
// ============================================================

const REQUIRED_COLUMNS = [
  'zokascore_match_id',
  'date',
  'home_team_id',
  'away_team_id',
  'home_score',
  'away_score',
  'home_elo_pre',
  'away_elo_pre'
];

const OUTPUT_COLUMNS = [
  'match_id',
  'date',
  'home_team_id',
  'away_team_id',
  'home_elo_pre',
  'away_elo_pre',
  'elo_diff',
  'target'
];

const VALID_TARGETS = new Set([
  'HOME_WIN',
  'DRAW',
  'AWAY_WIN'
]);


// ============================================================
// HELPERS
// ============================================================

function fail(message) {
  throw new Error(message);
}


function csvEscape(value) {
  const text = String(value ?? '');

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}


function isValidDate(value) {
  if (value == null) return false;

  const text = String(value).trim();

  if (!text) return false;

  return Number.isFinite(
    Date.parse(text)
  );
}


function cleanDate(value) {
  return String(value)
    .split('T')[0]
    .split(' ')[0];
}


function parseFiniteNumber(value) {
  if (value == null) return null;

  const text = String(value).trim();

  if (!text) return null;

  const number = Number(text);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}


function isValidScore(value) {
  const number = parseFiniteNumber(value);

  if (number === null) {
    return false;
  }

  return (
    number >= 0 &&
    Number.isInteger(number)
  );
}


function isValidElo(value) {
  const number = parseFiniteNumber(value);

  return number !== null;
}


function getTarget(homeScore, awayScore) {

  if (homeScore > awayScore) {
    return 'HOME_WIN';
  }

  if (homeScore < awayScore) {
    return 'AWAY_WIN';
  }

  return 'DRAW';
}


// ============================================================
// HEADER VALIDATION
// ============================================================

function validateHeaders(headers) {

  const missing = REQUIRED_COLUMNS.filter(
    column => !headers.includes(column)
  );

  if (missing.length > 0) {

    fail(
      'Missing required Step 32 columns: ' +
      missing.join(', ')
    );
  }
}


// ============================================================
// MAIN PROCESSOR
// ============================================================

function processStream() {

  return new Promise(
    (resolve, reject) => {

      if (!fs.existsSync(SOURCE_FILE)) {

        return reject(
          new Error(
            `Step 32 output not found:\n${SOURCE_FILE}`
          )
        );
      }

      fs.mkdirSync(
        OUTPUT_DIR,
        { recursive: true }
      );

      const readStream =
        fs.createReadStream(
          SOURCE_FILE
        );

      const writeStream =
        fs.createWriteStream(
          TEMP_OUTPUT_FILE,
          { encoding: 'utf8' }
        );


      let headersChecked = false;

      let sourceRows = 0;

      let featureRows = 0;

      let homeWins = 0;

      let draws = 0;

      let awayWins = 0;

      const matchIds = new Set();


      writeStream.write(
        OUTPUT_COLUMNS.join(',') + '\n'
      );


      readStream
        .pipe(csv())

        // ----------------------------------------------------
        // HEADERS
        // ----------------------------------------------------

        .on(
          'headers',
          headers => {

            headersChecked = true;

            validateHeaders(headers);
          }
        )

        // ----------------------------------------------------
        // DATA
        // ----------------------------------------------------

        .on(
          'data',
          row => {

            sourceRows++;

            const matchId =
              String(
                row.zokascore_match_id ?? ''
              ).trim();

            if (!matchId) {

              readStream.destroy(
                new Error(
                  `Missing Match ID at source row ${sourceRows}.`
                )
              );

              return;
            }


            if (matchIds.has(matchId)) {

              readStream.destroy(
                new Error(
                  `Duplicate Match ID detected: ${matchId}`
                )
              );

              return;
            }

            matchIds.add(matchId);


            const homeTeamId =
              String(
                row.home_team_id ?? ''
              ).trim();

            const awayTeamId =
              String(
                row.away_team_id ?? ''
              ).trim();


            if (!homeTeamId) {

              readStream.destroy(
                new Error(
                  `Missing home_team_id for ${matchId}`
                )
              );

              return;
            }


            if (!awayTeamId) {

              readStream.destroy(
                new Error(
                  `Missing away_team_id for ${matchId}`
                )
              );

              return;
            }


            if (homeTeamId === awayTeamId) {

              readStream.destroy(
                new Error(
                  `Self-match detected: ${matchId}`
                )
              );

              return;
            }


            if (!isValidDate(row.date)) {

              readStream.destroy(
                new Error(
                  `Invalid date for ${matchId}: ${row.date}`
                )
              );

              return;
            }


            if (!isValidScore(row.home_score)) {

              readStream.destroy(
                new Error(
                  `Invalid home score for ${matchId}: ${row.home_score}`
                )
              );

              return;
            }


            if (!isValidScore(row.away_score)) {

              readStream.destroy(
                new Error(
                  `Invalid away score for ${matchId}: ${row.away_score}`
                )
              );

              return;
            }


            if (!isValidElo(row.home_elo_pre)) {

              readStream.destroy(
                new Error(
                  `Invalid home ELO for ${matchId}: ${row.home_elo_pre}`
                )
              );

              return;
            }


            if (!isValidElo(row.away_elo_pre)) {

              readStream.destroy(
                new Error(
                  `Invalid away ELO for ${matchId}: ${row.away_elo_pre}`
                )
              );

              return;
            }


            const homeScore =
              parseFiniteNumber(
                row.home_score
              );

            const awayScore =
              parseFiniteNumber(
                row.away_score
              );

            const homeElo =
              parseFiniteNumber(
                row.home_elo_pre
              );

            const awayElo =
              parseFiniteNumber(
                row.away_elo_pre
              );


            const eloDiff =
              homeElo - awayElo;


            const target =
              getTarget(
                homeScore,
                awayScore
              );


            if (!VALID_TARGETS.has(target)) {

              readStream.destroy(
                new Error(
                  `Invalid target generated for ${matchId}`
                )
              );

              return;
            }


            if (target === 'HOME_WIN') {
              homeWins++;
            } else if (target === 'DRAW') {
              draws++;
            } else {
              awayWins++;
            }


            const outputRow = [

              csvEscape(matchId),

              csvEscape(
                cleanDate(row.date)
              ),

              csvEscape(homeTeamId),

              csvEscape(awayTeamId),

              homeElo.toFixed(2),

              awayElo.toFixed(2),

              eloDiff.toFixed(2),

              target

            ].join(',');


            writeStream.write(
              outputRow + '\n'
            );


            featureRows++;
          }
        )

        // ----------------------------------------------------
        // SOURCE END
        // ----------------------------------------------------

        .on(
          'end',
          () => {

            if (!headersChecked) {

              return reject(
                new Error(
                  'CSV was empty or missing headers.'
                )
              );
            }


            if (
              sourceRows !== featureRows
            ) {

              return reject(
                new Error(
                  `Population mismatch: ` +
                  `source=${sourceRows}, ` +
                  `features=${featureRows}`
                )
              );
            }


            writeStream.end(
              () => {

                resolve({
                  sourceRows,
                  featureRows,
                  uniqueIds: matchIds.size,
                  homeWins,
                  draws,
                  awayWins
                });
              }
            );
          }
        )

        // ----------------------------------------------------
        // READ ERROR
        // ----------------------------------------------------

        .on(
          'error',
          err => {

            writeStream.destroy();

            reject(err);
          }
        );


      writeStream.on(
        'error',
        err => {

          readStream.destroy();

          reject(err);
        }
      );
    }
  );
}


// ============================================================
// VERIFY WRITTEN OUTPUT
// ============================================================

function verifyOutput(expectedRows) {

  return new Promise(
    (resolve, reject) => {

      let rowCount = 0;

      let headersChecked = false;

      const matchIds = new Set();


      fs.createReadStream(
        TEMP_OUTPUT_FILE
      )
        .pipe(csv())

        .on(
          'headers',
          headers => {

            headersChecked = true;

            if (
              JSON.stringify(headers) !==
              JSON.stringify(OUTPUT_COLUMNS)
            ) {

              reject(
                new Error(
                  'Output column structure mismatch.'
                )
              );
            }
          }
        )

        .on(
          'data',
          row => {

            rowCount++;

            const matchId =
              String(
                row.match_id ?? ''
              ).trim();


            if (!matchId) {

              reject(
                new Error(
                  'Output contains missing Match ID.'
                )
              );

              return;
            }


            if (matchIds.has(matchId)) {

              reject(
                new Error(
                  `Output contains duplicate Match ID: ${matchId}`
                )
              );

              return;
            }


            matchIds.add(matchId);


            if (
              !VALID_TARGETS.has(
                row.target
              )
            ) {

              reject(
                new Error(
                  `Output contains invalid target: ${row.target}`
                )
              );
            }
          }
        )

        .on(
          'end',
          () => {

            if (!headersChecked) {

              reject(
                new Error(
                  'Output verification failed: missing headers.'
                )
              );

              return;
            }


            if (
              rowCount !== expectedRows
            ) {

              reject(
                new Error(
                  `Output verification failed: ` +
                  `expected ${expectedRows}, ` +
                  `got ${rowCount}.`
                )
              );

              return;
            }


            resolve();
          }
        )

        .on(
          'error',
          reject
        );
    }
  );
}


// ============================================================
// MAIN
// ============================================================

async function main() {

  console.log(
    '============================================================'
  );

  console.log(
    ' ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURES'
  );

  console.log(
    '============================================================\n'
  );


  // ----------------------------------------------------------
  // [1/6] SOURCE CHECK
  // ----------------------------------------------------------

  console.log(
    '[1/6] Checking Step 32 output...'
  );

  if (!fs.existsSync(SOURCE_FILE)) {

    fail(
      `Step 32 output not found:\n${SOURCE_FILE}`
    );
  }

  console.log(
    `   ↳ Source: ${SOURCE_FILE}`
  );


  // ----------------------------------------------------------
  // [2/6] STREAM + VALIDATE + PROJECT
  // ----------------------------------------------------------

  console.log(
    '\n[2/6] Streaming and validating master_with_elo.csv...'
  );

  const stats =
    await processStream();


  // ----------------------------------------------------------
  // [3/6] POPULATION
  // ----------------------------------------------------------

  console.log(
    '\n[3/6] Validating population...'
  );

  if (
    stats.sourceRows !==
    stats.featureRows
  ) {

    fail(
      `Population mismatch: ` +
      `source=${stats.sourceRows}, ` +
      `features=${stats.featureRows}`
    );
  }

  console.log(
    `   ✅ Source rows: ${stats.sourceRows.toLocaleString()}`
  );

  console.log(
    `   ✅ Feature rows: ${stats.featureRows.toLocaleString()}`
  );

  console.log(
    `   ✅ Unique Match IDs: ${stats.uniqueIds.toLocaleString()}`
  );


  // ----------------------------------------------------------
  // [4/6] RESULT ACCOUNTING
  // ----------------------------------------------------------

  console.log(
    '\n[4/6] Validating result accounting...'
  );

  const resultTotal =
    stats.homeWins +
    stats.draws +
    stats.awayWins;


  if (
    resultTotal !==
    stats.sourceRows
  ) {

    fail(
      `Result accounting mismatch: ` +
      `${resultTotal} != ${stats.sourceRows}`
    );
  }

  console.log(
    `   ✅ HOME_WIN: ${stats.homeWins.toLocaleString()}`
  );

  console.log(
    `   ✅ DRAW: ${stats.draws.toLocaleString()}`
  );

  console.log(
    `   ✅ AWAY_WIN: ${stats.awayWins.toLocaleString()}`
  );


  // ----------------------------------------------------------
  // [5/6] OUTPUT VERIFICATION
  // ----------------------------------------------------------

  console.log(
    '\n[5/6] Verifying output file...'
  );

  await verifyOutput(
    stats.featureRows
  );

  console.log(
    '   ✅ Output structure verified.'
  );

  console.log(
    '   ✅ Output population verified.'
  );

  console.log(
    '   ✅ Match IDs verified.'
  );

  console.log(
    '   ✅ Targets verified.'
  );


  // ----------------------------------------------------------
  // [6/6] ATOMIC PUBLISH
  // ----------------------------------------------------------

  console.log(
    '\n[6/6] Publishing features_elo.csv...'
  );

  fs.renameSync(
    TEMP_OUTPUT_FILE,
    OUTPUT_FILE
  );


  // ----------------------------------------------------------
  // FINAL
  // ----------------------------------------------------------

  console.log(
    '\n============================================================'
  );

  console.log(
    ' STEP 33 COMPLETE: PASS'
  );

  console.log(
    '============================================================'
  );

  console.log(
    `📊 Source population:  ${stats.sourceRows.toLocaleString()}`
  );

  console.log(
    `📊 Feature population: ${stats.featureRows.toLocaleString()}`
  );

  console.log(
    `📊 Unique Match IDs:   ${stats.uniqueIds.toLocaleString()}`
  );

  console.log(
    `📊 Home wins:          ${stats.homeWins.toLocaleString()}`
  );

  console.log(
    `📊 Draws:              ${stats.draws.toLocaleString()}`
  );

  console.log(
    `📊 Away wins:          ${stats.awayWins.toLocaleString()}`
  );

  console.log(
    `📁 Features:           ${OUTPUT_FILE}`
  );

  console.log();

  console.log(
    '🔒 No hard-coded population expectation.'
  );

  console.log(
    '🔒 Source population inherited dynamically.'
  );

  console.log(
    '🔒 No rows silently dropped.'
  );

  console.log(
    '🔒 No ELO recalculation.'
  );

  console.log(
    '🔒 No identity resolution.'
  );

  console.log(
    '============================================================'
  );
}


// ============================================================
// ENTRY POINT
// ============================================================

main().catch(
  err => {

    if (
      fs.existsSync(
        TEMP_OUTPUT_FILE
      )
    ) {

      try {
        fs.unlinkSync(
          TEMP_OUTPUT_FILE
        );
      } catch (_) {
        // Ignore cleanup failure.
      }
    }


    console.error(
      '\n============================================================'
    );

    console.error(
      ' ❌ STEP 33 FAILED'
    );

    console.error(
      '============================================================'
    );

    console.error(
      err.message
    );

    console.error(
      '============================================================'
    );

    process.exit(1);
  }
);
