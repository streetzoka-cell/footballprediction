'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — STEP 10: HISTORICAL INTEGRITY AUDIT
 * ============================================================
 *
 * PURPOSE
 * -------
 * Migrates the useful derived-artifact verification logic from
 * the legacy V2 integrity audit into the new canonical pipeline.
 *
 * Step 9 verifies the canonical relational graph:
 *
 *   MASTER
 *      ↕
 *   MATCH CROSSWALK
 *      ↕
 *   APPEARANCES
 *      ↕
 *   EVENTS
 *
 * Step 10 verifies that derived intelligence/statistical
 * artifacts agree with an independent reconstruction from the
 * canonical source data.
 *
 * THIS SCRIPT DOES NOT MODIFY SOURCE DATA.
 *
 * VERIFIED LAYERS
 * ---------------
 * 1. MASTER structural integrity
 * 2. MASTER unique match IDs
 * 3. Canonical team references
 * 4. Team statistical reconstruction
 * 5. H2H statistical reconstruction
 * 6. Seasonal statistical reconstruction
 * 7. Player statistical reconstruction
 * 8. Orphan canonical IDs / names
 * 9. Crosswalk-aware APPEARANCES reconciliation
 *
 * INPUTS
 * ------
 * data/source/ZOKASCORE_FINAL/ZOKASCORE_PUBLIC_MASTER.csv
 * data/source/ZOKASCORE_FINAL/ZOKASCORE_APPEARANCES.csv
 * data/indexes/teams-index.json
 * data/indexes/match-id-crosswalk.json
 * data/intelligence/team-intelligence-index.json
 * data/intelligence/h2h-intelligence-index.json
 * data/intelligence/player-intelligence-index.json
 * data/intelligence/seasonal/*.json
 *
 * OUTPUT
 * ------
 * data_audit/historical-integrity-report.json
 *
 * IMPORTANT
 * ---------
 * This is NOT the old public_data/v2_integrity audit revived.
 * It is the canonical-pipeline successor to that audit layer.
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

const SEASONAL_DIR = path.join(
    INTEL_DIR,
    'seasonal'
);

const AUDIT_DIR = path.join(
    ROOT,
    'data_audit'
);

const MASTER_FILE = path.join(
    DATA_DIR,
    'ZOKASCORE_PUBLIC_MASTER.csv'
);

const APPEARANCES_FILE = path.join(
    DATA_DIR,
    'ZOKASCORE_APPEARANCES.csv'
);

const TEAMS_INDEX_FILE = path.join(
    INDEX_DIR,
    'teams-index.json'
);

const CROSSWALK_FILE = path.join(
    INDEX_DIR,
    'match-id-crosswalk.json'
);

const TEAM_INTEL_FILE = path.join(
    INTEL_DIR,
    'team-intelligence-index.json'
);

const H2H_INTEL_FILE = path.join(
    INTEL_DIR,
    'h2h-intelligence-index.json'
);

const PLAYER_INTEL_FILE = path.join(
    INTEL_DIR,
    'player-intelligence-index.json'
);


// ============================================================
// UTILITIES
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}


function readJson(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Required file not found: ${filePath}`);
    }

    return JSON.parse(
        fs.readFileSync(filePath, 'utf8')
    );
}


function clean(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[.'’‘`""]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}


function compact(value) {
    return clean(value).replace(/\s+/g, '');
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

    return Number.isFinite(n) ? n : null;
}


function safeFilename(value) {
    return String(value)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim() || 'unknown';
}


function deriveSeasonFromDate(dateValue) {
    const dateStr = String(dateValue ?? '').trim();

    if (!dateStr) {
        return null;
    }

    const yearMatch = dateStr.match(/^(\d{4})/);

    return yearMatch
        ? yearMatch[1]
        : null;
}


function increment(map, key, amount = 1) {
    map.set(
        key,
        (map.get(key) || 0) + amount
    );
}


function createTeamStats() {
    return {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0
    };
}


function createH2HStats() {
    return {
        matches: 0,
        team_a_wins: 0,
        team_b_wins: 0,
        draws: 0,
        team_a_goals: 0,
        team_b_goals: 0
    };
}


function createPlayerStats() {
    return {
        appearances: 0,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0
    };
}


function normalizeId(value) {
    const v = String(value ?? '').trim();

    return v || null;
}


function getCanonicalTeamId(row, side, teamNameToIds) {
    const idCandidates = side === 'home'
        ? [
            row.home_team_id,
            row.home_canonical_team_id,
            row.homeTeamId
        ]
        : [
            row.away_team_id,
            row.away_canonical_team_id,
            row.awayTeamId
        ];

    for (const candidate of idCandidates) {
        const id = normalizeId(candidate);

        if (id) {
            return {
                id,
                source: 'canonical_id'
            };
        }
    }

    const name = side === 'home'
        ? normalizeId(row.home_team)
        : normalizeId(row.away_team);

    if (!name) {
        return {
            id: null,
            source: 'missing'
        };
    }

    const key = compact(name);
    const ids = teamNameToIds.get(key) || [];

    if (ids.length === 1) {
        return {
            id: ids[0],
            source: 'name'
        };
    }

    if (ids.length > 1) {
        return {
            id: null,
            source: 'ambiguous_name',
            name
        };
    }

    return {
        id: null,
        source: 'unknown_name',
        name
    };
}


function compareStats(expected, actual, fields) {
    const differences = [];

    for (const field of fields) {
        const expectedValue = Number(expected?.[field] ?? 0);
        const actualValue = Number(actual?.[field] ?? 0);

        if (expectedValue !== actualValue) {
            differences.push({
                field,
                expected: expectedValue,
                actual: actualValue
            });
        }
    }

    return differences;
}


function getObjectEntries(value) {
    return value &&
        typeof value === 'object' &&
        !Array.isArray(value)
        ? Object.entries(value)
        : [];
}


// ============================================================
// MAIN
// ============================================================

async function run() {

    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 10: HISTORICAL INTEGRITY AUDIT');
    console.log('============================================================\n');

    ensureDir(AUDIT_DIR);

    const failures = [];
    const warnings = [];

    const forensic = {
        orphan_team_ids: new Set(),
        orphan_team_names: new Set(),

        ambiguous_team_names: new Set(),

        missing_team_intelligence: new Set(),
        extra_team_intelligence: new Set(),

        missing_h2h_intelligence: new Set(),
        extra_h2h_intelligence: new Set(),

        missing_player_intelligence: new Set(),
        extra_player_intelligence: new Set(),

        missing_season_files: new Set(),
        missing_season_competitions: new Set(),

        unknown_appearance_match_ids: new Set(),
        missing_appearance_player_ids: new Set(),

        duplicate_master_match_ids: new Set(),
        missing_master_match_ids: 0,

        structurally_invalid_master_rows: 0,
        invalid_score_rows: 0
    };


    // ========================================================
    // 1. LOAD CANONICAL INDEXES / ARTIFACTS
    // ========================================================

    console.log(
        '[1/6] Loading canonical indexes and intelligence artifacts...'
    );

    const teamsIndex = readJson(TEAMS_INDEX_FILE);
    const crosswalk = readJson(CROSSWALK_FILE);

    const teamIntel = readJson(TEAM_INTEL_FILE);
    const h2hIntel = readJson(H2H_INTEL_FILE);
    const playerIntel = readJson(PLAYER_INTEL_FILE);

    const canonicalTeamIds = new Set();

    const teamNameToIds = new Map();

    for (const [id, profile] of Object.entries(teamsIndex)) {

        const canonicalId = normalizeId(
            profile?.canonical_id ||
            profile?.team_id ||
            id
        );

        if (!canonicalId) {
            continue;
        }

        canonicalTeamIds.add(canonicalId);

        const name =
            profile?.name ||
            profile?.team_name ||
            '';

        const nameKey = compact(name);

        if (!nameKey) {
            continue;
        }

        if (!teamNameToIds.has(nameKey)) {
            teamNameToIds.set(nameKey, []);
        }

        const ids = teamNameToIds.get(nameKey);

        if (!ids.includes(canonicalId)) {
            ids.push(canonicalId);
        }
    }

    const crosswalkMap = new Map();

    for (const [sourceId, targetId] of Object.entries(crosswalk)) {

        const source = normalizeId(sourceId);
        const target = normalizeId(targetId);

        if (!source || !target) {
            continue;
        }

        crosswalkMap.set(source, target);
    }

    console.log(
        `   ↳ Canonical teams indexed: ${canonicalTeamIds.size.toLocaleString()}`
    );

    console.log(
        `   ↳ Crosswalk mappings: ${crosswalkMap.size.toLocaleString()}`
    );

    console.log(
        `   ↳ Team intelligence records: ${Object.keys(teamIntel).length.toLocaleString()}`
    );

    console.log(
        `   ↳ H2H intelligence records: ${Object.keys(h2hIntel).length.toLocaleString()}`
    );

    console.log(
        `   ↳ Player intelligence records: ${Object.keys(playerIntel).length.toLocaleString()}\n`
    );


    // ========================================================
    // RECONSTRUCTION STRUCTURES
    // ========================================================

    const masterMatchIds = new Set();

    const localTeamStats = new Map();

    const localH2HStats = new Map();

    const localSeasonalStats = new Map();

    const localPlayerStats = new Map();

    let masterRows = 0;
    let appearanceRows = 0;

    let masterRowsUsed = 0;
    let masterRowsSkipped = 0;

    let appearanceRowsUsed = 0;
    let appearanceRowsSkipped = 0;


    // ========================================================
    // 2. MASTER STRUCTURAL + STATISTICAL RECONSTRUCTION
    // ========================================================

    console.log(
        '[2/6] Reconstructing canonical Team, H2H, and Seasonal statistics from MASTER...'
    );

    await new Promise((resolve, reject) => {

        if (!fs.existsSync(MASTER_FILE)) {
            reject(
                new Error(`MASTER file not found: ${MASTER_FILE}`)
            );
            return;
        }

        fs.createReadStream(MASTER_FILE)
            .pipe(csv())
            .on('data', row => {

                masterRows++;

                // ------------------------------------------------
                // MATCH ID
                // ------------------------------------------------

                const matchId = normalizeId(
                    row.match_id ||
                    row.zokascore_match_id ||
                    row.MatchID
                );

                if (!matchId) {

                    forensic.missing_master_match_ids++;

                    failures.push(
                        `MASTER row ${masterRows} has no match_id`
                    );

                    return;
                }

                if (masterMatchIds.has(matchId)) {

                    forensic.duplicate_master_match_ids.add(
                        matchId
                    );

                    failures.push(
                        `Duplicate MASTER match_id: ${matchId}`
                    );

                    return;
                }

                masterMatchIds.add(matchId);


                // ------------------------------------------------
                // STRUCTURAL VALIDITY
                // ------------------------------------------------

                const date = normalizeId(row.date);

                const home = getCanonicalTeamId(
                    row,
                    'home',
                    teamNameToIds
                );

                const away = getCanonicalTeamId(
                    row,
                    'away',
                    teamNameToIds
                );

                if (!date || !home.id || !away.id) {

                    forensic.structurally_invalid_master_rows++;

                    if (home.source === 'unknown_name') {
                        forensic.orphan_team_names.add(
                            home.name
                        );
                    }

                    if (away.source === 'unknown_name') {
                        forensic.orphan_team_names.add(
                            away.name
                        );
                    }

                    if (home.source === 'ambiguous_name') {
                        forensic.ambiguous_team_names.add(
                            home.name
                        );
                    }

                    if (away.source === 'ambiguous_name') {
                        forensic.ambiguous_team_names.add(
                            away.name
                        );
                    }

                    failures.push(
                        `Structurally invalid MASTER row: ${matchId}`
                    );

                    return;
                }


                // ------------------------------------------------
                // CANONICAL TEAM EXISTENCE
                // ------------------------------------------------

                if (!canonicalTeamIds.has(home.id)) {
                    forensic.orphan_team_ids.add(home.id);
                }

                if (!canonicalTeamIds.has(away.id)) {
                    forensic.orphan_team_ids.add(away.id);
                }


                // ------------------------------------------------
                // SCORE VALIDATION
                // ------------------------------------------------

                const homeScore = safeNumber(
                    row.home_score
                );

                const awayScore = safeNumber(
                    row.away_score
                );

                if (
                    homeScore === null ||
                    awayScore === null ||
                    homeScore < 0 ||
                    awayScore < 0
                ) {

                    forensic.invalid_score_rows++;

                    warnings.push(
                        `Invalid/missing score for MASTER match ${matchId}`
                    );

                    return;
                }


                // ------------------------------------------------
                // SEASON
                // ------------------------------------------------

                let season = normalizeId(row.season);

                if (!season) {
                    season = deriveSeasonFromDate(date);
                }

                if (!season) {

                    warnings.push(
                        `Unable to derive season for MASTER match ${matchId}`
                    );

                    return;
                }


                masterRowsUsed++;


                // =================================================
                // TEAM STATS
                // =================================================

                if (!localTeamStats.has(home.id)) {
                    localTeamStats.set(
                        home.id,
                        createTeamStats()
                    );
                }

                if (!localTeamStats.has(away.id)) {
                    localTeamStats.set(
                        away.id,
                        createTeamStats()
                    );
                }

                const homeStats =
                    localTeamStats.get(home.id);

                const awayStats =
                    localTeamStats.get(away.id);

                homeStats.matches++;
                homeStats.goals_for += homeScore;
                homeStats.goals_against += awayScore;

                awayStats.matches++;
                awayStats.goals_for += awayScore;
                awayStats.goals_against += homeScore;

                if (homeScore > awayScore) {

                    homeStats.wins++;
                    awayStats.losses++;

                } else if (homeScore < awayScore) {

                    awayStats.wins++;
                    homeStats.losses++;

                } else {

                    homeStats.draws++;
                    awayStats.draws++;
                }


                // =================================================
                // H2H
                // =================================================

                const sortedTeams = [
                    home.id,
                    away.id
                ].sort();

                const teamA = sortedTeams[0];
                const teamB = sortedTeams[1];

                const h2hKey =
                    `${teamA}_vs_${teamB}`;

                if (!localH2HStats.has(h2hKey)) {

                    localH2HStats.set(
                        h2hKey,
                        createH2HStats()
                    );
                }

                const h2h =
                    localH2HStats.get(h2hKey);

                h2h.matches++;

                const teamAScore =
                    home.id === teamA
                        ? homeScore
                        : awayScore;

                const teamBScore =
                    home.id === teamA
                        ? awayScore
                        : homeScore;

                h2h.team_a_goals += teamAScore;
                h2h.team_b_goals += teamBScore;

                if (teamAScore > teamBScore) {
                    h2h.team_a_wins++;
                } else if (teamBScore > teamAScore) {
                    h2h.team_b_wins++;
                } else {
                    h2h.draws++;
                }


                // =================================================
                // SEASONAL
                // =================================================

                const competition =
                    normalizeId(
                        row.competition ||
                        row.competition_name ||
                        row.league
                    ) ||
                    'UNKNOWN_COMPETITION';

                if (!localSeasonalStats.has(season)) {
                    localSeasonalStats.set(
                        season,
                        new Map()
                    );
                }

                const seasonMap =
                    localSeasonalStats.get(season);

                if (!seasonMap.has(competition)) {
                    seasonMap.set(
                        competition,
                        new Map()
                    );
                }

                const competitionMap =
                    seasonMap.get(competition);

                if (!competitionMap.has(home.id)) {
                    competitionMap.set(
                        home.id,
                        createTeamStats()
                    );
                }

                if (!competitionMap.has(away.id)) {
                    competitionMap.set(
                        away.id,
                        createTeamStats()
                    );
                }

                const homeSeason =
                    competitionMap.get(home.id);

                const awaySeason =
                    competitionMap.get(away.id);

                homeSeason.matches++;
                homeSeason.goals_for += homeScore;
                homeSeason.goals_against += awayScore;

                awaySeason.matches++;
                awaySeason.goals_for += awayScore;
                awaySeason.goals_against += homeScore;

                if (homeScore > awayScore) {

                    homeSeason.wins++;
                    awaySeason.losses++;

                } else if (homeScore < awayScore) {

                    awaySeason.wins++;
                    homeSeason.losses++;

                } else {

                    homeSeason.draws++;
                    awaySeason.draws++;
                }

            })
            .on('end', resolve)
            .on('error', reject);
    });


    masterRowsSkipped =
        masterRows - masterRowsUsed;

    console.log(
        `   ↳ MASTER rows: ${masterRows.toLocaleString()}`
    );

    console.log(
        `   ↳ Unique MASTER Match IDs: ${masterMatchIds.size.toLocaleString()}`
    );

    console.log(
        `   ↳ Rows used for reconstruction: ${masterRowsUsed.toLocaleString()}`
    );

    console.log(
        `   ↳ Rows excluded from reconstruction: ${masterRowsSkipped.toLocaleString()}\n`
    );


    // ========================================================
    // 3. APPEARANCES / PLAYER RECONSTRUCTION
    // ========================================================

    console.log(
        '[3/6] Reconstructing Player statistics from APPEARANCES...'
    );

    await new Promise((resolve, reject) => {

        if (!fs.existsSync(APPEARANCES_FILE)) {
            reject(
                new Error(
                    `APPEARANCES file not found: ${APPEARANCES_FILE}`
                )
            );
            return;
        }

        fs.createReadStream(APPEARANCES_FILE)
            .pipe(csv())
            .on('data', row => {

                appearanceRows++;

                const sourceMatchId =
                    normalizeId(
                        row.zokascore_match_id ||
                        row.match_id
                    );

                if (!sourceMatchId) {

                    appearanceRowsSkipped++;

                    warnings.push(
                        `APPEARANCES row ${appearanceRows} missing match ID`
                    );

                    return;
                }

                const canonicalMatchId =
                    crosswalkMap.get(sourceMatchId) ||
                    sourceMatchId;

                if (!masterMatchIds.has(canonicalMatchId)) {

                    forensic.unknown_appearance_match_ids.add(
                        sourceMatchId
                    );

                    appearanceRowsSkipped++;

                    return;
                }


                const playerId =
                    normalizeId(
                        row.zokascore_player_id ||
                        row.player_id
                    );

                if (!playerId) {

                    forensic.missing_appearance_player_ids.add(
                        sourceMatchId
                    );

                    appearanceRowsSkipped++;

                    return;
                }


                if (!localPlayerStats.has(playerId)) {
                    localPlayerStats.set(
                        playerId,
                        createPlayerStats()
                    );
                }

                const player =
                    localPlayerStats.get(playerId);

                player.appearances++;

                const goals = safeNumber(row.goals);
                const assists = safeNumber(row.assists);
                const yellow = safeNumber(row.yellow_cards);
                const red = safeNumber(row.red_cards);

                /*
                 * Missing statistical cells are interpreted as zero
                 * because the APPEARANCES schema may legitimately
                 * represent "no event" using blank cells.
                 *
                 * Invalid numeric values are treated as zero but
                 * are recorded as warnings.
                 */

                if (
                    row.goals !== undefined &&
                    String(row.goals).trim() !== '' &&
                    goals === null
                ) {
                    warnings.push(
                        `Invalid goals value for player ${playerId}`
                    );
                }

                if (
                    row.assists !== undefined &&
                    String(row.assists).trim() !== '' &&
                    assists === null
                ) {
                    warnings.push(
                        `Invalid assists value for player ${playerId}`
                    );
                }

                player.goals += goals ?? 0;
                player.assists += assists ?? 0;
                player.yellow_cards += yellow ?? 0;
                player.red_cards += red ?? 0;

                appearanceRowsUsed++;

            })
            .on('end', resolve)
            .on('error', reject);
    });


    console.log(
        `   ↳ APPEARANCES rows: ${appearanceRows.toLocaleString()}`
    );

    console.log(
        `   ↳ Rows used: ${appearanceRowsUsed.toLocaleString()}`
    );

    console.log(
        `   ↳ Rows excluded: ${appearanceRowsSkipped.toLocaleString()}\n`
    );


    // ========================================================
    // 4. ARTIFACT COMPARISON
    // ========================================================

    console.log(
        '[4/6] Comparing independent reconstruction against intelligence artifacts...'
    );

    let mismatchCount = 0;

    const mismatchSamples = [];


    function recordMismatch(message, details = null) {

        mismatchCount++;

        if (mismatchSamples.length < 100) {

            mismatchSamples.push({
                message,
                details
            });
        }
    }


    // ========================================================
    // TEAM INTELLIGENCE
    // ========================================================

    console.log(
        '   ↳ Validating Team Intelligence...'
    );

    for (const [teamId, local] of localTeamStats.entries()) {

        const generated =
            teamIntel[teamId];

        if (!generated) {

            forensic.missing_team_intelligence.add(
                teamId
            );

            recordMismatch(
                `Team ${teamId} missing from team intelligence`
            );

            continue;
        }

        const differences =
            compareStats(
                local,
                generated,
                [
                    'matches',
                    'wins',
                    'draws',
                    'losses',
                    'goals_for',
                    'goals_against'
                ]
            );

        if (differences.length) {

            recordMismatch(
                `Team ${teamId} statistics mismatch`,
                differences
            );
        }
    }


    // Detect generated team records that were not reconstructed.
    for (const teamId of Object.keys(teamIntel)) {

        if (!localTeamStats.has(teamId)) {

            forensic.extra_team_intelligence.add(
                teamId
            );

            recordMismatch(
                `Team intelligence ${teamId} has no reconstructed MASTER statistics`
            );
        }
    }


    // ========================================================
    // H2H INTELLIGENCE
    // ========================================================

    console.log(
        '   ↳ Validating H2H Intelligence...'
    );

    for (const [key, local] of localH2HStats.entries()) {

        const generated =
            h2hIntel[key];

        if (!generated) {

            forensic.missing_h2h_intelligence.add(
                key
            );

            recordMismatch(
                `H2H ${key} missing from intelligence`
            );

            continue;
        }

        const differences =
            compareStats(
                local,
                generated,
                [
                    'matches',
                    'team_a_wins',
                    'team_b_wins',
                    'draws',
                    'team_a_goals',
                    'team_b_goals'
                ]
            );

        if (differences.length) {

            recordMismatch(
                `H2H ${key} statistics mismatch`,
                differences
            );
        }
    }


    for (const key of Object.keys(h2hIntel)) {

        if (!localH2HStats.has(key)) {

            forensic.extra_h2h_intelligence.add(
                key
            );

            recordMismatch(
                `H2H intelligence ${key} has no reconstructed MASTER statistics`
            );
        }
    }


    // ========================================================
    // PLAYER INTELLIGENCE
    // ========================================================

    console.log(
        '   ↳ Validating Player Intelligence...'
    );

    for (const [playerId, local] of localPlayerStats.entries()) {

        const generated =
            playerIntel[playerId];

        if (!generated) {

            forensic.missing_player_intelligence.add(
                playerId
            );

            recordMismatch(
                `Player ${playerId} missing from player intelligence`
            );

            continue;
        }

        const differences =
            compareStats(
                local,
                generated,
                [
                    'appearances',
                    'goals',
                    'assists',
                    'yellow_cards',
                    'red_cards'
                ]
            );

        if (differences.length) {

            recordMismatch(
                `Player ${playerId} statistics mismatch`,
                differences
            );
        }
    }


    for (const playerId of Object.keys(playerIntel)) {

        if (!localPlayerStats.has(playerId)) {

            forensic.extra_player_intelligence.add(
                playerId
            );

            /*
             * Do not automatically treat every extra player artifact
             * as fatal. A player intelligence profile may legitimately
             * exist without an appearance row in the current source
             * slice.
             *
             * Preserve it as a forensic warning.
             */
            warnings.push(
                `Player intelligence ${playerId} has no reconstructed appearance record`
            );
        }
    }


    // ========================================================
    // SEASONAL INTELLIGENCE
    // ========================================================

    console.log(
        '   ↳ Validating Seasonal Intelligence...'
    );

    let seasonalCompetitionsVerified = 0;
    let seasonalTeamsVerified = 0;

    for (
        const [season, competitionMap]
        of localSeasonalStats.entries()
    ) {

        const seasonFile =
            path.join(
                SEASONAL_DIR,
                `${safeFilename(season)}.json`
            );

        if (!fs.existsSync(seasonFile)) {

            forensic.missing_season_files.add(
                season
            );

            recordMismatch(
                `Season ${season} intelligence file missing`
            );

            continue;
        }

        let generatedSeason;

        try {

            generatedSeason =
                JSON.parse(
                    fs.readFileSync(
                        seasonFile,
                        'utf8'
                    )
                );

        } catch (error) {

            recordMismatch(
                `Season ${season} intelligence JSON invalid`,
                error.message
            );

            continue;
        }

        const generatedCompetitions =
            generatedSeason?.competitions;

        if (
            !generatedCompetitions ||
            typeof generatedCompetitions !== 'object'
        ) {

            recordMismatch(
                `Season ${season} has invalid competitions structure`
            );

            continue;
        }


        for (
            const [competition, teamMap]
            of competitionMap.entries()
        ) {

            seasonalCompetitionsVerified++;

            const generatedCompetition =
                generatedCompetitions[competition];

            if (!generatedCompetition) {

                forensic.missing_season_competitions.add(
                    `${season}/${competition}`
                );

                recordMismatch(
                    `Competition ${competition} missing from season ${season}`
                );

                continue;
            }

            const generatedTeams =
                generatedCompetition.teams;

            if (
                !generatedTeams ||
                typeof generatedTeams !== 'object'
            ) {

                recordMismatch(
                    `Season ${season}/${competition} has invalid teams structure`
                );

                continue;
            }


            for (
                const [teamId, localStats]
                of teamMap.entries()
            ) {

                seasonalTeamsVerified++;

                const generatedStats =
                    generatedTeams[teamId];

                if (!generatedStats) {

                    recordMismatch(
                        `Seasonal team ${season}/${competition}/${teamId} missing`
                    );

                    continue;
                }

                const differences =
                    compareStats(
                        localStats,
                        generatedStats,
                        [
                            'matches',
                            'wins',
                            'draws',
                            'losses',
                            'goals_for',
                            'goals_against'
                        ]
                    );

                if (differences.length) {

                    recordMismatch(
                        `Seasonal ${season}/${competition}/${teamId} mismatch`,
                        differences
                    );
                }
            }


            // Generated teams not present in reconstruction.
            for (
                const teamId
                of Object.keys(generatedTeams)
            ) {

                if (!teamMap.has(teamId)) {

                    recordMismatch(
                        `Seasonal artifact contains extra team ${season}/${competition}/${teamId}`
                    );
                }
            }
        }


        // Generated competitions not present in reconstruction.
        for (
            const competition
            of Object.keys(generatedCompetitions)
        ) {

            if (!competitionMap.has(competition)) {

                recordMismatch(
                    `Season ${season} contains extra competition ${competition}`
                );
            }
        }
    }


    // ========================================================
    // 5. CANONICAL / FORENSIC ASSESSMENT
    // ========================================================

    console.log(
        '[5/6] Performing canonical historical integrity assessment...'
    );


    /*
     * Orphan canonical IDs are deliberately NOT converted into
     * valid teams.
     *
     * They remain forensic findings.
     */

    if (forensic.orphan_team_ids.size > 0) {

        warnings.push(
            `Found ${forensic.orphan_team_ids.size} orphan team IDs not present in teams-index`
        );
    }


    if (forensic.orphan_team_names.size > 0) {

        warnings.push(
            `Found ${forensic.orphan_team_names.size} unresolved team names`
        );
    }


    if (forensic.ambiguous_team_names.size > 0) {

        warnings.push(
            `Found ${forensic.ambiguous_team_names.size} ambiguous team names`
        );
    }


    if (forensic.unknown_appearance_match_ids.size > 0) {

        warnings.push(
            `Found ${forensic.unknown_appearance_match_ids.size} APPEARANCES match references outside MASTER`
        );
    }


    if (forensic.invalid_score_rows > 0) {

        warnings.push(
            `Found ${forensic.invalid_score_rows} MASTER rows with invalid/missing scores`
        );
    }


    // ========================================================
    // STATUS
    // ========================================================

    /*
     * Fatal integrity conditions:
     *
     * - duplicate MASTER IDs
     * - missing MASTER IDs
     * - structurally invalid canonical rows
     * - statistical mismatches
     *
     * Forensic warnings do NOT automatically fail the audit:
     *
     * - orphan team IDs
     * - residual appearance references
     * - ambiguous names
     * - player profiles without current appearance rows
     */

    const fatalIntegrityFailures =
        failures.length +
        mismatchCount;


    const status =
        fatalIntegrityFailures === 0
            ? 'PASS'
            : 'FAIL';


    // ========================================================
    // 6. REPORT
    // ========================================================

    console.log(
        '[6/6] Generating historical integrity report...'
    );


    const report = {

        generated_at:
            new Date().toISOString(),

        step:
            '10-historical-integrity-audit',

        status,

        purpose:
            'Independent verification of canonical historical/statistical intelligence artifacts',

        source_layer: {
            master_file: MASTER_FILE,
            appearances_file: APPEARANCES_FILE,
            teams_index: TEAMS_INDEX_FILE,
            crosswalk: CROSSWALK_FILE
        },

        artifact_layer: {
            team_intelligence: TEAM_INTEL_FILE,
            h2h_intelligence: H2H_INTEL_FILE,
            player_intelligence: PLAYER_INTEL_FILE,
            seasonal_directory: SEASONAL_DIR
        },

        processing: {

            master_rows:
                masterRows,

            master_unique_match_ids:
                masterMatchIds.size,

            master_rows_used:
                masterRowsUsed,

            master_rows_skipped:
                masterRowsSkipped,

            appearance_rows:
                appearanceRows,

            appearance_rows_used:
                appearanceRowsUsed,

            appearance_rows_skipped:
                appearanceRowsSkipped
        },

        validation: {

            teams_reconstructed:
                localTeamStats.size,

            h2h_reconstructed:
                localH2HStats.size,

            players_reconstructed:
                localPlayerStats.size,

            seasonal_competitions_verified:
                seasonalCompetitionsVerified,

            seasonal_team_records_verified:
                seasonalTeamsVerified,

            duplicate_master_match_ids:
                forensic.duplicate_master_match_ids.size,

            missing_master_match_ids:
                forensic.missing_master_match_ids,

            structurally_invalid_master_rows:
                forensic.structurally_invalid_master_rows,

            invalid_score_rows:
                forensic.invalid_score_rows,

            statistical_mismatches:
                mismatchCount,

            fatal_failures:
                fatalIntegrityFailures
        },

        forensic_findings: {

            orphan_team_ids:
                Array.from(
                    forensic.orphan_team_ids
                ).sort(),

            orphan_team_names:
                Array.from(
                    forensic.orphan_team_names
                ).sort(),

            ambiguous_team_names:
                Array.from(
                    forensic.ambiguous_team_names
                ).sort(),

            missing_team_intelligence:
                Array.from(
                    forensic.missing_team_intelligence
                ).sort(),

            extra_team_intelligence:
                Array.from(
                    forensic.extra_team_intelligence
                ).sort(),

            missing_h2h_intelligence:
                Array.from(
                    forensic.missing_h2h_intelligence
                ).sort(),

            extra_h2h_intelligence:
                Array.from(
                    forensic.extra_h2h_intelligence
                ).sort(),

            missing_player_intelligence:
                Array.from(
                    forensic.missing_player_intelligence
                ).sort(),

            extra_player_intelligence:
                Array.from(
                    forensic.extra_player_intelligence
                ).sort(),

            missing_season_files:
                Array.from(
                    forensic.missing_season_files
                ).sort(),

            missing_season_competitions:
                Array.from(
                    forensic.missing_season_competitions
                ).sort(),

            unknown_appearance_match_ids:
                Array.from(
                    forensic.unknown_appearance_match_ids
                ).sort(),

            missing_appearance_player_ids:
                Array.from(
                    forensic.missing_appearance_player_ids
                ).sort()
        },

        diagnostics: {

            failures:
                failures.slice(0, 500),

            warnings:
                warnings.slice(0, 500),

            mismatch_samples:
                mismatchSamples
        },

        source_files_modified:
            false
    };


    const reportPath =
        path.join(
            AUDIT_DIR,
            'historical-integrity-report.json'
        );

    fs.writeFileSync(
        reportPath,
        JSON.stringify(report, null, 2),
        'utf8'
    );


    // ========================================================
    // CONSOLE
    // ========================================================

    console.log('\n============================================================');
    console.log(
        ` STEP 10 HISTORICAL INTEGRITY COMPLETE: ${status}`
    );
    console.log('============================================================');

    console.log(
        `MASTER rows                    : ${masterRows.toLocaleString()}`
    );

    console.log(
        `Unique MASTER Match IDs        : ${masterMatchIds.size.toLocaleString()}`
    );

    console.log(
        `MASTER duplicate IDs           : ${forensic.duplicate_master_match_ids.size.toLocaleString()}`
    );

    console.log(
        `MASTER missing IDs             : ${forensic.missing_master_match_ids.toLocaleString()}`
    );

    console.log(
        `Structurally invalid MASTER    : ${forensic.structurally_invalid_master_rows.toLocaleString()}`
    );

    console.log(
        `Invalid/missing scores         : ${forensic.invalid_score_rows.toLocaleString()}`
    );

    console.log(
        `Teams reconstructed            : ${localTeamStats.size.toLocaleString()}`
    );

    console.log(
        `H2H reconstructed              : ${localH2HStats.size.toLocaleString()}`
    );

    console.log(
        `Players reconstructed          : ${localPlayerStats.size.toLocaleString()}`
    );

    console.log(
        `Seasonal competitions verified: ${seasonalCompetitionsVerified.toLocaleString()}`
    );

    console.log(
        `Seasonal team records verified : ${seasonalTeamsVerified.toLocaleString()}`
    );

    console.log(
        `Statistical mismatches         : ${mismatchCount.toLocaleString()}`
    );

    console.log(
        `Orphan canonical team IDs      : ${forensic.orphan_team_ids.size.toLocaleString()}`
    );

    console.log(
        `Unknown appearance Match IDs  : ${forensic.unknown_appearance_match_ids.size.toLocaleString()}`
    );

    console.log(
        `Warnings                       : ${warnings.length.toLocaleString()}`
    );

    console.log(
        `Failures                       : ${fatalIntegrityFailures.toLocaleString()}`
    );

    console.log(
        `\n📁 Audit report: ${reportPath}`
    );


    // ========================================================
    // FORENSIC SUMMARY
    // ========================================================

    if (forensic.orphan_team_ids.size > 0) {

        console.log('\n🟡 FORENSIC FINDING');

        console.log(
            `   ${forensic.orphan_team_ids.size.toLocaleString()} orphan canonical team IDs remain unresolved.`
        );

        console.log(
            '   They were NOT silently substituted or removed.'
        );
    }


    if (forensic.unknown_appearance_match_ids.size > 0) {

        console.log('\n🟡 FORENSIC FINDING');

        console.log(
            `   ${forensic.unknown_appearance_match_ids.size.toLocaleString()} APPEARANCES Match IDs are outside MASTER.`
        );

        console.log(
            '   These residuals were preserved and excluded from statistical reconstruction.'
        );
    }


    if (forensic.ambiguous_team_names.size > 0) {

        console.log('\n🟡 FORENSIC FINDING');

        console.log(
            `   ${forensic.ambiguous_team_names.size.toLocaleString()} ambiguous team names were detected.`
        );

        console.log(
            '   They were NOT auto-resolved.'
        );
    }


    if (mismatchCount === 0) {

        console.log('\n✅ Independent statistical reconstruction matches generated artifacts.');

    } else {

        console.log(
            `\n❌ ${mismatchCount.toLocaleString()} statistical/artifact mismatches detected.`
        );

        console.log(
            '   Review historical-integrity-report.json before proceeding.'
        );
    }


    console.log('\n🔒 Canonical source files were NOT modified.');

    console.log('============================================================\n');


    if (status === 'FAIL') {
        process.exitCode = 1;
    }
}


// ============================================================
// EXECUTE
// ============================================================

run().catch(error => {

    console.error('\n============================================================');
    console.error('❌ STEP 10 FAILED');
    console.error('============================================================');

    console.error(error);

    process.exit(1);
});