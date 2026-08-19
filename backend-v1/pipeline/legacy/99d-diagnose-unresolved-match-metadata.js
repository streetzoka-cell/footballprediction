'use strict';

/**
 * ============================================================
 * ZOKASCORE V2 — UNRESOLVED MATCH METADATA FORENSICS
 * ============================================================
 *
 * STEP 99D
 *
 * PURPOSE:
 *   Investigate secondary ZK_MATCH_* IDs that were unresolved
 *   by the 99c metadata linkage investigation.
 *
 * MODE:
 *   READ ONLY
 *
 * SAFETY:
 *   - No source files modified
 *   - No IDs rewritten
 *   - No data repaired
 *   - No public_data modified
 *
 * MEMORY DESIGN:
 *   - Compact MASTER indexes only
 *   - No duplicated full MASTER objects
 *   - Secondary files streamed row-by-row
 *
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.join(__dirname, '..');

const SOURCE_DIR = path.join(
    ROOT,
    'data',
    'source',
    'ZOKASCORE_FINAL'
);

const AUDIT_DIR = path.join(
    ROOT,
    'data_audit',
    'v2_integrity'
);

const MASTER_FILE = path.join(
    SOURCE_DIR,
    'ZOKASCORE_PUBLIC_MASTER.csv'
);

const APPEARANCES_FILE = path.join(
    SOURCE_DIR,
    'ZOKASCORE_APPEARANCES.csv'
);

const EVENTS_FILE = path.join(
    SOURCE_DIR,
    'ZOKASCORE_EVENTS.csv'
);

const REPORT_FILE = path.join(
    AUDIT_DIR,
    '99d-unresolved-match-metadata-report.json'
);

const SAMPLE_LIMIT = 40;

// ============================================================
// Logging
// ============================================================

function log(message = '') {
    console.log(`[ZK-99D] ${message}`);
}

function warn(message = '') {
    console.log(`[ZK-99D-WARN] ${message}`);
}

// ============================================================
// CSV
// ============================================================

function parseCSVLine(line) {
    const result = [];

    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            if (quoted && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                quoted = !quoted;
            }

            continue;
        }

        if (ch === ',' && !quoted) {
            result.push(current);
            current = '';
            continue;
        }

        current += ch;
    }

    result.push(current);

    return result;
}

function clean(value) {
    return String(value ?? '')
        .replace(/^\uFEFF/, '')
        .trim();
}

async function streamCSV(file, callback) {
    const input = fs.createReadStream(file, {
        encoding: 'utf8'
    });

    const rl = readline.createInterface({
        input,
        crlfDelay: Infinity
    });

    let headers = null;
    let rowNumber = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;

        const values = parseCSVLine(line);

        if (!headers) {
            headers = values.map(clean);
            continue;
        }

        rowNumber++;

        const row = {};

        for (let i = 0; i < headers.length; i++) {
            row[headers[i]] = clean(values[i]);
        }

        await callback(row, rowNumber);
    }
}

// ============================================================
// Normalization
// ============================================================

function normalizeBasic(value) {
    return String(value ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[’'`]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(value) {
    return normalizeBasic(value)
        .replace(/\s+/g, '');
}

function normalizeTeam(value) {
    let v = normalizeBasic(value);

    if (!v) return '';

    /*
     * IMPORTANT:
     * These are deliberately conservative.
     * We are investigating, not repairing.
     */

    const removable = [
        'football club',
        'footballclub',
        'fc',
        'afc',
        'sc',
        'cf',
        'fk',
        'nk',
        'sk',
        'sv',
        'kv',
        'ksc',
        'rsc',
        'ue',
        'cd',
        'ud',
        'ac',
        'as',
        'ss',
        'us'
    ];

    for (const suffix of removable) {
        const re = new RegExp(
            `\\b${suffix}\\b`,
            'g'
        );

        v = v.replace(re, ' ');
    }

    return v
        .replace(/\s+/g, ' ')
        .trim();
}

