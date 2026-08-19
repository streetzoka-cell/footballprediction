'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');

const SOURCE_DIR = path.join(
    ROOT,
    'data',
    'source',
    'ZOKASCORE_FINAL'
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

const AUDIT_DIR = path.join(
    ROOT,
    'data_audit',
    'v2_integrity'
);

const REPORT_FILE = path.join(
    AUDIT_DIR,
    '99i-secondary-match-linkage-report.json'
);

/*
 * ------------------------------------------------------------
 * NORMALIZATION
 * ------------------------------------------------------------
 */

function clean(value) {

    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[.'’'"]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function compact(value) {
    return clean(value).replace(/[^a-z0-9]/g, '');
}

function normalizeDate(value) {

    const s = String(value ?? '').trim();

    if (!s) return '';

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (m) {
        return `${m[1]}-${m[2]}-${m[3]}`;
    }

    m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);

    if (m) {
        return `${m[1]}-${m[2]}-${m[3]}`;
    }

    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);

    if (m) {
        return `${m[1]}-${m[2]}-${m[3]}`;
    }

    return s;
}

/*
 * ------------------------------------------------------------
 * SECONDARY MATCH ID PARSER
 * ------------------------------------------------------------
 *
 * Actual schema:
 *
 * ZK_MATCH_20120729_naval 1 de maio_atletico cp
 *
 * The first 8 digits are the date.
 * Everything after that contains home + away separated
 * by the final structural underscore used by the source ID.
 *
 * We test candidates rather than assuming the first split is
 * automatically correct.
 * ------------------------------------------------------------
 */

function parseSecondaryMatchId(id) {

    const sourceId = String(id ?? '').trim();

    const match = sourceId.match(
        /^ZK_MATCH_(\d{8})_(.+)$/i
    );

    if (!match) {
        return null;
    }

    const date = normalizeDate(match[1]);

    const body = match[2];

    /*
     * Source IDs use:
     *
     * date_home_away
     *
     * Team names themselves are represented as spaces in these
     * observed IDs, while the home/away boundary is "_".
     */

    const separator = body.indexOf('_');

    if (separator === -1) {
        return null;
    }

    const home = body.slice(0, separator).trim();
    const away = body.slice(separator + 1).trim();

    if (!date || !home || !away) {
        return null;
    }

    return {
        source_id: sourceId,
        date,
        home,
        away
    };
}

/*
 * ------------------------------------------------------------
 * MASTER INDEX
 * ------------------------------------------------------------
 *
 * We retain only compact metadata necessary for linkage.
 *
 * No full MASTER rows are retained.
 * No 951k date/team bucket explosion.
 * This keeps memory substantially lower than 99G.
 * ------------------------------------------------------------
 */

async function loadMasterIndexes() {

    return new Promise((resolve, reject) => {

        const direct = new Map();
        const reverse = new Map();

        let rows = 0;
        let usable = 0;

        fs.createReadStream(MASTER_FILE)
            .pipe(csv())
            .on('data', row => {

                rows++;

                const id =
                    String(
                        row.zokascore_match_id ??
                        row.match_id ??
                        row.id ??
                        ''
                    ).trim();

                const date =
                    normalizeDate(row.date);

                const home =
                    String(row.home_team ?? '').trim();

                const away =
                    String(row.away_team ?? '').trim();

                if (!id || !date || !home || !away) {
                    return;
                }

                usable++;

                const record = {
                    master_row: rows,
                    master_match_id: id,
                    date,
                    home_team: home,
                    away_team: away,

                    home_clean: clean(home),
                    away_clean: clean(away),

                    home_compact: compact(home),
                    away_compact: compact(away)
                };

                const directKey =
                    `${date}|${record.home_compact}|${record.away_compact}`;

                const reverseKey =
                    `${date}|${record.away_compact}|${record.home_compact}`;

                if (!direct.has(directKey)) {
                    direct.set(directKey, []);
                }

                direct.get(directKey).push(record);

                if (!reverse.has(reverseKey)) {
                    reverse.set(reverseKey, []);
                }

                reverse.get(reverseKey).push(record);

            })
            .on('end', () => {

                resolve({
                    rows,
                    usable,
                    direct,
                    reverse
                });

            })
            .on('error', reject);
    });
}

