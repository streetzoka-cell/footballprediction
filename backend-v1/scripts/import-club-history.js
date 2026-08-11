// backend-v1/scripts/import-club-history.js
const fs = require('fs');
const path = require('path');

const INPUT_CSV = path.join(process.cwd(), 'matches.csv');
const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

// Map Division Codes to Folder Paths
const DIVISION_MAP = {
  'F1': 'france/ligue_1',
  'F2': 'france/ligue_2',
  'E0': 'england/premier_league',
  'E1': 'england/championship',
  'E2': 'england/league_one',
  'E3': 'england/league_two',
  'SP1': 'spain/la_liga',
  'SP2': 'spain/segunda_division',
  'I1': 'italy/serie_a',
  'I2': 'italy/serie_b',
  'D1': 'germany/bundesliga',
  'D2': 'germany/bundesliga_2',
  'N1': 'netherlands/eredivisie',
  'B1': 'belgium/pro_league',
  'P1': 'portugal/primeira_liga',
  'T1': 'turkey/super_lig',
  'G1': 'greece/super_league'
};

// Safe number parsers
const toNum = (val) => (val === '' || val === undefined) ? null : (isNaN(parseFloat(val)) ? null : parseFloat(val));
const toInt = (val) => (val === '' || val === undefined) ? null : (isNaN(parseInt(val, 10)) ? null : parseInt(val, 10));

console.log('[Import] Reading Club History CSV...');

