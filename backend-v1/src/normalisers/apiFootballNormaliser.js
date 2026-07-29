const { processMatch } = require('../services/SmartMatchEngine');

const normalizeMatch = (m) => {
  if (!m) return null;

  const normalizedData = {
    id: String(m.fixture?.id || ''),
    sport: 'football',
    date: m.fixture?.date ? new Date(m.fixture.date).toISOString() : null,
    timestamp: m.fixture?.timestamp || null,
    status: m.fixture?.status?.short || 'NS',
    statusLong: m.fixture?.status?.long || 'Not Started',
    minute: m.fixture?.status?.elapsed || null,
    
    homeTeamId: String(m.teams?.home?.id || ''),
    homeTeamName: m.teams?.home?.name || 'TBD',
    homeName: m.teams?.home?.name || 'TBD',
    homeTeamLogo: m.teams?.home?.logo || null,
    homeLogo: m.teams?.home?.logo || null,
    
    awayTeamId: String(m.teams?.away?.id || ''),
    awayTeamName: m.teams?.away?.name || 'TBD',
    awayName: m.teams?.away?.name || 'TBD',
    awayTeamLogo: m.teams?.away?.logo || null,
    awayLogo: m.teams?.away?.logo || null,
    
    homeScore: m.goals?.home ?? null,
    awayScore: m.goals?.away ?? null,
    goalsHome: m.goals?.home ?? null,
    goalsAway: m.goals?.away ?? null,
    
    leagueId: String(m.league?.id || ''),
    leagueName: m.league?.name || 'Other',
    leagueCountry: m.league?.country || null,
    leagueLogo: m.league?.logo || null,
    leagueFlag: m.league?.flag || null,
    season: m.league?.season || new Date().getFullYear(),
    round: m.league?.round || null,
    
    score: {
      halftime: { home: m.score?.halftime?.home ?? null, away: m.score?.halftime?.away ?? null },
      fulltime: { home: m.score?.fulltime?.home ?? null, away: m.score?.fulltime?.away ?? null },
      extratime: { home: m.score?.extratime?.home ?? null, away: m.score?.extratime?.away ?? null },
      penalty: { home: m.score?.penalty?.home ?? null, away: m.score?.penalty?.away ?? null },
    },
    
    venue: m.fixture?.venue?.name || null,
    venueCity: m.fixture?.venue?.city || null,
    matchScore: 0,
    category: 'NORMAL',
  };

  return processMatch(normalizedData);
};

module.exports = {
  normalizeMatch,
};