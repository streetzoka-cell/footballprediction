'use strict';

/**
 * 99c-diagnose-match-metadata-linkage.js
 *
 * ============================================================
 * ZOKASCORE V2 — MATCH METADATA LINKAGE FORENSICS
 * ============================================================
 *
 * PURPOSE
 * -------
 * Diagnose the relationship between:
 *
 *   ZOKASCORE_PUBLIC_MASTER.csv
 *   ZOKASCORE_APPEARANCES.csv
 *   ZOKASCORE_EVENTS.csv
 *
 * The current investigation has established that:
 *
 *   MASTER uses:
 *      zokascore_match_id
 *      ZK_YYYYMMDD_HOME_AWAY
 *
 * while APPEARANCES / EVENTS use:
 *      ZK_MATCH_YYYYMMDD_HOME_AWAY
 *
 * This script determines whether the records can be linked
 * through their embedded metadata:
 *
 *      date + home_team + away_team
 *
 * IMPORTANT
 * ---------
 * READ ONLY.
 *
 * NO FILES ARE MODIFIED.
 * NO CANONICAL DATA IS REPAIRED.
 * NO IDs ARE CHANGED.
 *
 * MEMORY DESIGN
 * -------------
 * This script intentionally avoids:
 *
 *      Import-Csv entire file
 *      storing entire MASTER rows
 *      storing every appearance/event row
 *
 * Only compact lookup structures and bounded samples are kept.
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

const SAMPLE_LIMIT = 30;
const AMBIGUOUS_SAMPLE_LIMIT = 30;

const log = (msg = '') => console.log(`[ZK-LINK] ${msg}`);
const warn = (msg = '') => console.warn(`[ZK-LINK-WARN] ${msg}`);

function filePath(filename) {
    return path.join(DATA_DIR, filename);
}

function fileExists(filename) {
    return fs.existsSync(filePath(filename));
}

function clean(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/**
 * Strong normalization for comparison.
 *
 * Examples:
 *
 * "FC Twente Enschede"
 * "fc twente enschede"
 *
 * become:
 *
 * "fc twente enschede"
 */