/*
 * ------------------------------------------------------------
 * CANDIDATE SCORING
 * ------------------------------------------------------------
 */

function scoreCandidate(source, candidate) {

    let score = 0;

    const sourceHome =
        compact(source.home);

    const sourceAway =
        compact(source.away);

    if (
        sourceHome === candidate.home_compact
    ) {
        score += 1;
    }

    if (
        sourceAway === candidate.away_compact
    ) {
        score += 1;
    }

    if (
        sourceHome === candidate.away_compact &&
        sourceAway === candidate.home_compact
    ) {
        score += 1;
    }

    if (
        clean(source.home) ===
        candidate.home_clean
    ) {
        score += 2;
    }

    if (
        clean(source.away) ===
        candidate.away_clean
    ) {
        score += 2;
    }

    return score;
}

function classify(source, candidates) {

    for (const candidate of candidates) {

        candidate.home_exact =
            clean(source.home) ===
            candidate.home_clean;

        candidate.away_exact =
            clean(source.away) ===
            candidate.away_clean;

        candidate.home_compact_match =
            compact(source.home) ===
            candidate.home_compact;

        candidate.away_compact_match =
            compact(source.away) ===
            candidate.away_compact;

        candidate.reversed =
            compact(source.home) ===
            candidate.away_compact &&
            compact(source.away) ===
            candidate.home_compact;

        candidate.evidence_score =
            scoreCandidate(source, candidate);
    }

    candidates.sort(
        (a, b) =>
            b.evidence_score -
            a.evidence_score
    );

    if (candidates.length === 0) {
        return 'NO_MASTER_CANDIDATE';
    }

    if (candidates.length === 1) {
        return 'SINGLE_MASTER_CANDIDATE';
    }

    if (
        candidates[0].evidence_score >
        candidates[1].evidence_score
    ) {
        return 'BEST_CANDIDATE_EXISTS';
    }

    return 'MULTIPLE_EQUAL_CANDIDATES';
}

/*
 * ------------------------------------------------------------
 * SECONDARY AUDIT
 * ------------------------------------------------------------
 */

