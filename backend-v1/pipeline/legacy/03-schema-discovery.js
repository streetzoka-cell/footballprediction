'use strict';

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const AUDIT_DIR = path.join(ROOT, 'data_audit', 'schema_profiles');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function profileFile(filename) {
  return new Promise((resolve) => {
    const filePath = path.join(SOURCE_DIR, filename);
    const profile = {
      file: filename,
      exists: false,
      headers: [],
      sampleRows: []
    };

    if (!fs.existsSync(filePath)) {
      return resolve(profile);
    }

    profile.exists = true;
    let rowCount = 0;

    fs.createReadStream(filePath, { encoding: 'utf-8' }) // Force UTF-8 to handle BOMs
      .pipe(csv())
      .on('headers', (headers) => {
        profile.headers = headers.map(h => h.trim());
      })
      .on('data', (row) => {
        rowCount++;
        if (rowCount <= 2) {
          profile.sampleRows.push(row);
        }
      })
      .on('end', () => {
        resolve(profile);
      })
      .on('error', (err) => {
        console.error(`❌ Error profiling ${filename}: ${err.message}`);
        resolve(profile);
      });
  });
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 3: SCHEMA & RELATIONSHIP DISCOVERY');
  console.log('============================================================\n');

  ensureDir(AUDIT_DIR);

  // Read all files in source directory
  const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.csv'));
  const profiles = [];

  for (const file of files) {
    console.log(`🔍 Profiling ${file}...`);
    const profile = await profileFile(file);
    profiles.push(profile);
  }

  // Save full report
  const reportPath = path.join(AUDIT_DIR, 'schema-profiles.json');
  fs.writeFileSync(reportPath, JSON.stringify(profiles, null, 2), 'utf8');

  console.log('\n============================================================');
  console.log(' STEP 3 COMPLETE');
  console.log('============================================================');
  console.log(`📁 Full report saved to: ${reportPath}`);
  console.log('\n📋 Schema Summary:\n');

  // Print compact summary for easy reading
  for (const profile of profiles) {
    if (!profile.exists) continue;
    console.log(`--- ${profile.file} ---`);
    console.log(`Headers: ${profile.headers.join(', ')}`);
    if (profile.sampleRows.length > 0) {
      console.log('Sample Row:', JSON.stringify(profile.sampleRows[0]));
    }
    console.log('');
  }
}

run().catch(console.error);