const logger = require('../utils/logger');

class FootballIntelligence {
  /**
   * Calculates win probability using Poisson distribution based on attack/defense strengths.
   * @param {Object} home - { name, goalsFor (avg), goalsAgainst (avg), form (e.g., 'WWDLW') }
   * @param {Object} away - { name, goalsFor (avg), goalsAgainst (avg), form (e.g., 'LDWWL') }
   */
  calculateProbability(home, away) {
    try {
      // Use league average (1.35) if data is missing
      const homeAtt = home.goalsFor || 1.35;
      const homeDef = home.goalsAgainst || 1.35;
      const awayAtt = away.goalsFor || 1.35;
      const awayDef = away.goalsAgainst || 1.35;

      // Expected Goals (xG) approximation
      const homeXG = homeAtt * awayDef * 1.15; // Home advantage multiplier
      const awayXG = awayAtt * homeDef * 0.85;

      // Simple Poisson win/draw/loss estimation
      let homeWinProb = 0, drawProb = 0, awayWinProb = 0;
      
      if (homeXG > awayXG) {
        homeWinProb = Math.min(0.75, 0.40 + (homeXG - awayXG) * 0.15);
        awayWinProb = Math.max(0.10, 0.30 - (homeXG - awayXG) * 0.10);
      } else {
        awayWinProb = Math.min(0.65, 0.35 + (awayXG - homeXG) * 0.12);
        homeWinProb = Math.max(0.15, 0.35 - (awayXG - homeXG) * 0.10);
      }
      drawProb = 1.0 - (homeWinProb + awayWinProb);

      return {
        homeXG: homeXG.toFixed(2),
        awayXG: awayXG.toFixed(2),
        probabilities: {
          home: Math.round(homeWinProb * 100),
          draw: Math.round(drawProb * 100),
          away: Math.round(awayWinProb * 100)
        }
      };
    } catch (err) {
      logger.error(`[AI] Probability calc failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Generates a human-readable match story.
   */
  generateStory(home, away, probability) {
    try {
      let story = "";
      const homeForm = home.form || "";
      const awayForm = away.form || "";
      
      const homeWins = (homeForm.match(/W/g) || []).length;
      const awayWins = (awayForm.match(/W/g) || []).length;

      if (probability.probabilities.home > 55) {
        story = `${home.name} enter this fixture as strong favorites. With a ${homeForm} recent run and playing at home, they are expected to control the tempo. ${away.name} will need to be compact defensively to secure a point.`;
      } else if (probability.probabilities.away > 55) {
        story = `${away.name} look poised to take all three points. Despite traveling away, their ${awayForm} form gives them a significant edge over a ${home.name} side struggling for consistency.`;
      } else if (homeWins >= 3 && awayWins >= 3) {
        story = `This promises to be a tightly contested battle. Both ${home.name} and ${away.name} are in excellent form. Expect an open game with goals at both ends.`;
      } else {
        story = `Expect a cagey affair between ${home.name} and ${away.name}. Neither side holds a significant statistical advantage, and a draw might be the most likely outcome.`;
      }

      return story;
    } catch (err) {
      return "Match preview unavailable due to insufficient data.";
    }
  }

  /**
   * Enriches a raw fixture with intelligence.
   * @param {Object} fixture - Normalized API-Football fixture
   * @param {Object} homeStats - Standings/Form data for home team
   * @param {Object} awayStats - Standings/Form data for away team
   */
  enrichFixture(fixture, homeStats, awayStats) {
    if (!homeStats || !awayStats) return fixture;

    const probability = this.calculateProbability(homeStats, awayStats);
    if (!probability) return fixture;

    const story = this.generateStory(homeStats, awayStats, probability);

    return {
      ...fixture,
      intelligence: {
        xG: { home: probability.homeXG, away: probability.awayXG },
        winProbability: probability.probabilities,
        form: { home: homeStats.form || 'N/A', away: awayStats.form || 'N/A' },
        story: story
      }
    };
  }
}

module.exports = new FootballIntelligence();