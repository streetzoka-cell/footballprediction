'use strict';

/**
 * ============================================================
 * 01-build-canonical-indexes.js
 *
 * ============================================================
 * ZOKASCORE V2 — PHASE B: CANONICAL INDEXING & CROSSWALK
 * ============================================================
 *
 * Purpose:
 *   1. Build fast JSON indexes for Teams, Players and Competitions.
 *   2. Build a deterministic MASTER match metadata index.
 *   3. Resolve secondary match IDs from APPEARANCES/EVENTS
 *      to canonical MASTER match IDs.
 *   4. Preserve unresolved cases for forensic review.
 *
 * Match namespace bridge:
 *   Secondary IDs: ZK_MATCH_YYYYMMDD_home_away
 *   Canonical IDs: zokascore_match_id
 *
 * Resolution uses candidate matching:
 *   Parses date, then tests every underscore boundary in the remainder
 *   against the MASTER metadata index.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(__dirname, '..', 'data', 'source', 'ZOKASCORE_FINAL');
const INDEX_DIR = path.join(__dirname, '..', 'data', 'indexes');

const MASTER_FILE = 'ZOKASCORE_PUBLIC_MASTER.csv';
const SECONDARY_FILES = [
    'ZOKASCORE_APPEARANCES.csv',
    'ZOKASCORE_EVENTS.csv'
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (/^\d{8}$/.test(v)) return `${v.substring(0, 4)}-${v.substring(4, 6)}-${v.substring(6, 8)}`;
    return v;
}

function buildKey(date, home, away) {
    return [normalizeDate(date), compact(home), compact(away)].join('|');
}

function buildReverseKey(date, home, away) {
    return [normalizeDate(date), compact(away), compact(home)].join('|');
}

async function buildMasterIndexes() {
    return new Promise((resolve, reject) => {
        const direct = new Map();
        const reverse = new Map();
        const directCollisions = new Map();
        const reverseCollisions = new Map();

        let rows = 0;
        let validRows = 0;

        const fullPath = path.join(DATA_DIR, MASTER_FILE);
        if (!fs.existsSync(fullPath)) return reject(new Error(`Missing MASTER file: ${fullPath}`));

        fs.createReadStream(fullPath)
            .pipe(csv())
            .on('data', row => {
                rows++;
                const id = String(row.zokascore_match_id ?? '').trim();
                const date = String(row.date ?? '').trim();
                const home = String(row.home_team ?? '').trim();
                const away = String(row.away_team ?? '').trim();

                if (!id || !date || !home || !away) return;
                validRows++;

                const dKey = buildKey(date, home, away);
                const rKey = buildReverseKey(date, home, away);

                if (!direct.has(dKey)) {
                    direct.set(dKey, id);
                } else if (direct.get(dKey) !== id) {
                    if (!directCollisions.has(dKey)) directCollisions.set(dKey, new Set([direct.get(dKey)]));
                    directCollisions.get(dKey).add(id);
                }

                if (!reverse.has(rKey)) {
                    reverse.set(rKey, id);
                } else if (reverse.get(rKey) !== id) {
                    if (!reverseCollisions.has(rKey)) reverseCollisions.set(rKey, new Set([reverse.get(rKey)]));
                    reverseCollisions.get(rKey).add(id);
                }
            })
            .on('end', () => {
                console.log(`[INDEX] MASTER rows: ${rows.toLocaleString()}`);
                console.log(`[INDEX] MASTER valid metadata rows: ${validRows.toLocaleString()}`);
                console.log(`[INDEX] Direct keys: ${direct.size.toLocaleString()}`);
                console.log(`[INDEX] Reverse keys: ${reverse.size.toLocaleString()}`);
                console.log(`[INDEX] Direct collisions: ${directCollisions.size.toLocaleString()}`);
                console.log(`[INDEX] Reverse collisions: ${reverseCollisions.size.toLocaleString()}`);
                
                resolve({ direct, reverse, directCollisions, reverseCollisions, rows, validRows });
            })
            .on('error', reject);
    });
}

/**
 * Parse a secondary match ID into multiple boundary candidates.
 * 
 * Tests every underscore in the body string as a potential home/away separator.
 */
