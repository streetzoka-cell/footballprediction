'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const MASTER_FILE = path.join(
    ROOT,
    'data',
    'source',
    'ZOKASCORE_FINAL',
    'ZOKASCORE_PUBLIC_MASTER.csv'
);

const OUTPUT_DIR = path.join(
    ROOT,
    'data',
    'intelligence',
    'elo'
);

const MATCH_OUTPUT = path.join(
    OUTPUT_DIR,
    'match_elo.json'
);

const TEAM_OUTPUT = path.join(
    OUTPUT_DIR,
    'team_elo.json'
);

const REPORT_OUTPUT = path.join(
    OUTPUT_DIR,
    'elo-report.json'
);

// ============================================================
// CONFIGURATION
// ============================================================

const BASE_ELO = 1500.0;
const K_FACTOR = 20.0;

// Preserve the existing ZOKASCORE baseline mathematics.
// Home advantage is deliberately NOT introduced here.
// That can be evaluated separately rather than silently
// changing the historical model specification.
const HOME_ADVANTAGE = 0.0;

// ============================================================
// HELPERS
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
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

function compareRows(a, b) {
    const dateA = String(a.date || '');
    const dateB = String(b.date || '');

    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;

    const idA = String(a.zokascore_match_id || '');
    const idB = String(b.zokascore_match_id || '');

    if (idA < idB) return -1;
    if (idA > idB) return 1;

    return 0;
}

function expectedHomeScore(homeElo, awayElo) {
    return 1 / (
        1 +
        Math.pow(
            10,
            ((awayElo - homeElo) / 400.0)
        )
    );
}

function marginOfVictoryMultiplier(homeScore, awayScore) {
    const goalDiff = Math.abs(homeScore - awayScore);

    if (goalDiff <= 1) {
        return 1.0;
    }

    if (goalDiff === 2) {
        return 1.5;
    }

    return (11.0 + goalDiff) / 8.0;
}

function actualResult(homeScore, awayScore) {
    if (homeScore > awayScore) {
        return [1.0, 0.0];
    }

    if (homeScore < awayScore) {
        return [0.0, 1.0];
    }

    return [0.5, 0.5];
}

