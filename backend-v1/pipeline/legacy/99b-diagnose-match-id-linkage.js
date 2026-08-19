'use strict';

/**
 * 99b-diagnose-match-id-linkage.js
 *
 * ============================================================
 * ZOKASCORE V2 — MATCH ID LINKAGE FORENSICS
 * ============================================================
 *
 * Purpose:
 *   Determine why APPEARANCES/EVENTS use ZK_MATCH_* IDs while
 *   MASTER uses a different zokascore_match_id namespace.
 *
 * IMPORTANT:
 *   READ ONLY.
 *
 *   This script:
 *   - modifies no canonical files
 *   - modifies no public_data
 *   - performs no repairs
 *   - does not create mappings
 *
 * It only measures whether appearance/event match IDs can be
 * linked to MASTER through existing match information.
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

const MASTER_FILE = 'ZOKASCORE_PUBLIC_MASTER.csv';
const APPEARANCES_FILE = 'ZOKASCORE_APPEARANCES.csv';
const EVENTS_FILE = 'ZOKASCORE_EVENTS.csv';

function normalize(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function normalizeTeam(value) {
    return normalize(value)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function makeKey(date, home, away) {
    return [
        normalize(date),
        normalizeTeam(home),
        normalizeTeam(away)
    ].join('|');
}

function readCsv(file) {
    return new Promise((resolve, reject) => {
        const results = [];

        const fullPath = path.join(DATA_DIR, file);

        if (!fs.existsSync(fullPath)) {
            return reject(new Error(`Missing file: ${fullPath}`));
        }

        fs.createReadStream(fullPath)
            .pipe(csv())
            .on('data', row => results.push(row))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

function streamCsv(file, onRow) {
    return new Promise((resolve, reject) => {
        const fullPath = path.join(DATA_DIR, file);

        if (!fs.existsSync(fullPath)) {
            return reject(new Error(`Missing file: ${fullPath}`));
        }

        let count = 0;

        fs.createReadStream(fullPath)
            .pipe(csv())
            .on('data', row => {
                count++;
                onRow(row, count);
            })
            .on('end', () => resolve(count))
            .on('error', reject);
    });
}

async function run() {

    console.log('\n============================================================');
    console.log(' ZOKASCORE V2 — MATCH ID LINKAGE FORENSICS');
    console.log('============================================================');

    console.log(`Source: ${DATA_DIR}`);

    // ========================================================
    // 1. LOAD MASTER INDEX
    // ========================================================

    console.log('\n[1] BUILDING MASTER MATCH INDEX...');

    const master = await readCsv(MASTER_FILE);

    const masterById = new Map();
    const masterByMatchId = new Map();
    const masterByDateTeams = new Map();

    for (const row of master) {

        const zokascoreId = normalize(row.zokascore_match_id);
        const matchId = normalize(row.match_id);

        if (zokascoreId) {
            masterById.set(zokascoreId, row);
        }

        if (matchId) {
            masterByMatchId.set(matchId, row);
        }

        if (
            row.date &&
            row.home_team &&
            row.away_team
        ) {
            const key = makeKey(
                row.date,
                row.home_team,
                row.away_team
            );

            if (!masterByDateTeams.has(key)) {
                masterByDateTeams.set(key, []);
            }

            masterByDateTeams.get(key).push(row);
        }
    }

    console.log(`MASTER rows: ${master.length.toLocaleString()}`);
    console.log(`MASTER zokascore IDs: ${masterById.size.toLocaleString()}`);
    console.log(`MASTER match_id values: ${masterByMatchId.size.toLocaleString()}`);
    console.log(`MASTER date/home/away keys: ${masterByDateTeams.size.toLocaleString()}`);

    // ========================================================
    // 2. INSPECT APPEARANCE IDS
    // ========================================================

    console.log('\n[2] ANALYZING APPEARANCE MATCH IDs...');

    let appearanceRows = 0;

    let exactZokascoreMatches = 0;
    let exactMatchIdMatches = 0;

    let unresolved = 0;

    const appearanceIdSamples = [];
    const unresolvedSamples = [];

    await streamCsv(APPEARANCES_FILE, row => {

        appearanceRows++;

        const appearanceMatchId =
            normalize(row.zokascore_match_id);

        if (!appearanceMatchId) {
            unresolved++;
            return;
        }

        if (masterById.has(appearanceMatchId)) {
            exactZokascoreMatches++;

            if (appearanceIdSamples.length < 10) {
                appearanceIdSamples.push({
                    appearanceId: row.zokascore_match_id,
                    masterId: masterById.get(appearanceMatchId).zokascore_match_id
                });
            }

            return;
        }

        if (masterByMatchId.has(appearanceMatchId)) {
            exactMatchIdMatches++;
            return;
        }

        unresolved++;

        if (unresolvedSamples.length < 20) {
            unresolvedSamples.push({
                appearanceMatchId: row.zokascore_match_id
            });
        }
    });

    console.log(`APPEARANCES rows: ${appearanceRows.toLocaleString()}`);
    console.log(`Exact MASTER zokascore_match_id matches: ${exactZokascoreMatches.toLocaleString()}`);
    console.log(`Exact MASTER match_id matches: ${exactMatchIdMatches.toLocaleString()}`);
    console.log(`Unresolved by direct ID: ${unresolved.toLocaleString()}`);

    // ========================================================
    // 3. SHOW SAMPLE APPEARANCE IDS
    // ========================================================

    console.log('\n[3] SAMPLE APPEARANCE MATCH IDs');

    const uniqueAppearanceSamples = new Set();

    await streamCsv(APPEARANCES_FILE, row => {

        if (uniqueAppearanceSamples.size >= 10) return;

        const id = String(row.zokascore_match_id || '').trim();

        if (id) {
            uniqueAppearanceSamples.add(id);
        }
    });

    for (const id of uniqueAppearanceSamples) {
        console.log(`  ${id}`);
    }

    // ========================================================
    // 4. SHOW SAMPLE EVENT IDS
    // ========================================================

    console.log('\n[4] SAMPLE EVENT MATCH IDs');

    const uniqueEventSamples = new Set();

    await streamCsv(EVENTS_FILE, row => {

        if (uniqueEventSamples.size >= 10) return;

        const id = String(row.zokascore_match_id || '').trim();

        if (id) {
            uniqueEventSamples.add(id);
        }
    });

    for (const id of uniqueEventSamples) {
        console.log(`  ${id}`);
    }

    // ========================================================
    // 5. LOOK FOR STRUCTURAL ID PATTERNS
    // ========================================================

    console.log('\n[5] ID PATTERN ANALYSIS');

    const patterns = {
        ZK_MATCH: 0,
        ZK_OTHER: 0,
        EMPTY: 0
    };

    await streamCsv(APPEARANCES_FILE, row => {

        const id = String(row.zokascore_match_id || '').trim();

        if (!id) {
            patterns.EMPTY++;
        } else if (id.startsWith('ZK_MATCH_')) {
            patterns.ZK_MATCH++;
        } else {
            patterns.ZK_OTHER++;
        }
    });

    console.log(`  ZK_MATCH_* IDs: ${patterns.ZK_MATCH.toLocaleString()}`);
    console.log(`  Other IDs:      ${patterns.ZK_OTHER.toLocaleString()}`);
    console.log(`  Blank IDs:      ${patterns.EMPTY.toLocaleString()}`);

    // ========================================================
    // 6. ATTEMPT TO PARSE ZK_MATCH_* ID
    // ========================================================

    console.log('\n[6] SAMPLE ZK_MATCH_* ID PARSING');

    const parseSamples = [];

    for (const id of uniqueAppearanceSamples) {

        if (!id.startsWith('ZK_MATCH_')) continue;

        const raw = id.substring('ZK_MATCH_'.length);

        const parts = raw.split('_');

        parseSamples.push({
            original: id,
            remainder: raw,
            parts
        });
    }

    for (const sample of parseSamples) {

        console.log(`\n  ID: ${sample.original}`);
        console.log(`  Remainder: ${sample.remainder}`);
        console.log(`  Parts: ${JSON.stringify(sample.parts)}`);
    }

    // ========================================================
    // 7. REPORT
    // ========================================================

    console.log('\n============================================================');
    console.log(' LINKAGE FORENSICS RESULT');
    console.log('============================================================');

    console.log(`
MASTER:
  ${master.length.toLocaleString()} matches

APPEARANCES:
  ${appearanceRows.toLocaleString()} rows

Direct ID linkage:
  MASTER zokascore_match_id : ${exactZokascoreMatches.toLocaleString()}
  MASTER match_id           : ${exactMatchIdMatches.toLocaleString()}
  unresolved                : ${unresolved.toLocaleString()}
`);

    console.log('Sample unresolved appearance IDs:');

    for (const sample of unresolvedSamples) {
        console.log(`  ${sample.appearanceMatchId}`);
    }

    console.log('\n============================================================');
    console.log(' NO FILES MODIFIED');
    console.log('============================================================');
}

run().catch(error => {

    console.error('\n============================================================');
    console.error(' FATAL ERROR');
    console.error('============================================================');

    console.error(error);

    process.exitCode = 1;
});