async function auditSecondary(
    file,
    sourceName,
    masterDirect,
    masterReverse
) {

    return new Promise((resolve, reject) => {

        const matches = new Map();

        let rows = 0;
        let malformed = 0;

        fs.createReadStream(file)
            .pipe(csv())
            .on('data', row => {

                rows++;

                const sourceId =
                    String(
                        row.zokascore_match_id ?? ''
                    ).trim();

                if (!sourceId) {
                    malformed++;
                    return;
                }

                /*
                 * Only one metadata record per match ID.
                 */
                if (!matches.has(sourceId)) {

                    matches.set(
                        sourceId,
                        {
                            source_id: sourceId,
                            rows: 0
                        }
                    );
                }

                matches.get(sourceId).rows++;
            })
            .on('end', () => {

                const summary = {
                    unique_match_ids: matches.size,
                    exact_one: 0,
                    exact_multiple: 0,
                    reversed_one: 0,
                    reversed_multiple: 0,
                    best_candidate_exists: 0,
                    no_candidate: 0,
                    malformed: 0
                };

                const samples = {
                    exact_one: [],
                    exact_multiple: [],
                    reversed_one: [],
                    reversed_multiple: [],
                    best_candidate_exists: [],
                    no_candidate: [],
                    malformed: []
                };

                for (const entry of matches.values()) {

                    const parsed =
                        parseSecondaryMatchId(
                            entry.source_id
                        );

                    if (!parsed) {

                        summary.malformed++;

                        if (
                            samples.malformed.length < 20
                        ) {
                            samples.malformed.push({
                                source_id:
                                    entry.source_id,

                                rows:
                                    entry.rows
                            });
                        }

                        continue;
                    }

                    const directKey =
                        `${parsed.date}|${compact(parsed.home)}|${compact(parsed.away)}`;

                    const reverseKey =
                        `${parsed.date}|${compact(parsed.away)}|${compact(parsed.home)}`;

                    const directCandidates =
                        masterDirect.get(directKey) || [];

                    const reverseCandidates =
                        masterReverse.get(reverseKey) || [];

                    /*
                     * Prefer direct orientation.
                     */

                    let candidates =
                        directCandidates.length > 0
                            ? directCandidates
                            : reverseCandidates;

                    /*
                     * Remove duplicate MASTER rows.
                     */

                    const unique =
                        new Map();

                    for (const candidate of candidates) {
                        unique.set(
                            candidate.master_row,
                            candidate
                        );
                    }

                    candidates =
                        Array.from(unique.values());

                    const classification =
                        classify(
                            parsed,
                            candidates
                        );

                    let result;

                    if (
                        classification ===
                        'SINGLE_MASTER_CANDIDATE'
                    ) {

                        const candidate =
                            candidates[0];

                        const reversed =
                            candidate.reversed;

                        if (reversed) {
                            summary.reversed_one++;

                            result = 'reversed_one';

                            if (
                                samples.reversed_one.length < 20
                            ) {
                                samples.reversed_one.push({
                                    source_id:
                                        entry.source_id,

                                    rows:
                                        entry.rows,

                                    date:
                                        parsed.date,

                                    source_home:
                                        parsed.home,

                                    source_away:
                                        parsed.away,

                                    master_match_id:
                                        candidate.master_match_id
                                });
                            }

                        } else {

                            summary.exact_one++;

                            result = 'exact_one';

                            if (
                                samples.exact_one.length < 20
                            ) {
                                samples.exact_one.push({
                                    source_id:
                                        entry.source_id,

                                    rows:
                                        entry.rows,

                                    date:
                                        parsed.date,

                                    source_home:
                                        parsed.home,

                                    source_away:
                                        parsed.away,

                                    master_match_id:
                                        candidate.master_match_id
                                });
                            }
                        }

                    } else if (
                        classification ===
                        'BEST_CANDIDATE_EXISTS'
                    ) {

                        summary.best_candidate_exists++;

                        result =
                            'best_candidate_exists';

                        if (
                            samples.best_candidate_exists.length < 20
                        ) {
                            samples.best_candidate_exists.push({
                                source_id:
                                    entry.source_id,

                                date:
                                    parsed.date,

                                source_home:
                                    parsed.home,

                                source_away:
                                    parsed.away,

                                rows:
                                    entry.rows,

                                candidates:
                                    candidates.slice(0, 10)
                            });
                        }

                    } else if (
                        classification ===
                        'MULTIPLE_EQUAL_CANDIDATES'
                    ) {

                        /*
                         * Distinguish direct/reversed ambiguity.
                         */

                        if (
                            candidates.every(
                                x => x.reversed
                            )
                        ) {
                            summary.reversed_multiple++;

                            if (
                                samples.reversed_multiple.length < 20
                            ) {
                                samples.reversed_multiple.push({
                                    source_id:
                                        entry.source_id,

                                    date:
                                        parsed.date,

                                    source_home:
                                        parsed.home,

                                    source_away:
                                        parsed.away,

                                    rows:
                                        entry.rows,

                                    candidates
                                });
                            }

                        } else {

                            summary.exact_multiple++;

                            if (
                                samples.exact_multiple.length < 20
                            ) {
                                samples.exact_multiple.push({
                                    source_id:
                                        entry.source_id,

                                    date:
                                        parsed.date,

                                    source_home:
                                        parsed.home,

                                    source_away:
                                        parsed.away,

                                    rows:
                                        entry.rows,

                                    candidates
                                });
                            }
                        }

                    } else {

                        summary.no_candidate++;

                        if (
                            samples.no_candidate.length < 20
                        ) {
                            samples.no_candidate.push({
                                source_id:
                                    entry.source_id,

                                date:
                                    parsed.date,

                                source_home:
                                    parsed.home,

                                source_away:
                                    parsed.away,

                                rows:
                                    entry.rows
                            });
                        }
                    }
                }

                resolve({
                    source: sourceName,
                    rows,
                    malformed_rows: malformed,
                    ...summary,
                    samples
                });

            })
            .on('error', reject);
    });
}

/*
 * ------------------------------------------------------------
 * MAIN
 * ------------------------------------------------------------
 */

