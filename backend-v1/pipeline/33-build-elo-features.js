'use strict';

/*
============================================================
ZOKASCORE V2 — STEP 33
CANONICAL ELO FEATURE EXTRACTION
============================================================

SOURCE OF TRUTH
---------------
data/processed/master_with_elo.csv

OUTPUT
------
data/ml/features_elo.csv

CONTRACT
--------
Step 33 is a PURE projection of the validated Step 32
master_with_elo.csv dataset.

Step 33 DOES NOT:
- rebuild historical data
- scan historical JSON
- resolve team identities
- recalculate ELO
- use another ELO source
- silently drop rows
- repair identities
- modify Step 32
- use a hard-coded population expectation

Every valid Step 32 row must produce exactly one
Step 33 feature row.

============================================================
STEP 32 ACTUAL SCHEMA
============================================================

zokascore_match_id
date
home_team
away_team
home_score
away_score
competition
home_team_id
away_team_id
home_elo_pre
away_elo_pre
home_elo_expected
away_elo_expected
home_elo_delta
away_elo_delta
home_elo_post
away_elo_post
elo_mov_multiplier

============================================================
STEP 33 OUTPUT
============================================================

match_id
date
home_team_id
away_team_id
home_elo_pre
away_elo_pre
elo_diff
target

============================================================
SAFETY
============================================================

- Source is read-only.
- Output is written atomically.
- No source rows are dropped.
- Match IDs must remain unique.
- Team IDs must exist.
- Scores must be valid.
- Dates must be valid.
- Pre-match ELO must be valid.
- Target accounting must equal source population.
- No ELO recalculation.
============================================================
*/

const fs = require('fs');
const path = require('path');

// ============================================================
// PATHS
// ============================================================

const BASE_DIR = path.resolve(__dirname, '..');

const SOURCE_FILE = path.join(
    BASE_DIR,
    'data',
    'processed',
    'master_with_elo.csv'
);

const OUTPUT_DIR = path.join(
    BASE_DIR,
    'data',
    'ml'
);

const OUTPUT_FILE = path.join(
    OUTPUT_DIR,
    'features_elo.csv'
);

const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';

// ============================================================
// CONTRACT
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
// ERROR
// ============================================================

function fail(message) {
    throw new Error(message);
}

// ============================================================
// NUMBER FORMATTING
// ============================================================

function fmt(value) {
    return Number(value).toLocaleString('en-US');
}

// ============================================================
// CSV PARSER
// ============================================================

function parseCSVLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            fields.push(field);
            field = '';
        } else {
            field += char;
        }
    }

    if (inQuotes) {
        fail('Malformed CSV: unterminated quoted field.');
    }

    fields.push(field);

    return fields;
}

