class PredictionEngine {
  
  async resolveQuery(message, matchData) {
    if (!matchData) return { status: "NO_PREDICTION" };
    
    const msg = message.toLowerCase();
    if (!msg.includes('predict') && !msg.includes('prediction') && !msg.includes('what should i play') && !msg.includes('what should i bet') && !msg.includes('who will win')) {
      return { status: "NO_PREDICTION" };
    }

    const homeName = matchData.homeTeam?.name || 'Home';
    const awayName = matchData.awayTeam?.name || 'Away';
    const homeScore = matchData.homeScore ?? 0;
    const awayScore = matchData.awayScore ?? 0;
    const minute = matchData.display?.minute || 0;
    const isLive = matchData.display?.isLive;

    let predictionLogic = "";

    // 1. Live Match Prediction Logic
    if (isLive && minute > 60) {
      if (homeScore !== awayScore) {
        // A team is winning in the late game
        predictionLogic = `Since ${homeName} is leading ${homeScore}-${awayScore} in the ${minute}' minute, the losing team will have to take risks and leave space. A safe prediction is ${homeScore}-${awayScore} (Correct Result) or ${homeScore + 1}-${awayScore} if the winning team counters.`;
      } else {
        // It's a draw in the late game
        predictionLogic = `It's ${homeScore}-${awayScore} in the ${minute}' minute. Both teams look evenly matched. A safe Exact Score prediction is ${homeScore}-${awayScore}, or a 1-1/2-2 draw. Look for late winners if a sub is brought on.`;
      }
    } 
    // 2. Pre-Match Prediction Logic (0-0, Scheduled)
    else {
      // Here we would normally pull Form/H2H, but we use a tactical default for now
      predictionLogic = `For the upcoming ${homeName} vs ${awayName} match, look at the tactical styles. If one plays a High Press and the other plays a Low Block, expect few goals. A safe Exact Score prediction is 1-0 or 1-1. If both teams play 4-3-3 and press high, expect goals: 2-2 or 3-2.`;
    }

    const evidence = `[PREDICTION ANALYSIS]\n${predictionLogic}\n\nRemember, matches lock 60 minutes before kickoff on ZOKASCORE!`;

    return {
      status: "ANSWERED_LOCALLY",
      evidence: evidence,
      confidence: 1.0
    };
  }
}

module.exports = new PredictionEngine();