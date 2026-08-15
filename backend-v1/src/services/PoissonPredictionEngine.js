'use strict';

/**
 * ZOKASCORE V2 - Poisson Baseline Prediction Engine
 * Calculates deterministic probabilities based on Expected Goals (lambda).
 * Tail-safe matrix (up to 10 goals) ensures O/U and BTTS sum to exactly 100%.
 */
class PoissonPredictionEngine {
  
  _poissonProb(k, lambda) {
    if (lambda <= 0) return k === 0 ? 1 : 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this._factorial(k);
  }

  _factorial(n) {
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  _safeNum(val) {
    const num = Number(val);
    return isNaN(num) ? 1.0 : num;
  }

  predict(features) {
    const homeAttack = this._safeNum(features.home.homeAvgs.avgGoalsFor);
    const homeDefense = this._safeNum(features.home.homeAvgs.avgGoalsAgainst);
    const awayAttack = this._safeNum(features.away.awayAvgs.avgGoalsFor);
    const awayDefense = this._safeNum(features.away.awayAvgs.avgGoalsAgainst);

    const HOME_ADVANTAGE = 1.15;
    const AWAY_DISADVANTAGE = 0.95;

    let lambdaH = ((homeAttack + awayDefense) / 2) * HOME_ADVANTAGE;
    let lambdaA = ((awayAttack + homeDefense) / 2) * AWAY_DISADVANTAGE;

    lambdaH = Math.max(0.1, Math.min(5.0, lambdaH));
    lambdaA = Math.max(0.1, Math.min(5.0, lambdaA));

    // Expanded Matrix (0 to 10 goals) for tail safety
    const maxGoals = 10;
    let pHomeWin = 0, pDraw = 0, pAwayWin = 0;
    let pOver2_5 = 0, pUnder2_5 = 0, pBtts = 0, pBttsNo = 0;
    let totalMatrixProb = 0;

    for (let i = 0; i <= maxGoals; i++) {
      const probI = this._poissonProb(i, lambdaH);
      
      for (let j = 0; j <= maxGoals; j++) {
        const probJ = this._poissonProb(j, lambdaA);
        const probScoreline = probI * probJ;
        
        totalMatrixProb += probScoreline;

        if (i > j) pHomeWin += probScoreline;
        else if (i === j) pDraw += probScoreline;
        else pAwayWin += probScoreline;

        if (i + j > 2.5) pOver2_5 += probScoreline;
        else pUnder2_5 += probScoreline;

        if (i > 0 && j > 0) pBtts += probScoreline;
        else pBttsNo += probScoreline;
      }
    }

    // Normalize ALL markets (guarantees exactly 100% sum)
    pHomeWin /= totalMatrixProb;
    pDraw /= totalMatrixProb;
    pAwayWin /= totalMatrixProb;
    pOver2_5 /= totalMatrixProb;
    pUnder2_5 /= totalMatrixProb;
    pBtts /= totalMatrixProb;
    pBttsNo /= totalMatrixProb;

    return {
      expectedGoals: {
        home: parseFloat(lambdaH.toFixed(2)),
        away: parseFloat(lambdaA.toFixed(2))
      },
      probabilities: {
        homeWin: parseFloat((pHomeWin * 100).toFixed(2)),
        draw: parseFloat((pDraw * 100).toFixed(2)),
        awayWin: parseFloat((pAwayWin * 100).toFixed(2)),
        over2_5: parseFloat((pOver2_5 * 100).toFixed(2)),
        under2_5: parseFloat((pUnder2_5 * 100).toFixed(2)),
        btts: parseFloat((pBtts * 100).toFixed(2)),
        bttsNo: parseFloat((pBttsNo * 100).toFixed(2))
      },
      fairOdds: {
        homeWin: parseFloat((1 / pHomeWin).toFixed(2)),
        draw: parseFloat((1 / pDraw).toFixed(2)),
        awayWin: parseFloat((1 / pAwayWin).toFixed(2)),
        over2_5: parseFloat((1 / pOver2_5).toFixed(2)),
        under2_5: parseFloat((1 / pUnder2_5).toFixed(2)),
        btts: parseFloat((1 / pBtts).toFixed(2)),
        bttsNo: parseFloat((1 / pBttsNo).toFixed(2))
      }
    };
  }
}

module.exports = new PoissonPredictionEngine();