function teamCompact(value) {
    return compact(normalizeTeam(value));
}

function normalizeDate(value) {
    const raw = clean(value);

    if (!raw) return '';

    const m = raw.match(
        /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/
    );

    if (!m) {
        return normalizeBasic(raw);
    }

    return [
        m[1],
        m[2].padStart(2, '0'),
        m[3].padStart(2, '0')
    ].join('-');
}

// ============================================================
// ZK_MATCH parser
// ============================================================

function parseZKMatchId(id) {
    const raw = clean(id);

    if (!raw.startsWith('ZK_MATCH_')) {
        return null;
    }

    const remainder = raw.slice(9);

    const m = remainder.match(
        /^(\d{8})_(.+?)_(.+)$/
    );

    if (!m) {
        return null;
    }

    const dateRaw = m[1];

    const date =
        `${dateRaw.slice(0, 4)}-` +
        `${dateRaw.slice(4, 6)}-` +
        `${dateRaw.slice(6, 8)}`;

    return {
        rawId: raw,
        date,

        home: clean(m[2]),
        away: clean(m[3]),

        homeNorm: normalizeTeam(m[2]),
        awayNorm: normalizeTeam(m[3]),

        homeCompact: teamCompact(m[2]),
        awayCompact: teamCompact(m[3])
    };
}

// ============================================================
// Compact MASTER indexes
// ============================================================
//
// Each entry is a tiny object.
// We do NOT keep the full CSV row.
//
// ============================================================

const exactIndex = new Map();
const compactIndex = new Map();
const reverseIndex = new Map();
const dateTeamIndex = new Map();

let masterRows = 0;

function addIndex(map, key, value) {
    if (!key) return;

    let list = map.get(key);

    if (!list) {
        list = [];
        map.set(key, list);
    }

    /*
     * Only keep compact references.
     */
    list.push(value);
}

function compactMasterRecord(row) {
    return {
        id: row.zokascore_match_id,
        matchId: row.match_id,
        date: normalizeDate(row.date),
        home: clean(row.home_team),
        away: clean(row.away_team)
    };
}

async function buildMasterIndexes() {
    log('');
    log('============================================================');
    log('[1] BUILDING COMPACT MASTER INDEX');
    log('============================================================');

    await streamCSV(
        MASTER_FILE,
        async row => {
            masterRows++;

            const r = compactMasterRecord(row);

            const exactKey = [
                r.date,
                normalizeTeam(r.home),
                normalizeTeam(r.away)
            ].join('|');

            const compactKey = [
                r.date,
                teamCompact(r.home),
                teamCompact(r.away)
            ].join('|');

            const reverseKey = [
                r.date,
                teamCompact(r.away),
                teamCompact(r.home)
            ].join('|');

            const teamKey = [
                teamCompact(r.home),
                teamCompact(r.away)
            ].sort().join('|');

            addIndex(
                exactIndex,
                exactKey,
                r
            );

            addIndex(
                compactIndex,
                compactKey,
                r
            );

            addIndex(
                reverseIndex,
                reverseKey,
                r
            );

            addIndex(
                dateTeamIndex,
                `${r.date}|${teamKey}`,
                r
            );

            if (masterRows % 100000 === 0) {
                log(`MASTER rows indexed: ${masterRows}`);
            }
        }
    );

    log(`MASTER rows: ${masterRows}`);
    log(`Exact index keys: ${exactIndex.size}`);
    log(`Compact index keys: ${compactIndex.size}`);
    log(`Reverse index keys: ${reverseIndex.size}`);
    log(`Date/team index keys: ${dateTeamIndex.size}`);
}

// ============================================================
// Classification
// ============================================================

