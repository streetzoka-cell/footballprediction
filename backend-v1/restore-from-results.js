const fs = require('fs');
const path = require('path');

const resultsDir = './public_data/results';
const fixturesDir = './public_data/fixtures';

function normalizeGood(raw){
  // kickoff fix - original has date / utcDate / timestamp
  let kickoff = null;
  if(raw.kickoff) kickoff = new Date(raw.kickoff);
  else if(raw.utcDate) kickoff = new Date(raw.utcDate);
  else if(raw.date) kickoff = new Date(raw.date);
  else if(raw.timestamp) kickoff = new Date(raw.timestamp * 1000);
  else if(raw.dateStr) kickoff = new Date(raw.dateStr);

  // score fix - original has display.score.display AND homeScore/awayScore
  const dScore = raw.display?.score;
  const home = dScore?.home?? raw.homeScore?? raw.score?.home?? 0;
  const away = dScore?.away?? raw.awayScore?? raw.score?.away?? 0;
  let display = dScore?.display?? raw.score?.display;
  if(!display || display.includes('undefined')) display = home + '-' + away;

  return {
    id: String(raw.id),
    sourceId: String(raw.ids?.isports || raw.sourceId || raw.id),
    sport: raw.sport || 'football',
    kickoff: kickoff,
    dateStr: raw.dateStr,
    timestamp: raw.timestamp,
    status: raw.display?.status || raw.status || 'NS',
    minute: raw.display?.minute?? raw.minute?? 0,
    category: raw.category || (raw.display?.isLive? 'LIVE' : 'NORMAL'),
    matchScore: raw.matchScore?? 0,
    isLive:!!(raw.display?.isLive?? raw.isLive),
    isFinished:!!(raw.display?.isFinished?? raw.isFinished),
    isUpcoming:!!(raw.display?.isUpcoming?? raw.isUpcoming?? (raw.status === 'NS')),
    isHalfTime:!!(raw.display?.isHalfTime?? raw.isHalfTime),
    score: { home, away, display },
    homeTeam: {
      id: String(raw.homeTeam?.id || raw.homeTeamId),
      name: raw.homeTeam?.name || raw.homeTeamName,
      shortName: raw.homeTeam?.shortName || raw.homeTeam?.name,
      crest: raw.homeTeam?.crest || raw.homeLogo || null,
    },
    awayTeam: {
      id: String(raw.awayTeam?.id || raw.awayTeamId),
      name: raw.awayTeam?.name || raw.awayTeamName,
      shortName: raw.awayTeam?.shortName || raw.awayTeam?.name,
      crest: raw.awayTeam?.crest || raw.awayLogo || null,
    },
    league: {
      id: String(raw.league?.id || raw.leagueId),
      name: raw.league?.name || raw.leagueName,
      emblem: raw.league?.emblem || raw.leagueLogo || null,
    },
    prediction: raw.prediction || raw.mlPredictions || raw.mlPrediction || null,
    extraExplain: raw.extraExplain || null,
  };
}

const files = fs.readdirSync(resultsDir).filter(f=>f.endsWith('.json'));
console.log('Found results files:', files.length);

for(const file of files){
  const full = path.join(resultsDir, file);
  let json;
  try { json = JSON.parse(fs.readFileSync(full,'utf8')); } catch(e){ console.log('BAD JSON', file); continue; }
  const data = json.data || [];
  if(data.length === 0) { console.log('SKIP empty', file); continue; }

  const fixed = data.map(normalizeGood);
  const outPath = path.join(fixturesDir, file);
  fs.writeFileSync(outPath, JSON.stringify({ data: fixed, count: fixed.length, date: file.replace('.json','') }, null, 2));
  console.log('RESTORED', file, '->', fixed.length, 'matches | sample:', fixed[0].score.display, '| kickoff OK:',!!fixed[0].kickoff);
}
