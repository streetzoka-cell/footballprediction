// backend-v1/services/HistoricalArchive.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const HISTORY_DIR = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'history');

function getCompSlug(match) {
  const leagueName = match.leagueName || match.league?.name || 'unknown_competition';
  return String(leagueName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

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
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    let payload = { competition: match.leagueName || match.league?.name, season, total_matches: 0, matches: [] };
    if (fs.existsSync(filePath)) {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    
    const matchId = String(match.id || '');
    const exists = payload.matches.some(m => m.match_id === matchId);
    if (exists) return; // Already archived
    
    const ftHome = match.homeScore ?? 0;
    const ftAway = match.awayScore ?? 0;
    
    const historicalMatch = {
      match_id: matchId,
      date: matchDate,
      competition: match.leagueName || match.league?.name || 'Unknown',
      season: season,
      home_team: match.homeTeam?.name || match.homeName,
      away_team: match.awayTeam?.name || match.awayName,
      home_score: ftHome,
      away_score: ftAway,
      home_team_id: String(match.homeTeamId || match.homeTeam?.id || ''),
      away_team_id: String(match.awayTeamId || match.awayTeam?.id || ''),
      // Deep stats will be filled later by Python if missing
      home_elo_pre: match.home_elo_pre || null,
      away_elo_pre: match.away_elo_pre || null,
      prediction: match.prediction || null
    };
    
    payload.matches.push(historicalMatch);
    payload.total_matches = payload.matches.length;
    payload.matches.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    logger.info(`[HistoricalArchive] Archived ${historicalMatch.home_team} vs ${historicalMatch.away_team}`);
  } catch (err) {
    logger.error(`[HistoricalArchive] Failed: ${err.message}`);
  }
}

module.exports = { archiveMatch };