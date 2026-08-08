const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');

// Cache live/fixture data for 30 seconds to avoid reading disk on every message
let matchDataCache = { data: null, timestamp: 0 };
const MATCH_CACHE_TTL = 30 * 1000;

class MatchDataEngine {
  
  normalizeTeamName(name) {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    // Basic cleanup to help with matching (can be expanded)
    return lower.replace(/\bfc\b|\bafc\b|\bcf\b|\bsc\b/g, '').trim();
  }

  loadTodaysMatches() {
    const now = Date.now();
    if (matchDataCache.data && (now - matchDataCache.timestamp < MATCH_CACHE_TTL)) {
      return matchDataCache.data;
    }

    const today = new Date().toISOString().split('T')[0];
    const fixturesPath = path.join(PUBLIC_DATA_DIR, 'fixtures', `${today}.json`);
    const livePath = path.join(PUBLIC_DATA_DIR, 'live.json`);
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

  // Extracts data using the same logic as the frontend normalizeMatch
  getMatchDetails(match) {
    const homeName = match.homeName || match.homeTeam?.name || 'Home';
    const awayName = match.awayName || match.awayTeam?.name || 'Away';
    
    const score = match.display?.score || match.score || {};
    const homeScore = score.home ?? match.homeScore ?? 0;
    const awayScore = score.away ?? match.awayScore ?? 0;

    const display = match.display || {};
    const minute = display.minute != null ? display.minute : (match.minute || 0);
    let status = display.status || match.status || 'Scheduled';
    
    if (display.isLive) status = 'Live';
    if (display.isFinished) status = 'FT';
    if (status === 'HT') status = 'HT';

    return { homeName, awayName, homeScore, awayScore, minute, status };
  }

  findMatchInMessage(message) {
    const msg = this.normalizeTeamName(message);
    const matches = this.loadTodaysMatches();
    
    // 0. ★ NEW: Explicit "vs" parser (Bypasses ambiguity for exact matchups)
    if (msg.includes(' vs ') || msg.includes(' v ') || msg.includes(' versus ')) {
      const parts = msg.split(/\s+vs\s+|\s+v\s+|\s+versus\s+/i);
      if (parts.length >= 2) {
        const team1 = parts[0].trim();
        const team2 = parts[1].trim();
        
        for (const match of matches) {
          const { homeName, awayName } = this.getMatchDetails(match);
          const home = this.normalizeTeamName(homeName);
          const away = this.normalizeTeamName(awayName);
          
          // Check if team1 matches home and team2 matches away (or vice versa)
          const match1 = (team1.includes(home) || home.includes(team1)) && (team2.includes(away) || away.includes(team2));
          const match2 = (team2.includes(home) || home.includes(team2)) && (team1.includes(away) || away.includes(team1));
          
          if (match1 || match2) {
            return { match, ambiguous: false }; // Exact matchup found, no ambiguity!
          }
        }
      }
    }

    // 1. Try exact two-team match (fallback if no 'vs' used)
    for (const match of matches) {
      const { homeName, awayName } = this.getMatchDetails(match);
      const home = this.normalizeTeamName(homeName);
      const away = this.normalizeTeamName(awayName);
      
      if (home && away && msg.includes(home) && msg.includes(away)) {
        return { match, ambiguous: false };
      }
    }

    // 2. Try single-team match (with ambiguity protection)
    let candidates = [];
    for (const match of matches) {
      const { homeName, awayName } = this.getMatchDetails(match);
      const home = this.normalizeTeamName(homeName);
      const away = this.normalizeTeamName(awayName);
      
      if ((home && msg.includes(home)) || (away && msg.includes(away))) {
        candidates.push(match);
      }
    }

    if (candidates.length === 1) {
      return { match: candidates[0], ambiguous: false };
    } else if (candidates.length > 1) {
      // Multiple matches found for one team, ask user to clarify
      return { match: null, ambiguous: true, candidates };
    }
    
    return { match: null, ambiguous: false };
  }

  formatMatchData(match) {
    const { homeName, awayName, homeScore, awayScore, minute, status } = this.getMatchDetails(match);
    
    let stats = '';
    const rawStats = match.statistics || match.stats;
    if (Array.isArray(rawStats) && rawStats.length > 0) {
      const poss = rawStats.find(s => s.type?.toLowerCase().includes('possession'));
      if (poss && poss.home != null && poss.away != null) {
        stats += `\nPossession: ${poss.home}% - ${poss.away}%`;
      }
    }

    let minuteStr = '';
    if (status === 'Live' || status === '1H' || status === '2H') {
      minuteStr = minute > 0 ? `${minute}' ` : '';
    } else if (status === 'HT') {
      minuteStr = 'HT ';
    } else if (status === 'FT' || status === 'AET' || status === 'PEN') {
      minuteStr = 'FT ';
    }

    return `[LIVE MATCH DATA]\n${homeName} ${homeScore} - ${awayScore} ${awayName}\nStatus: ${minuteStr}${status}${stats}`;
  }

  async resolveQuery(message) {
    const result = this.findMatchInMessage(message);
    
    // Ambiguity Protection
    if (result.ambiguous) {
      const teamNames = result.candidates.map(m => {
        const { homeName, awayName } = this.getMatchDetails(m);
        return `${homeName} vs ${awayName}`;
      }).join(' or ');
      return {
        status: "ANSWERED_LOCALLY",
        evidence: `I found multiple matches for that team today (${teamNames}). Which specific match are you asking about?`,
        confidence: 1.0
      };
    }

    const match = result.match;
    if (match) {
      const formattedData = this.formatMatchData(match);
      const msg = this.normalizeTeamName(message);
      
      // Check if the user is just asking for the score/status
      if (msg.includes('score') || msg.includes('status') || msg.includes('how is') || msg.includes('happening') || msg.includes('doing') || msg.includes('what s going')) {
        return { status: "ANSWERED_LOCALLY", evidence: formattedData, confidence: 1.0 };
      }
      
      // If they asked for analysis/prediction/tactics, pass the data to Gemini
      return { status: "DYNAMIC_DATA_FOUND", evidence: formattedData, confidence: 1.0, match };
    }
    
    return { status: "NO_DATA_FOUND" };
  }
}

module.exports = new MatchDataEngine();