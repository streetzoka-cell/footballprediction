// footballprediction/backend-v1/src/normalisers/isportsNormaliser.js

function normaliseMatch(m) {
  if (!m) return null;
  
  let mappedStatus = 'NS';
  let isLive = false;
  let isFinished = false;
  let isUpcoming = false;
  
  if (m.status === -1) {
    mappedStatus = 'FT';
    isFinished = true;
  } else if (m.status > 0) {
    isLive = true;
    if (m.status === 1) mappedStatus = '1H';
    else if (m.status === 2) mappedStatus = 'HT';
    else if (m.status === 3) mappedStatus = '2H';
    else if (m.status === 4) mappedStatus = 'ET';
    else if (m.status === 5) mappedStatus = 'P';
    else mappedStatus = 'LIVE'; 
  } else {
    isUpcoming = true;
  }

  const homeName = m.homeName || 'TBD';
  const awayName = m.awayName || 'TBD';
  const leagueName = m.leagueName || 'Other';

  // â˜… MUST mimic the exact API-Football shape for the frontend matchEngine!
  return {
    id: String(m.matchId),
    sport: 'football',
    dateStr: m.matchTime ? new Date(m.matchTime * 1000).toISOString().split('T')[0] : null,
    date: m.matchTime ? new Date(m.matchTime * 1000).toISOString() : null,
    utcDate: m.matchTime ? new Date(m.matchTime * 1000).toISOString() : null,
    timestamp: m.matchTime,
    status: mappedStatus,
    
    // Nested objects for matchEngine.js
    homeTeam: { name: homeName, shortName: homeName, id: String(m.homeId), crest: null },
    awayTeam: { name: awayName, shortName: awayName, id: String(m.awayId), crest: null },
    league: { name: leagueName, id: String(m.leagueId), emblem: null },
    competition: { name: leagueName, id: String(m.leagueId), emblem: null },
    
    // Flat fields for backward compatibility
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeName: homeName,
    awayName: awayName,
    homeTeamId: String(m.homeId),
    awayTeamId: String(m.awayId),
    homeLogo: null,
    awayLogo: null,
    leagueName: leagueName,
    leagueId: String(m.leagueId),
    leagueLogo: null,
    
    // Scores nested inside display.score
    display: {
      isLive: isLive,
      isFinished: isFinished,
      isUpcoming: isUpcoming,
      isHalfTime: mappedStatus === 'HT',
      minute: m.extraExplain?.minute || 0,
      status: mappedStatus,
      score: {
        home: m.homeScore ?? 0,
        away: m.awayScore ?? 0,
        display: `${m.homeScore ?? 0}-${m.awayScore ?? 0}`
      }
    },
    
    // Flat scores for Blind Merger
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    isLive: isLive,
    isFinished: isFinished,
  };
}

function normaliseLeague(l) {
  if (!l) return null;
  return {
    id: String(l.leagueId),
    leagueName: l.name || l.leagueName,
    name: l.name || l.leagueName,
    shortName: l.shortName || l.leagueShortName,
    logo: l.logo,
    country: l.country,
    countryLogo: l.countryLogo,
    season: l.currentSeason,
    totalRound: l.totalRound,
    currentRound: l.currentRound,
  };
}

module.exports = {
  normaliseMatch,
  normaliseLeague,
  matches: (payload) => (payload || []).map(normaliseMatch).filter(Boolean),
  leagues: (payload) => (payload || []).map(normaliseLeague).filter(Boolean),
};
