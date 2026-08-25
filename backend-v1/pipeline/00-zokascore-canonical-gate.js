'use strict';

/**
 * ============================================================
 * 00-zokascore-canonical-gate.js
 * ZOKASCORE V2 — FINAL CANONICAL DATA GATE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Audit ZOKASCORE_FINAL without modifying canonical data.
 *
 * SAFETY RULES
 * ------------
 * 1. Canonical files are NEVER modified.
 * 2. No automatic repairs.
 * 3. No fuzzy matching.
 * 4. No invented identities.
 * 5. Dynamic baselines update ONLY when the gate PASSES.
 * 6. Empty optional FK values are WARNINGS, not false failures.
 * 7. Non-empty invalid FK values remain hard failures.
 * 8. Orphan match references are warnings because historical /
 *    source-layer reconciliation may legitimately leave some
 *    references unresolved at this stage.
 * 9. Duplicate identities remain hard failures.
 * 10. Possible semantic duplicates are reported for review,
 *     never automatically removed.
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(
    __dirname,
    '..',
    'data',
    'source',
    'ZOKASCORE_FINAL'
);

const AUDIT_DIR = path.join(
    __dirname,
    '..',
    'data_audit',
    'canonical_gate'
);

const BASELINE_FILE = path.join(
    AUDIT_DIR,
    'baseline_counts.json'
);

const FILES = {
    MASTER: 'ZOKASCORE_PUBLIC_MASTER.csv',
    COMPETITIONS: 'ZOKASCORE_COMPETITIONS.csv',
    TEAMS: 'ZOKASCORE_TEAMS.csv',
    PLAYERS: 'ZOKASCORE_PLAYERS.csv',
    APPEARANCES: 'ZOKASCORE_APPEARANCES.csv',
    EVENTS: 'ZOKASCORE_EVENTS.csv',
    RATINGS: 'ZOKASCORE_RATINGS.csv'
};

/*
 * IMPORTANT:
 * These schemas reflect the ACTUAL canonical files currently
 * present in ZOKASCORE_FINAL.
 */
const REQUIRED_COLUMNS = {
    MASTER: [
        'zokascore_match_id',
        'match_id',
        'date',
        'home_team',
        'away_team',
        'competition',
        'home_score',
        'away_score'
    ],

    COMPETITIONS: [
        'zokascore_competition_id',
        'canonical_name',
        'normalized_name',
        'competition_type',
        'match_count'
    ],

    TEAMS: [
        'zokascore_team_id',
        'canonical_name',
        'country',
        'stadium'
    ],

    PLAYERS: [
        'zokascore_player_id',
        'canonical_name',
        'country_of_birth',
        'date_of_birth',
        'position',
        'sub_position',
        'foot',
        'height_in_cm',
        'current_zokascore_team_id'
    ],

    APPEARANCES: [
        'zokascore_appearance_id',
        'zokascore_match_id',
        'zokascore_player_id',
        'zokascore_team_id',
        'goals',
        'assists',
        'minutes_played',
        'yellow_cards',
        'red_cards'
    ],

    EVENTS: [
        'zokascore_event_id',
        'zokascore_match_id',
        'zokascore_player_id',
        'zokascore_team_id',
        'zokascore_player_in_id',
        'event_type',
        'minute',
        'extra_minute',
        'player_name',
        'assist',
        'team_name',
        'description',
        'score',
        'penalty',
        'own_goal'
    ],

    RATINGS: [
        'zokascore_rating_id',
        'zokascore_team_id',
        'date',
        'rating_source',
        'rating_value',
        'rank',
        'country'
    ]
};

let gatePassed = true;
const issues = [];
const warnings = [];

/*
 * Load baseline without mutating it.
 *
 * IMPORTANT:
 * The baseline is only committed to disk AFTER the complete
 * gate passes.
 */
let baselines = {};

if (fs.existsSync(BASELINE_FILE)) {
    try {
        baselines = JSON.parse(
            fs.readFileSync(BASELINE_FILE, 'utf8')
        );
    } catch (error) {
        fail(
            `Unable to read baseline file: ${error.message}`
        );
    }
}

const proposedBaselines = {
    ...baselines
};

const log = (msg) =>
    console.log(`[ZK-GATE] ${msg}`);

const warn = (msg) => {
    console.warn(`[ZK-GATE-WARN] ${msg}`);
    warnings.push(msg);
};