function parseSecondaryCandidates(secondaryId) {
    const id = String(secondaryId ?? '').trim();
    const match = id.match(/^ZK_MATCH_(\d{8})_(.+)$/i);
    if (!match) return null;

    const date = `${match[1].substring(0,4)}-${match[1].substring(4,6)}-${match[1].substring(6,8)}`;
    const body = match[2];

    const candidates = [];
    for (let i = 0; i < body.length; i++) {
        if (body[i] === '_') {
            const home = body.slice(0, i).trim();
            const away = body.slice(i + 1).trim();
            if (home && away) {
                candidates.push({ date, home, away });
            }
        }
    }
    return candidates.length ? { date, candidates } : null;
}

function resolveSecondaryMatchId(secondaryId, masterIndexes) {
    const id = String(secondaryId ?? '').trim();
    if (!id) return { canonicalId: null, method: 'blank' };

    const parsed = parseSecondaryCandidates(id);
    if (!parsed) return { canonicalId: null, method: 'invalid_secondary_id' };

    // Test each candidate boundary against the MASTER index
    for (const candidate of parsed.candidates) {
        const dKey = buildKey(parsed.date, candidate.home, candidate.away);
        const rKey = buildReverseKey(parsed.date, candidate.home, candidate.away);

        const directId = masterIndexes.direct.get(dKey);
        if (directId) return { canonicalId: directId, method: 'direct_normalized' };

        const reverseId = masterIndexes.reverse.get(rKey);
        if (reverseId) return { canonicalId: reverseId, method: 'reverse_normalized' };
    }

    return { canonicalId: null, method: 'unresolved' };
}

