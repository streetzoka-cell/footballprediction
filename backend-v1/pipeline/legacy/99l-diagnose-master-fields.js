'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const MASTER_FILE = path.join(__dirname, '..', 'data', 'source', 'ZOKASCORE_FINAL', 'ZOKASCORE_PUBLIC_MASTER.csv');

async function run() {
    console.log('============================================================');
    console.log(' ZOKASCORE V2 — MASTER FIELD COMPOSITION DIAGNOSTIC');
    console.log('============================================================\n');

    const stats = {
        totalRows: 0,
        allFieldsPresent: 0,
        missingSeasonOnly: 0,
        missingDateOnly: 0,
        missingHomeTeamOnly: 0,
        missingAwayTeamOnly: 0,
        missingMultiple: 0
    };

    await new Promise((resolve, reject) => {
        fs.createReadStream(MASTER_FILE)
            .pipe(csv())
            .on('data', row => {
                stats.totalRows++;
                
                const hasSeason = String(row.season ?? '').trim() !== '';
                const hasDate = String(row.date ?? '').trim() !== '';
                const hasHome = String(row.home_team ?? '').trim() !== '';
                const hasAway = String(row.away_team ?? '').trim() !== '';

                if (hasSeason && hasDate && hasHome && hasAway) {
                    stats.allFieldsPresent++;
                    return;
                }

                const missingCount = !hasSeason + !hasDate + !hasHome + !hasAway;

                if (missingCount > 1) {
                    stats.missingMultiple++;
                } else if (!hasSeason) {
                    stats.missingSeasonOnly++;
                } else if (!hasDate) {
                    stats.missingDateOnly++;
                } else if (!hasHome) {
                    stats.missingHomeTeamOnly++;
                } else if (!hasAway) {
                    stats.missingAwayTeamOnly++;
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });

    console.log(`Total Rows Scanned         : ${stats.totalRows.toLocaleString()}`);
    console.log(`All Fields Present          : ${stats.allFieldsPresent.toLocaleString()}`);
    console.log(`Missing Season ONLY         : ${stats.missingSeasonOnly.toLocaleString()}`);
    console.log(`Missing Date ONLY           : ${stats.missingDateOnly.toLocaleString()}`);
    console.log(`Missing Home Team ONLY      : ${stats.missingHomeTeamOnly.toLocaleString()}`);
    console.log(`Missing Away Team ONLY      : ${stats.missingAwayTeamOnly.toLocaleString()}`);
    console.log(`Missing Multiple Fields     : ${stats.missingMultiple.toLocaleString()}`);
    
    console.log('\n============================================================');
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});