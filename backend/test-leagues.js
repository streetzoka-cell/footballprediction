const axios = require('axios');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const api = axios.create({
  baseURL: 'https://api.goal-api.com/v1',
  timeout: 15000,
  headers: { 'Authorization': `Bearer ${process.env.GOAL_API_KEY}` }
});

async function run() {
  console.log('🚀 Fetching top 100 leagues from GOAL API...');
  try {
    // Fetch 100 leagues sorted by popularity (highest first)
    const res = await api.get('/leagues', { params: { limit: 100, sort: '-popularity' } });
    const leagues = res.data?.data || [];
    
    console.log('\n=== TOP 100 LEAGUES (ID : NAME) ===\n');
    leagues.forEach(league => {
      console.log(`"${league.id}" : "${league.name}" (${league.countryName})`);
    });
    
    console.log('\n✅ Done! Copy this list so we can map them to your constants.js.');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  }
}

run();