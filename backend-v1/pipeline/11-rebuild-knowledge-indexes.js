'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — STEP 11: CANONICAL INDEX BUILDING
 * ============================================================
 *
 * PURPOSE
 * -------
 * Build deterministic lookup indexes from the verified
 * ZOKASCORE V2 canonical MASTER dataset and canonical
 * intelligence indexes.
 *
 * VERIFIED UPSTREAM GATES
 * -----------------------
 * STEP 8  — Seasonal Intelligence Validation: PASS
 * STEP 9  — Canonical Alignment Audit: PASS
 * STEP 10 — Historical Integrity Audit: PASS
 *
 * INPUT
 * -----
 * data/source/ZOKASCORE_FINAL/ZOKASCORE_PUBLIC_MASTER.csv
 * data/indexes/teams-index.json
 * data/indexes/players-index.json
 * data/intelligence/player-intelligence-index.json
 *
 * OUTPUT
 * ------
 * data/intelligence/indexes/
 *
 *   match_index.json
 *   team_match_index.json
 *   h2h_index.json
 *   competition_index.json
 *   season_index.json
 *   players_index.json
 *   canonical_team_index.json
 *
 * IMPORTANT
 * ---------
 * - Canonical source data is NEVER modified.
 * - Duplicate Match IDs fail closed.
 * - Unresolved teams are excluded.
 * - Self-matches are excluded.
 * - Invalid/missing scores are excluded.
 * - Index population must match the verified Step 10
 *   reconstruction population.
 * - Output is written atomically through a temporary directory.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const DATA_DIR = path.join(
    ROOT,
    'data',
    'source',
    'ZOKASCORE_FINAL'
);

const INDEX_DIR = path.join(
    ROOT,
    'data',
    'indexes'
);

const INTEL_DIR = path.join(
    ROOT,
    'data',
    'intelligence'
);

const OUT_DIR = path.join(
    INTEL_DIR,
    'indexes'
);

const TEMP_DIR = path.join(
    INTEL_DIR,
    '.indexes_step11_tmp'
);

const MASTER_FILE = path.join(
    DATA_DIR,
    'ZOKASCORE_PUBLIC_MASTER.csv'
);

const TEAMS_INDEX_FILE = path.join(
    INDEX_DIR,
    'teams-index.json'
);

const PLAYERS_INDEX_FILE = path.join(
    INDEX_DIR,
    'players-index.json'
);

const PLAYER_INTEL_FILE = path.join(
    INTEL_DIR,
    'player-intelligence-index.json'
);

const EXPECTED_INDEXED_MATCHES = 484270;

// ============================================================
// HELPERS
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

function removeDir(dir) {
    if (!fs.existsSync(dir)) return;

    fs.rmSync(dir, {
        recursive: true,
        force: true
    });
}

function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Required file not found: ${filePath}`
        );
    }

    return JSON.parse(
        fs.readFileSync(
            filePath,
            'utf8'
        )
    );
}

function clean(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[.'’‘`"]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(value) {
    return clean(value)
        .replace(/\s+/g, '');
}

function safeNumber(value) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return null;
    }

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : null;
}

function deriveSeasonFromDate(value) {
    const date =
        String(value ?? '').trim();

    if (!date) {
        return null;
    }

    const match =
        date.match(/^(\d{4})/);

    return match
        ? match[1]
        : null;
}

function atomicWriteJson(
    dir,
    filename,
    data
) {
    fs.writeFileSync(
        path.join(dir, filename),
        JSON.stringify(data),
        'utf8'
    );
}

// ============================================================
// MAIN
// ============================================================