// ============================================================
// MAIN
// ============================================================

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — STEP 32: CANONICAL ELO ENGINE');
    console.log('============================================================\n');

    ensureDir(OUTPUT_DIR);

    // --------------------------------------------------------
    // STEP 1 — LOAD MASTER
    // --------------------------------------------------------

    console.log('[1/5] Loading canonical MASTER...');

    const rows = [];

    let masterRows = 0;
    let missingMatchId = 0;
    let missingTeamId = 0;
    let invalidScores = 0;
    let selfMatches = 0;
    let duplicateIds = 0;

    const seenMatchIds = new Set();

    await new Promise((resolve, reject) => {
        fs.createReadStream(MASTER_FILE)
            .pipe(csv())
            .on('data', row => {
                masterRows++;

                const matchId = String(
                    row.zokascore_match_id ?? ''
                ).trim();

                const homeId = String(
                    row.home_team_id ?? ''
                ).trim();

                const awayId = String(
                    row.away_team_id ?? ''
                ).trim();

                const date = String(
                    row.date ?? ''
                ).trim();

                const homeScore = safeNumber(row.home_score);
                const awayScore = safeNumber(row.away_score);

                // ------------------------------------------------
                // Match ID validation
                // ------------------------------------------------

                if (!matchId) {
                    missingMatchId++;
                    return;
                }

                if (seenMatchIds.has(matchId)) {
                    duplicateIds++;
                    return;
                }

                seenMatchIds.add(matchId);

                // ------------------------------------------------
                // Canonical identity validation
                // ------------------------------------------------

                if (!homeId || !awayId) {
                    missingTeamId++;
                    return;
                }

                // Permanent ZOKASCORE identity gate.
                if (
                    !homeId.startsWith('ZK_TEAM_') ||
                    !awayId.startsWith('ZK_TEAM_')
                ) {
                    missingTeamId++;
                    return;
                }

                // Self-match exclusion.
                if (homeId === awayId) {
                    selfMatches++;
                    return;
                }

                // ------------------------------------------------
                // Score validation
                // ------------------------------------------------

                if (
                    !Number.isFinite(homeScore) ||
                    !Number.isFinite(awayScore)
                ) {
                    invalidScores++;
                    return;
                }

                rows.push({
                    zokascore_match_id: matchId,
                    date,
                    season: String(row.season ?? '').trim(),
                    competition: String(row.competition ?? '').trim(),

                    home_team_id: homeId,
                    away_team_id: awayId,

                    home_score: homeScore,
                    away_score: awayScore
                });
            })
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`   ↳ MASTER rows scanned:       ${masterRows.toLocaleString()}`);
    console.log(`   ↳ Valid ELO matches:         ${rows.length.toLocaleString()}`);
    console.log(`   ↳ Missing Match IDs:         ${missingMatchId.toLocaleString()}`);
    console.log(`   ↳ Missing canonical Team IDs:${missingTeamId.toLocaleString()}`);
    console.log(`   ↳ Self-matches:              ${selfMatches.toLocaleString()}`);
    console.log(`   ↳ Invalid/missing scores:    ${invalidScores.toLocaleString()}`);
    console.log(`   ↳ Duplicate Match IDs:       ${duplicateIds.toLocaleString()}`);

    // --------------------------------------------------------
    // HARD INTEGRITY GATES
    // --------------------------------------------------------

    if (duplicateIds !== 0) {
        throw new Error(
            `ELO aborted: ${duplicateIds} duplicate Match IDs detected.`
        );
    }

    if (rows.length !== 484270) {
        throw new Error(
            `ELO population mismatch: expected 484,270 valid matches, got ${rows.length}.`
        );
    }

    if (masterRows !== 484363) {
        throw new Error(
            `MASTER population mismatch: expected 484,363 rows, got ${masterRows}.`
        );
    }

    if (missingMatchId !== 0) {
        throw new Error(
            `ELO aborted: ${missingMatchId} MASTER rows have missing Match IDs.`
        );
    }

    if (missingTeamId !== 84) {
        throw new Error(
            `ELO identity accounting mismatch: expected 84 unresolved/missing canonical team rows, got ${missingTeamId}.`
        );
    }

    if (selfMatches !== 4) {
        throw new Error(
            `ELO self-match accounting mismatch: expected 4, got ${selfMatches}.`
        );
    }

    if (invalidScores !== 5) {
        throw new Error(
            `ELO score accounting mismatch: expected 5 invalid/missing score rows, got ${invalidScores}.`
        );
    }

    console.log('\n   ✅ ELO population matches Step 10/11 validated population.');
    console.log('   ✅ Canonical ZK_TEAM identity gate passed.');
    console.log('   ✅ Duplicate Match ID gate passed.');

    // --------------------------------------------------------
    // STEP 2 — CHRONOLOGICAL ORDER
    // --------------------------------------------------------

    console.log('\n[2/5] Sorting canonical matches chronologically...');

    rows.sort(compareRows);

    console.log(
        `   ↳ Chronological matches: ${rows.length.toLocaleString()}`
    );

    // --------------------------------------------------------
    // STEP 3 — CALCULATE ELO
    // --------------------------------------------------------

    console.log('\n[3/5] Calculating pre-match and post-match ELO...');

    const teamRatings = new Map();
    const matchElo = [];

    let processed = 0;
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;

    for (const match of rows) {
        const homeId = match.home_team_id;
        const awayId = match.away_team_id;

        if (!teamRatings.has(homeId)) {
            teamRatings.set(homeId, BASE_ELO);
        }

        if (!teamRatings.has(awayId)) {
            teamRatings.set(awayId, BASE_ELO);
        }

        const homePreElo = teamRatings.get(homeId);
        const awayPreElo = teamRatings.get(awayId);

        const adjustedHomeElo =
            homePreElo + HOME_ADVANTAGE;

        const expectedHome =
            expectedHomeScore(
                adjustedHomeElo,
                awayPreElo
            );

        const expectedAway =
            1.0 - expectedHome;

        const [
            actualHome,
            actualAway
        ] = actualResult(
            match.home_score,
            match.away_score
        );

        if (actualHome === 1.0) {
            homeWins++;
        } else if (actualHome === 0.5) {
            draws++;
        } else {
            awayWins++;
        }

        const movMultiplier =
            marginOfVictoryMultiplier(
                match.home_score,
                match.away_score
            );

        const homeDelta =
            K_FACTOR *
            movMultiplier *
            (actualHome - expectedHome);

        const awayDelta =
            K_FACTOR *
            movMultiplier *
            (actualAway - expectedAway);

        const homePostElo =
            homePreElo + homeDelta;

        const awayPostElo =
            awayPreElo + awayDelta;

        teamRatings.set(homeId, homePostElo);
        teamRatings.set(awayId, awayPostElo);

        matchElo.push({
            zokascore_match_id: match.zokascore_match_id,
            date: match.date,
            season: match.season,
            competition: match.competition,

            home_team_id: homeId,
            away_team_id: awayId,

            home_score: match.home_score,
            away_score: match.away_score,

            home_elo_pre: Number(homePreElo.toFixed(6)),
            away_elo_pre: Number(awayPreElo.toFixed(6)),

            expected_home: Number(expectedHome.toFixed(6)),
            expected_away: Number(expectedAway.toFixed(6)),

            elo_delta_home: Number(homeDelta.toFixed(6)),
            elo_delta_away: Number(awayDelta.toFixed(6)),

            home_elo_post: Number(homePostElo.toFixed(6)),
            away_elo_post: Number(awayPostElo.toFixed(6)),

            mov_multiplier: Number(movMultiplier.toFixed(6))
        });

        processed++;
    }

    console.log(
        `   ↳ Matches processed: ${processed.toLocaleString()}`
    );

    // --------------------------------------------------------
    // STEP 4 — BUILD FINAL TEAM RATINGS
    // --------------------------------------------------------

    console.log('\n[4/5] Building final team ELO index...');

    const teamElo = {};

    for (const [teamId, rating] of teamRatings.entries()) {
        teamElo[teamId] = {
            team_id: teamId,
            current_elo: Number(rating.toFixed(6))
        };
    }

    // --------------------------------------------------------
    // STEP 5 — WRITE ATOMICALLY
    // --------------------------------------------------------

    console.log('\n[5/5] Writing ELO artifacts atomically...');

    const matchTemp = `${MATCH_OUTPUT}.tmp`;
    const teamTemp = `${TEAM_OUTPUT}.tmp`;
    const reportTemp = `${REPORT_OUTPUT}.tmp`;

    const report = {
        pipeline_step: '32',
        status: 'PASS',

        source: 'ZOKASCORE_PUBLIC_MASTER.csv',

        master_rows: masterRows,
        matches_processed: processed,

        exclusions: {
            missing_match_id: missingMatchId,
            missing_team_id: missingTeamId,
            self_matches: selfMatches,
            invalid_or_missing_scores: invalidScores,
            duplicate_match_ids: duplicateIds
        },

        parameters: {
            base_elo: BASE_ELO,
            k_factor: K_FACTOR,
            home_advantage: HOME_ADVANTAGE,
            margin_of_victory: true
        },

        results: {
            home_wins: homeWins,
            draws,
            away_wins: awayWins
        },

        teams_with_ratings: teamRatings.size,

        identity: {
            namespace: 'ZK_TEAM_*',
            canonical_identity: true,
            team_names_used_for_identity: false
        },

        leakage_control: {
            match_rating_fields: 'pre-match',
            chronological_order: 'date + zokascore_match_id'
        },

        generated_at: new Date().toISOString()
    };

    fs.writeFileSync(
        matchTemp,
        JSON.stringify(matchElo),
        'utf8'
    );

    fs.writeFileSync(
        teamTemp,
        JSON.stringify(teamElo, null, 2),
        'utf8'
    );

    fs.writeFileSync(
        reportTemp,
        JSON.stringify(report, null, 2),
        'utf8'
    );

    // Basic artifact validation before publication.
    const writtenMatches =
        JSON.parse(fs.readFileSync(matchTemp, 'utf8'));

    const writtenTeams =
        JSON.parse(fs.readFileSync(teamTemp, 'utf8'));

    if (writtenMatches.length !== processed) {
        throw new Error(
            'Temporary Match ELO artifact failed population validation.'
        );
    }

    if (Object.keys(writtenTeams).length !== teamRatings.size) {
        throw new Error(
            'Temporary Team ELO artifact failed population validation.'
        );
    }

    fs.renameSync(matchTemp, MATCH_OUTPUT);
    fs.renameSync(teamTemp, TEAM_OUTPUT);
    fs.renameSync(reportTemp, REPORT_OUTPUT);

    console.log('   ↳ Temporary ELO artifacts validated.');
    console.log('   ↳ Final ELO artifacts published atomically.');

    // --------------------------------------------------------
    // FINAL REPORT
    // --------------------------------------------------------

    console.log('\n============================================================');
    console.log(' STEP 32 COMPLETE: PASS');
    console.log('============================================================');

    console.log(
        `📊 MASTER Rows:             ${masterRows.toLocaleString()}`
    );

    console.log(
        `📊 ELO Matches:             ${processed.toLocaleString()}`
    );

    console.log(
        `📊 Teams with ELO:          ${teamRatings.size.toLocaleString()}`
    );

    console.log(
        `📊 Home Wins:               ${homeWins.toLocaleString()}`
    );

    console.log(
        `📊 Draws:                   ${draws.toLocaleString()}`
    );

    console.log(
        `📊 Away Wins:               ${awayWins.toLocaleString()}`
    );

    console.log(`📁 Match ELO: ${MATCH_OUTPUT}`);
    console.log(`📁 Team ELO:  ${TEAM_OUTPUT}`);
    console.log(`📁 Report:    ${REPORT_OUTPUT}`);

    console.log('\n🔒 Canonical V2 source data was NOT modified.');
    console.log('🔒 ELO artifacts are derived from the canonical backbone.');
    console.log('🔒 Pre-match ratings are safe for downstream prediction features.');
    console.log('============================================================');
}

run().catch(err => {
    console.error('\n============================================================');
    console.error('❌ STEP 32 FAILED');
    console.error('============================================================');
    console.error(err.message || err);
    process.exit(1);
});