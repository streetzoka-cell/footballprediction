'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data', 'source');
const DOWNLOADS_DIR = 'C:\\Users\\COISA COMPUTERS\\Downloads';

// The large files that were missing/empty in the backend root
const LARGE_FILES = [
  'appearances.csv',
  'game_events.csv',
  'goalscorers.csv',
  'matches.csv',
  'players.csv',
  'player_valuations.csv'
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function copyFile(src, dest) {
  // Using read/write stream for large files to avoid RAM spikes
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(src);
    const writeStream = fs.createWriteStream(dest);
    
    readStream.pipe(writeStream);
    
    writeStream.on('finish', () => {
      const hash = sha256(dest);
      const size = fs.statSync(dest).size;
      resolve({ hash, size });
    });
    
    writeStream.on('error', reject);
    readStream.on('error', reject);
  });
}

async function run() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 PIPELINE — STEP 0: IMPORT LARGE CSVS');
  console.log('============================================================\n');

  ensureDir(SOURCE_DIR);

  for (const file of LARGE_FILES) {
    const src = path.join(DOWNLOADS_DIR, file);
    const dest = path.join(SOURCE_DIR, file);
    
    // Skip if already exists and is not empty in source dir
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`✅ Already exists in source: ${file} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }

    if (!fs.existsSync(src)) {
      console.warn(`⚠️ Not found in Downloads: ${file}`);
      continue;
    }

    console.log(`📥 Copying ${file}...`);
    try {
      const { hash, size } = await copyFile(src, dest);
      console.log(`✅ Imported: ${file}`);
      console.log(`   Size:   ${(size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   SHA256: ${hash}`);
    } catch (e) {
      console.error(`❌ Failed to copy ${file}: ${e.message}`);
    }
  }

  console.log('\n✅ Import complete. You can now run the audit script.');
}

run().catch(console.error);