async function main() {

    console.log('');
    console.log('============================================================');
    console.log('ZOKASCORE 99I v2: SECONDARY MATCH LINKAGE AUDIT');
    console.log('============================================================');
    console.log('');

    console.log('[1/5] Loading MASTER indexes...');

    const master =
        await loadMasterIndexes();

    console.log(
        `MASTER rows: ${master.rows}`
    );

    console.log(
        `MASTER usable rows: ${master.usable}`
    );

    console.log(
        `Direct index keys: ${master.direct.size}`
    );

    console.log(
        `Reverse index keys: ${master.reverse.size}`
    );

    console.log('');
    console.log('[2/5] Auditing APPEARANCES...');

    const appearances =
        await auditSecondary(
            APPEARANCES_FILE,
            'APPEARANCES',
            master.direct,
            master.reverse
        );

    console.log(
        `APPEARANCES rows: ${appearances.rows}`
    );

    console.log(
        `APPEARANCES unique match IDs: ${appearances.unique_match_ids}`
    );

    console.log('');
    console.log('[3/5] Auditing EVENTS...');

    const events =
        await auditSecondary(
            EVENTS_FILE,
            'EVENTS',
            master.direct,
            master.reverse
        );

    console.log(
        `EVENTS rows: ${events.rows}`
    );

    console.log(
        `EVENTS unique match IDs: ${events.unique_match_ids}`
    );

    console.log('');
    console.log('[4/5] Preparing report...');

    fs.mkdirSync(
        AUDIT_DIR,
        { recursive: true }
    );

    const report = {

        generated_at:
            new Date().toISOString(),

        tool:
            '99i-audit-secondary-match-linkage',

        version:
            '2.0.0',

        read_only:
            true,

        source:
            SOURCE_DIR,

        safety: {

            files_modified:
                false,

            source_modified:
                false,

            public_data_modified:
                false,

            repairs_performed:
                false,

            ids_rewritten:
                false
        },

        master: {

            rows:
                master.rows,

            usable_rows:
                master.usable,

            direct_index_keys:
                master.direct.size,

            reverse_index_keys:
                master.reverse.size
        },

        appearances,

        events,

        methodology: [

            'Secondary identity is taken from zokascore_match_id.',

            'APPEARANCES and EVENTS are not assumed to contain date/home/away columns.',

            'Secondary IDs are parsed as ZK_MATCH_YYYYMMDD_home_away.',

            'MASTER linkage uses date plus normalized team identity.',

            'Unicode accents and punctuation are normalized before comparison.',

            'Compact team identity is used for robust comparison.',

            'Reversed home/away orientation is detected separately.',

            'Multiple MASTER candidates are never automatically repaired.',

            'No fuzzy matching is performed.',

            'No date shifting is performed.',

            'No source IDs are rewritten.',

            'No source data is modified.',

            'This report is diagnostic only.'
        ]
    };

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
    console.log('[5/5] Report written.');

    console.log('');
    console.log('============================================================');
    console.log('99I v2 RESULTS');
    console.log('============================================================');

    console.log('');
    console.log('APPEARANCES');

    console.log(
        `  Unique IDs          : ${appearances.unique_match_ids}`
    );

    console.log(
        `  Exact one           : ${appearances.exact_one}`
    );

    console.log(
        `  Exact multiple      : ${appearances.exact_multiple}`
    );

    console.log(
        `  Reversed one        : ${appearances.reversed_one}`
    );

    console.log(
        `  Reversed multiple   : ${appearances.reversed_multiple}`
    );

    console.log(
        `  Best candidate      : ${appearances.best_candidate_exists}`
    );

    console.log(
        `  No candidate        : ${appearances.no_candidate}`
    );

    console.log(
        `  Malformed           : ${appearances.malformed}`
    );

    console.log('');
    console.log('EVENTS');

    console.log(
        `  Unique IDs          : ${events.unique_match_ids}`
    );

    console.log(
        `  Exact one           : ${events.exact_one}`
    );

    console.log(
        `  Exact multiple      : ${events.exact_multiple}`
    );

    console.log(
        `  Reversed one        : ${events.reversed_one}`
    );

    console.log(
        `  Reversed multiple   : ${events.reversed_multiple}`
    );

    console.log(
        `  Best candidate      : ${events.best_candidate_exists}`
    );

    console.log(
        `  No candidate        : ${events.no_candidate}`
    );

    console.log(
        `  Malformed           : ${events.malformed}`
    );

    console.log('');
    console.log(`Report: ${REPORT_FILE}`);
    console.log('');
}

main().catch(error => {

    console.error('');
    console.error('99I v2 FAILED');
    console.error(error);

    process.exit(1);
});
