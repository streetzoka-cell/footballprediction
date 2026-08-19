const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(__dirname, '..', 'data', 'source', 'ZOKASCORE_FINAL');

async function printFirstRow(file) {
    return new Promise((resolve) => {
        console.log(`\n--- ${file} ---`);
        let count = 0;
        fs.createReadStream(path.join(DATA_DIR, file))
            .pipe(csv())
            .on('headers', (headers) => {
                console.log('Headers:', headers);
            })
            .on('data', (row) => {
                if (count === 0) {
                    console.log('Row 1:', JSON.stringify(row, null, 2));
                    count++;
                    resolve();
                }
            })
            .on('end', () => resolve());
    });
}

async function run() {
    await printFirstRow('ZOKASCORE_PUBLIC_MASTER.csv');
    await printFirstRow('ZOKASCORE_APPEARANCES.csv');
    await printFirstRow('ZOKASCORE_EVENTS.csv');
}

run();