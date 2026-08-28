// backend-v1/src/config/leagues.js

/* API-Football league IDs.
   mustHave = the TOP 12 — guaranteed in every fixture snapshot (never filtered,
   never capped by the 500 limit) and pinned in the frontend. */
const PRIORITY_COMPETITIONS = [
  // TIER 1 — The Elite (6 of the must-have 12)
  { id: '2',   name: 'UEFA Champions League', country: 'World',   tier: 1, priority: 100, mustHave: true },
  { id: '39',  name: 'Premier League',        country: 'England', tier: 1, priority: 100, mustHave: true },
  { id: '140', name: 'La Liga',               country: 'Spain',   tier: 1, priority: 100, mustHave: true },
  { id: '78',  name: 'Bundesliga',            country: 'Germany', tier: 1, priority: 100, mustHave: true },
  { id: '135', name: 'Serie A',               country: 'Italy',   tier: 1, priority: 100, mustHave: true },
  { id: '61',  name: 'Ligue 1',               country: 'France',  tier: 1, priority: 100, mustHave: true },

  // TIER 2 — must-have (the other 6 of 12)
  { id: '3',   name: 'UEFA Europa Conference League', country: 'World',       tier: 2, priority: 90, mustHave: true },
  { id: '848', name: 'UEFA Europa League',    country: 'World',       tier: 2, priority: 90, mustHave: true },
  { id: '88',  name: 'Eredivisie',            country: 'Netherlands', tier: 2, priority: 85, mustHave: true },
  { id: '94',  name: 'Primeira Liga',         country: 'Portugal',    tier: 2, priority: 85, mustHave: true },
  { id: '71',  name: 'Serie A',               country: 'Brazil',      tier: 2, priority: 85, mustHave: true },
  { id: '128', name: 'Liga Profesional',     country: 'Argentina',   tier: 2, priority: 85, mustHave: true },

  // TIER 2 — rest of the priority universe
  { id: '144', name: 'Jupiler Pro League',    country: 'Belgium',      tier: 2, priority: 80 },
  { id: '203', name: 'Süper Lig',             country: 'Turkey',       tier: 2, priority: 80 },
  { id: '262', name: 'MLS',                   country: 'USA',          tier: 2, priority: 80 },
  { id: '307', name: 'Saudi Pro League',      country: 'Saudi Arabia', tier: 2, priority: 80 },
  { id: '40',  name: 'Championship',          country: 'England',      tier: 2, priority: 80 },

  // TIER 3 — Major Cups & Other Notable Leagues
  { id: '13',  name: 'Copa Libertadores',     country: 'South America', tier: 3, priority: 75 },
  { id: '11',  name: 'Copa Sudamericana',     country: 'South America', tier: 3, priority: 75 },
  { id: '197', name: 'Super League',          country: 'Greece',        tier: 3, priority: 70 },
  { id: '179', name: 'Premiership',           country: 'Scotland',      tier: 3, priority: 70 },
  { id: '218', name: 'Bundesliga',            country: 'Austria',       tier: 3, priority: 70 },
  { id: '207', name: 'Super League',          country: 'Switzerland',   tier: 3, priority: 70 },
  { id: '119', name: 'Superliga',             country: 'Denmark',       tier: 3, priority: 70 },
  { id: '103', name: 'Eliteserien',           country: 'Norway',        tier: 3, priority: 70 },
  { id: '95',  name: 'Allsvenskan',           country: 'Sweden',        tier: 3, priority: 70 },
  { id: '106', name: 'Ekstraklasa',           country: 'Poland',        tier: 3, priority: 70 },
  { id: '345', name: 'First League',          country: 'Czech Republic', tier: 3, priority: 70 },
  { id: '210', name: 'HNL',                   country: 'Croatia',       tier: 3, priority: 70 },
  { id: '283', name: 'Liga I',                country: 'Romania',       tier: 3, priority: 70 },
  { id: '333', name: 'Premier League',        country: 'Ukraine',       tier: 3, priority: 70 },
  { id: '72',  name: 'Série B',               country: 'Brazil',        tier: 3, priority: 65 },
  { id: '239', name: 'Primera A',             country: 'Colombia',      tier: 3, priority: 65 },
];

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const byId = new Map();
const aliasMap = new Map();
const prioritySet = new Set();
const mustHaveSet = new Set();

for (const comp of PRIORITY_COMPETITIONS) {
  byId.set(String(comp.id), comp);
  prioritySet.add(String(comp.id));
  if (comp.mustHave) mustHaveSet.add(String(comp.id));

  comp.aliases = [
    String(comp.id),
    slugify(comp.name),
    slugify(`${comp.country} ${comp.name}`),
  ];

  for (const alias of comp.aliases) {
    // First wins — list is ordered by priority, so Italy's "serie_a" beats Brazil's
    if (!aliasMap.has(alias)) aliasMap.set(alias, comp);
  }
}

function getLeagues() {
  return PRIORITY_COMPETITIONS;
}

function findLeague(identifier) {
  if (!identifier) return null;
  return aliasMap.get(String(identifier).trim().toLowerCase()) || null;
}

/* ★ This was imported by the standings route but never existed → boot crash */
function getLeagueAliases(id) {
  const comp = byId.get(String(id));
  return comp ? comp.aliases : [String(id)];
}

function isPriorityCompetition(competitionId) {
  return prioritySet.has(String(competitionId));
}

function isMustHaveLeague(competitionId) {
  return mustHaveSet.has(String(competitionId));
}

function getLeaguePriority(competitionId) {
  return byId.get(String(competitionId))?.priority ?? 0;
}

const MUST_HAVE_LEAGUE_IDS = Array.from(mustHaveSet);

module.exports = {
  getLeagues,
  findLeague,
  getLeagueAliases,
  isPriorityCompetition,
  isMustHaveLeague,
  getLeaguePriority,
  MUST_HAVE_LEAGUE_IDS,
};