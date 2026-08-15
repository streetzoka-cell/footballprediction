'use strict';

const fs = require('fs');
const path = require('path');

/**
 * ZOKASCORE V2 - Football Intelligence Service
 * The single, READ-ONLY gateway to the historical match indexes.
 */
class FootballIntelligenceService {
  constructor() {
    this.teamIndex = null;
    this.h2hIndex = null;
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    const teamIdxPath = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'indexes', 'team_match_index.json');
    const h2hIdxPath = path.join(process.cwd(), 'public_data', 'knowledge', 'football', 'indexes', 'h2h_match_index.json');
    
    console.log('[IntelligenceService] Loading historical indexes into memory...');
    this.teamIndex = JSON.parse(fs.readFileSync(teamIdxPath, 'utf8'));
    this.h2hIndex = JSON.parse(fs.readFileSync(h2hIdxPath, 'utf8'));
    this.loaded = true;
    console.log('[IntelligenceService] Indexes loaded successfully.');
  }

  _getMatches(teamId) {
    this.load();
    return this.teamIndex[String(teamId)] || [];
  }

  // Defensive score parser
  _parseScore(score) {
    const num = Number(score);
    return isNaN(num) ? 0 : num;
  }

  _calculateForm(teamId, matches) {
    let wins = 0, draws = 0, losses = 0;
    let goalsFor = 0, goalsAgainst = 0;
    let cleanSheets = 0;

    matches.forEach(m => {
      const isHome = m.home_club_id === String(teamId);
      const myScore = this._parseScore(isHome ? m.home_score : m.away_score);
      const oppScore = this._parseScore(isHome ? m.away_score : m.home_score);

      goalsFor += myScore;
      goalsAgainst += oppScore;
      if (oppScore === 0) cleanSheets++;

      if (myScore > oppScore) wins++;
      else if (myScore === oppScore) draws++;
      else losses++;
    });

    return {
      matches: matches.length,
      wins, draws, losses,
      goalsFor, goalsAgainst,
      cleanSheets,
      formString: matches.map(m => {
        const isHome = m.home_club_id === String(teamId);
        const myScore = this._parseScore(isHome ? m.home_score : m.away_score);
        const oppScore = this._parseScore(isHome ? m.away_score : m.home_score);
        if (myScore > oppScore) return 'W';
        if (myScore === oppScore) return 'D';
        return 'L';
      }).reverse().join('') // Most recent first
    };
  }

  // --- STANDARD QUERIES (All History) ---

  getLastMatches(teamId, limit = 5) {
    return this._getMatches(teamId).slice(-limit);
  }

  getLastHomeMatches(teamId, limit = 5) {
    return this._getMatches(teamId).filter(m => m.home_club_id === String(teamId)).slice(-limit);
  }

  getLastAwayMatches(teamId, limit = 5) {
    return this._getMatches(teamId).filter(m => m.away_club_id === String(teamId)).slice(-limit);
  }

  getH2H(teamA, teamB, limit = 10) {
    this.load();
    const ids = [String(teamA), String(teamB)].sort();
    const key = `${ids[0]}|${ids[1]}`;
    return (this.h2hIndex[key] || []).slice(-limit);
  }

  getTeamForm(teamId, limit = 5) {
    return this._calculateForm(teamId, this.getLastMatches(teamId, limit));
  }

  // --- DATE-AWARE QUERIES (For Prediction/Backtesting) ---

  getLastMatchesBefore(teamId, beforeDate, limit = 5) {
    return this._getMatches(teamId).filter(m => m.date < beforeDate).slice(-limit);
  }

  getLastHomeMatchesBefore(teamId, beforeDate, limit = 5) {
    return this._getMatches(teamId)
      .filter(m => m.home_club_id === String(teamId) && m.date < beforeDate)
      .slice(-limit);
  }

  getLastAwayMatchesBefore(teamId, beforeDate, limit = 5) {
    return this._getMatches(teamId)
      .filter(m => m.away_club_id === String(teamId) && m.date < beforeDate)
      .slice(-limit);
  }

  getH2HBefore(teamA, teamB, beforeDate, limit = 10) {
    this.load();
    const ids = [String(teamA), String(teamB)].sort();
    const key = `${ids[0]}|${ids[1]}`;
    return (this.h2hIndex[key] || []).filter(m => m.date < beforeDate).slice(-limit);
  }

  getTeamFormBefore(teamId, beforeDate, limit = 5) {
    return this._calculateForm(teamId, this.getLastMatchesBefore(teamId, beforeDate, limit));
  }
}

// Export as singleton
module.exports = new FootballIntelligenceService();