function fail(msg) {
    console.error(`[ZK-GATE-FAIL] ${msg}`);
    gatePassed = false;
    issues.push(msg);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function filePath(filename) {
    return path.join(DATA_DIR, filename);
}

function fileExists(filename) {
    return fs.existsSync(filePath(filename));
}

function isBlank(value) {
    return (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    );
}

function normalize(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .trim()
        .toLowerCase();
}

function clean(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[.'’’""]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(value) {
    return clean(value).replace(/\s+/g, '');
}

function normalizeDate(value) {
    const v = String(value ?? '').trim();

    if (!v) {
        return '';
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return v;
    }

    const m = v.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (m) {
        return `${m[1]}-${m[2]}-${m[3]}`;
    }

    return v;
}

function buildKey(date, home, away) {
    return [
        normalizeDate(date),
        compact(home),
        compact(away)
    ].join('|');
}

function buildReverseKey(date, home, away) {
    return [
        normalizeDate(date),
        compact(away),
        compact(home)
    ].join('|');
}

function parseYear(dateValue) {
    if (!dateValue) {
        return null;
    }

    const match = String(dateValue)
        .trim()
        .match(/^(\d{4})/);

    if (!match) {
        return null;
    }

    const year = Number(match[1]);

    return Number.isInteger(year)
        ? year
        : null;
}

function isValidDate(value) {
    if (isBlank(value)) {
        return false;
    }

    const text = String(value).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return false;
    }

    const date = new Date(`${text}T00:00:00Z`);

    if (Number.isNaN(date.getTime())) {
        return false;
    }

    return (
        date.toISOString().substring(0, 10) === text
    );
}

function readHeaders(filename) {
    return new Promise((resolve, reject) => {
        const fullPath = filePath(filename);

        if (!fs.existsSync(fullPath)) {
            fail(`Missing file: ${filename}`);
            return resolve(null);
        }

        let finished = false;

        const stream = fs
            .createReadStream(fullPath)
            .pipe(csv());

        stream.on('headers', (headers) => {
            if (finished) {
                return;
            }

            finished = true;

            resolve(
                headers.map((h) =>
                    String(h)
                        .replace(/^\uFEFF/, '')
                        .trim()
                )
            );

            stream.destroy();
        });

        stream.on('error', reject);

        stream.on('end', () => {
            if (!finished) {
                resolve([]);
            }
        });
    });
}

async function verifySchema(key, filename) {
    log(`Checking schema: ${filename}`);

    const headers = await readHeaders(filename);

    if (!headers) {
        return false;
    }

    const required = REQUIRED_COLUMNS[key];

    const missing = required.filter(
        column => !headers.includes(column)
    );

    if (missing.length > 0) {
        fail(
            `${filename} missing required columns: ${missing.join(', ')}`
        );

        return false;
    }

    log(
        `✅ ${filename} schema verified (${headers.length} columns)`
    );

    return true;
}

function streamCsv(filename, onRow) {
    return new Promise((resolve, reject) => {
        const fullPath = filePath(filename);

        if (!fs.existsSync(fullPath)) {
            fail(`Missing file: ${filename}`);
            return resolve(null);
        }

        let rowCount = 0;

        const stream = fs
            .createReadStream(fullPath)
            .pipe(csv());

        stream.on('data', (row) => {
            rowCount++;

            try {
                onRow(row, rowCount);
            } catch (error) {
                stream.destroy(error);
            }
        });

        stream.on('end', () => {
            resolve(rowCount);
        });

        stream.on('error', reject);
    });
}

/*
 * Dynamic count checker.
 *
 * A count decrease is a hard failure.
 * A count increase is only proposed.
 * The proposal is committed ONLY if the entire gate passes.
 */
function checkDynamicCount(key, count) {
    const baseline = baselines[key] || 0;

    if (count < baseline) {
        fail(
            `${key} count DROPPED: found ${count.toLocaleString()}, expected at least ${baseline.toLocaleString()}`
        );

        return;
    }

    if (count > baseline) {
        log(
            `${key} count GREW: found ${count.toLocaleString()} (was ${baseline.toLocaleString()}).`
        );

        proposedBaselines[key] = count;

        return;
    }

    log(
        `✅ ${key} count stable at ${count.toLocaleString()} rows.`
    );
}

async function verifyEntityFile(
    key,
    filename,
    idColumn
) {
    log(`\nVerifying ${key}...`);

    if (!fileExists(filename)) {
        fail(`Missing ${filename}`);
        return null;
    }

    const schemaOK = await verifySchema(
        key,
        filename
    );

    if (!schemaOK) {
        return null;
    }

    const ids = new Set();

    let duplicateIds = 0;
    let blankIds = 0;

    const duplicateSamples = [];

    const count = await streamCsv(
        filename,
        (row) => {
            const id = String(
                row[idColumn] || ''
            ).trim();

            if (!id) {
                blankIds++;

                if (blankIds <= 10) {
                    warn(
                        `${filename}: blank ${idColumn} encountered`
                    );
                }

                return;
            }

            if (ids.has(id)) {
                duplicateIds++;

                if (
                    duplicateSamples.length < 10
                ) {
                    duplicateSamples.push(id);
                }
            } else {
                ids.add(id);
            }
        }
    );

    if (count === null) {
        return null;
    }

    log(
        `${key} rows: ${count.toLocaleString()}`
    );

    checkDynamicCount(key, count);

    if (blankIds > 0) {
        fail(
            `${key} contains ${blankIds.toLocaleString()} blank ${idColumn} values`
        );
    }

    if (duplicateIds > 0) {
        fail(
            `${key} contains ${duplicateIds.toLocaleString()} duplicate ${idColumn} occurrences`
        );

        log(
            `Duplicate ${idColumn} samples: ${duplicateSamples.join(', ')}`
        );
    }

    log(
        `✅ ${key}: ${ids.size.toLocaleString()} unique IDs`
    );

    return {
        count,
        uniqueIds: ids.size,
        duplicateIds,
        blankIds,
        ids
    };
}

async function verifyMaster() {
    const filename = FILES.MASTER;
    const key = 'MASTER';

    log('\n============================================================');
    log('VERIFYING MASTER');
    log('============================================================');

    if (!fileExists(filename)) {
        fail(`Missing MASTER file: ${filename}`);
        return null;
    }

    const schemaOK = await verifySchema(
        key,
        filename
    );

    if (!schemaOK) {
        return null;
    }

    let masterCount = 0;

    let blankMatchIds = 0;
    let duplicateMatchIds = 0;

    let blankDates = 0;
    let invalidDates = 0;

    let blankHomeTeams = 0;
    let blankAwayTeams = 0;
    let blankCompetitions = 0;

    let blankHomeScores = 0;
    let blankAwayScores = 0;

    let minYear = Infinity;
    let maxYear = -Infinity;

    const matchIds = new Set();

    const directMetaIndex = new Map();
    const reverseMetaIndex = new Map();

    const duplicateMatchIdSamples = [];

    const duplicateMatchKeys = new Map();

    const possibleDuplicateSamples = [];

    await streamCsv(
        filename,
        (row) => {
            masterCount++;

            const matchId = String(
                row.zokascore_match_id || ''
            ).trim();

            if (!matchId) {
                blankMatchIds++;
            } else if (matchIds.has(matchId)) {
                duplicateMatchIds++;

                if (
                    duplicateMatchIdSamples.length < 10
                ) {
                    duplicateMatchIdSamples.push(
                        matchId
                    );
                }
            } else {
                matchIds.add(matchId);

                const dKey = buildKey(
                    row.date,
                    row.home_team,
                    row.away_team
                );

                const rKey = buildReverseKey(
                    row.date,
                    row.home_team,
                    row.away_team
                );

                if (!directMetaIndex.has(dKey)) {
                    directMetaIndex.set(
                        dKey,
                        matchId
                    );
                }

                if (!reverseMetaIndex.has(rKey)) {
                    reverseMetaIndex.set(
                        rKey,
                        matchId
                    );
                }
            }

            const date = String(
                row.date || ''
            ).trim();

            if (!date) {
                blankDates++;
            } else {
                if (!isValidDate(date)) {
                    invalidDates++;
                }

                const year = parseYear(date);

                if (year !== null) {
                    minYear = Math.min(
                        minYear,
                        year
                    );

                    maxYear = Math.max(
                        maxYear,
                        year
                    );
                }
            }

            const home = String(
                row.home_team || ''
            ).trim();

            const away = String(
                row.away_team || ''
            ).trim();

            if (!home) {
                blankHomeTeams++;
            }

            if (!away) {
                blankAwayTeams++;
            }

            const competition = String(
                row.competition || ''
            ).trim();

            if (!competition) {
                blankCompetitions++;
            }

            if (isBlank(row.home_score)) {
                blankHomeScores++;
            }

            if (isBlank(row.away_score)) {
                blankAwayScores++;
            }

            if (date && home && away) {
                const keyValue = [
                    normalize(date),
                    normalize(home),
                    normalize(away)
                ].join('|');

                if (
                    !duplicateMatchKeys.has(
                        keyValue
                    )
                ) {
                    duplicateMatchKeys.set(
                        keyValue,
                        {
                            count: 1,
                            rows: [
                                {
                                    matchId,
                                    date,
                                    home,
                                    away
                                }
                            ]
                        }
                    );
                } else {
                    const group =
                        duplicateMatchKeys.get(
                            keyValue
                        );

                    group.count++;

                    if (group.rows.length < 5) {
                        group.rows.push({
                            matchId,
                            date,
                            home,
                            away
                        });
                    }
                }
            }
        }
    );

    let possibleDuplicateGroups = 0;
    let possibleDuplicateRows = 0;

    for (
        const [keyValue, group]
        of duplicateMatchKeys.entries()
    ) {
        if (group.count > 1) {
            possibleDuplicateGroups++;
            possibleDuplicateRows += group.count;

            if (
                possibleDuplicateSamples.length < 20
            ) {
                possibleDuplicateSamples.push({
                    key: keyValue,
                    count: group.count,
                    rows: group.rows
                });
            }
        }
    }

    log(
        `MASTER rows: ${masterCount.toLocaleString()}`
    );

    checkDynamicCount(
        key,
        masterCount
    );

    log(
        `MASTER unique match IDs: ${matchIds.size.toLocaleString()}`
    );

    if (blankMatchIds > 0) {
        fail(
            `MASTER contains ${blankMatchIds.toLocaleString()} blank match IDs`
        );
    }

    if (duplicateMatchIds > 0) {
        fail(
            `MASTER contains ${duplicateMatchIds.toLocaleString()} duplicate match ID occurrences`
        );

        log(
            `Duplicate match ID samples: ${duplicateMatchIdSamples.join(', ')}`
        );
    }

    log(
        `MASTER date range: ${minYear} to ${maxYear}`
    );

    const currentYear =
        new Date().getFullYear();

    if (
        minYear < 1872 ||
        maxYear > currentYear + 1
    ) {
        fail(
            `MASTER date bounds outside expected range 1872-${currentYear + 1}`
        );
    }

    if (blankDates > 0) {
        fail(
            `MASTER contains ${blankDates.toLocaleString()} blank dates`
        );
    }

    if (invalidDates > 0) {
        fail(
            `MASTER contains ${invalidDates.toLocaleString()} invalid date values`
        );
    }

    if (blankHomeTeams > 0) {
        fail(
            `MASTER contains ${blankHomeTeams.toLocaleString()} blank home teams`
        );
    }

    if (blankAwayTeams > 0) {
        fail(
            `MASTER contains ${blankAwayTeams.toLocaleString()} blank away teams`
        );
    }

    log('\nMASTER critical field audit:');

    log(
        `  Blank dates:          ${blankDates.toLocaleString()}`
    );

    log(
        `  Blank home teams:     ${blankHomeTeams.toLocaleString()}`
    );

    log(
        `  Blank away teams:     ${blankAwayTeams.toLocaleString()}`
    );

    log(
        `  Blank competitions:   ${blankCompetitions.toLocaleString()}`
    );

    log(
        `  Blank home scores:    ${blankHomeScores.toLocaleString()}`
    );

    log(
        `  Blank away scores:    ${blankAwayScores.toLocaleString()}`
    );

    /*
     * Blank competition is currently observational.
     * Do not reject the canonical layer solely because some
     * source records lack competition metadata.
     */
    if (blankCompetitions > 0) {
        warn(
            `MASTER contains ${blankCompetitions.toLocaleString()} blank competition values. This is recorded for downstream semantic review.`
        );
    }

    /*
     * Blank scores are allowed because the master may contain
     * upcoming/unplayed fixtures.
     */
    if (
        blankHomeScores > 0 ||
        blankAwayScores > 0
    ) {
        warn(
            `MASTER contains ${Math.max(
                blankHomeScores,
                blankAwayScores
            ).toLocaleString()} rows with missing score fields. Missing scores are permitted for unplayed/upcoming matches.`
        );
    }

    log(
        `\nPossible date/home/away duplicate groups: ${possibleDuplicateGroups.toLocaleString()}`
    );

    if (possibleDuplicateGroups > 0) {
        warn(
            'MASTER contains possible semantic duplicate match groups. They require review and are NOT automatically treated as duplicates.'
        );

        for (
            const sample
            of possibleDuplicateSamples
        ) {
            log(
                `  DUPLICATE GROUP (${sample.count}): ${sample.key}`
            );

            for (
                const row
                of sample.rows
            ) {
                log(
                    `     ${row.matchId} | ${row.date} | ${row.home} vs ${row.away}`
                );
            }
        }
    }

    log(
        '✅ MASTER streaming audit complete'
    );

    return {
        count: masterCount,
        matchIds,
        directMetaIndex,
        reverseMetaIndex,
        uniqueIds: matchIds.size,
        blankMatchIds,
        duplicateMatchIds,
        blankDates,
        invalidDates,
        blankHomeTeams,
        blankAwayTeams,
        blankCompetitions,
        blankHomeScores,
        blankAwayScores,
        minYear,
        maxYear,
        possibleDuplicateGroups,
        possibleDuplicateRows,
        possibleDuplicateSamples
    };
}

/*
 * Match IDs in appearances/events can exist in a different
 * source-derived representation.
 *
 * First try exact canonical ID.
 * Then support the known ZK_MATCH_DATE_HOME_AWAY form.
 */
function resolveMatchId(matchId, master) {
    if (!matchId) {
        return false;
    }

    if (master.matchIds.has(matchId)) {
        return true;
    }

    const match = matchId.match(
        /^ZK_MATCH_(\d{8})_(.+)_(.+)$/i
    );

    if (!match) {
        return false;
    }

    const date =
        `${match[1].substring(0, 4)}-` +
        `${match[1].substring(4, 6)}-` +
        `${match[1].substring(6, 8)}`;

    const home = match[2];
    const away = match[3];

    const dKey = buildKey(
        date,
        home,
        away
    );

    const rKey = buildReverseKey(
        date,
        home,
        away
    );

    return (
        master.directMetaIndex.has(dKey) ||
        master.reverseMetaIndex.has(rKey)
    );
}

async function verifyAppearances(
    master,
    players,
    teams
) {
    const filename = FILES.APPEARANCES;
    const key = 'APPEARANCES';

    log('\n============================================================');
    log('VERIFYING APPEARANCES');
    log('============================================================');

    if (!fileExists(filename)) {
        fail(`Missing ${filename}`);
        return null;
    }

    const schemaOK = await verifySchema(
        key,
        filename
    );

    if (!schemaOK) {
        return null;
    }

    let count = 0;

    let orphanMatch = 0;
    let orphanPlayer = 0;
    let orphanTeam = 0;

    let blankTeam = 0;

    let blankAppearanceId = 0;
    let duplicateAppearanceIds = 0;

    const appearanceIds = new Set();
    const duplicateSamples = [];

    const orphanTeamSamples = [];
    const orphanMatchSamples = [];

    await streamCsv(
        filename,
        (row) => {
            count++;

            const appearanceId =
                String(
                    row.zokascore_appearance_id ||
                    ''
                ).trim();

            if (!appearanceId) {
                blankAppearanceId++;
            } else if (
                appearanceIds.has(appearanceId)
            ) {
                duplicateAppearanceIds++;

                if (
                    duplicateSamples.length < 10
                ) {
                    duplicateSamples.push(
                        appearanceId
                    );
                }
            } else {
                appearanceIds.add(
                    appearanceId
                );
            }

            const matchId =
                String(
                    row.zokascore_match_id ||
                    ''
                ).trim();

            const playerId =
                String(
                    row.zokascore_player_id ||
                    ''
                ).trim();

            const teamId =
                String(
                    row.zokascore_team_id ||
                    ''
                ).trim();

            /*
             * Match FK:
             * unresolved references are WARNINGS.
             */
            if (
                !matchId ||
                !resolveMatchId(
                    matchId,
                    master
                )
            ) {
                orphanMatch++;

                if (
                    orphanMatchSamples.length < 10
                ) {
                    orphanMatchSamples.push(
                        matchId
                    );
                }
            }

            /*
             * Player FK:
             * player is required for an appearance.
             */
            if (
                !playerId ||
                !players.ids.has(playerId)
            ) {
                orphanPlayer++;
            }

            /*
             * Team FK:
             *
             * Empty team IDs are existing unresolved source
             * records. They are NOT "invalid team IDs".
             *
             * Non-empty IDs pointing to nowhere are hard
             * failures.
             */
            if (!teamId) {
                blankTeam++;
            } else if (
                !teams.ids.has(teamId)
            ) {
                orphanTeam++;

                if (
                    orphanTeamSamples.length < 10
                ) {
                    orphanTeamSamples.push(
                        teamId
                    );
                }
            }
        }
    );

    log(
        `APPEARANCES rows: ${count.toLocaleString()}`
    );

    checkDynamicCount(
        key,
        count
    );

    log(
        `Unresolved match references: ${orphanMatch.toLocaleString()}`
    );

    log(
        `Orphan players: ${orphanPlayer.toLocaleString()}`
    );

    log(
        `Blank team IDs: ${blankTeam.toLocaleString()}`
    );

    log(
        `Invalid non-empty team IDs: ${orphanTeam.toLocaleString()}`
    );

    /*
     * Player is mandatory.
     */
    if (orphanPlayer > 0) {
        fail(
            `APPEARANCES contains ${orphanPlayer.toLocaleString()} broken player foreign-key relationships`
        );
    }

    /*
     * Blank team IDs are tolerated at this canonical gate
     * because the current canonical source demonstrably contains
     * unresolved appearance-team links.
     */
    if (blankTeam > 0) {
        warn(
            `APPEARANCES contains ${blankTeam.toLocaleString()} rows with blank team IDs. These are unresolved source relationships and are not automatically repaired.`
        );
    }

    /*
     * A non-empty team ID that does not exist is genuinely broken.
     */
    if (orphanTeam > 0) {
        fail(
            `APPEARANCES contains ${orphanTeam.toLocaleString()} invalid non-empty team foreign keys`
        );

        log(
            `Invalid team ID samples: ${orphanTeamSamples.join(', ')}`
        );
    }

    if (orphanMatch > 0) {
        warn(
            `APPEARANCES contains ${orphanMatch.toLocaleString()} unresolved match references. These will be skipped during downstream intelligence construction.`
        );

        if (orphanMatchSamples.length > 0) {
            log(
                `Unresolved match samples: ${orphanMatchSamples.join(', ')}`
            );
        }
    }

    if (blankAppearanceId > 0) {
        fail(
            `APPEARANCES contains ${blankAppearanceId.toLocaleString()} blank appearance IDs`
        );
    }

    if (duplicateAppearanceIds > 0) {
        fail(
            `APPEARANCES contains ${duplicateAppearanceIds.toLocaleString()} duplicate appearance IDs`
        );

        log(
            `Duplicate appearance ID samples: ${duplicateSamples.join(', ')}`
        );
    }

    if (
        orphanPlayer === 0 &&
        orphanTeam === 0
    ) {
        log(
            '✅ APPEARANCES player/team relational integrity verified'
        );
    }

    return {
        count,
        uniqueIds: appearanceIds.size,
        orphanMatch,
        orphanPlayer,
        orphanTeam,
        blankTeam,
        blankAppearanceId,
        duplicateAppearanceIds
    };
}

async function verifyEvents(
    master,
    players,
    teams
) {
    const filename = FILES.EVENTS;
    const key = 'EVENTS';

    log('\n============================================================');
    log('VERIFYING EVENTS');
    log('============================================================');

    if (!fileExists(filename)) {
        fail(`Missing ${filename}`);
        return null;
    }

    const schemaOK = await verifySchema(
        key,
        filename
    );

    if (!schemaOK) {
        return null;
    }

    let count = 0;

    let orphanMatch = 0;
    let orphanPlayer = 0;
    let orphanTeam = 0;
    let orphanPlayerIn = 0;

    let blankTeam = 0;

    let blankEventId = 0;
    let duplicateEventIds = 0;

    const eventIds = new Set();
    const duplicateSamples = [];

    await streamCsv(
        filename,
        (row) => {
            count++;

            const eventId =
                String(
                    row.zokascore_event_id ||
                    ''
                ).trim();

            if (!eventId) {
                blankEventId++;
            } else if (
                eventIds.has(eventId)
            ) {
                duplicateEventIds++;

                if (
                    duplicateSamples.length < 10
                ) {
                    duplicateSamples.push(
                        eventId
                    );
                }
            } else {
                eventIds.add(eventId);
            }

            const matchId =
                String(
                    row.zokascore_match_id ||
                    ''
                ).trim();

            if (
                !matchId ||
                !resolveMatchId(
                    matchId,
                    master
                )
            ) {
                orphanMatch++;
            }

            const playerId =
                String(
                    row.zokascore_player_id ||
                    ''
                ).trim();

            if (
                playerId &&
                !players.ids.has(playerId)
            ) {
                orphanPlayer++;
            }

            const teamId =
                String(
                    row.zokascore_team_id ||
                    ''
                ).trim();

            if (!teamId) {
                blankTeam++;
            } else if (
                !teams.ids.has(teamId)
            ) {
                orphanTeam++;
            }

            const playerInId =
                String(
                    row.zokascore_player_in_id ||
                    ''
                ).trim();

            if (
                playerInId &&
                !players.ids.has(playerInId)
            ) {
                orphanPlayerIn++;
            }
        }
    );

    log(
        `EVENTS rows: ${count.toLocaleString()}`
    );

    checkDynamicCount(
        key,
        count
    );

    log(
        `Unresolved match references: ${orphanMatch.toLocaleString()}`
    );

    log(
        `Orphan players: ${orphanPlayer.toLocaleString()}`
    );

    log(
        `Blank team IDs: ${blankTeam.toLocaleString()}`
    );

    log(
        `Invalid non-empty team IDs: ${orphanTeam.toLocaleString()}`
    );

    log(
        `Orphan player-in IDs: ${orphanPlayerIn.toLocaleString()}`
    );

    /*
     * Event player IDs are optional in some event types.
     * Only non-empty invalid IDs fail.
     */
    if (orphanPlayer > 0) {
        fail(
            `EVENTS contains ${orphanPlayer.toLocaleString()} invalid player foreign keys`
        );
    }

    if (orphanTeam > 0) {
        fail(
            `EVENTS contains ${orphanTeam.toLocaleString()} invalid non-empty team foreign keys`
        );
    }

    if (orphanPlayerIn > 0) {
        fail(
            `EVENTS contains ${orphanPlayerIn.toLocaleString()} invalid player-in foreign keys`
        );
    }

    if (blankTeam > 0) {
        warn(
            `EVENTS contains ${blankTeam.toLocaleString()} blank team IDs. These are retained as unresolved source relationships.`
        );
    }

    if (orphanMatch > 0) {
        warn(
            `EVENTS contains ${orphanMatch.toLocaleString()} unresolved match references. These will be skipped during downstream intelligence construction.`
        );
    }

    if (
        orphanPlayer === 0 &&
        orphanTeam === 0 &&
        orphanPlayerIn === 0
    ) {
        log(
            '✅ EVENTS player/team relational integrity verified'
        );
    }

    if (blankEventId > 0) {
        fail(
            `EVENTS contains ${blankEventId.toLocaleString()} blank event IDs`
        );
    }

    if (duplicateEventIds > 0) {
        fail(
            `EVENTS contains ${duplicateEventIds.toLocaleString()} duplicate event IDs`
        );

        log(
            `Duplicate event ID samples: ${duplicateSamples.join(', ')}`
        );
    }

    return {
        count,
        uniqueIds: eventIds.size,
        orphanMatch,
        orphanPlayer,
        orphanTeam,
        orphanPlayerIn,
        blankTeam,
        blankEventId,
        duplicateEventIds
    };
}

async function verifyRatings(teams) {
    const filename = FILES.RATINGS;
    const key = 'RATINGS';

    log('\n============================================================');
    log('VERIFYING RATINGS');
    log('============================================================');

    if (!fileExists(filename)) {
        fail(`Missing ${filename}`);
        return null;
    }

    const schemaOK = await verifySchema(
        key,
        filename
    );

    if (!schemaOK) {
        return null;
    }

    let count = 0;

    let orphanTeam = 0;

    let blankRatingId = 0;
    let duplicateRatingIds = 0;

    let blankDates = 0;
    let invalidDates = 0;

    let blankRatingValues = 0;

    const ratingIds = new Set();
    const duplicateSamples = [];

    await streamCsv(
        filename,
        (row) => {
            count++;

            const ratingId =
                String(
                    row.zokascore_rating_id ||
                    ''
                ).trim();

            if (!ratingId) {
                blankRatingId++;
            } else if (
                ratingIds.has(ratingId)
            ) {
                duplicateRatingIds++;

                if (
                    duplicateSamples.length < 10
                ) {
                    duplicateSamples.push(
                        ratingId
                    );
                }
            } else {
                ratingIds.add(ratingId);
            }

            const teamId =
                String(
                    row.zokascore_team_id ||
                    ''
                ).trim();

            if (
                !teamId ||
                !teams.ids.has(teamId)
            ) {
                orphanTeam++;
            }

            const date =
                String(
                    row.date || ''
                ).trim();

            if (!date) {
                blankDates++;
            } else if (
                !isValidDate(date)
            ) {
                invalidDates++;
            }

            if (
                isBlank(row.rating_value)
            ) {
                blankRatingValues++;
            }
        }
    );

    log(
        `RATINGS rows: ${count.toLocaleString()}`
    );

    checkDynamicCount(
        key,
        count
    );

    log(
        `Orphan teams: ${orphanTeam.toLocaleString()}`
    );

    if (orphanTeam > 0) {
        fail(
            `RATINGS contains ${orphanTeam.toLocaleString()} broken team foreign keys`
        );
    }

    if (blankRatingId > 0) {
        fail(
            `RATINGS contains ${blankRatingId.toLocaleString()} blank rating IDs`
        );
    }

    if (duplicateRatingIds > 0) {
        fail(
            `RATINGS contains ${duplicateRatingIds.toLocaleString()} duplicate rating IDs`
        );

        log(
            `Duplicate rating ID samples: ${duplicateSamples.join(', ')}`
        );
    }

    if (blankDates > 0) {
        fail(
            `RATINGS contains ${blankDates.toLocaleString()} blank dates`
        );
    }

    if (invalidDates > 0) {
        fail(
            `RATINGS contains ${invalidDates.toLocaleString()} invalid dates`
        );
    }

    log(
        `Blank rating values: ${blankRatingValues.toLocaleString()}`
    );

    if (blankRatingValues > 0) {
        warn(
            `RATINGS contains ${blankRatingValues.toLocaleString()} blank rating values.`
        );
    }

    if (orphanTeam === 0) {
        log(
            '✅ RATINGS relational integrity verified'
        );
    }

    return {
        count,
        uniqueIds: ratingIds.size,
        orphanTeam,
        blankRatingId,
        duplicateRatingIds,
        blankDates,
        invalidDates,
        blankRatingValues
    };
}

/*
 * Commit the proposed baseline ONLY after the complete gate
 * has passed.
 */
function commitBaselines() {
    fs.writeFileSync(
        BASELINE_FILE,
        JSON.stringify(
            proposedBaselines,
            null,
            2
        ),
        'utf8'
    );

    baselines = {
        ...proposedBaselines
    };
}

function writeAuditReport(results) {
    ensureDir(AUDIT_DIR);

    /*
     * CRITICAL:
     * Do NOT update baseline on failure.
     */
    if (gatePassed) {
        commitBaselines();
    }

    const report = {
        generatedAt:
            new Date().toISOString(),

        gate:
            gatePassed
                ? 'PASS'
                : 'FAIL',

        sourceDirectory:
            'data/source/ZOKASCORE_FINAL',

        files: {
            ...FILES
        },

        dynamicBaselines: {
            ...baselines
        },

        proposedBaselines: {
            ...proposedBaselines
        },

        baselineCommitted:
            gatePassed,

        issues: [
            ...issues
        ],

        warnings: [
            ...warnings
        ],

        results: {
            teams: results.teams
                ? {
                    count:
                        results.teams.count,
                    uniqueIds:
                        results.teams.uniqueIds,
                    duplicateIds:
                        results.teams.duplicateIds,
                    blankIds:
                        results.teams.blankIds
                }
                : null,

            players: results.players
                ? {
                    count:
                        results.players.count,
                    uniqueIds:
                        results.players.uniqueIds,
                    duplicateIds:
                        results.players.duplicateIds,
                    blankIds:
                        results.players.blankIds
                }
                : null,

            competitions:
                results.competitions
                    ? {
                        count:
                            results.competitions.count,
                        uniqueIds:
                            results.competitions.uniqueIds,
                        duplicateIds:
                            results.competitions.duplicateIds,
                        blankIds:
                            results.competitions.blankIds
                    }
                    : null,

            master: results.master
                ? {
                    count:
                        results.master.count,
                    uniqueIds:
                        results.master.uniqueIds,
                    blankMatchIds:
                        results.master.blankMatchIds,
                    duplicateMatchIds:
                        results.master.duplicateMatchIds,
                    blankDates:
                        results.master.blankDates,
                    invalidDates:
                        results.master.invalidDates,
                    blankHomeTeams:
                        results.master.blankHomeTeams,
                    blankAwayTeams:
                        results.master.blankAwayTeams,
                    blankCompetitions:
                        results.master.blankCompetitions,
                    blankHomeScores:
                        results.master.blankHomeScores,
                    blankAwayScores:
                        results.master.blankAwayScores,
                    minYear:
                        results.master.minYear,
                    maxYear:
                        results.master.maxYear,
                    possibleDuplicateGroups:
                        results.master.possibleDuplicateGroups,
                    possibleDuplicateRows:
                        results.master.possibleDuplicateRows,
                    possibleDuplicateSamples:
                        results.master.possibleDuplicateSamples
                }
                : null,

            appearances:
                results.appearances
                    ? {
                        count:
                            results.appearances.count,
                        uniqueIds:
                            results.appearances.uniqueIds,
                        orphanMatch:
                            results.appearances.orphanMatch,
                        orphanPlayer:
                            results.appearances.orphanPlayer,
                        orphanTeam:
                            results.appearances.orphanTeam,
                        blankTeam:
                            results.appearances.blankTeam,
                        blankAppearanceId:
                            results.appearances.blankAppearanceId,
                        duplicateAppearanceIds:
                            results.appearances.duplicateAppearanceIds
                    }
                    : null,

            events:
                results.events
                    ? {
                        count:
                            results.events.count,
                        uniqueIds:
                            results.events.uniqueIds,
                        orphanMatch:
                            results.events.orphanMatch,
                        orphanPlayer:
                            results.events.orphanPlayer,
                        orphanTeam:
                            results.events.orphanTeam,
                        orphanPlayerIn:
                            results.events.orphanPlayerIn,
                        blankTeam:
                            results.events.blankTeam,
                        blankEventId:
                            results.events.blankEventId,
                        duplicateEventIds:
                            results.events.duplicateEventIds
                    }
                    : null,

            ratings:
                results.ratings
                    ? {
                        count:
                            results.ratings.count,
                        uniqueIds:
                            results.ratings.uniqueIds,
                        orphanTeam:
                            results.ratings.orphanTeam,
                        blankRatingId:
                            results.ratings.blankRatingId,
                        duplicateRatingIds:
                            results.ratings.duplicateRatingIds,
                        blankDates:
                            results.ratings.blankDates,
                        invalidDates:
                            results.ratings.invalidDates,
                        blankRatingValues:
                            results.ratings.blankRatingValues
                    }
                    : null
        }
    };

    const reportPath = path.join(
        AUDIT_DIR,
        'canonical-gate-report.json'
    );

    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            report,
            null,
            2
        ),
        'utf8'
    );

    return reportPath;
}

