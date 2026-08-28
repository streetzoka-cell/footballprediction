const fs = require('fs');
const rawFile = process.argv[2] || './fixtures.json';

const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const data = raw.data || raw;

function normalize(raw) {
  return {
    id: String(raw.id),
    sourceId: String(raw.ids?.isports || raw.id),
    sport: raw.sport,
    kickoff: new Date(raw.utcDate || raw.date),
    dateStr: raw.dateStr,
    timestamp: raw.timestamp,
    status: raw.display?.status || raw.status,
    minute: raw.display?.minute?? raw.minute?? 0,
    category: raw.category,
    matchScore: raw.matchScore,
    isLive:!!raw.display?.isLive,
    isFinished:!!raw.display?.isFinished,
    isUpcoming:!!raw.display?.isUpcoming,
    isHalfTime:!!raw.display?.isHalfTime,
    score: {
      home: raw.display?.score?.home?? raw.homeScore?? 0,
      away: raw.display?.score?.away?? raw.awayScore?? 0,
      display: raw.display?.score?.display?? raw.homeScore + '-' + raw.awayScore,
    },
    homeTeam: {
      id: String(raw.homeTeam?.id || raw.homeTeamId),
      name: raw.homeTeam?.name || raw.homeTeamName,
      shortName: raw.homeTeam?.shortName,
      crest: raw.homeTeam?.crest || raw.homeLogo || null,
    },
    awayTeam: {
      id: String(raw.awayTeam?.id || raw.awayTeamId),
      name: raw.awayTeam?.name || raw.awayTeamName,
      shortName: raw.awayTeam?.shortName,
      crest: raw.awayTeam?.crest || raw.awayLogo || null,
    },
    league: {
      id: String(raw.league?.id || raw.leagueId),
      name: raw.league?.name || raw.leagueName,
      emblem: raw.league?.emblem || raw.leagueLogo || null,
    },
    prediction: raw.prediction || raw.mlPredictions || null,
  };
}

const fixed = data.map(normalize);
fs.writeFileSync('./fixtures.fixed.json', JSON.stringify({ data: fixed, count: fixed.length, date: raw.date }, null, 2));
console.log('Fixed ' + fixed.length + ' fixtures -> fixtures.fixed.json');