function csvEscape(value) {
    if (value === null || value === undefined) {
        return '';
    }

    const stringValue = String(value);

    if (
        stringValue.includes('"') ||
        stringValue.includes(',') ||
        stringValue.includes('\n') ||
        stringValue.includes('\r')
    ) {
        return '"' + stringValue.replace(/"/g, '""') + '"';
    }

    return stringValue;
}

// ============================================================
// DATE VALIDATION
// ============================================================

function parseValidDate(value, rowNumber) {
    const text = String(value ?? '').trim();

    if (!text) {
        fail(
            `Row ${fmt(rowNumber)}: missing date.`
        );
    }

    const date = new Date(text);

    if (Number.isNaN(date.getTime())) {
        fail(
            `Row ${fmt(rowNumber)}: invalid date "${text}".`
        );
    }

    return text;
}

// ============================================================
// INTEGER VALIDATION
// ============================================================

function parseNonNegativeInteger(value, field, rowNumber) {
    const text = String(value ?? '').trim();

    if (!text) {
        fail(
            `Row ${fmt(rowNumber)}: missing ${field}.`
        );
    }

    const number = Number(text);

    if (
        !Number.isFinite(number) ||
        !Number.isInteger(number) ||
        number < 0
    ) {
        fail(
            `Row ${fmt(rowNumber)}: invalid ${field} "${text}".`
        );
    }

    return number;
}

// ============================================================
// ELO VALIDATION
// ============================================================

function parseFiniteNumber(value, field, rowNumber) {
    const text = String(value ?? '').trim();

    if (!text) {
        fail(
            `Row ${fmt(rowNumber)}: missing ${field}.`
        );
    }

    const number = Number(text);

    if (!Number.isFinite(number)) {
        fail(
            `Row ${fmt(rowNumber)}: invalid ${field} "${text}".`
        );
    }

    return number;
}

// ============================================================
// HEADER VALIDATION
// ============================================================

function validateHeader(headerLine) {
    const columns = parseCSVLine(
        headerLine.replace(/^\uFEFF/, '')
    );

    const missing = REQUIRED_COLUMNS.filter(
        column => !columns.includes(column)
    );

    if (missing.length > 0) {
        fail(
            'Step 32 output is missing required columns: ' +
            missing.join(', ')
        );
    }

    return columns;
}

// ============================================================
// TARGET
// ============================================================

function calculateTarget(homeScore, awayScore) {
    if (homeScore > awayScore) {
        return 'HOME_WIN';
    }

    if (homeScore < awayScore) {
        return 'AWAY_WIN';
    }

    return 'DRAW';
}

// ============================================================
// MAIN
// ============================================================

function run() {
    console.log('='.repeat(60));
    console.log(' ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURE EXTRACTION');
    console.log('='.repeat(60));
    console.log();

    // --------------------------------------------------------
    // [1/6] SOURCE CHECK
    // --------------------------------------------------------

    console.log('[1/6] Checking Step 32 output...');

    if (!fs.existsSync(SOURCE_FILE)) {
        fail(
            `Step 32 output not found:\n${SOURCE_FILE}`
        );
    }

    console.log(`   ↳ Source: ${SOURCE_FILE}`);

    // --------------------------------------------------------
    // [2/6] LOAD SOURCE
    // --------------------------------------------------------

    console.log('\n[2/6] Loading master_with_elo.csv...');

    const sourceText = fs.readFileSync(
        SOURCE_FILE,
        'utf8'
    );

    if (!sourceText.trim()) {
        fail('Step 32 dataset is empty.');
    }

    const lines = sourceText.split(/\r?\n/);

    // Remove only the final empty line caused by EOF newline.
    if (
        lines.length > 0 &&
        lines[lines.length - 1] === ''
    ) {
        lines.pop();
    }

    if (lines.length < 2) {
        fail(
            'Step 32 dataset contains no data rows.'
        );
    }

    const header = validateHeader(lines[0]);

    const columnIndex = new Map();

    header.forEach(
        (column, index) => {
            columnIndex.set(column, index);
        }
    );

    const sourceRows = lines.length - 1;

    console.log(
        `   ↳ Rows loaded: ${fmt(sourceRows)}`
    );

    // --------------------------------------------------------
    // [3/6] VALIDATE + EXTRACT
    // --------------------------------------------------------

    console.log(
        '\n[3/6] Strictly validating Step 32 dataset...'
    );

    const seenMatchIds = new Set();

    const featureRows = [];

    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
        const rowNumber = lineIndex + 1;

        const line = lines[lineIndex];

        if (!line.trim()) {
            fail(
                `Row ${fmt(rowNumber)} is unexpectedly empty.`
            );
        }

        const values = parseCSVLine(line);

        if (values.length !== header.length) {
            fail(
                `Row ${fmt(rowNumber)} has ${fmt(values.length)} ` +
                `columns; expected ${fmt(header.length)}.`
            );
        }

        const get = column => {
            return values[columnIndex.get(column)];
        };

        // ----------------------------------------------------
        // Match ID
        // ----------------------------------------------------

        const matchId = String(
            get('zokascore_match_id') ?? ''
        ).trim();

        if (!matchId) {
            fail(
                `Row ${fmt(rowNumber)}: missing/empty ` +
                'zokascore_match_id.'
            );
        }

        if (seenMatchIds.has(matchId)) {
            fail(
                `Row ${fmt(rowNumber)}: duplicate Match ID ` +
                `"${matchId}".`
            );
        }

        seenMatchIds.add(matchId);

        // ----------------------------------------------------
        // Date
        // ----------------------------------------------------

        const date = parseValidDate(
            get('date'),
            rowNumber
        );

        // ----------------------------------------------------
        // Team IDs
        // ----------------------------------------------------

        const homeTeamId = String(
            get('home_team_id') ?? ''
        ).trim();

        const awayTeamId = String(
            get('away_team_id') ?? ''
        ).trim();

        if (!homeTeamId) {
            fail(
                `Row ${fmt(rowNumber)}: missing/empty home_team_id.`
            );
        }

        if (!awayTeamId) {
            fail(
                `Row ${fmt(rowNumber)}: missing/empty away_team_id.`
            );
        }

        if (homeTeamId === awayTeamId) {
            fail(
                `Row ${fmt(rowNumber)}: self-match detected ` +
                `(${homeTeamId}).`
            );
        }

        // ----------------------------------------------------
        // Scores
        // ----------------------------------------------------

        const homeScore = parseNonNegativeInteger(
            get('home_score'),
            'home_score',
            rowNumber
        );

        const awayScore = parseNonNegativeInteger(
            get('away_score'),
            'away_score',
            rowNumber
        );

        // ----------------------------------------------------
        // PRE-MATCH ELO
        // ----------------------------------------------------

        const homeElo = parseFiniteNumber(
            get('home_elo_pre'),
            'home_elo_pre',
            rowNumber
        );

        const awayElo = parseFiniteNumber(
            get('away_elo_pre'),
            'away_elo_pre',
            rowNumber
        );

        // ----------------------------------------------------
        // TARGET
        // ----------------------------------------------------

        const target = calculateTarget(
            homeScore,
            awayScore
        );

        if (!VALID_TARGETS.has(target)) {
            fail(
                `Row ${fmt(rowNumber)}: invalid target "${target}".`
            );
        }

        // ----------------------------------------------------
        // FEATURE ROW
        // ----------------------------------------------------

        const eloDiff = homeElo - awayElo;

        featureRows.push({
            match_id: matchId,
            date,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            home_elo_pre: Number(homeElo.toFixed(2)),
            away_elo_pre: Number(awayElo.toFixed(2)),
            elo_diff: Number(eloDiff.toFixed(2)),
            target
        });

        // ----------------------------------------------------
        // ACCOUNTING
        // ----------------------------------------------------

        if (target === 'HOME_WIN') {
            homeWins++;
        } else if (target === 'DRAW') {
            draws++;
        } else {
            awayWins++;
        }
    }

    console.log(
        `   ✅ Source rows: ${fmt(sourceRows)}`
    );

    console.log(
        `   ✅ Feature rows: ${fmt(featureRows.length)}`
    );

    console.log(
        `   ✅ Unique Match IDs: ${fmt(seenMatchIds.size)}`
    );

    console.log(
        '   ✅ Canonical team IDs present.'
    );

    console.log(
        '   ✅ Dates valid.'
    );

    console.log(
        '   ✅ Scores valid.'
    );

    console.log(
        '   ✅ Pre-match ELO values valid.'
    );

    // --------------------------------------------------------
    // [4/6] RESULT ACCOUNTING
    // --------------------------------------------------------

    console.log(
        '\n[4/6] Validating result accounting...'
    );

    if (featureRows.length !== sourceRows) {
        fail(
            'Feature population mismatch: ' +
            `source=${fmt(sourceRows)}, ` +
            `features=${fmt(featureRows.length)}.`
        );
    }

    const resultTotal =
        homeWins +
        draws +
        awayWins;

    if (resultTotal !== sourceRows) {
        fail(
            'Result accounting mismatch: ' +
            `HOME_WIN=${fmt(homeWins)}, ` +
            `DRAW=${fmt(draws)}, ` +
            `AWAY_WIN=${fmt(awayWins)}, ` +
            `TOTAL=${fmt(resultTotal)}, ` +
            `EXPECTED=${fmt(sourceRows)}.`
        );
    }

    console.log(
        `   ✅ HOME_WIN: ${fmt(homeWins)}`
    );

    console.log(
        `   ✅ DRAW: ${fmt(draws)}`
    );

    console.log(
        `   ✅ AWAY_WIN: ${fmt(awayWins)}`
    );

    // --------------------------------------------------------
    // [5/6] OUTPUT VALIDATION
    // --------------------------------------------------------

    console.log(
        '\n[5/6] Verifying generated feature structure...'
    );

    for (const row of featureRows) {
        for (const column of OUTPUT_COLUMNS) {
            if (
                row[column] === undefined ||
                row[column] === null ||
                row[column] === ''
            ) {
                fail(
                    `Generated feature row for Match ID ` +
                    `"${row.match_id}" is missing "${column}".`
                );
            }
        }

        if (!VALID_TARGETS.has(row.target)) {
            fail(
                `Generated feature row has invalid target ` +
                `"${row.target}".`
            );
        }
    }

    const outputIds = new Set(
        featureRows.map(row => row.match_id)
    );

    if (outputIds.size !== featureRows.length) {
        fail(
            'Generated features contain duplicate Match IDs.'
        );
    }

    if (outputIds.size !== seenMatchIds.size) {
        fail(
            'Output Match ID population differs from source.'
        );
    }

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

    // --------------------------------------------------------
    // [6/6] ATOMIC WRITE
    // --------------------------------------------------------

    console.log(
        '\n[6/6] Publishing features_elo.csv...'
    );

    fs.mkdirSync(
        OUTPUT_DIR,
        { recursive: true }
    );

    const outputStream = fs.createWriteStream(
        TEMP_OUTPUT_FILE,
        {
            encoding: 'utf8'
        }
    );

    outputStream.write(
        OUTPUT_COLUMNS
            .map(csvEscape)
            .join(',') +
        '\n'
    );

    for (const row of featureRows) {
        outputStream.write(
            OUTPUT_COLUMNS
                .map(column => csvEscape(row[column]))
                .join(',') +
            '\n'
        );
    }

    outputStream.end();

    // --------------------------------------------------------
    // WAIT FOR WRITE
    // --------------------------------------------------------

    return new Promise((resolve, reject) => {

        outputStream.on('error', reject);

        outputStream.on('finish', () => {

            try {

                // ------------------------------------------------
                // RELOAD OUTPUT
                // ------------------------------------------------

                const verificationText = fs.readFileSync(
                    TEMP_OUTPUT_FILE,
                    'utf8'
                );

                const verificationLines =
                    verificationText.split(/\r?\n/);

                if (
                    verificationLines.length > 0 &&
                    verificationLines[verificationLines.length - 1] === ''
                ) {
                    verificationLines.pop();
                }

                if (verificationLines.length < 2) {
                    fail(
                        'Generated output is empty.'
                    );
                }

                const outputHeader =
                    parseCSVLine(
                        verificationLines[0]
                    );

                if (
                    outputHeader.length !== OUTPUT_COLUMNS.length ||
                    outputHeader.some(
                        (column, index) =>
                            column !== OUTPUT_COLUMNS[index]
                    )
                ) {
                    fail(
                        'Output reload column structure mismatch.'
                    );
                }

                const outputRows =
                    verificationLines.length - 1;

                if (outputRows !== sourceRows) {
                    fail(
                        'Output reload population mismatch: ' +
                        `source=${fmt(sourceRows)}, ` +
                        `output=${fmt(outputRows)}.`
                    );
                }

                const verificationIds = new Set();

                for (
                    let i = 1;
                    i < verificationLines.length;
                    i++
                ) {
                    const values =
                        parseCSVLine(
                            verificationLines[i]
                        );

                    if (
                        values.length !== OUTPUT_COLUMNS.length
                    ) {
                        fail(
                            `Output row ${fmt(i + 1)} has ` +
                            `${fmt(values.length)} columns; ` +
                            `expected ${fmt(OUTPUT_COLUMNS.length)}.`
                        );
                    }

                    const id = String(
                        values[0] ?? ''
                    ).trim();

                    if (!id) {
                        fail(
                            `Output row ${fmt(i + 1)} has ` +
                            'missing Match ID.'
                        );
                    }

                    if (verificationIds.has(id)) {
                        fail(
                            `Output contains duplicate Match ID "${id}".`
                        );
                    }

                    verificationIds.add(id);

                    const target =
                        String(values[7] ?? '').trim();

                    if (!VALID_TARGETS.has(target)) {
                        fail(
                            `Output row ${fmt(i + 1)} has invalid ` +
                            `target "${target}".`
                        );
                    }
                }

                if (
                    verificationIds.size !==
                    seenMatchIds.size
                ) {
                    fail(
                        'Output Match ID population does not ' +
                        'match source population.'
                    );
                }

                // ------------------------------------------------
                // ATOMIC REPLACEMENT
                // ------------------------------------------------

                fs.renameSync(
                    TEMP_OUTPUT_FILE,
                    OUTPUT_FILE
                );

                resolve();

            } catch (error) {

                reject(error);
            }
        });
    })
    .then(() => {

        // --------------------------------------------------------
        // FINAL
        // --------------------------------------------------------

        console.log();
        console.log('='.repeat(60));
        console.log(' STEP 33 COMPLETE: PASS');
        console.log('='.repeat(60));

        console.log(
            `📊 Source population:  ${fmt(sourceRows)}`
        );

        console.log(
            `📊 Feature population: ${fmt(featureRows.length)}`
        );

        console.log(
            `📊 Unique Match IDs:   ${fmt(seenMatchIds.size)}`
        );

        console.log(
            `📊 Home wins:          ${fmt(homeWins)}`
        );

        console.log(
            `📊 Draws:              ${fmt(draws)}`
        );

        console.log(
            `📊 Away wins:          ${fmt(awayWins)}`
        );

        console.log(
            `📁 Features: ${OUTPUT_FILE}`
        );

        console.log();

        console.log(
            '🔒 No hard-coded population expectation.'
        );

        console.log(
            '🔒 Source population inherited dynamically from Step 32.'
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
            '🔒 Step 32 source remains untouched.'
        );

        console.log('='.repeat(60));
    });
}

// ============================================================
// EXECUTION
// ============================================================

run()
    .catch(error => {

        if (fs.existsSync(TEMP_OUTPUT_FILE)) {
            try {
                fs.unlinkSync(TEMP_OUTPUT_FILE);
            } catch (_) {
                // Ignore cleanup failure.
            }
        }

        console.error();
        console.error('='.repeat(60));
        console.error(' ❌ STEP 33 FAILED');
        console.error('='.repeat(60));
        console.error(error.message);
        console.error('='.repeat(60));

        process.exitCode = 1;
    });