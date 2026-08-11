// backend-v1/scripts/generate-player-profiles.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const DOWNLOADS_DIR = 'C:\\Users\\COISA COMPUTERS\\Downloads';
const PLAYERS_CSV = path.join(DOWNLOADS_DIR, 'players.csv');
const APP_CSV = path.join(DOWNLOADS_DIR, 'appearances.csv');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');
const VALUATIONS_FILE = path.join(HISTORY_DIR, 'player_valuations.json');
const OUTPUT_DIR = path.join(HISTORY_DIR, 'entities', 'players');

async function run() {
  console.log('[Profiles] Starting Player Aggregation...');

  // 1. Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 2. Load Base Player Profiles
  console.log('[Profiles] Loading players.csv...');
  const playersMap = {};
  await new Promise((res, rej) => {
    fs.createReadStream(PLAYERS_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        if (row.player_id) {
          playersMap[row.player_id] = {
            profile: {
              name: row.name,
              position: row.position,
              sub_position: row.sub_position,
              nationality: row.country_of_citizenship,
              date_of_birth: row.date_of_birth,
              height: row.height_in_cm ? `${row.height_in_cm} cm` : null,
              foot: row.foot
            }
          };
        }
      }).on('end', res).on('error', rej);
  });
  console.log(`[Profiles] Loaded ${Object.keys(playersMap).length} base profiles.`);

  // 3. Load Valuations
  console.log('[Profiles] Loading valuations...');
  let valuationsMap = {};
  try {
    const rawVal = fs.readFileSync(VALUATIONS_FILE, 'utf8');
    const parsedVal = JSON.parse(rawVal);
    valuationsMap = parsedVal.valuations || {};
    console.log(`[Profiles] Loaded ${Object.keys(valuationsMap).length} valuation histories.`);
  } catch (e) {
    console.warn('[Profiles] Warning: player_valuations.json not found. Skipping valuations.');
  }

  // 4. Stream Appearances and Aggregator
  console.log('[Profiles] Streaming 1.89M appearances... (this takes a minute)');
  const statsMap = {};

  await new Promise((res, rej) => {
    fs.createReadStream(APP_CSV).pipe(parse({ columns: true, trim: true }))
      .on('data', (row) => {
        const pId = row.player_id;
        if (!pId) return;

        if (!playersMap[pId]) {
          playersMap[pId] = { profile: { name: row.player_name || 'Unknown' } };
        }

        if (!statsMap[pId]) {
          statsMap[pId] = {
            career: { appearances: 0, goals: 0, assists: 0, minutes: 0, yellow_cards: 0, red_cards: 0 },
            clubs: new Set(),
            competitions: new Set(),
            seasons: new Set()
          };
        }

        const stats = statsMap[pId];
        stats.career.appearances++;
        stats.career.goals += parseInt(row.goals, 10) || 0;
        stats.career.assists += parseInt(row.assists, 10) || 0;
        stats.career.minutes += parseInt(row.minutes_played, 10) || 0;
        stats.career.yellow_cards += parseInt(row.yellow_cards, 10) || 0;
        stats.career.red_cards += parseInt(row.red_cards, 10) || 0;

        if (row.player_club_id) stats.clubs.add(row.player_club_id);
        if (row.competition_id) stats.competitions.add(row.competition_id);
        
        // Extract season from date (YYYY)
        if (row.date) stats.seasons.add(row.date.substring(0, 4));
        
      }).on('end', res).on('error', rej);
  });

  // 5. Save individual Player Files
  console.log('[Profiles] Saving aggregated player files...');
  let savedCount = 0;

  for (const pId in playersMap) {
    const playerData = playersMap[pId];
    const stats = statsMap[pId] || { career: {}, clubs: [], competitions: [], seasons: [] };
    const valuations = valuationsMap[pId] ? valuationsMap[pId].valuations : [];

    const payload = {
      id: pId,
      profile: playerData.profile,
      career_stats: stats.career,
      clubs: Array.from(stats.clubs),
      competitions: Array.from(stats.competitions),
      seasons: Array.from(stats.seasons).sort(),
      valuations: valuations
    };

    // Only save if the player actually has at least one appearance or valuation
    if (payload.career_stats.appearances > 0 || valuations.length > 0) {
      const filePath = path.join(OUTPUT_DIR, `${pId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
      savedCount++;
    }
  }

  console.log(`\n[Profiles] Done! Saved ${savedCount} player profiles to /entities/players/`);
}

run().catch(err => { console.error('[Profiles] Failed:', err); process.exit(1); });