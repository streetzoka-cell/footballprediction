require('dotenv').config();

const IsportsAdapter = require('./src/providers/IsportsAdapter');

(async () => {
  const matches = await IsportsAdapter.getLiveFixtures();

  console.log("LIVE:", matches.length);

  matches.slice(0,5).forEach((m,i)=>{
    console.log("\nMATCH", i+1);

    console.log({
      teams: `${m.homeName} vs ${m.awayName}`,
      status: m.status,
      explain: m.explain,
      extraExplain: m.extraExplain,
      halfStartTime: m.halfStartTime,
      matchTime: m.matchTime,
      injuryTime: m.injuryTime
    });
  });

})();