if (!fs.existsSync(INPUT_CSV)) {
  console.error(`[Import] Error: Could not find ${INPUT_CSV}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(INPUT_CSV, 'utf-8');
const lines = csvContent.split(/\r?\n/).filter(l => l.trim() !== '');

if (lines.length === 0) {
  console.error('[Import] CSV is empty!');
  process.exit(1);
}

// Detect delimiter (usually comma for this format)
const firstLine = lines[0];
let delimiter = ',';
if (firstLine.includes('|')) delimiter = '|';
else if (firstLine.includes(';')) delimiter = ';';

const headers = firstLine.split(delimiter).map(h => h.trim());
const idx = (name) => headers.indexOf(name);

const c = {
  div: idx('Division'), date: idx('MatchDate'), time: idx('MatchTime'),
  home: idx('HomeTeam'), away: idx('AwayTeam'),
  homeElo: idx('HomeElo'), awayElo: idx('AwayElo'),
  f3h: idx('Form3Home'), f5h: idx('Form5Home'), f3a: idx('Form3Away'), f5a: idx('Form5Away'),
  ftHome: idx('FTHome'), ftAway: idx('FTAway'), ftRes: idx('FTResult'),
  htHome: idx('HTHome'), htAway: idx('HTAway'), htRes: idx('HTResult'),
  hShots: idx('HomeShots'), aShots: idx('AwayShots'), hTarget: idx('HomeTarget'), aTarget: idx('AwayTarget'),
  hFouls: idx('HomeFouls'), aFouls: idx('AwayFouls'), hCorners: idx('HomeCorners'), aCorners: idx('AwayCorners'),
  hYellow: idx('HomeYellow'), aYellow: idx('AwayYellow'), hRed: idx('HomeRed'), aRed: idx('AwayRed'),
  oddH: idx('OddHome'), oddD: idx('OddDraw'), oddA: idx('OddAway'),
  maxH: idx('MaxHome'), maxD: idx('MaxDraw'), maxA: idx('MaxAway'),
  o25: idx('Over25'), u25: idx('Under25'), maxO25: idx('MaxOver25'), maxU25: idx('MaxUnder25'),
  hSize: idx('HandiSize'), hHome: idx('HandiHome'), hAway: idx('HandiAway'),
  cLTH: idx('C_LTH'), cLTA: idx('C_LTA'), cVHD: idx('C_VHD'), cVAD: idx('C_VAD'), cHTB: idx('C_HTB'), cPHB: idx('C_PHB')
};

const matchesByLeagueSeason = {};

for (let i = 1; i < lines.length; i++) {
  const parts = lines[i].split(delimiter).map(p => p.trim());
  
  const division = parts[c.div];
  const matchDate = parts[c.date];
  const homeTeam = parts[c.home];
  const awayTeam = parts[c.away];
  
  if (!division || !matchDate || !homeTeam) continue;
  
  const leaguePath = DIVISION_MAP[division];
  if (!leaguePath) continue; // Skip leagues we haven't mapped yet
  
  // Calculate Season (e.g., 2000-07-28 -> "2000_2001")
  const dateObj = new Date(matchDate);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1; // 1-12
  const season = month >= 7 ? `${year}_${year+1}` : `${year-1}_${year}`;
  
  const key = `${leaguePath}/${season}`;
  if (!matchesByLeagueSeason[key]) matchesByLeagueSeason[key] = [];
  
  const match = {
    date: matchDate,
    time: parts[c.time] || null,
    home_team: homeTeam,
    away_team: awayTeam,
    elo: { home: toNum(parts[c.homeElo]), away: toNum(parts[c.awayElo]) },
    form: { home_3: toNum(parts[c.f3h]), home_5: toNum(parts[c.f5h]), away_3: toNum(parts[c.f3a]), away_5: toNum(parts[c.f5a]) },
    score: {
      ft: { home: toInt(parts[c.ftHome]), away: toInt(parts[c.ftAway]), result: parts[c.ftRes] },
      ht: { home: toInt(parts[c.htHome]), away: toInt(parts[c.htAway]), result: parts[c.htRes] }
    },
    stats: {
      shots: { home: toInt(parts[c.hShots]), away: toInt(parts[c.aShots]) },
      target: { home: toInt(parts[c.hTarget]), away: toInt(parts[c.aTarget]) },
      fouls: { home: toInt(parts[c.hFouls]), away: toInt(parts[c.aFouls]) },
      corners: { home: toInt(parts[c.hCorners]), away: toInt(parts[c.aCorners]) },
      yellow: { home: toInt(parts[c.hYellow]), away: toInt(parts[c.aYellow]) },
      red: { home: toInt(parts[c.hRed]), away: toInt(parts[c.aRed]) }
    },
    odds: {
      home: toNum(parts[c.oddH]), draw: toNum(parts[c.oddD]), away: toNum(parts[c.oddA]),
      max_home: toNum(parts[c.maxH]), max_draw: toNum(parts[c.maxD]), max_away: toNum(parts[c.maxA]),
      over_25: toNum(parts[c.o25]), under_25: toNum(parts[c.u25]),
      max_over_25: toNum(parts[c.maxO25]), max_under_25: toNum(parts[c.maxU25]),
      handicap_size: toNum(parts[c.hSize]), handicap_home: toNum(parts[c.hHome]), handicap_away: toNum(parts[c.hAway])
    },
    custom_metrics: {
      C_LTH: toNum(parts[c.cLTH]), C_LTA: toNum(parts[c.cLTA]), C_VHD: toNum(parts[c.cVHD]), 
      C_VAD: toNum(parts[c.cVAD]), C_HTB: toNum(parts[c.cHTB]), C_PHB: toNum(parts[c.cPHB])
    }
  };
  
  matchesByLeagueSeason[key].push(match);
}

let totalSaved = 0;
for (const [key, matches] of Object.entries(matchesByLeagueSeason)) {
  const outputDir = path.join(HISTORY_DIR, 'clubs', key);
  fs.mkdirSync(outputDir, { recursive: true });
  
  const payload = {
    id: key.replace(/\//g, '_'),
    name: key.replace(/\//g, ' ').replace(/_/g, ' '),
    aliases: [key.replace(/\//g, ' ')],
    category: 'history',
    intents: ['definition'],
    matches: matches
  };
  
  fs.writeFileSync(path.join(outputDir, 'matches.json'), JSON.stringify(payload, null, 2));
  console.log(`[Import] Saved ${matches.length} matches to clubs/${key}/matches.json`);
  totalSaved += matches.length;
}

console.log(`\n[Import] Done! Saved ${totalSaved} club matches.`);