function normalize(value) {
    return clean(value)
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[.'’`]/g, '')
        .replace(/[-_/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Build canonical metadata key.
 */
function metadataKey(date, home, away) {
    const d = clean(date);

    const h = normalize(home);
    const a = normalize(away);

    if (!d || !h || !a) return null;

    return `${d}|${h}|${a}`;
}

/**
 * Parse IDs like:
 *
 * ZK_MATCH_20120703_f91 dudelange_sp tre penne
 *
 * into:
 *
 * date = 2012-07-03
 * home = f91 dudelange
 * away = sp tre penne
 *
 * The first underscore separates date from teams.
 * The second underscore separates home from away.
 */
function parseZkMatchId(id) {
    const raw = clean(id);

    if (!raw) {
        return null;
    }

    if (!raw.startsWith('ZK_MATCH_')) {
        return null;
    }

    const remainder = raw.substring('ZK_MATCH_'.length);

    const firstUnderscore = remainder.indexOf('_');

    if (firstUnderscore === -1) {
        return null;
    }

    const datePart = remainder.substring(0, firstUnderscore);
    const teamsPart = remainder.substring(firstUnderscore + 1);

    if (!/^\d{8}$/.test(datePart)) {
        return null;
    }

    const secondUnderscore = teamsPart.indexOf('_');

    if (secondUnderscore === -1) {
        return null;
    }

    const home = teamsPart.substring(0, secondUnderscore);
    const away = teamsPart.substring(secondUnderscore + 1);

    if (!home || !away) {
        return null;
    }

    const year = datePart.substring(0, 4);
    const month = datePart.substring(4, 6);
    const day = datePart.substring(6, 8);

    const date = `${year}-${month}-${day}`;

    return {
        rawId: raw,
        date,
        home,
        away,
        key: metadataKey(date, home, away)
    };
}

/**
 * Stream CSV.
 *
 * onHeaders(headers)
 * onRow(row)
 *
 * Returns number of rows.
 */
function streamCsv(filename, onRow, onHeaders = null) {
    return new Promise((resolve, reject) => {
        const fullPath = filePath(filename);

        if (!fs.existsSync(fullPath)) {
            return reject(
                new Error(`Missing file: ${filename}`)
            );
        }

        let rowCount = 0;

        const stream = fs
            .createReadStream(fullPath)
            .pipe(csv());

        if (onHeaders) {
            stream.on('headers', headers => {
                onHeaders(headers);
            });
        }

        stream.on('data', row => {
            rowCount++;

            try {
                onRow(row, rowCount);
            } catch (err) {
                stream.destroy(err);
            }
        });

        stream.on('end', () => {
            resolve(rowCount);
        });

        stream.on('error', reject);
    });
}

/**
 * ============================================================
 * MASTER INDEX
 * ============================================================
 *
 * We deliberately store only:
 *
 *   metadata key -> compact master metadata
 *
 * NOT the entire row.
 *
 * This dramatically reduces memory.
 */
async function buildMasterIndex() {
    log('');
    log('============================================================');
    log('[2] BUILDING STREAMING MASTER MATCH INDEX');
    log('============================================================');

    let rows = 0;

    const metadataIndex = new Map();

    let duplicateMetadataKeys = 0;

    const duplicateSamples = [];

    const masterIdSamples = [];

    await streamCsv(
        MASTER_FILE,
        row => {
            rows++;

            const matchId = clean(row.zokascore_match_id);
            const date = clean(row.date);
            const home = clean(row.home_team);
            const away = clean(row.away_team);

            const key = metadataKey(
                date,
                home,
                away
            );

            if (!key) {
                return;
            }

            const existing = metadataIndex.get(key);

            if (!existing) {
                metadataIndex.set(key, {
                    matchId,
                    date,
                    home,
                    away
                });

                if (masterIdSamples.length < 5) {
                    masterIdSamples.push({
                        matchId,
                        date,
                        home,
                        away
                    });
                }
            } else {
                duplicateMetadataKeys++;

                if (
                    duplicateSamples.length <
                    AMBIGUOUS_SAMPLE_LIMIT
                ) {
                    duplicateSamples.push({
                        key,
                        first: existing,
                        duplicate: {
                            matchId,
                            date,
                            home,
                            away
                        }
                    });
                }

                /**
                 * IMPORTANT:
                 *
                 * We do NOT overwrite the first record.
                 *
                 * The key is ambiguous and must remain marked.
                 */
            }
        }
    );

    log(
        `MASTER rows: ${rows.toLocaleString()}`
    );

    log(
        `MASTER unique metadata keys: ${metadataIndex.size.toLocaleString()}`
    );

    log(
        `MASTER duplicate metadata occurrences: ${duplicateMetadataKeys.toLocaleString()}`
    );

    if (duplicateMetadataKeys > 0) {
        warn(
            'MASTER contains repeated date/home/away metadata keys.'
        );

        for (const item of duplicateSamples) {
            log(
                `  DUPLICATE KEY: ${item.key}`
            );

            log(
                `     ${item.first.matchId} | ${item.first.date} | ${item.first.home} vs ${item.first.away}`
            );

            log(
                `     ${item.duplicate.matchId} | ${item.duplicate.date} | ${item.duplicate.home} vs ${item.duplicate.away}`
            );
        }
    }

    return {
        rows,
        metadataIndex,
        duplicateMetadataKeys,
        duplicateSamples
    };
}

/**
 * ============================================================
 * ANALYZE SECONDARY MATCH IDs
 * ============================================================
 */
async function analyzeSecondaryFile(
    filename,
    label,
    masterIndex
) {
    log('');
    log(
        `============================================================`
    );

    log(
        `[3] ANALYZING ${label} MATCH METADATA`
    );

    log(
        `============================================================`
    );

    let rows = 0;

    let zkMatchIds = 0;
    let otherIds = 0;
    let blankIds = 0;
    let malformedIds = 0;

    let metadataParsed = 0;

    let exactMetadataMatches = 0;
    let unresolvedMetadata = 0;

    let exactHomeAwayDateMatches = 0;

    const unresolvedSamples = [];
    const resolvedSamples = [];
    const malformedSamples = [];

    /**
     * Frequency of metadata keys encountered in the
     * secondary file.
     *
     * This is bounded by using only unresolved keys.
     */
    const unresolvedKeyCounts = new Map();

    await streamCsv(
        filename,
        row => {
            rows++;

            const matchId = clean(
                row.zokascore_match_id
            );

            if (!matchId) {
                blankIds++;
                return;
            }

            if (!matchId.startsWith('ZK_MATCH_')) {
                otherIds++;

                if (
                    malformedSamples.length <
                    SAMPLE_LIMIT
                ) {
                    malformedSamples.push(matchId);
                }

                return;
            }

            zkMatchIds++;

            const parsed = parseZkMatchId(matchId);

            if (!parsed || !parsed.key) {
                malformedIds++;

                if (
                    malformedSamples.length <
                    SAMPLE_LIMIT
                ) {
                    malformedSamples.push(matchId);
                }

                return;
            }

            metadataParsed++;

            const masterMatch =
                masterIndex.metadataIndex.get(
                    parsed.key
                );

            if (masterMatch) {
                exactMetadataMatches++;

                if (
                    resolvedSamples.length <
                    SAMPLE_LIMIT
                ) {
                    resolvedSamples.push({
                        sourceId: matchId,
                        masterId: masterMatch.matchId,
                        date: parsed.date,
                        home: parsed.home,
                        away: parsed.away
                    });
                }
            } else {
                unresolvedMetadata++;

                const current =
                    unresolvedKeyCounts.get(
                        parsed.key
                    ) || 0;

                unresolvedKeyCounts.set(
                    parsed.key,
                    current + 1
                );

                if (
                    unresolvedSamples.length <
                    SAMPLE_LIMIT
                ) {
                    unresolvedSamples.push({
                        sourceId: matchId,
                        date: parsed.date,
                        home: parsed.home,
                        away: parsed.away,
                        key: parsed.key
                    });
                }
            }
        }
    );

    log(
        `${label} rows: ${rows.toLocaleString()}`
    );

    log(
        `${label} ZK_MATCH_* IDs: ${zkMatchIds.toLocaleString()}`
    );

    log(
        `${label} other IDs: ${otherIds.toLocaleString()}`
    );

    log(
        `${label} blank IDs: ${blankIds.toLocaleString()}`
    );

    log(
        `${label} malformed ZK_MATCH IDs: ${malformedIds.toLocaleString()}`
    );

    log(
        `${label} metadata parsed: ${metadataParsed.toLocaleString()}`
    );

    log(
        `${label} metadata matched to MASTER: ${exactMetadataMatches.toLocaleString()}`
    );

    log(
        `${label} metadata unresolved: ${unresolvedMetadata.toLocaleString()}`
    );

    if (rows > 0) {
        const matchRate =
            (exactMetadataMatches / rows) * 100;

        log(
            `${label} metadata linkage rate: ${matchRate.toFixed(4)}%`
        );
    }

    /**
     * Resolved samples
     */
    if (resolvedSamples.length > 0) {
        log('');
        log(
            `[${label}] RESOLVED METADATA SAMPLES`
        );

        for (const item of resolvedSamples) {
            log(
                `  ${item.sourceId}`
            );

            log(
                `     -> ${item.masterId}`
            );

            log(
                `     ${item.date} | ${item.home} vs ${item.away}`
            );
        }
    }

    /**
     * Unresolved samples
     */
    if (unresolvedSamples.length > 0) {
        log('');
        log(
            `[${label}] UNRESOLVED METADATA SAMPLES`
        );

        for (const item of unresolvedSamples) {
            log(
                `  ${item.sourceId}`
            );

            log(
                `     ${item.date} | ${item.home} vs ${item.away}`
            );
        }
    }

    /**
     * Malformed samples
     */
    if (malformedSamples.length > 0) {
        log('');
        log(
            `[${label}] MALFORMED / OTHER ID SAMPLES`
        );

        for (const id of malformedSamples) {
            log(`  ${id}`);
        }
    }

    return {
        rows,
        zkMatchIds,
        otherIds,
        blankIds,
        malformedIds,
        metadataParsed,
        exactMetadataMatches,
        unresolvedMetadata,
        resolvedSamples,
        unresolvedSamples,
        malformedSamples,
        unresolvedKeyCounts
    };
}

/**
 * ============================================================
 * COMPARE APPEARANCE / EVENT ID STRUCTURE
 * ============================================================
 */
function printInterpretation(
    appearanceResults,
    eventResults
) {
    log('');
    log(
        '============================================================'
    );

    log(
        'LINKAGE INTERPRETATION'
    );

    log(
        '============================================================'
    );

    const totalRows =
        appearanceResults.rows +
        eventResults.rows;

    const totalResolved =
        appearanceResults.exactMetadataMatches +
        eventResults.exactMetadataMatches;

    const totalUnresolved =
        appearanceResults.unresolvedMetadata +
        eventResults.unresolvedMetadata;

    log(
        `Secondary rows analyzed: ${totalRows.toLocaleString()}`
    );

    log(
        `Metadata-resolved rows: ${totalResolved.toLocaleString()}`
    );

    log(
        `Metadata-unresolved rows: ${totalUnresolved.toLocaleString()}`
    );

    if (totalRows > 0) {
        const rate =
            (totalResolved / totalRows) * 100;

        log(
            `Overall metadata linkage rate: ${rate.toFixed(4)}%`
        );
    }

    if (
        totalResolved === totalRows &&
        totalRows > 0
    ) {
        log('');
        log(
            '✅ ALL SECONDARY MATCH IDs RESOLVE THROUGH METADATA.'
        );

        log(
            'The ZK_MATCH_* IDs appear to be a separate'
        );

        log(
            'identifier namespace whose embedded metadata'
        );

        log(
            'can be mapped to the MASTER match IDs.'
        );

        return;
    }

    if (totalResolved > 0) {
        log('');
        warn(
            'PARTIAL METADATA LINKAGE DETECTED.'
        );

        warn(
            'The linkage is real for some records, but unresolved'
        );

        warn(
            'records require additional forensic investigation.'
        );

        return;
    }

    log('');
    warn(
        'NO METADATA LINKAGE FOUND.'
    );

    warn(
        'The secondary match IDs cannot currently be linked'
    );

    warn(
        'to MASTER using date/home/away metadata alone.'
    );
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */
async function run() {
    console.log('');
    console.log(
        '============================================================'
    );

    console.log(
        ' ZOKASCORE V2 — MATCH METADATA LINKAGE FORENSICS'
    );

    console.log(
        '============================================================'
    );

    log(`Source: ${DATA_DIR}`);

    log(
        'READ ONLY — NO FILES WILL BE MODIFIED.'
    );

    /**
     * --------------------------------------------------------
     * 1. VERIFY FILES
     * --------------------------------------------------------
     */
    log('');
    log(
        '============================================================'
    );

    log(
        '[1] VERIFYING SOURCE FILES'
    );

    log(
        '============================================================'
    );

    const requiredFiles = [
        MASTER_FILE,
        APPEARANCES_FILE,
        EVENTS_FILE
    ];

    for (const file of requiredFiles) {
        if (!fileExists(file)) {
            throw new Error(
                `Missing required file: ${file}`
            );
        }

        log(`✅ ${file}`);
    }

    /**
     * --------------------------------------------------------
     * 2. BUILD MASTER INDEX
     * --------------------------------------------------------
     */
    const master = await buildMasterIndex();

    /**
     * --------------------------------------------------------
     * 3. APPEARANCES
     * --------------------------------------------------------
     */
    const appearances =
        await analyzeSecondaryFile(
            APPEARANCES_FILE,
            'APPEARANCES',
            master
        );

    /**
     * --------------------------------------------------------
     * 4. EVENTS
     * --------------------------------------------------------
     */
    const events =
        await analyzeSecondaryFile(
            EVENTS_FILE,
            'EVENTS',
            master
        );

    /**
     * --------------------------------------------------------
     * 5. INTERPRETATION
     * --------------------------------------------------------
     */
    printInterpretation(
        appearances,
        events
    );

    /**
     * --------------------------------------------------------
     * FINAL
     * --------------------------------------------------------
     */
    console.log('');
    console.log(
        '============================================================'
    );

    log(
        'MATCH METADATA LINKAGE FORENSICS COMPLETE'
    );

    log(
        '============================================================'
    );

    log(
        '🔒 NO FILES MODIFIED.'
    );

    log(
        '🔒 ZOKASCORE_FINAL WAS NOT MODIFIED.'
    );

    log(
        '🔒 public_data WAS NOT MODIFIED.'
    );

    log(
        '🔒 NO REPAIRS WERE PERFORMED.'
    );

    console.log('');
}

run().catch(err => {
    console.error('');
    console.error(
        '============================================================'
    );

    console.error(
        ' FATAL ERROR DURING MATCH METADATA LINKAGE FORENSICS'
    );

    console.error(
        '============================================================'
    );

    console.error(err);

    console.error('');

    process.exitCode = 1;
});