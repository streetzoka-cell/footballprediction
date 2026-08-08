const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');

// ★ NEW: Team Alias Dictionary for robust matching
const TEAM_ALIASES = {
  "man city": "manchester city",
  "man united": "manchester united",
  "man utd": "manchester united",
  "spurs": "tottenham hotspur",
  "tottenham": "tottenham hotspur",
  "arsenal": "arsenal",
  "chelsea": "chelsea",
  "liverpool": "liverpool",
  "barca": "barcelona",
  "real madrid": "real madrid",
  "atletico": "atletico madrid",
  "bayern": "bayern munich",
  "dortmund": "borussia dortmund",
  "psg": "paris saint germain",
  "juve": "juventus",
  "inter": "inter milan",
  "milan": "ac milan"
};

let matchDataCache = { data: null, timestamp: 0 };
const MATCH_CACHE_TTL = 30 * 1000;

class MatchDataEngine {
  
  // Normalize team names using the alias dictionary
  normalizeTeamName(name) {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    return TEAM_ALIASES[lower] || lower;
  }

  loadTodaysMatches() {
    const now = Date.now();
    if (matchDataCache.data && (now - matchDataCache.timestamp < MATCH_CACHE_TTL)) {
      return matchDataCache.data;
    }

    const today = new Date().toISOString().split('T')[0];
    const fixturesPath = path.join(PUBLIC_DATA_DIR, 'fixtures', `${today}.json`);
    const livePath = path.join(PUBLIC_DATA_DIR, 'live.json');
    const resultsPath = path.join(PUBLIC_DATA_DIR, 'results', `${today}.json`);

    let matches = [];

    try {
      if (fs.existsSync(livePath)) {
        const liveData = JSON.parse(fs.readFileSync(livePath, 'utf8'));
        matches.push(...(liveData.matches || liveData.data || []));
      }
      if (fs.existsSync(fixturesPath)) {
        const fixData = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
        matches.push(...(fixData.matches || fixData.data || []));
      }
      if (fs.existsSync(resultsPath)) {
        const resData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        matches.push(...(resData.matches || resData.data || []));
      }

      matchDataCache = { data: matches, timestamp: now };
      return matches;
    } catch (e) {
      logger.warn('[MatchDataEngine] Failed to load matches:', e.message);
      return [];
    }
  }

  findMatchInMessage(message) {
    // Normalize message using aliases (e.g., "Man City" -> "manchester city")
    let normalizedMsg = message.toLowerCase();
    for (const [alias, fullName] of Object.entries(TEAM_ALIASES)) {
      normalizedMsg = normalizedMsg.replace(new RegExp(`\\b${alias}\\b`, 'g'), fullName);
    }

    const matches = this.loadTodaysMatches();
    
    // 1. Try exact two-team match
    for (const match of matches) {
      const home = this.normalizeTeamName(match.homeTeam?.name);
      const away = this.normalizeTeamName(match.awayTeam?.name);
      
      if (home && away && normalizedMsg.includes(home) && normalizedMsg.includes(away)) {
        return { match, ambiguous: false };
      }
    }

    // 2. Try single-team match (with ambiguity protection)
    let candidates = [];
    for (const match of matches) {
      const home = this.normalizeTeamName(match.homeTeam?.name);
      const away = this.normalizeTeamName(match.awayTeam?.name);
      
      if ((home && normalizedMsg.includes(home)) || (away && normalizedMsg.includes(away))) {
        candidates.push(match);
      }
    }

    if (candidates.length === 1) {
      return { match: candidates[0], ambiguous: false };
    } else if (candidates.length > 1) {
      return { match: null, ambiguous: true, candidates };
    }
    
    return { match: null, ambiguous: false };
  }

  formatMatchData(match) {
    const homeName = match.homeTeam?.name || 'Home';
    const awayName = match.awayTeam?.name || 'Away';
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    
    const minute = match.display?.minute != null ? `${match.display.minute}'` : '';
    const status = match.display?.status || match.status?.description || 'Scheduled';
    
    let stats = '';
    if (Array.isArray(match.stats) && match.stats.length > 0) {
      const poss = match.stats.find(s => s.type === 'possession' || s.type === 'Ball Possession');
      if (poss && poss.home != null && poss.away != null) {
        stats += `\nPossession: ${poss.home}% - ${poss.away}%`;
      }
      const shots = match.stats.find(s => s.type === 'shots_total' || s.type === 'Total Shots');
      if (shots && shots.home != null && shots.away != null) {
        stats += `\nTotal Shots: ${shots.home} - ${shots.away}`;
      }
    }

    return `[LIVE MATCH DATA]\n${homeName} ${homeScore} - ${awayScore} ${awayName}\nStatus: ${minute ? minute + ' ' : ''}${status}${stats}`;
  }

  async resolveQuery(message) {
    const result = this.findMatchInMessage(message);
    
    if (result.ambiguous) {
      const teamNames = result.candidates.map(m => `${m.homeTeam?.name} vs ${m.awayTeam?.name}`).join(' or ');
      return {
        status: "ANSWERED_LOCALLY",
        evidence: `I found multiple matches for that team today (${teamNames}). Which specific match are you asking about?`,
        confidence: 1.0
      };
    }

    const match = result.match;
    if (match) {
      const formattedData = this.formatMatchData(match);
      const msg = message.toLowerCase();
      
      // If user asks for score/status, answer locally
      if (msg.includes('score') || msg.includes('status') || msg.includes('how is') || msg.includes('what is happening') || msg.includes('doing')) {
        return { status: "ANSWERED_LOCALLY", evidence: formattedData, confidence: 1.0 };
      }
      
      // If they asked for analysis/prediction/tactics, pass the data to Gemini
      return { status: "DYNAMIC_DATA_FOUND", evidence: formattedData, confidence: 1.0, match };
    }
    
    return { status: "NO_DATA_FOUND" };
  }
}

module.exports = new MatchDataEngine();