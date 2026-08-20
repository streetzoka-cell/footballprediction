// backend-v1/pipeline/33-extract-features.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const ROOT = path.join(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'data', 'processed', 'master_with_elo.csv');
const OUTPUT_DIR = path.join(ROOT, 'data', 'ml');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'features_elo.csv');
const TEMP_OUTPUT_FILE = OUTPUT_FILE + '.tmp';

const REQUIRED_COLUMNS = [
  'zokascore_match_id', 'date', 'home_team_id', 'away_team_id', 
  'home_score', 'away_score', 'home_elo_pre', 'away_elo_pre'
];

function csvEscape(value) {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function isValidDate(value) {
  if (value == null || String(value).trim() === '') return false;
  return Number.isFinite(Date.parse(String(value)));
}

function getTarget(homeScore, awayScore) {
  if (homeScore > awayScore) return 'HOME_WIN';
  if (homeScore < awayScore) return 'AWAY_WIN';
  return 'DRAW';
}

async function processStream() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SOURCE_FILE)) {
      return reject(new Error(`Source file not found: ${SOURCE_FILE}`));
    }

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    
    const readStream = fs.createReadStream(SOURCE_FILE);
    const writeStream = fs.createWriteStream(TEMP_OUTPUT_FILE, { encoding: 'utf8' });
    
    let rowCount = 0;
    let homeWins = 0, draws = 0, awayWins = 0;
    const matchIds = new Set();
    let headersChecked = false;
    
    writeStream.write('match_id,date,home_team_id,away_team_id,home_elo_pre,away_elo_pre,elo_diff,target\n');

    readStream
      .pipe(csv())
      .on('headers', (headers) => {
        headersChecked = true;
        const missing = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
        if (missing.length > 0) {
          reject(new Error(`Missing required columns: ${missing.join(', ')}`));
          readStream.destroy();
        }
      })
      .on('data', (row) => {
        const matchId = String(row.zokascore_match_id ?? '').trim();
        if (!matchId || matchIds.has(matchId)) return;
        matchIds.add(matchId);

        const homeTeamId = String(row.home_team_id ?? '').trim();
        const awayTeamId = String(row.away_team_id ?? '').trim();
        if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;

        if (!isValidDate(row.date)) return;

        const homeScore = Number(row.home_score);
        const awayScore = Number(row.away_score);
        if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore < 0 || awayScore < 0) return;

        const homeElo = Number(row.home_elo_pre);
        const awayElo = Number(row.away_elo_pre);
        if (!Number.isFinite(homeElo) || !Number.isFinite(awayElo)) return;

        const eloDiff = homeElo - awayElo;
        const target = getTarget(homeScore, awayScore);
        
        if (target === 'HOME_WIN') homeWins++;
        else if (target === 'DRAW') draws++;
        else awayWins++;

        const cleanDate = String(row.date).split('T')[0];
        
        writeStream.write([
          csvEscape(matchId), csvEscape(cleanDate), csvEscape(homeTeamId), csvEscape(awayTeamId),
          homeElo.toFixed(2), awayElo.toFixed(2), eloDiff.toFixed(2), target
        ].join(',') + '\n');
        
        rowCount++;
      })
      .on('end', () => {
        if (!headersChecked) return reject(new Error('CSV was empty or missing headers'));
        writeStream.end(() => {
          resolve({ rowCount, homeWins, draws, awayWins, uniqueIds: matchIds.size });
        });
      })
      .on('error', (err) => reject(err));
      
    writeStream.on('error', (err) => reject(err));
  });
}

async function main() {
  console.log('============================================================');
  console.log(' ZOKASCORE V2 — STEP 33: CANONICAL ELO FEATURE EXTRACTION');
  console.log('============================================================\n');

  console.log('[1/2] Streaming master_with_elo.csv -> features_elo.csv...');
  const stats = await processStream();

  console.log('[2/2] Verifying output file...');
  let verifyCount = 0;
  await new Promise((resolve, reject) => {
    fs.createReadStream(TEMP_OUTPUT_FILE)
      .pipe(csv())
      .on('data', () => verifyCount++)
      .on('end', resolve)
      .on('error', reject);
  });

  if (verifyCount !== stats.rowCount) {
    throw new Error(`Verification failed: wrote ${stats.rowCount} but read back ${verifyCount}`);
  }

  fs.renameSync(TEMP_OUTPUT_FILE, OUTPUT_FILE);

  console.log('\n============================================================');
  console.log(' STEP 33 COMPLETE: PASS');
  console.log('============================================================');
  console.log(`📊 Streamed rows:      ${stats.rowCount.toLocaleString()}`);
  console.log(`📊 Unique Match IDs:   ${stats.uniqueIds.toLocaleString()}`);
  console.log(`📊 Home wins:          ${stats.homeWins.toLocaleString()}`);
  console.log(`📊 Draws:              ${stats.draws.toLocaleString()}`);
  console.log(`📊 Away wins:          ${stats.awayWins.toLocaleString()}`);
  console.log(`📁 Features:           ${OUTPUT_FILE}\n`);
}

main().catch(err => {
  if (fs.existsSync(TEMP_OUTPUT_FILE)) fs.unlinkSync(TEMP_OUTPUT_FILE);
  console.error('\n❌ PIPELINE 33 FAILED');
  console.error('------------------------------------------------------------');
  console.error(err.message);
  console.error('------------------------------------------------------------');
  process.exit(1);
});