async function buildCrosswalk(masterIndexes) {
    const crosswalk = {};
    const unresolved = {
        'ZOKASCORE_APPEARANCES.csv': [],
        'ZOKASCORE_EVENTS.csv': []
    };

    const statistics = {
        'ZOKASCORE_APPEARANCES.csv': {
            rows: 0, uniqueSecondaryIds: 0, resolved: 0, directNormalized: 0, reverseNormalized: 0, unresolved: 0, invalidIds: 0, blankIds: 0
        },
        'ZOKASCORE_EVENTS.csv': {
            rows: 0, uniqueSecondaryIds: 0, resolved: 0, directNormalized: 0, reverseNormalized: 0, unresolved: 0, invalidIds: 0, blankIds: 0
        }
    };

    for (const fileName of SECONDARY_FILES) {
        await new Promise((resolve, reject) => {
            const stats = statistics[fileName];
            const seenIds = new Set();
            const fullPath = path.join(DATA_DIR, fileName);

            if (!fs.existsSync(fullPath)) return reject(new Error(`Missing file: ${fullPath}`));

            fs.createReadStream(fullPath)
                .pipe(csv())
                .on('data', row => {
                    stats.rows++;
                    const secondaryId = String(row.zokascore_match_id ?? '').trim();

                    if (!secondaryId) {
                        stats.blankIds++;
                        return;
                    }

                    if (seenIds.has(secondaryId)) return;
                    seenIds.add(secondaryId);
                    stats.uniqueSecondaryIds++;

                    const result = resolveSecondaryMatchId(secondaryId, masterIndexes);

                    if (result.canonicalId) {
                        crosswalk[secondaryId] = result.canonicalId;
                        stats.resolved++;
                        if (result.method === 'direct_normalized') stats.directNormalized++;
                        if (result.method === 'reverse_normalized') stats.reverseNormalized++;
                        return;
                    }

                    if (result.method === 'invalid_secondary_id') {
                        stats.invalidIds++;
                    } else if (result.method === 'unresolved') {
                        stats.unresolved++;
                    }

                    if (unresolved[fileName].length < 5000) {
                        unresolved[fileName].push({
                            secondary_id: secondaryId,
                            reason: result.method
                        });
                    }
                })
                .on('end', () => {
                    console.log(`[INDEX] ${fileName}`);
                    console.log(`        Rows: ${stats.rows.toLocaleString()}`);
                    console.log(`        Unique IDs: ${stats.uniqueSecondaryIds.toLocaleString()}`);
                    console.log(`        Resolved: ${stats.resolved.toLocaleString()}`);
                    console.log(`        Direct: ${stats.directNormalized.toLocaleString()}`);
                    console.log(`        Reverse: ${stats.reverseNormalized.toLocaleString()}`);
                    console.log(`        Unresolved: ${stats.unresolved.toLocaleString()}`);
                    console.log(`        Invalid IDs: ${stats.invalidIds.toLocaleString()}`);
                    console.log(`        Blank IDs: ${stats.blankIds.toLocaleString()}`);
                    resolve();
                })
                .on('error', reject);
        });
    }

    const crosswalkPath = path.join(INDEX_DIR, 'match-id-crosswalk.json');
    const unresolvedPath = path.join(INDEX_DIR, 'match-id-unresolved.json');
    const statisticsPath = path.join(INDEX_DIR, 'match-id-crosswalk-report.json');

    fs.writeFileSync(crosswalkPath, JSON.stringify(crosswalk, null, 2), 'utf8');
    fs.writeFileSync(unresolvedPath, JSON.stringify(unresolved, null, 2), 'utf8');

    const report = {
        generatedAt: new Date().toISOString(),
        sourceDirectory: 'data/source/ZOKASCORE_FINAL',
        masterFile: MASTER_FILE,
        crosswalkEntries: Object.keys(crosswalk).length,
        statistics,
        unresolvedSamples: {
            appearances: unresolved['ZOKASCORE_APPEARANCES.csv'].length,
            events: unresolved['ZOKASCORE_EVENTS.csv'].length
        }
    };

    fs.writeFileSync(statisticsPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`\n[INDEX] Crosswalk entries: ${Object.keys(crosswalk).length.toLocaleString()}`);
    console.log(`[INDEX] Crosswalk written: ${crosswalkPath}`);
    console.log(`[INDEX] Unresolved report: ${unresolvedPath}`);
    console.log(`[INDEX] Statistics report: ${statisticsPath}`);

    return { crosswalk, unresolved, statistics };
}

