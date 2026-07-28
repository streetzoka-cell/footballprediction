// backend/config/teamRanking.js
//
// ★ FIX: The previous version keyed TEAM_POPULARITY by classic API-Football
// numeric team IDs. Goal API team IDs are opaque strings
// ("cmr9x..." style) with no bridge back to those numbers, so every lookup
// missed and fell back to DEFAULT_TEAM_SCORE for every single team.
//
// Fix: key by a normalized team name instead (lowercase, punctuation
// stripped) and look it up the same way Fixtures.jsx already does for its
// TOP_TEAMS_LIST on the frontend — so this list and that one can eventually
// be merged into one shared source of truth if you want.
//
// This list is a reasonable starting curation, not exhaustive — add to it
// as you notice popular teams scoring as generic.

const DEFAULT_TEAM_SCORE = 40;

const RAW_POPULARITY = {
  // England
  'manchester united': 100, 'manchester city': 100, 'liverpool': 100, 'chelsea': 95,
  'arsenal': 95, 'tottenham hotspur': 90, 'tottenham': 90, 'newcastle united': 75,
  'aston villa': 70, 'west ham united': 65,
  // Spain
  'real madrid': 100, 'barcelona': 100, 'atletico madrid': 90, 'athletic bilbao': 70,
  'sevilla': 65, 'valencia': 60, 'real sociedad': 60,
  // Germany
  'bayern munich': 100, 'borussia dortmund': 90, 'rb leipzig': 80, 'bayer leverkusen': 80,
  'eintracht frankfurt': 60, 'schalke 04': 55,
  // Italy
  'juventus': 95, 'inter': 90, 'inter milan': 90, 'ac milan': 90, 'napoli': 85,
  'roma': 75, 'as roma': 75, 'lazio': 70, 'atalanta': 65,
  // France
  'paris saint germain': 95, 'psg': 95, 'marseille': 70, 'lyon': 65, 'monaco': 60,
  // Portugal / Netherlands
  'benfica': 75, 'porto': 75, 'sporting cp': 70, 'ajax': 75, 'psv eindhoven': 60, 'feyenoord': 60,
  // Scotland
  'celtic': 60, 'rangers': 60,
  // Americas
  'flamengo': 70, 'palmeiras': 65, 'corinthians': 65, 'sao paulo': 60,
  'boca juniors': 70, 'river plate': 70, 'inter miami': 65,
};

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const TEAM_POPULARITY_BY_NAME = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_POPULARITY).map(([k, v]) => [normalizeName(k), v])
  )
);

function getTeamPopularity(teamName) {
  return TEAM_POPULARITY_BY_NAME[normalizeName(teamName)] ?? DEFAULT_TEAM_SCORE;
}

module.exports = { TEAM_POPULARITY_BY_NAME, DEFAULT_TEAM_SCORE, getTeamPopularity };