async function run() {
    console.log('\n============================================================');
    console.log(' ZOKASCORE V2 — CANONICAL DATA GATE');
    console.log('============================================================');

    log(`Source: ${DATA_DIR}`);
    log(`Audit:  ${AUDIT_DIR}`);

    if (!fs.existsSync(DATA_DIR)) {
        fail(
            `Canonical source directory does not exist: ${DATA_DIR}`
        );

        process.exitCode = 1;
        return;
    }

    ensureDir(AUDIT_DIR);

    const results = {
        teams: null,
        players: null,
        competitions: null,
        master: null,
        appearances: null,
        events: null,
        ratings: null
    };

    /*
     * ========================================================
     * 1. ENTITY FILES
     * ========================================================
     */

    results.teams =
        await verifyEntityFile(
            'TEAMS',
            FILES.TEAMS,
            'zokascore_team_id'
        );

    results.players =
        await verifyEntityFile(
            'PLAYERS',
            FILES.PLAYERS,
            'zokascore_player_id'
        );

    results.competitions =
        await verifyEntityFile(
            'COMPETITIONS',
            FILES.COMPETITIONS,
            'zokascore_competition_id'
        );

    /*
     * ========================================================
     * 2. MASTER
     * ========================================================
     */

    results.master =
        await verifyMaster();

    /*
     * ========================================================
     * 3. APPEARANCES
     * ========================================================
     */

    if (
        results.master &&
        results.players &&
        results.teams
    ) {
        results.appearances =
            await verifyAppearances(
                results.master,
                results.players,
                results.teams
            );
    } else {
        fail(
            'APPEARANCES FK verification skipped because MASTER/PLAYERS/TEAMS verification data is unavailable'
        );
    }

    /*
     * ========================================================
     * 4. EVENTS
     * ========================================================
     */

    if (
        results.master &&
        results.players &&
        results.teams
    ) {
        results.events =
            await verifyEvents(
                results.master,
                results.players,
                results.teams
            );
    } else {
        fail(
            'EVENTS FK verification skipped because MASTER/PLAYERS/TEAMS verification data is unavailable'
        );
    }

    /*
     * ========================================================
     * 5. RATINGS
     * ========================================================
     */

    if (results.teams) {
        results.ratings =
            await verifyRatings(
                results.teams
            );
    } else {
        fail(
            'RATINGS FK verification skipped because TEAMS verification data is unavailable'
        );
    }

    /*
     * ========================================================
     * 6. REPORT
     * ========================================================
     */

    const reportPath =
        writeAuditReport(results);

    console.log('\n============================================================');

    if (gatePassed) {
        log(
            '✅✅✅ ZOKASCORE CANONICAL GATE PASSED ✅✅✅'
        );

        log(
            'All canonical structural and relational checks passed.'
        );

        log(
            'Warnings are informational and do not block promotion.'
        );

        log(
            'The source layer is cleared for the next audit stage.'
        );
    } else {
        log(
            '❌❌❌ ZOKASCORE CANONICAL GATE FAILED ❌❌❌'
        );

        log(
            'Do NOT modify the canonical source files automatically.'
        );

        log(
            'Review the audit findings before proceeding.'
        );
    }

    console.log('============================================================');

    log(
        `Audit report: ${reportPath}`
    );

    console.log(
        '\n🔒 ZOKASCORE_FINAL WAS NOT MODIFIED.'
    );

    log(
        '🔒 public_data WAS NOT MODIFIED.'
    );

    log(
        '🔒 No repairs were performed.'
    );

    if (gatePassed) {
        log(
            '🔓 Dynamic baseline committed because gate PASSED.'
        );
    } else {
        log(
            '🔒 Dynamic baseline NOT changed because gate FAILED.'
        );
    }

    console.log('');
}

run().catch((err) => {
    console.error('\n============================================================');
    console.error(' FATAL ERROR DURING CANONICAL GATE');
    console.error('============================================================');

    console.error(err);

    process.exitCode = 1;
});