async function buildEntityIndex(file, idCol, mapFn) {
    return new Promise((resolve, reject) => {
        const map = {};
        let count = 0, blankIds = 0, duplicateIds = 0;
        const seen = new Set();
        const fullPath = path.join(DATA_DIR, file);

        if (!fs.existsSync(fullPath)) return reject(new Error(`Missing file: ${fullPath}`));

        fs.createReadStream(fullPath)
            .pipe(csv())
            .on('data', row => {
                count++;
                const id = String(row[idCol] ?? '').trim();
                if (!id) { blankIds++; return; }
                if (seen.has(id)) duplicateIds++;
                seen.add(id);
                map[id] = mapFn(row);
            })
            .on('end', () => {
                console.log(`[INDEX] ${file} mapped: ${count.toLocaleString()} rows`);
                console.log(`        Unique IDs: ${seen.size.toLocaleString()}`);
                console.log(`        Blank IDs: ${blankIds.toLocaleString()}`);
                console.log(`        Duplicate IDs: ${duplicateIds.toLocaleString()}`);
                resolve({ map, count, uniqueIds: seen.size, blankIds, duplicateIds });
            })
            .on('error', reject);
    });
}

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — PHASE B: CANONICAL INDEXING');
    console.log('============================================================');
    console.log(`[INDEX] Source: ${DATA_DIR}`);
    console.log(`[INDEX] Output: ${INDEX_DIR}\n`);

    if (!fs.existsSync(DATA_DIR)) throw new Error(`Canonical source directory does not exist: ${DATA_DIR}`);
    ensureDir(INDEX_DIR);

    console.log('[1/4] Building MASTER metadata indexes...');
    const masterIndexes = await buildMasterIndexes();

    const collisionReport = {
        direct: Object.fromEntries([...masterIndexes.directCollisions.entries()].map(([key, ids]) => [key, [...ids]])),
        reverse: Object.fromEntries([...masterIndexes.reverseCollisions.entries()].map(([key, ids]) => [key, [...ids]]))
    };
    fs.writeFileSync(path.join(INDEX_DIR, 'master-metadata-collisions.json'), JSON.stringify(collisionReport, null, 2), 'utf8');

    console.log('\n[2/4] Building secondary → canonical match crosswalk...');
    await buildCrosswalk(masterIndexes);

    console.log('\n[3/4] Building entity indexes...');
    const teams = await buildEntityIndex('ZOKASCORE_TEAMS.csv', 'zokascore_team_id', row => ({
        name: row.canonical_name, country: row.country, stadium: row.stadium, city: row.city, founded: row.founded, former_names: row.former_names
    }));
    fs.writeFileSync(path.join(INDEX_DIR, 'teams-index.json'), JSON.stringify(teams.map, null, 2), 'utf8');

    const players = await buildEntityIndex('ZOKASCORE_PLAYERS.csv', 'zokascore_player_id', row => ({
        name: row.canonical_name, country_of_birth: row.country_of_birth, date_of_birth: row.date_of_birth, position: row.position, sub_position: row.sub_position, foot: row.foot, height_in_cm: row.height_in_cm, current_team_id: row.current_zokascore_team_id
    }));
    fs.writeFileSync(path.join(INDEX_DIR, 'players-index.json'), JSON.stringify(players.map, null, 2), 'utf8');

    const competitions = await buildEntityIndex('ZOKASCORE_COMPETITIONS.csv', 'zokascore_competition_id', row => ({
        name: row.canonical_name, normalized_name: row.normalized_name, type: row.competition_type, match_count: row.match_count
    }));
    fs.writeFileSync(path.join(INDEX_DIR, 'competitions-index.json'), JSON.stringify(competitions.map, null, 2), 'utf8');

    const summary = {
        generatedAt: new Date().toISOString(),
        source: 'data/source/ZOKASCORE_FINAL',
        master: {
            rows: masterIndexes.rows, validMetadataRows: masterIndexes.validRows,
            directKeys: masterIndexes.direct.size, reverseKeys: masterIndexes.reverse.size,
            directCollisions: masterIndexes.directCollisions.size, reverseCollisions: masterIndexes.reverseCollisions.size
        },
        entities: {
            teams: { rows: teams.count, uniqueIds: teams.uniqueIds },
            players: { rows: players.count, uniqueIds: players.uniqueIds },
            competitions: { rows: competitions.count, uniqueIds: competitions.uniqueIds }
        },
        outputs: [
            'master-metadata-collisions.json', 'match-id-crosswalk.json', 'match-id-unresolved.json',
            'match-id-crosswalk-report.json', 'teams-index.json', 'players-index.json', 'competitions-index.json'
        ]
    };
    fs.writeFileSync(path.join(INDEX_DIR, 'canonical-index-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    console.log('\n[4/4] Phase B Complete.');
    console.log('============================================================');
    console.log('✅ Canonical indexes built successfully.');
    console.log('🔒 ZOKASCORE_FINAL was NOT modified.');
    console.log('🔒 No source CSV was modified.');
    console.log(`📁 Index output: ${INDEX_DIR}`);
    console.log('============================================================\n');
}

run().catch(err => {
    console.error('\n============================================================');
    console.error('❌ INDEXING FAILED');
    console.error('============================================================');
    console.error(err);
    process.exit(1);
});
