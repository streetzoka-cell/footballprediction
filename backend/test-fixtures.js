const axios = require('axios');
const https = require('https');

const KEY = 'yUILJl2Kdd2g1t0e';
const SECRET = 'gcavwL3nL2jYeIqNC8ymuB6IO9YQDY4T';

async function test() {
  const url = 'https://livescore-api.com/api-client/fixtures/matches.json';
  
  // Let's fetch August 1 to August 15
  const params = {
    key: KEY,
    secret: SECRET,
    from: '2026-08-01',
    to: '2026-08-15'
  };
  
  try {
    const res = await axios.get(url, { params, httpsAgent: new https.Agent({ rejectUnauthorized: false }) });
    console.log(`✅ SUCCESS! Status: ${res.status}`);
    const matches = res.data?.data?.match || [];
    console.log(`Total fixtures found: ${matches.length}`);
    
    if (matches.length > 0) {
      console.log('\nFirst fixture preview:');
      console.log(JSON.stringify(matches[0], null, 2));
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err.response?.status}`);
    console.log('Error:', JSON.stringify(err.response?.data, null, 2));
  }
}

test();