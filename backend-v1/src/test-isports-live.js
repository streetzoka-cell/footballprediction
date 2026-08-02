require('dotenv').config();

const IsportsAdapter = require('./src/providers/IsportsAdapter');

(async () => {
  try {
    console.log('Testing iSports live endpoint...\n');

    const matches = await IsportsAdapter.getLiveFixtures();

    console.log(`Total live matches: ${matches.length}\n`);

    matches.slice(0, 10).forEach((m, index) => {
      console.log(`MATCH ${index + 1}`);

      console.log({
        id: m.id,
        status: m.status,
        minute: m.minute,
        period: m.period,
        time: m.time,
        liveTime: m.liveTime,
        clock: m.clock,
        keys: Object.keys(m)
      });

      console.log('----------------------');
    });

  } catch (err) {
    console.error('FAILED:', err.message);
  }
})();