function classify(parsed) {
    if (!parsed) {
        return {
            type: 'MALFORMED_ID',
            candidates: []
        };
    }

    const exactKey = [
        parsed.date,
        parsed.homeNorm,
        parsed.awayNorm
    ].join('|');

    const compactKey = [
        parsed.date,
        parsed.homeCompact,
        parsed.awayCompact
    ].join('|');

    const reverseKey = [
        parsed.date,
        parsed.homeCompact,
        parsed.awayCompact
    ].join('|');

    const exact = exactIndex.get(exactKey) || [];

    if (exact.length === 1) {
        return {
            type: 'EXACT_NORMALIZATION',
            candidates: exact
        };
    }

    if (exact.length > 1) {
        return {
            type: 'AMBIGUOUS',
            candidates: exact
        };
    }

    const compactMatches =
        compactIndex.get(compactKey) || [];

    if (compactMatches.length === 1) {
        return {
            type: 'TEAM_NAME_VARIATION',
            candidates: compactMatches
        };
    }

    if (compactMatches.length > 1) {
        return {
            type: 'AMBIGUOUS',
            candidates: compactMatches
        };
    }

    /*
     * Check the same pairing in reverse home/away order.
     */

    const reversedKey = [
        parsed.date,
        parsed.awayCompact,
        parsed.homeCompact
    ].join('|');

    const reverseMatches =
        compactIndex.get(reversedKey) || [];

    if (reverseMatches.length === 1) {
        return {
            type: 'HOME_AWAY_VARIATION',
            candidates: reverseMatches
        };
    }

    if (reverseMatches.length > 1) {
        return {
            type: 'AMBIGUOUS',
            candidates: reverseMatches
        };
    }

    /*
     * Same two teams but potentially different date.
     */

    const sortedTeams = [
        parsed.homeCompact,
        parsed.awayCompact
    ].sort().join('|');

    /*
     * Search the date/team index for exact date first.
     * If unavailable, we do NOT scan the whole MASTER.
     *
     * This keeps the forensic process memory-safe.
     */

    const sameDate =
        dateTeamIndex.get(
            `${parsed.date}|${sortedTeams}`
        ) || [];

    if (sameDate.length === 1) {
        return {
            type: 'TEAM_NAME_VARIATION',
            candidates: sameDate
        };
    }

    if (sameDate.length > 1) {
        return {
            type: 'AMBIGUOUS',
            candidates: sameDate
        };
    }

    /*
     * We deliberately classify the remaining records as
     * NO_MASTER_CANDIDATE here.
     *
     * A separate forensic step can investigate date shifts.
     */

    return {
        type: 'NO_MASTER_CANDIDATE',
        candidates: []
    };
}

// ============================================================
// Stats
// ============================================================

function makeStats() {
    return {
        rows: 0,
        parsed: 0,
        malformed: 0,

        exactNormalization: 0,
        teamNameVariation: 0,
        dateVariation: 0,
        homeAwayVariation: 0,
        possibleDuplicate: 0,
        ambiguous: 0,
        noMasterCandidate: 0,

        samples: {
            EXACT_NORMALIZATION: [],
            TEAM_NAME_VARIATION: [],
            DATE_VARIATION: [],
            HOME_AWAY_VARIATION: [],
            POSSIBLE_DUPLICATE: [],
            AMBIGUOUS: [],
            NO_MASTER_CANDIDATE: []
        }
    };
}

function increment(stats, type) {
    switch (type) {
        case 'EXACT_NORMALIZATION':
            stats.exactNormalization++;
            break;

        case 'TEAM_NAME_VARIATION':
            stats.teamNameVariation++;
            break;

        case 'DATE_VARIATION':
            stats.dateVariation++;
            break;

        case 'HOME_AWAY_VARIATION':
            stats.homeAwayVariation++;
            break;

        case 'POSSIBLE_DUPLICATE':
            stats.possibleDuplicate++;
            break;

        case 'AMBIGUOUS':
            stats.ambiguous++;
            break;

        case 'NO_MASTER_CANDIDATE':
            stats.noMasterCandidate++;
            break;

        case 'MALFORMED_ID':
            stats.malformed++;
            break;
    }
}

function addSample(stats, type, sample) {
    if (!stats.samples[type]) return;

    if (
        stats.samples[type].length <
        SAMPLE_LIMIT
    ) {
        stats.samples[type].push(sample);
    }
}

