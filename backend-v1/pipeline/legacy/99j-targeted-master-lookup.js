'use strict';

/**
 * 99j-targeted-master-lookup.js
 * 
 * Targeted lookup for the 8 residual unresolved match dates.
 * Streams MASTER and prints exact team strings for those dates.
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const MASTER_FILE = path.join(__dirname, '..', 'data', 'source', 'ZOKASCORE_FINAL', 'ZOKASCORE_PUBLIC_MASTER.csv');

// The 8 unique dates from the unresolved cases
const TARGET_DATES = new Set([
    '2012-07-29',
    '2012-08-01',
    '2012-08-05',
    '2012-09-09',
    '2012-10-13',
    '2012-12-19',
    '2013-01-09',
    '2025-08-09'
]);

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — TARGETED MASTER LOOKUP (99J)');
    console.log('============================================================\n');
    
    console.log('Scanning MASTER for matches on target dates...\n');

    let found = 0;
    let scanned = 0;

    fs.createReadStream(MASTER_FILE)
        .pipe(csv())
        .on('data', row => {
            scanned++;
            if (TARGET_DATES.has(row.date)) {
                found++;
                console.log(`--- Match found for ${row.date} ---`);
                console.log(`  Master ID : ${row.zokascore_match_id}`);
                console.log(`  Home      : ${row.home_team}`);
                console.log(`  Away      : ${row.away_team}`);
                console.log(`  Competition: ${row.competition}`);
                console.log('');
            }
        })
        .on('end', () => {
            console.log('============================================================');
            console.log(`Scan complete. Scanned ${scanned.toLocaleString()} rows.`);
            console.log(`Found ${found} matches in MASTER matching the target dates.`);
            console.log('============================================================');
        })
        .on('error', err => {
            console.error('Error reading MASTER file:', err);
        });
}

run();