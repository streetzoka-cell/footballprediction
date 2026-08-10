// backend-v1/src/services/MatchRankingService.js

// ★ FIX: Define normalize BEFORE using it in arrays
const normalize = (str) => String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ★ PHASE 15: Top Leagues (API-Football IDs)
const TIER_1_LEAGUES = [39, 140, 135, 78, 61, 2, 3]; // EPL, La Liga, Serie A, Bund, Ligue 1, UCL, UEL
const TIER_2_LEAGUES = [253, 848, 94, 143, 71]; // Championship, Conf League, Eredivisie, Liga Portugal, Brasileirão

// ★ FIX: Normalize keywords so they match normalized team names
const GLOBAL_CLUBS = [
  'real madrid', 'barcelona', 'atletico madrid',
  'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea', 'tottenham',
  'bayern munich', 'borussia dortmund', 'bayer leverkusen',
  'psg', 'paris saint germain',
  'juventus', 'ac milan', 'inter milan', 'napoli',
  'ajax', 'benfica', 'porto'
].map(normalize);

const RIVALRY_KEYWORDS = [
  'elclasico', 'derby', 'oldfirm', 'superclasico', 'northlondon', 'manchesterderby', 'milanderby'
];

/**
 * Calculates a "Heat Score" for a match.
 * Higher score = More important/Popular match.
 */
function calculateMatchScore(match, now) {
  let score = 0;
  const leagueId = match.league?.id || match.leagueId;
  const homeName = normalize(match.homeTeam?.name || match.homeName);
  const awayName = normalize(match.awayTeam?.name || match.awayName);
  const matchName = normalize(`${homeName} ${awayName} ${match.league?.name || ''}`);

  // 1. League Tier
  if (TIER_1_LEAGUES.includes(Number(leagueId))) score += 100;
  else if (TIER_2_LEAGUES.includes(Number(leagueId))) score += 50;
  else score += 10;

  // 2. Team Popularity (Global Clubs)
  if (GLOBAL_CLUBS.some(c => homeName.includes(c) || awayName.includes(c))) score += 80;

  // 3. Rivalry Bonus
  if (RIVALRY_KEYWORDS.some(k => matchName.includes(k))) score += 40;

  // 4. Status & Timing (The "Live" Factor)
  const status = (match.status || '').toUpperCase();
  const kickoff = match.timestamp ? match.timestamp * 1000 : new Date(match.date).getTime();
  const hoursToKickoff = (kickoff - now) / (1000 * 60 * 60);

  if (['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(status)) {
    score += 1000; // ★ LIVE MATCHES ALWAYS WIN
  } else if (status === 'FT' || status === 'AET' || status === 'PEN') {
    score -= 500; // Hide finished matches from Top 3
  } else if (hoursToKickoff > 0 && hoursToKickoff < 2) {
    score += 300; // Starting in next 2 hours
  } else if (hoursToKickoff > 0 && hoursToKickoff < 6) {
    score += 150; // Starting soon
  } else {
    score += 20; // Later today/tomorrow
  }

  return score;
}

/**
 * Sorts matches by score and tags the Top 3 as 'FEATURED'.
 */
function rankAndTagMatches(matches) {
  const now = Date.now();
  
  // Calculate scores
  const scored = matches.map(m => ({ ...m, _rankScore: calculateMatchScore(m, now) }));
  
  // Sort Descending
  scored.sort((a, b) => b._rankScore - a._rankScore);

  // Tag the Top 3 Upcoming/Live matches as FEATURED
  let topCount = 0;
  const tagged = scored.map(m => {
    const isFinished = ['FT', 'AET', 'PEN'].includes((m.status || '').toUpperCase());
    if (topCount < 3 && !isFinished && m._rankScore > 0) {
      topCount++;
      return { ...m, category: 'FEATURED', importance: 10 }; // Force into Top 3
    }
    return m;
  });

  // Clean up internal score property
  return tagged.map(({ _rankScore, ...rest }) => rest);
}

module.exports = { calculateMatchScore, rankAndTagMatches };