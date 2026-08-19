// backend-v1/src/config/leagues.js

const PRIORITY_COMPETITIONS = [
  // TIER 1: The Elite (Priority 100)
  { id: '2', name: 'UEFA Champions League', country: 'World', tier: 1, priority: 100 },
  { id: '39', name: 'Premier League', country: 'England', tier: 1, priority: 100 },
  { id: '140', name: 'La Liga', country: 'Spain', tier: 1, priority: 100 },
  { id: '78', name: 'Bundesliga', country: 'Germany', tier: 1, priority: 100 },
  { id: '135', name: 'Serie A', country: 'Italy', tier: 1, priority: 100 },
  { id: '61', name: 'Ligue 1', country: 'France', tier: 1, priority: 100 },
  
  // TIER 2: Major Domestic & High-Profile (Priority 85)
  { id: '88', name: 'Eredivisie', country: 'Netherlands', tier: 2, priority: 85 },
  { id: '94', name: 'Primeira Liga', country: 'Portugal', tier: 2, priority: 85 },
  { id: '144', name: 'Jupiler Pro League', country: 'Belgium', tier: 2, priority: 80 },
  { id: '203', name: 'Süper Lig', country: 'Turkey', tier: 2, priority: 80 },
  { id: '71', name: 'Serie A', country: 'Brazil', tier: 2, priority: 85 },
  { id: '128', name: 'Liga Profesional', country: 'Argentina', tier: 2, priority: 85 },
  { id: '262', name: 'MLS', country: 'USA', tier: 2, priority: 80 },
  { id: '307', name: 'Saudi Pro League', country: 'Saudi Arabia', tier: 2, priority: 80 },
  { id: '40', name: 'Championship', country: 'England', tier: 2, priority: 80 },
  
  // TIER 3: Major Cups & Other Notable Leagues (Priority 75)
  { id: '3', name: 'UEFA Europa League', country: 'World', tier: 3, priority: 75 },
  { id: '848', name: 'UEFA Europa Conference League', country: 'World', tier: 3, priority: 75 },
  { id: '13', name: 'Copa Libertadores', country: 'South America', tier: 3, priority: 75 },
  { id: '11', name: 'Copa Sudamericana', country: 'South America', tier: 3, priority: 75 },
  { id: '197', name: 'Super League', country: 'Greece', tier: 3, priority: 70 },
  { id: '179', name: 'Premiership', country: 'Scotland', tier: 3, priority: 70 },
  { id: '218', name: 'Bundesliga', country: 'Austria', tier: 3, priority: 70 },
  { id: '207', name: 'Super League', country: 'Switzerland', tier: 3, priority: 70 },
  { id: '119', name: 'Superliga', country: 'Denmark', tier: 3, priority: 70 },
  { id: '103', name: 'Eliteserien', country: 'Norway', tier: 3, priority: 70 },
  { id: '95', name: 'Allsvenskan', country: 'Sweden', tier: 3, priority: 70 },
  { id: '106', name: 'Ekstraklasa', country: 'Poland', tier: 3, priority: 70 },
  { id: '345', name: 'First League', country: 'Czech Republic', tier: 3, priority: 70 },
  { id: '210', name: 'HNL', country: 'Croatia', tier: 3, priority: 70 },
  { id: '283', name: 'Liga I', country: 'Romania', tier: 3, priority: 70 },
  { id: '333', name: 'Premier League', country: 'Ukraine', tier: 3, priority: 70 },
  { id: '72', name: 'Série B', country: 'Brazil', tier: 3, priority: 65 },
  { id: '239', name: 'Primera A', country: 'Colombia', tier: 3, priority: 65 },
];

const aliasMap = new Map();
const prioritySet = new Set();

for (const comp of PRIORITY_COMPETITIONS) {
  aliasMap.set(String(comp.id).toLowerCase(), comp);
  prioritySet.add(String(comp.id));
}

function getLeagues() {
  return PRIORITY_COMPETITIONS;
}

function findLeague(identifier) {
  if (!identifier) return null;
  const key = String(identifier).trim().toLowerCase();
  return aliasMap.get(key) || null;
}

// ★ NEW: Replaces isTop50League. Checks if the competition is in our priority universe.
function isPriorityCompetition(competitionId) {
  return prioritySet.has(String(competitionId));
}

module.exports = {
  getLeagues,
  findLeague,
  isPriorityCompetition,
};