// ============================================================
// Secondary analysis
// ============================================================

async function analyzeFile(name, file) {
    const stats = makeStats();

    log('');
    log('============================================================');
    log(`[2] ANALYZING ${name}`);
    log('============================================================');

    await streamCSV(
        file,
        async row => {
            stats.rows++;

            const parsed =
                parseZKMatchId(
                    row.zokascore_match_id
                );

            if (!parsed) {
                stats.malformed++;

                addSample(
                    stats,
                    'NO_MASTER_CANDIDATE',
                    {
                        source: name,
                        row: stats.rows,
                        secondaryId:
                            row.zokascore_match_id,
                        reason:
                            'MALFORMED_ZK_MATCH_ID'
                    }
                );

                return;
            }

            stats.parsed++;

            const result =
                classify(parsed);

            increment(
                stats,
                result.type
            );

            const candidate =
                result.candidates.length === 1
                    ? result.candidates[0]
                    : null;

            addSample(
                stats,
                result.type,
                {
                    source: name,
                    row: stats.rows,

                    secondaryId:
                        parsed.rawId,

                    parsed: {
                        date: parsed.date,
                        home: parsed.home,
                        away: parsed.away
                    },

                    classification:
                        result.type,

                    candidateCount:
                        result.candidates.length,

                    candidate: candidate
                        ? {
                            zokascoreMatchId:
                                candidate.id,

                            matchId:
                                candidate.matchId,

                            date:
                                candidate.date,

                            home:
                                candidate.home,

                            away:
                                candidate.away
                        }
                        : null
                }
            );

            if (
                stats.rows % 250000 === 0
            ) {
                log(
                    `${name} rows analyzed: ${stats.rows}`
                );
            }
        }
    );

    log(`${name} rows: ${stats.rows}`);
    log(`${name} parsed: ${stats.parsed}`);
    log(`${name} malformed: ${stats.malformed}`);
    log(
        `${name} exact normalization: ${stats.exactNormalization}`
    );
    log(
        `${name} team-name variation: ${stats.teamNameVariation}`
    );
    log(
        `${name} date variation: ${stats.dateVariation}`
    );
    log(
        `${name} home/away variation: ${stats.homeAwayVariation}`
    );
    log(
        `${name} ambiguous: ${stats.ambiguous}`
    );
    log(
        `${name} no MASTER candidate: ${stats.noMasterCandidate}`
    );

    return stats;
}

// ============================================================
// Main
// ============================================================

