const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

// V2 uses slugs like "e0", "sp1", etc., or the competition name slugified.
// Since live matches use API-Football IDs, we'll create a fallback slug from the league name.
function getCompSlug(match) {
  const leagueName = match.leagueName || match.league?.name || 'unknown_competition';
  return String(leagueName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// V2 derives the season from the year (e.g., "2024")
function getSeason(dateStr) {
  if (!dateStr) return new Date().getFullYear().toString();
  return String(dateStr).split('-')[0];
}

async function archiveMatch(match) {
  try {
    const matchDate = match.date?.split('T')[0];
    if (!matchDate) return;

    const compSlug = getCompSlug(match);
    const season = getSeason(matchDate);
    
    const dirPath = path.join(HISTORY_DIR, compSlug);
    const filePath = path.join(dirPath, `${season}.json`);
    
    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Read existing matches
    let payload = { competition: match.leagueName || match.league?.name, season, total_matches: 0, matches: [] };
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
    
    const ftHome = match.homeScore ?? match.homeTeam?.score ?? 0;
    const ftAway = match.awayScore ?? match.awayTeam?.score ?? 0;
    
    // Format to our V2 historical schema (with ELO and ML Predictions if available)
    const historicalMatch = {
      match_id: String(match.id || ''),
      date: matchDate,
      competition: match.leagueName || match.league?.name || 'Unknown',
      season: season,
      home_team: match.homeTeam?.name || match.homeName,
      away_team: match.awayTeam?.name || match.awayName,
      home_score: ftHome,
      away_score: ftAway,
      home_team_id: match.homeTeamId || match.homeTeam?.id || null,
      away_team_id: match.awayTeamId || match.awayTeam?.id || null,
      // Preserve ELO and ML Predictions if they were injected by Python Step 50
      home_elo_pre: match.home_elo_pre || null,
      away_elo_pre: match.away_elo_pre || null,
      home_elo_post: match.home_elo_post || null,
      away_elo_post: match.away_elo_post || null,
      home_elo_delta: match.home_elo_delta || null,
      away_elo_delta: match.away_elo_delta || null,
      prediction: match.prediction || null
    };
    
    payload.matches.push(historicalMatch);
    payload.total_matches = payload.matches.length;
    
    // Sort matches by date
    payload.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    logger.info(`[HistoricalArchive] Archived ${historicalMatch.home_team} vs ${historicalMatch.away_team} to ${compSlug}/${season}.json`);
  } catch (err) {
    logger.error(`[HistoricalArchive] Failed to archive match: ${err.message}`);
  }
}

module.exports = { archiveMatch };