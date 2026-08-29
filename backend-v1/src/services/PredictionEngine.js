// backend-v1/src/services/PredictionEngine.js
class PredictionEngine {

  async resolveQuery(message, matchData) {
    if (!matchData) return { status: 'NO_PREDICTION' };

    const msg = String(message || '').toLowerCase();
    const triggers = ['predict', 'prediction', 'what should i play', 'what should i bet', 'who will win'];
    if (!triggers.some((t) => msg.includes(t))) {
      return { status: 'NO_PREDICTION' };
    }

    const homeName = matchData.homeTeam?.name || 'Home';
    const awayName = matchData.awayTeam?.name || 'Away';
    const homeScore = Number(matchData.homeScore ?? 0);
    const awayScore = Number(matchData.awayScore ?? 0);
    const minute = Number(matchData.display?.minute) || 0;
    const isLive = Boolean(matchData.display?.isLive);

    // ============================================================
    // READ V2 ML PREDICTIONS (Injected by Python Step 50)
    // ============================================================
    const mlPred = matchData.prediction;
    let predictionLogic = '';

    if (mlPred && mlPred['1x2'] && mlPred['over_under_2_5']) {
      const p1x2 = mlPred['1x2'].probabilities;
      const pOu = mlPred['over_under_2_5'].probabilities;
      const pBtts = mlPred.btts ? mlPred.btts.probabilities : null;

      const homeWinProb = p1x2.HOME_WIN || 0;
      const drawProb = p1x2.DRAW || 0;
      const awayWinProb = p1x2.AWAY_WIN || 0;

      // ★ FIX: OVER/UNDER live inside over_under_2_5, NOT 1x2.
      const overProb = pOu.OVER || 0;
      const underProb = pOu.UNDER || 0;

      // 1. Live Match Prediction Logic (Late Game)
      if (isLive && minute > 60) {
        if (homeScore !== awayScore) {
          predictionLogic = `Since ${homeName} is leading ${homeScore}-${awayScore} in the ${minute}' minute, the losing team must take risks. The AI expects this to open up. If you are predicting, consider ${homeScore}-${awayScore} (Correct Result) or ${homeScore + 1}-${awayScore} if the winning team counters.`;
        } else {
          predictionLogic = `It's ${homeScore}-${awayScore} in the ${minute}' minute. Both teams look evenly matched. A safe Exact Score prediction is ${homeScore}-${awayScore}. Look for late winners if a sub is brought on.`;
        }
      }
      // 2. Pre-Match Prediction Logic (Using V2 ML Data)
      else {
        let outcomeText = '';
        if (homeWinProb > 45) outcomeText = `${homeName} to win (${homeWinProb}% probability).`;
        else if (awayWinProb > 45) outcomeText = `${awayName} to win (${awayWinProb}% probability).`;
        else outcomeText = `a tight match, possibly a draw (${drawProb}% probability).`;

        let goalsText = '';
        if (overProb > 55) goalsText = `The model favors OVER 2.5 goals (${overProb}% probability).`;
        else if (underProb > 55) goalsText = `The model favors UNDER 2.5 goals (${underProb}% probability).`;
        else goalsText = `goals could go either way (Over ${overProb}% / Under ${underProb}%).`;

        predictionLogic = `For the upcoming ${homeName} vs ${awayName} match, the ZOKASCORE V2 AI predicts ${outcomeText} Regarding goals, ${goalsText}`;

        if (pBtts) {
          const bttsYes = pBtts.YES || 0;
          if (bttsYes > 55) predictionLogic += ` Both teams are expected to score (${bttsYes}% probability).`;
        }
      }
    }
    // Fallback if ML data is missing
    else {
      if (isLive && minute > 60) {
        predictionLogic = `Since ${homeName} is leading ${homeScore}-${awayScore} in the ${minute}' minute, the losing team will have to take risks. A safe prediction is ${homeScore}-${awayScore} (Correct Result).`;
      } else {
        predictionLogic = `For the upcoming ${homeName} vs ${awayName} match, ML data is currently unavailable. Look at the tactical styles. If one plays a High Press and the other plays a Low Block, expect few goals (1-0 or 1-1).`;
      }
    }

    const evidence = `[PREDICTION ANALYSIS]\n${predictionLogic}\n\nRemember, matches lock 60 minutes before kickoff on ZOKASCORE!`;

    return {
      status: 'ANSWERED_LOCALLY',
      evidence,
      confidence: 1.0,
    };
  }
}

module.exports = new PredictionEngine();