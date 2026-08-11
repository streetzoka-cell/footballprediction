const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history', 'clubs');

// Map your API-Football League IDs to our folder structure
const LEAGUE_MAP = {
  39: 'england/premier_league',
  40: 'england/championship',
  41: 'england/league_one',
  42: 'england/league_two',
  140: 'spain/la_liga',
  141: 'spain/segunda_division',
  78: 'germany/bundesliga',
  79: 'germany/bundesliga_2',
  135: 'italy/serie_a',
  136: 'italy/serie_b',
  61: 'france/ligue_1',
  62: 'france/ligue_2',
  2: 'europe/uefa_champions_league',
  3: 'europe/uefa_europa_league',
  848: 'europe/uefa_conference_league'
};

function getSeason(dateStr) {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-12
  return month >= 7 ? `${year}_${year+1}` : `${year-1}_${year}`;
}

async function archiveMatch(match) {
  try {
    const leagueId = match.league?.id;
    const leaguePath = LEAGUE_MAP[leagueId];
    
    // Skip leagues we don't track in our historical database
    if (!leaguePath) return;
    
    const matchDate = match.date?.split('T')[0];
    if (!matchDate) return;

    const season = getSeason(matchDate);
    const dirPath = path.join(HISTORY_DIR, leaguePath, season);
    const filePath = path.join(dirPath, 'matches.json');
    
    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Read existing matches
    let payload = { matches: [] };
    if (fs.existsSync(filePath)) {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    // Dedup check
    const exists = payload.matches.some(m => 
      m.date === matchDate && 
      m.home_team === (match.homeTeam?.name || match.homeName) && 
      m.away_team === (match.awayTeam?.name || match.awayName)
    );
    if (exists) return;
    
    // Format to our historical schema
    const ftHome = match.homeScore ?? match.homeTeam?.score;
    const ftAway = match.awayScore ?? match.awayTeam?.score;
    
    const historicalMatch = {
      date: matchDate,
      time: match.date?.split('T')[1]?.split('+')[0] || null,
      home_team: match.homeTeam?.name || match.homeName,
      away_team: match.awayTeam?.name || match.awayName,
      score: {
        ft: { 
          home: ftHome, 
          away: ftAway, 
          result: ftHome > ftAway ? 'H' : ftHome < ftAway ? 'A' : 'D' 
        }
      },
      stadium: match.fixture?.venue?.name || null,
      // Note: Pre-match features (Elo, Form) will be missing here. 
      // They will be populated next time you run the generate-match-features.js script.
    };
    
    payload.matches.push(historicalMatch);
    
    // Sort matches by date
    payload.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    logger.info(`[HistoricalArchive] Archived ${historicalMatch.home_team} vs ${historicalMatch.away_team} to ${leaguePath}/${season}`);
  } catch (err) {
    logger.error(`[HistoricalArchive] Failed to archive match: ${err.message}`);
  }
}

module.exports = { archiveMatch };