async function main() {
    console.log('');
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — UNRESOLVED MATCH METADATA FORENSICS');
    console.log('============================================================');

    log(`Source: ${SOURCE_DIR}`);
    log('READ ONLY — NO FILES WILL BE MODIFIED.');

    // --------------------------------------------------------
    // Verify source files
    // --------------------------------------------------------

    log('');
    log('============================================================');
    log('[0] VERIFYING SOURCE FILES');
    log('============================================================');

    for (const file of [
        MASTER_FILE,
        APPEARANCES_FILE,
        EVENTS_FILE
    ]) {
        if (!fs.existsSync(file)) {
            throw new Error(
                `Missing source file: ${file}`
            );
        }

        log(`✅ ${path.basename(file)}`);
    }

    // --------------------------------------------------------
    // MASTER
    // --------------------------------------------------------

    await buildMasterIndexes();

    // --------------------------------------------------------
    // Secondary files
    // --------------------------------------------------------

    const appearances =
        await analyzeFile(
            'APPEARANCES',
            APPEARANCES_FILE
        );

    const events =
        await analyzeFile(
            'EVENTS',
            EVENTS_FILE
        );

    // --------------------------------------------------------
    // Combined
    // --------------------------------------------------------

    const combined = {
        rows:
            appearances.rows +
            events.rows,

        parsed:
            appearances.parsed +
            events.parsed,

        malformed:
            appearances.malformed +
            events.malformed,

        exactNormalization:
            appearances.exactNormalization +
            events.exactNormalization,

        teamNameVariation:
            appearances.teamNameVariation +
            events.teamNameVariation,

        dateVariation:
            appearances.dateVariation +
            events.dateVariation,

        homeAwayVariation:
            appearances.homeAwayVariation +
            events.homeAwayVariation,

        possibleDuplicate:
            appearances.possibleDuplicate +
            events.possibleDuplicate,

        ambiguous:
            appearances.ambiguous +
            events.ambiguous,

        noMasterCandidate:
            appearances.noMasterCandidate +
            events.noMasterCandidate
    };

    // --------------------------------------------------------
    // Print
    // --------------------------------------------------------

    console.log('');
    console.log('============================================================');
    console.log(' [3] COMBINED FORENSIC RESULT');
    console.log('============================================================');

    log(`MASTER rows: ${masterRows}`);
    log(`Secondary rows: ${combined.rows}`);
    log(`Parsed: ${combined.parsed}`);
    log(`Malformed: ${combined.malformed}`);
    log('');

    log(
        `Exact normalization: ${combined.exactNormalization}`
    );

    log(
        `Team-name variation: ${combined.teamNameVariation}`
    );

    log(
        `Date variation: ${combined.dateVariation}`
    );

    log(
        `Home/away variation: ${combined.homeAwayVariation}`
    );

    log(
        `Possible duplicates: ${combined.possibleDuplicate}`
    );

    log(
        `Ambiguous: ${combined.ambiguous}`
    );

    log(
        `No MASTER candidate: ${combined.noMasterCandidate}`
    );

    // --------------------------------------------------------
    // Report
    // --------------------------------------------------------

    const report = {
        generatedAt:
            new Date().toISOString(),

        step: '99D',

        mode: 'READ_ONLY',

        source:
            SOURCE_DIR,

        master: {
            rows: masterRows,

            exactIndexKeys:
                exactIndex.size,

            compactIndexKeys:
                compactIndex.size,

            reverseIndexKeys:
                reverseIndex.size,

            dateTeamIndexKeys:
                dateTeamIndex.size
        },

        combined,

        datasets: {
            appearances,
            events
        },

        interpretation: {
            exactNormalization:
                'Metadata uniquely reconstructs a MASTER match after normalization.',

            teamNameVariation:
                'The same match appears identifiable after conservative team-name normalization.',

            dateVariation:
                'Same team pairing appears on another date. This version does not automatically search date shifts.',

            homeAwayVariation:
                'Home and away appear reversed.',

            possibleDuplicate:
                'Multiple MASTER candidates exist.',

            ambiguous:
                'More than one candidate exists and must not be auto-repaired.',

            noMasterCandidate:
                'No safe candidate was found with the current conservative indexes.'
        },

        safety: {
            filesModified: false,
            sourceModified: false,
            publicDataModified: false,
            repairsPerformed: false,
            idsRewritten: false
        }
    };

    fs.mkdirSync(
        AUDIT_DIR,
        { recursive: true }
    );

    fs.writeFileSync(
        REPORT_FILE,
        JSON.stringify(
            report,
            null,
            2
        ),
        'utf8'
    );

    console.log('');
    console.log('============================================================');
    console.log(' ZOKASCORE 99D — FORENSICS COMPLETE');
    console.log('============================================================');

    log(`Report: ${REPORT_FILE}`);

    log('');
    log('🔒 NO FILES MODIFIED.');
    log('🔒 ZOKASCORE_FINAL WAS NOT MODIFIED.');
    log('🔒 public_data WAS NOT MODIFIED.');
    log('🔒 NO REPAIRS WERE PERFORMED.');
    log('🔒 NO IDs WERE REWRITTEN.');
}

main().catch(error => {
    console.error('');
    console.error('============================================================');
    console.error(' ZOKASCORE 99D — FAILED');
    console.error('============================================================');
    console.error(error);
    process.exit(1);
});