'use strict';

/**
 * 99k-targeted-key-diagnostic.js
 * 
 * Compares exact clean/compact strings and generated keys 
 * for the 15 residual unresolved secondary IDs against MASTER.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const MASTER_FILE = path.join(__dirname, '..', 'data', 'source', 'ZOKASCORE_FINAL', 'ZOKASCORE_PUBLIC_MASTER.csv');

// The 8 unique unresolved secondary IDs
const UNRESOLVED_IDS = [
    'ZK_MATCH_20120729_naval 1 de maio_atletico cp',
    'ZK_MATCH_20120801_naval 1 de maio_sc covilha',
    'ZK_MATCH_20120805_fc arouca_naval 1 de maio',
    'ZK_MATCH_20120909_naval 1 de maio_gil vicente fc',
    'ZK_MATCH_20121013_gil vicente fc_naval 1 de maio',
    'ZK_MATCH_20121219_naval 1 de maio_sc beira mar',
    'ZK_MATCH_20130109_vitoria guimaraes sc_naval 1 de maio',
    'ZK_MATCH_20250809_sc korosten agro nyva_lutsksantekhmontazh 536 lutsk'
];

// Exact clean/compact functions from 01-build-canonical-indexes.js
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

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — TARGETED KEY DIAGNOSTIC (99K)');
    console.log('============================================================\n');

    // 1. Parse secondary IDs
    console.log('[1] Parsing Secondary Unresolved IDs...\n');
    const secondaryData = [];
    for (const id of UNRESOLVED_IDS) {
        const parsed = parseSecondaryCandidates(id);
        if (!parsed) continue;

        // Find the candidate boundary that contains "naval" or the main team name to isolate the correct split
        // For this diagnostic, let's just look at the first valid split for simplicity, 
        // but actually, let's look at all splits to find where 'naval' is the home team.
        const targetCandidate = parsed.candidates.find(c => c.home.includes('naval') || c.away.includes('naval')) || parsed.candidates[0];
        
        const secCleanHome = clean(targetCandidate.home);
        const secCleanAway = clean(targetCandidate.away);
        
        secondaryData.push({
            id,
            date: targetCandidate.date,
            rawHome: targetCandidate.home,
            rawAway: targetCandidate.away,
            cleanHome: secCleanHome,
            cleanAway: secCleanAway,
            key: buildKey(targetCandidate.date, targetCandidate.home, targetCandidate.away)
        });
    }

    // 2. Scan MASTER for those dates
    console.log('[2] Scanning MASTER for matching dates...\n');
    const targetDates = new Set(secondaryData.map(s => s.date));
    const masterMatches = {};

    await new Promise((resolve, reject) => {
        fs.createReadStream(MASTER_FILE)
            .pipe(csv())
            .on('data', row => {
                if (targetDates.has(row.date)) {
                    // Only keep matches that might be vaguely relevant (e.g. containing 'naval' or 'korosten')
                    // to avoid printing 570 rows.
                    const isRelevant = row.home_team.toLowerCase().includes('naval') || 
                                       row.away_team.toLowerCase().includes('naval') ||
                                       row.home_team.toLowerCase().includes('korosten') ||
                                       row.away_team.toLowerCase().includes('korosten');

                    if (isRelevant) {
                        if (!masterMatches[row.date]) masterMatches[row.date] = [];
                        masterMatches[row.date].push({
                            id: row.zokascore_match_id,
                            rawHome: row.home_team,
                            rawAway: row.away_team,
                            cleanHome: clean(row.home_team),
                            cleanAway: clean(row.away_team),
                            key: buildKey(row.date, row.home_team, row.away_team)
                        });
                    }
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    // 3. Print Comparison
    console.log('[3] Key Comparison:\n');
    for (const sec of secondaryData) {
        console.log('--------------------------------------------------------');
        console.log(`Secondary ID: ${sec.id}`);
        console.log(`  Raw Home:    "${sec.rawHome}"`);
        console.log(`  Clean Home:  "${sec.cleanHome}"`);
        console.log(`  Raw Away:    "${sec.rawAway}"`);
        console.log(`  Clean Away:  "${sec.cleanAway}"`);
        console.log(`  Gen Key:     ${sec.key}`);
        
        console.log(`\n  MASTER matches for ${sec.date} containing relevant teams:`);
        const masters = masterMatches[sec.date] || [];
        if (masters.length === 0) {
            console.log(`  ❌ NO relevant MASTER match found for this date!`);
        } else {
            for (const m of masters) {
                const keysMatch = sec.key === m.key;
                console.log(`    - Master ID: ${m.id}`);
                console.log(`      Raw Home:    "${m.rawHome}"`);
                console.log(`      Clean Home:  "${m.cleanHome}"`);
                console.log(`      Raw Away:    "${m.rawAway}"`);
                console.log(`      Clean Away:  "${m.cleanAway}"`);
                console.log(`      Gen Key:     ${m.key}`);
                console.log(`      KEY MATCH:   ${keysMatch ? '✅ YES' : '❌ NO'}`);
            }
        }
        console.log('');
    }
}

run().catch(err => {
    console.error('Error:', err);
});