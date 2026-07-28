const axios = require('axios');

async function test() {
  // TheSportsDB endpoint for events on a specific day
  // We will test for a Saturday in August
  const url = 'https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=2026-08-01&s=Soccer';
  
  try {
    console.log(`Testing: ${url}`);
    const res = await axios.get(url, { timeout: 15000 });
    
    const events = res.data?.events || [];
    console.log(`✅ SUCCESS! Status: ${res.status}`);
    console.log(`Total fixtures found for 2026-08-01: ${events.length}`);
    
    if (events.length > 0) {
      console.log('\nFirst 3 fixtures preview:');
      events.slice(0, 3).forEach((event, index) => {
        console.log(`\n--- Match ${index + 1} ---`);
        console.log(`League: ${event.strLeague}`);
        console.log(`Home: ${event.strHomeTeam}`);
        console.log(`Away: ${event.strAwayTeam}`);
        console.log(`Time: ${event.strTime}`);
        console.log(`Status: ${event.strStatus || 'NS'}`);
      });
    } else {
      console.log('No events found for this date.');
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err.response?.status}`);
    console.log('Error:', err.message);
  }
}

test();