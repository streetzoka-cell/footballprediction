// backend-v1/src/config/leagues.js

const LEAGUES = [
  {
    id: '39',
    aliases: ['39', 'PL', 'premierleague', 'premier league', 'england premier league'],
    name: 'Premier League',
    country: 'England',
    logo: null,
    season: 2026,
    priority: 100,
  },
  {
    id: '140',
    aliases: ['140', 'PD', 'laliga', 'la liga', 'spain la liga'],
    name: 'La Liga',
    country: 'Spain',
    logo: null,
    season: 2026,
    priority: 95,
  },
  {
    id: '135',
    aliases: ['135', 'SA', 'seriea', 'serie a', 'italy serie a'],
    name: 'Serie A',
    country: 'Italy',
    logo: null,
    season: 2026,
    priority: 90,
  },
  {
    id: '78',
    aliases: ['78', 'BL1', 'bundesliga', 'germany bundesliga'],
    name: 'Bundesliga',
    country: 'Germany',
    logo: null,
    season: 2026,
    priority: 85,
  },
  {
    id: '61',
    aliases: ['61', 'FL1', 'ligue1', 'ligue 1', 'france ligue 1'],
    name: 'Ligue 1',
    country: 'France',
    logo: null,
    season: 2026,
    priority: 80,
  },
  {
    id: '2',
    aliases: ['2', 'CL', 'ucl', 'champions league', 'uefa champions league'],
    name: 'UEFA Champions League',
    country: 'World',
    logo: null,
    season: 2026,
    priority: 100,
  },
  {
    id: '3',
    aliases: ['3', 'EL', 'uel', 'europa league', 'uefa europa league'],
    name: 'UEFA Europa League',
    country: 'World',
    logo: null,
    season: 2026,
    priority: 75,
  },
  {
    id: '88',
    aliases: ['88', 'DED', 'eredivisie', 'netherlands eredivisie'],
    name: 'Eredivisie',
    country: 'Netherlands',
    logo: null,
    season: 2026,
    priority: 60,
  },
  {
    id: '94',
    aliases: ['94', 'PPL', 'primeira liga', 'portugal primeira liga'],
    name: 'Primeira Liga',
    country: 'Portugal',
    logo: null,
    season: 2026,
    priority: 58,
  },
  {
    id: '71',
    aliases: ['71', 'BSA', 'serie a brazil', 'brazil serie a', 'brasileirao'],
    name: 'Serie A (Brazil)',
    country: 'Brazil',
    logo: null,
    season: 2026,
    priority: 65,
  },
  {
    id: '40',
    aliases: ['40', 'ELC', 'championship', 'england championship'],
    name: 'Championship',
    country: 'England',
    logo: null,
    season: 2026,
    priority: 55,
  },
];

const aliasMap = new Map();

for (const league of LEAGUES) {
  aliasMap.set(String(league.id).toLowerCase(), league);

  for (const alias of league.aliases || []) {
    aliasMap.set(String(alias).toLowerCase(), league);
  }
}

function getLeagues() {
  return LEAGUES;
}

function findLeague(identifier) {
  if (identifier === null || identifier === undefined || identifier === '') {
    return null;
  }

  const key = String(identifier).trim().toLowerCase();

  if (aliasMap.has(key)) {
    return aliasMap.get(key);
  }

  const byName = LEAGUES.find((league) =>
    league.name.toLowerCase().includes(key)
  );

  return byName || null;
}

function getLeagueAliases(identifier) {
  const league = findLeague(identifier);

  if (!league) {
    return [String(identifier)];
  }

  return [String(league.id), ...(league.aliases || [])];
}

module.exports = {
  LEAGUES,
  getLeagues,
  findLeague,
  getLeagueAliases,
};