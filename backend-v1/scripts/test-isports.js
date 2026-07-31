// backend-v1/scripts/test-isports.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const KEY = process.env.ISPORTS_API_KEY;
const BASES = ['https://api.isportsapi.com', 'https://api2.isportsapi.com'];

if (!KEY) {
  console.error('❌  ISPORTS_API_KEY missing in .env');
  process.exit(1);
}

// Test today and tomorrow's date
const today = new Date();
const tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
const formatDate = (d) => d.toISOString().split('T')[0];

const ENDPOINTS = [
  { label: 'livescores',  path: '/sport/football/livescores' },
  { label: 'fixtures-today', path: '/sport/football/schedule/basic', params: { date: formatDate(today) } },
  { label: 'fixtures-tomorrow', path: '/sport/football/schedule/basic', params: { date: formatDate(tomorrow) } },
];

async function probe(base, ep) {
  const url = `${base}${ep.path}`;
  try {
    const { status, data } = await axios.get(url, {
      params: { api_key: KEY, ...(ep.params || {}) },
      timeout: 15000,
      validateStatus: () => true,
    });
    
    console.log(`\n=== ${ep.label} ===`);
    console.log(`URL: ${url}`);
    console.log(`Status: ${status}`);
    
    if (data.code === 0 && data.data) {
      console.log(`✅ Success! Returned ${data.data.length} items.`);
      console.log('Sample item:', JSON.stringify(data.data[0], null, 2).slice(0, 1000));
    } else {
      console.log(`❌ API Error: Code ${data.code} - ${data.message}`);
    }
  } catch (e) {
    console.log(`❌ Network Error: ${e.message}`);
  }
}

(async () => {
  console.log('🔑 Using key:', KEY.slice(0, 6) + '…' + KEY.slice(-3));
  for (const ep of ENDPOINTS) {
    await probe(BASES[0], ep);
  }
})();