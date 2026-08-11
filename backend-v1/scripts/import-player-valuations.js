// backend-v1/scripts/import-player-valuations.js
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

const INPUT_CSV = path.join(process.cwd(), 'player_valuations.csv');
const OUTPUT_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

async function run() {
  console.log('[Import] Streaming player_valuations.csv...');
  
  const valuationsByPlayer = {};
  let count = 0;

  await new Promise((res, rej) => {
    fs.createReadStream(INPUT_CSV)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (r) => {
        const playerId = r.player_id;
        if (!playerId) return;
        
        if (!valuationsByPlayer[playerId]) {
          valuationsByPlayer[playerId] = {
            name: r.current_club_name, // Will be overwritten by players.csv later if needed
            valuations: []
          };
        }
        
        valuationsByPlayer[playerId].valuations.push({
          date: r.date,
          market_value: r.market_value_in_eur ? parseInt(r.market_value_in_eur, 10) : null,
          club: r.current_club_name
        });
        count++;
      })
      .on('end', res)
      .on('error', rej);
  });

  console.log(`[Import] Loaded ${count} valuations for ${Object.keys(valuationsByPlayer).length} players.`);

  // Sort valuations by date for each player
  for (const id in valuationsByPlayer) {
    valuationsByPlayer[id].valuations.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  const payload = {
    id: 'player_valuations',
    name: 'Player Market Value History',
    aliases: ['market value', 'player valuations', 'transfer value'],
    category: 'history',
    intents: ['definition'],
    valuations: valuationsByPlayer
  };

  const outputFile = path.join(OUTPUT_DIR, 'player_valuations.json');
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));

  console.log(`[Import] Saved to ${path.relative(process.cwd(), outputFile)}`);
  console.log('[Import] Done!');
}

run().catch(err => {
  console.error('[Import] Failed:', err);
  process.exit(1);
});