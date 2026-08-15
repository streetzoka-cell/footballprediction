'use strict';

const intelligence = require('./FootballIntelligenceService');

/**
 * ZOKASCORE V2 - Feature Engine
 * Transforms raw historical queries into deterministic pre-match features.
 */
class FeatureEngine {
  
  _calculateAverages(teamId, matches) {
    if (matches.length === 0) return { avgGoalsFor: 0, avgGoalsAgainst: 0, cleanSheetPct: 0, scoringPct: 0 };
    
    let goalsFor = 0, goalsAgainst = 0, cleanSheets = 0, scored = 0;
    
    matches.forEach(m => {
      const isHome = m.home_club_id === String(teamId);
      const myScore = Number(isHome ? m.home_score : m.away_score);
      const oppScore = Number(isHome ? m.away_score : m.home_score);
      
      goalsFor += myScore;
      goalsAgainst += oppScore;
      if (oppScore === 0) cleanSheets++;
      if (myScore > 0) scored++;
    });

    return {
      avgGoalsFor: goalsFor / matches.length,
      avgGoalsAgainst: goalsAgainst / matches.length,
      cleanSheetPct: (cleanSheets / matches.length) * 100,
      scoringPct: (scored / matches.length) * 100
    };
  }

  _calculateH2H(teamA, teamB, matches) {
    if (matches.length === 0) return { teamAWins: 0, draws: 0, teamBWins: 0, avgGoals: 0 };
    
    let teamAWins = 0, draws = 0, teamBWins = 0, totalGoals = 0;
    
    matches.forEach(m => {
      const homeScore = Number(m.home_score);
      const awayScore = Number(m.away_score);
      totalGoals += (homeScore + awayScore);
      
      if (homeScore === awayScore) draws++;
      else if (m.home_club_id === String(teamA) && homeScore > awayScore) teamAWins++;
      else if (m.away_club_id === String(teamA) && awayScore > homeScore) teamAWins++;
      else teamBWins++;
    });

    return {
      teamAWins,
      draws,
      teamBWins,
      avgGoals: totalGoals / matches.length
    };
  }

  /**
   * Generate the full pre-match feature set for a fixture
   */
  generateFeatures(homeTeamId, awayTeamId, matchDate) {
    // 1. Fetch raw data strictly BEFORE matchDate
    const homeLast5 = intelligence.getLastMatchesBefore(homeTeamId, matchDate, 5);
    const homeLast10 = intelligence.getLastMatchesBefore(homeTeamId, matchDate, 10);
    const homeHome5 = intelligence.getLastHomeMatchesBefore(homeTeamId, matchDate, 5);
    
    const awayLast5 = intelligence.getLastMatchesBefore(awayTeamId, matchDate, 5);
    const awayLast10 = intelligence.getLastMatchesBefore(awayTeamId, matchDate, 10);
    const awayAway5 = intelligence.getLastAwayMatchesBefore(awayTeamId, matchDate, 5);
    
    const h2h = intelligence.getH2HBefore(homeTeamId, awayTeamId, matchDate, 10);

    // 2. Calculate Form & Stats
    const homeForm5 = intelligence.getTeamFormBefore(homeTeamId, matchDate, 5);
    const awayForm5 = intelligence.getTeamFormBefore(awayTeamId, matchDate, 5);
    
    const homeAvgs = this._calculateAverages(homeTeamId, homeLast10);
    const homeHomeAvgs = this._calculateAverages(homeTeamId, homeHome5);
    const awayAvgs = this._calculateAverages(awayTeamId, awayLast10);
    const awayAwayAvgs = this._calculateAverages(awayTeamId, awayAway5);
    
    const h2hStats = this._calculateH2H(homeTeamId, awayTeamId, h2h);

    // 3. Construct Feature Payload
    return {
      matchDate: matchDate,
      home: {
        teamId: homeTeamId,
        form5: homeForm5,
        overallAvgs: homeAvgs,
        homeAvgs: homeHomeAvgs
      },
      away: {
        teamId: awayTeamId,
        form5: awayForm5,
        overallAvgs: awayAvgs,
        awayAvgs: awayAwayAvgs
      },
      h2h: {
        matches: h2h.length,
        ...h2hStats
      }
    };
  }
}

module.exports = new FeatureEngine();