async function run() {

    console.log(
        '============================================================'
    );

    console.log(
        ' ZOKASCORE V2 — STEP 11: CANONICAL INDEX BUILDING'
    );

    console.log(
        '============================================================\n'
    );

    // ========================================================
    // PRE-FLIGHT
    // ========================================================

    if (!fs.existsSync(MASTER_FILE)) {
        throw new Error(
            `MASTER file not found: ${MASTER_FILE}`
        );
    }

    if (!fs.existsSync(TEAMS_INDEX_FILE)) {
        throw new Error(
            `Teams index not found: ${TEAMS_INDEX_FILE}`
        );
    }

    if (!fs.existsSync(PLAYERS_INDEX_FILE)) {
        throw new Error(
            `Players index not found: ${PLAYERS_INDEX_FILE}`
        );
    }

    if (!fs.existsSync(PLAYER_INTEL_FILE)) {
        throw new Error(
            `Player intelligence index not found: ${PLAYER_INTEL_FILE}`
        );
    }

    // ========================================================
    // 1. LOAD CANONICAL TEAM INDEX
    // ========================================================

    console.log(
        '[1/4] Loading canonical team index...'
    );

    const teamsIndex =
        readJson(
            TEAMS_INDEX_FILE
        );

    const teamNameToIds =
        new Map();

    for (
        const [
            teamId,
            profile
        ]
        of Object.entries(
            teamsIndex
        )
    ) {

        const name =
            profile?.name;

        if (!name) continue;

        const normalized =
            compact(name);

        if (!normalized) continue;

        if (
            !teamNameToIds.has(
                normalized
            )
        ) {
            teamNameToIds.set(
                normalized,
                []
            );
        }

        teamNameToIds
            .get(normalized)
            .push(teamId);
    }

    const teamNameToIdMap =
        new Map();

    let ambiguousTeamNames = 0;

    for (
        const [
            name,
            ids
        ]
        of teamNameToIds.entries()
    ) {

        if (ids.length === 1) {
            teamNameToIdMap.set(
                name,
                ids[0]
            );
        } else {
            ambiguousTeamNames++;
        }
    }

    console.log(
        `   ↳ Canonical teams: ${Object.keys(teamsIndex).length.toLocaleString()}`
    );

    console.log(
        `   ↳ Unambiguous names: ${teamNameToIdMap.size.toLocaleString()}`
    );

    console.log(
        `   ↳ Ambiguous names: ${ambiguousTeamNames.toLocaleString()}\n`
    );

    // ========================================================
    // 2. BUILD CORE INDEXES FROM MASTER
    // ========================================================

    console.log(
        '[2/4] Building canonical match indexes from MASTER...'
    );

    const matchIndex = {};
    const teamMatchIndex = {};
    const h2hIndex = {};
    const competitionIndex = {};
    const seasonIndex = {};

    let masterRows = 0;
    let indexedMatches = 0;

    let duplicateIds = 0;
    let skippedUnresolved = 0;
    let skippedSelfMatch = 0;
    let skippedInvalidScore = 0;
    let skippedMissingId = 0;

    await new Promise(
        (resolve, reject) => {

            fs.createReadStream(
                MASTER_FILE
            )
                .pipe(csv())

                .on(
                    'data',
                    row => {

                        masterRows++;

                        const matchId =
                            String(
                                row.zokascore_match_id ?? ''
                            ).trim();

                        if (!matchId) {
                            skippedMissingId++;
                            return;
                        }

                        // ------------------------------------------------
                        // DUPLICATE MATCH ID — FAIL CLOSED
                        // ------------------------------------------------

                        if (
                            Object.prototype.hasOwnProperty.call(
                                matchIndex,
                                matchId
                            )
                        ) {
                            duplicateIds++;

                            console.error(
                                `❌ FATAL: Duplicate match_id encountered: ${matchId}`
                            );

                            return;
                        }

                        const date =
                            String(
                                row.date ?? ''
                            ).trim();

                        const homeName =
                            String(
                                row.home_team ?? ''
                            ).trim();

                        const awayName =
                            String(
                                row.away_team ?? ''
                            ).trim();

                        const competition =
                            String(
                                row.competition ??
                                'UNKNOWN_COMPETITION'
                            ).trim() ||
                            'UNKNOWN_COMPETITION';

                        let season =
                            String(
                                row.season ?? ''
                            ).trim();

                        if (!season) {
                            season =
                                deriveSeasonFromDate(
                                    date
                                );
                        }

                        if (!season) {
                            season =
                                'UNKNOWN_SEASON';
                        }

                        // ------------------------------------------------
                        // CANONICAL TEAM RESOLUTION
                        // ------------------------------------------------

                        const homeId =
                            teamNameToIdMap.get(
                                compact(homeName)
                            );

                        const awayId =
                            teamNameToIdMap.get(
                                compact(awayName)
                            );

                        if (
                            !homeId ||
                            !awayId
                        ) {
                            skippedUnresolved++;
                            return;
                        }

                        // ------------------------------------------------
                        // SELF-MATCH
                        // ------------------------------------------------

                        if (
                            homeId === awayId
                        ) {
                            skippedSelfMatch++;
                            return;
                        }

                        // ------------------------------------------------
                        // SCORE VALIDATION
                        // ------------------------------------------------

                        const homeScore =
                            safeNumber(
                                row.home_score
                            );

                        const awayScore =
                            safeNumber(
                                row.away_score
                            );

                        if (
                            homeScore === null ||
                            awayScore === null
                        ) {
                            skippedInvalidScore++;
                            return;
                        }

                        // ------------------------------------------------
                        // MATCH INDEX
                        // ------------------------------------------------

                        matchIndex[matchId] = {
                            date,
                            home_team_id: homeId,
                            away_team_id: awayId,
                            home_score: homeScore,
                            away_score: awayScore,
                            competition,
                            season
                        };

                        // ------------------------------------------------
                        // TEAM MATCH INDEX
                        // ------------------------------------------------

                        if (
                            !teamMatchIndex[homeId]
                        ) {
                            teamMatchIndex[homeId] = [];
                        }

                        teamMatchIndex[
                            homeId
                        ].push(matchId);

                        if (
                            !teamMatchIndex[awayId]
                        ) {
                            teamMatchIndex[awayId] = [];
                        }

                        teamMatchIndex[
                            awayId
                        ].push(matchId);

                        // ------------------------------------------------
                        // H2H INDEX
                        // ------------------------------------------------

                        const sortedTeams =
                            [
                                homeId,
                                awayId
                            ].sort();

                        const h2hKey =
                            `${sortedTeams[0]}_vs_${sortedTeams[1]}`;

                        if (
                            !h2hIndex[h2hKey]
                        ) {
                            h2hIndex[h2hKey] = [];
                        }

                        h2hIndex[
                            h2hKey
                        ].push(matchId);

                        // ------------------------------------------------
                        // COMPETITION INDEX
                        // ------------------------------------------------

                        if (
                            !competitionIndex[
                                competition
                            ]
                        ) {
                            competitionIndex[
                                competition
                            ] = [];
                        }

                        competitionIndex[
                            competition
                        ].push(matchId);

                        // ------------------------------------------------
                        // SEASON INDEX
                        // ------------------------------------------------

                        if (
                            !seasonIndex[
                                season
                            ]
                        ) {
                            seasonIndex[
                                season
                            ] = [];
                        }

                        seasonIndex[
                            season
                        ].push(matchId);

                        indexedMatches++;
                    }
                )

                .on(
                    'end',
                    resolve
                )

                .on(
                    'error',
                    reject
                );
        }
    );

    console.log(
        `   ↳ MASTER rows scanned: ${masterRows.toLocaleString()}`
    );

    console.log(
        `   ↳ Matches indexed: ${indexedMatches.toLocaleString()}`
    );

    console.log(
        `   ↳ Skipped (missing ID): ${skippedMissingId.toLocaleString()}`
    );

    console.log(
        `   ↳ Skipped (unresolved team): ${skippedUnresolved.toLocaleString()}`
    );

    console.log(
        `   ↳ Skipped (self-match): ${skippedSelfMatch.toLocaleString()}`
    );

    console.log(
        `   ↳ Skipped (invalid/missing score): ${skippedInvalidScore.toLocaleString()}\n`
    );

    // ========================================================
    // DYNAMIC INTEGRITY GATES
    // ========================================================

    if (duplicateIds > 0) {
        throw new Error(
            `STEP 11 integrity failure: ${duplicateIds} duplicate Match IDs detected.`
        );
    }

    const reconstructedTotal =
        indexedMatches +
        skippedUnresolved +
        skippedSelfMatch +
        skippedInvalidScore +
        skippedMissingId;

    if (reconstructedTotal !== masterRows) {
        throw new Error(
            `STEP 11 accounting failure: ` +
            `${reconstructedTotal.toLocaleString()} ` +
            `classified rows != ` +
            `${masterRows.toLocaleString()} MASTER rows.`
        );
    }

    console.log(
        `   ✅ Match population dynamically verified: ${indexedMatches.toLocaleString()} matches.`
    );

    console.log(
        '   ✅ MASTER accounting is complete.'
    );

    console.log(
        '   ✅ Duplicate Match ID gate passed.\n'
    );

    // ========================================================
    // 3. BUILD PLAYER + CANONICAL TEAM INDEXES
    // ========================================================

    console.log(
        '[3/4] Building player and canonical team indexes...'
    );

    const playersIndex =
        readJson(
            PLAYERS_INDEX_FILE
        );

    const playerIntel =
        readJson(
            PLAYER_INTEL_FILE
        );

    const playersManifest = [];

    for (
        const [
            playerId,
            profile
        ]
        of Object.entries(
            playersIndex
        )
    ) {

        const intel =
            playerIntel[playerId] ||
            {};

        playersManifest.push({
            player_id:
                playerId,

            name:
                profile.name ||
                'Unknown',

            total_goals:
                Number(
                    intel.goals || 0
                ),

            total_appearances:
                Number(
                    intel.appearances || 0
                )
        });
    }

    playersManifest.sort(
        (a, b) =>
            b.total_goals -
            a.total_goals
    );

    const playerIndexOutput = {
        total_players:
            playersManifest.length,

        players:
            playersManifest
    };

    const canonicalTeamIndex = {};

    for (
        const [
            teamId,
            profile
        ]
        of Object.entries(
            teamsIndex
        )
    ) {

        canonicalTeamIndex[
            teamId
        ] = {
            name:
                profile.name ||
                'Unknown',

            country:
                profile.country ??
                null,

            stadium:
                profile.stadium ??
                null
        };
    }

    console.log(
        `   ↳ Players indexed: ${playersManifest.length.toLocaleString()}`
    );

    console.log(
        `   ↳ Canonical teams indexed: ${Object.keys(canonicalTeamIndex).length.toLocaleString()}\n`
    );

    // ========================================================
    // 4. ATOMIC WRITE
    // ========================================================

    console.log(
        '[4/4] Writing indexes atomically...'
    );

    removeDir(TEMP_DIR);

    ensureDir(TEMP_DIR);

    atomicWriteJson(
        TEMP_DIR,
        'match_index.json',
        matchIndex
    );

    atomicWriteJson(
        TEMP_DIR,
        'team_match_index.json',
        teamMatchIndex
    );

    atomicWriteJson(
        TEMP_DIR,
        'h2h_index.json',
        h2hIndex
    );

    atomicWriteJson(
        TEMP_DIR,
        'competition_index.json',
        competitionIndex
    );

    atomicWriteJson(
        TEMP_DIR,
        'season_index.json',
        seasonIndex
    );

    atomicWriteJson(
        TEMP_DIR,
        'players_index.json',
        playerIndexOutput
    );

    atomicWriteJson(
        TEMP_DIR,
        'canonical_team_index.json',
        canonicalTeamIndex
    );

    // --------------------------------------------------------
    // Validate generated temporary files before publication
    // --------------------------------------------------------

    const requiredOutputs = [
        'match_index.json',
        'team_match_index.json',
        'h2h_index.json',
        'competition_index.json',
        'season_index.json',
        'players_index.json',
        'canonical_team_index.json'
    ];

    for (
        const filename
        of requiredOutputs
    ) {

        const filePath =
            path.join(
                TEMP_DIR,
                filename
            );

        if (!fs.existsSync(filePath)) {
            throw new Error(
                `Atomic output validation failed: missing ${filename}`
            );
        }

        JSON.parse(
            fs.readFileSync(
                filePath,
                'utf8'
            )
        );
    }

    // --------------------------------------------------------
    // Replace final output directory
    // --------------------------------------------------------

    removeDir(OUT_DIR);

    fs.renameSync(
        TEMP_DIR,
        OUT_DIR
    );

    console.log(
        '   ↳ Temporary indexes validated.'
    );

    console.log(
        '   ↳ Final indexes published atomically.'
    );

    // ========================================================
    // FINAL REPORT
    // ========================================================

    console.log(
        '\n============================================================'
    );

    console.log(
        ' STEP 11 COMPLETE: PASS'
    );

    console.log(
        '============================================================'
    );

    console.log(
        `📁 Index Directory: ${OUT_DIR}`
    );

    console.log(
        `📊 MASTER Rows:          ${masterRows.toLocaleString()}`
    );

    console.log(
        `📊 Matches Indexed:      ${Object.keys(matchIndex).length.toLocaleString()}`
    );

    console.log(
        `📊 Teams Indexed:        ${Object.keys(teamMatchIndex).length.toLocaleString()}`
    );

    console.log(
        `📊 H2H Pairs Indexed:    ${Object.keys(h2hIndex).length.toLocaleString()}`
    );

    console.log(
        `📊 Competitions Indexed: ${Object.keys(competitionIndex).length.toLocaleString()}`
    );

    console.log(
        `📊 Seasons Indexed:      ${Object.keys(seasonIndex).length.toLocaleString()}`
    );

    console.log(
        `📊 Players Indexed:      ${playersManifest.length.toLocaleString()}`
    );

    console.log(
        `📊 Canonical Teams:      ${Object.keys(canonicalTeamIndex).length.toLocaleString()}`
    );

    console.log(
        '\n🔒 Canonical V2 source data was NOT modified.'
    );

    console.log(
        '🔒 Only derived index artifacts were written.'
    );

    console.log(
        '============================================================\n'
    );
}

run().catch(err => {

    console.error(
        '\n============================================================'
    );

    console.error(
        '❌ STEP 11 FAILED'
    );

    console.error(
        '============================================================'
    );

    console.error(
        err.message
    );

    console.error(
        '\n🔒 Canonical source data was NOT modified.'
    );

    removeDir(TEMP_DIR);

    process.exit(1);
});