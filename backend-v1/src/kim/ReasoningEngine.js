'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL FOOTBALL REASONING ENGINE
 * ============================================================
 * VERSION: 3.2.0
 *
 * Pure deterministic football intelligence.
 * ============================================================
 */

class ReasoningEngine {
  constructor() {
    this.VERSION = '3.2.0';

    this.MIN_SAMPLE = 5;
    this.STRONG_SAMPLE = 10;

    this.MIN_CONFIDENCE = 0.35;
    this.MAX_CONFIDENCE = 0.95;

    this.DEFAULT_ELO = 1500;
    this.HOME_ADVANTAGE_ELO = 55;

    this.WEIGHTS = {
      strong: 3,
      moderate: 2,
      weak: 1
    };
  }

  /* ============================================================
     PUBLIC API
  ============================================================ */

  analyzeTeamStats(teamIntel = {}, teamName = 'The team') {
    const overall = teamIntel.overall || {};
    const home = teamIntel.home || {};
    const away = teamIntel.away || {};
    const goals = teamIntel.goal_patterns?.overall || {};
    const resilience = teamIntel.resilience || {};

    const insights = [];
    const warnings = [];
    const signals = [];

    const played = this.num(overall.played);
    const wins = this.num(overall.win);
    const draws = this.num(overall.draw);
    const losses = this.num(overall.loss);
    const goalsFor = this.num(overall.goals_for);
    const goalsAgainst = this.num(overall.goals_against);

    const winRate = this.percent(wins, played);
    const drawRate = this.percent(draws, played);
    const lossRate = this.percent(losses, played);

    const points = wins * 3 + draws;
    const pointsPerGame = this.perGame(points, played);
    const goalsPerGame = this.perGame(goalsFor, played);
    const concededPerGame = this.perGame(goalsAgainst, played);

    const goalDifference = goalsFor - goalsAgainst;
    const goalDifferencePerGame = this.perGame(goalDifference, played);

    if (played === 0) {
      warnings.push('No overall match sample is available.');
    } else if (played < this.MIN_SAMPLE) {
      warnings.push(`Small sample size: only ${played} matches.`);
    } else if (played < this.STRONG_SAMPLE) {
      warnings.push(`Moderate sample size: ${played} matches.`);
    }

    if (played >= this.MIN_SAMPLE) {
      if (winRate >= 70) {
        insights.push(`${teamName} are producing elite results, winning ${winRate}% of their matches.`);
        signals.push(this.signal('FORM', teamName, 3, winRate, 'Very high win rate.'));
      } else if (winRate >= 55) {
        insights.push(`${teamName} are in strong competitive form, with a ${winRate}% win rate.`);
        signals.push(this.signal('FORM', teamName, 2, winRate, 'Strong win rate.'));
      } else if (winRate <= 25) {
        insights.push(`${teamName} are struggling badly for results, winning only ${winRate}% of their matches.`);
        signals.push(this.signal('FORM', teamName, -3, winRate, 'Very low win rate.'));
      } else if (winRate <= 35) {
        insights.push(`${teamName} are struggling to convert matches into wins.`);
        signals.push(this.signal('FORM', teamName, -2, winRate, 'Low win rate.'));
      }
    }

    if (played >= this.MIN_SAMPLE) {
      if (pointsPerGame >= 2.2) {
        insights.push(`Their points return is excellent at ${pointsPerGame.toFixed(2)} points per game.`);
        signals.push(this.signal('POINTS', teamName, 3, pointsPerGame, 'Excellent points-per-game return.'));
      } else if (pointsPerGame < 1.0) {
        insights.push(`Their points return is poor at only ${pointsPerGame.toFixed(2)} points per game.`);
        signals.push(this.signal('POINTS', teamName, -3, pointsPerGame, 'Poor points-per-game return.'));
      }
    }

    if (played >= this.MIN_SAMPLE) {
      if (goalsPerGame >= 2.2) {
        insights.push(`${teamName} have a highly productive attack, averaging ${goalsPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('ATTACK', teamName, 3, goalsPerGame, 'Elite scoring rate.'));
      } else if (goalsPerGame >= 1.6) {
        insights.push(`${teamName} are producing a healthy ${goalsPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('ATTACK', teamName, 2, goalsPerGame, 'Strong scoring rate.'));
      } else if (goalsPerGame < 0.9) {
        insights.push(`${teamName}'s attack is a major concern, averaging only ${goalsPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('ATTACK', teamName, -3, goalsPerGame, 'Very low scoring rate.'));
      } else if (goalsPerGame < 1.2) {
        insights.push(`${teamName} have a relatively modest scoring output.`);
        signals.push(this.signal('ATTACK', teamName, -2, goalsPerGame, 'Low scoring rate.'));
      }
    }

    if (played >= this.MIN_SAMPLE) {
      if (concededPerGame <= 0.75) {
        insights.push(`${teamName} have been extremely difficult to break down, conceding only ${concededPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('DEFENCE', teamName, 3, concededPerGame, 'Elite defensive record.'));
      } else if (concededPerGame <= 1.0) {
        insights.push(`${teamName} have a strong defensive record.`);
        signals.push(this.signal('DEFENCE', teamName, 2, concededPerGame, 'Low concession rate.'));
      } else if (concededPerGame >= 1.9) {
        insights.push(`${teamName} are conceding at a worrying rate of ${concededPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('DEFENCE', teamName, -3, concededPerGame, 'Very high concession rate.'));
      } else if (concededPerGame >= 1.6) {
        insights.push(`${teamName}'s defence has been vulnerable, conceding ${concededPerGame.toFixed(2)} goals per match.`);
        signals.push(this.signal('DEFENCE', teamName, -2, concededPerGame, 'High concession rate.'));
      }
    }

    if (played >= this.MIN_SAMPLE) {
      if (goalDifferencePerGame >= 1) {
        signals.push(this.signal('GOAL_DIFFERENCE', teamName, 3, goalDifferencePerGame, 'Dominant goal difference.'));
      } else if (goalDifferencePerGame <= -0.8) {
        signals.push(this.signal('GOAL_DIFFERENCE', teamName, -3, goalDifferencePerGame, 'Poor goal difference.'));
      }
    }

    const homePlayed = this.num(home.played);
    const awayPlayed = this.num(away.played);
    const homeWins = this.num(home.win);
    const awayWins = this.num(away.win);
    const homeWinRate = this.percent(homeWins, homePlayed);
    const awayWinRate = this.percent(awayWins, awayPlayed);
    const venueDifference = this.round(homeWinRate - awayWinRate, 1);

    if (homePlayed >= this.MIN_SAMPLE && awayPlayed >= this.MIN_SAMPLE) {
      if (venueDifference >= 25) {
        insights.push(`${teamName} are substantially stronger at home than away.`);
        signals.push({ type: 'VENUE', entity: teamName, direction: 'HOME', strength: 'strong', score: 3, value: venueDifference, reason: 'Large home/away win-rate difference.' });
      } else if (venueDifference <= -20) {
        insights.push(`Interestingly, ${teamName} have performed better away from home than at home.`);
        signals.push({ type: 'VENUE', entity: teamName, direction: 'AWAY', strength: 'strong', score: 2, value: Math.abs(venueDifference), reason: 'Away win rate exceeds home win rate.' });
      }
    }

    const over25 = this.num(goals.over_2_5_pct);
    const under25 = this.num(goals.under_2_5_pct, 100 - over25);
    const btts = this.num(goals.btts_pct);

    if (over25 >= 70) {
      insights.push(`Their matches are heavily tilted toward high-scoring games, with Over 2.5 landing ${over25}% of the time.`);
      signals.push({ type: 'GOALS', subtype: 'OVER_2_5', entity: teamName, score: 3, strength: 'strong', value: over25, reason: 'Very high Over 2.5 frequency.' });
    } else if (over25 >= 60) {
      signals.push({ type: 'GOALS', subtype: 'OVER_2_5', entity: teamName, score: 2, strength: 'moderate', value: over25 });
    } else if (under25 >= 70) {
      insights.push(`Their matches tend to be low-scoring, with Under 2.5 occurring approximately ${under25}% of the time.`);
      signals.push({ type: 'GOALS', subtype: 'UNDER_2_5', entity: teamName, score: 2, strength: 'moderate', value: under25 });
    }

    if (btts >= 70) {
      insights.push(`Both teams score very frequently in their matches, with BTTS at ${btts}%.`);
      signals.push({ type: 'GOALS', subtype: 'BTTS', entity: teamName, score: 3, strength: 'strong', value: btts });
    } else if (btts <= 30) {
      signals.push({ type: 'GOALS', subtype: 'NO_BTTS', entity: teamName, score: 2, strength: 'moderate', value: btts });
    }

    const comebackWins = this.num(resilience.comeback_wins);
    const leadProtection = this.num(resilience.lead_protection_rate);

    if (comebackWins >= 5) {
      insights.push(`${teamName} have demonstrated excellent comeback ability.`);
      signals.push({ type: 'RESILIENCE', subtype: 'COMEBACK', entity: teamName, score: 3, strength: 'strong', value: comebackWins });
    } else if (comebackWins >= 3) {
      signals.push({ type: 'RESILIENCE', subtype: 'COMEBACK', entity: teamName, score: 2, strength: 'moderate', value: comebackWins });
    }

    if (leadProtection > 0 && leadProtection < 65) {
      insights.push(`${teamName} have shown a tendency to surrender points after taking the lead.`);
      signals.push({ type: 'RESILIENCE', subtype: 'LEAD_PROTECTION', entity: teamName, score: -2, strength: 'moderate', value: leadProtection });
    }

    const positiveSignals = signals.filter(s => this.num(s.score) > 0).length;
    const negativeSignals = signals.filter(s => this.num(s.score) < 0).length;

    let profile = 'balanced';
    if (positiveSignals >= 5 && negativeSignals === 0) {
      profile = 'dominant';
    } else if (negativeSignals >= 4 && positiveSignals <= 1) {
      profile = 'struggling';
    } else if (goalsPerGame >= 1.8 && concededPerGame >= 1.6) {
      profile = 'high-risk attacking';
    } else if (goalsPerGame < 1.1 && concededPerGame < 1.1) {
      profile = 'defensive / low-scoring';
    }

    if (!insights.length) {
      insights.push(`${teamName} show a relatively balanced statistical profile without a major extreme in the available data.`);
    }

    const confidence = this.calculateSampleConfidence(played);

    return {
      type: 'TEAM_ANALYSIS',
      version: this.VERSION,
      team: teamName,
      confidence,
      confidencePercent: this.round(confidence * 100, 1),
      profile,
      summary: insights.join(' '),
      insights,
      warnings,
      signals,
      metrics: {
        played, wins, draws, losses, winRate, drawRate, lossRate, points, pointsPerGame,
        goalsFor, goalsAgainst, goalsPerGame, concededPerGame, goalDifference, goalDifferencePerGame,
        homePlayed, awayPlayed, homeWinRate, awayWinRate, homeAwayDifference: venueDifference,
        over25, under25, btts, comebackWins, leadProtection
      }
    };
  }

  /* ============================================================
     MATCHUP ANALYSIS
  ============================================================ */

  analyzeMatchup(homeTeam, awayTeam, intel = {}) {
    const home = intel.home || {};
    const away = intel.away || {};
    const h2h = intel.h2h || null;

    const signals = [];
    const insights = [];

    const homeElo = this.num(home.elo?.current ?? home.elo, this.DEFAULT_ELO);
    const awayElo = this.num(away.elo?.current ?? away.elo, this.DEFAULT_ELO);

    const adjustedHomeElo = homeElo + this.HOME_ADVANTAGE_ELO;
    const eloDifference = adjustedHomeElo - awayElo;

    if (eloDifference >= 150) {
      insights.push(`${homeTeam} have a substantial rating advantage, including home advantage.`);
      signals.push({ type: 'ELO', entity: homeTeam, winner: homeTeam, score: 3, strength: 'strong', margin: eloDifference });
    } else if (eloDifference >= 60) {
      insights.push(`${homeTeam} hold a meaningful rating advantage.`);
      signals.push({ type: 'ELO', entity: homeTeam, winner: homeTeam, score: 2, strength: 'moderate', margin: eloDifference });
    } else if (eloDifference <= -150) {
      insights.push(`${awayTeam} have the stronger underlying rating despite playing away.`);
      signals.push({ type: 'ELO', entity: awayTeam, winner: awayTeam, score: 3, strength: 'strong', margin: Math.abs(eloDifference) });
    } else if (eloDifference <= -60) {
      insights.push(`${awayTeam} hold a meaningful rating advantage despite the away venue.`);
      signals.push({ type: 'ELO', entity: awayTeam, winner: awayTeam, score: 2, strength: 'moderate', margin: Math.abs(eloDifference) });
    } else {
      insights.push(`The underlying ratings suggest a relatively balanced matchup.`);
      signals.push({ type: 'ELO', entity: null, winner: null, score: 0, strength: 'weak', margin: Math.abs(eloDifference) });
    }

    const homeWinRate = this.percent(home.win, home.played);
    const awayWinRate = this.percent(away.win, away.played);

    if (homeWinRate >= 55 && homeWinRate > awayWinRate + 10) {
      insights.push(`${homeTeam}'s home record provides an additional positive signal.`);
      signals.push({ type: 'VENUE', entity: homeTeam, winner: homeTeam, score: 2, strength: 'moderate', value: homeWinRate });
    } else if (awayWinRate >= 55 && awayWinRate > homeWinRate + 10) {
      insights.push(`${awayTeam}'s away record is a notable positive signal.`);
      signals.push({ type: 'VENUE', entity: awayTeam, winner: awayTeam, score: 2, strength: 'moderate', value: awayWinRate });
    }

    if (h2h && this.num(h2h.meetings) >= 4) {
      const meetings = this.num(h2h.meetings);
      const teamAWins = this.num(h2h.teamA_wins);
      const teamBWins = this.num(h2h.teamB_wins);
      const h2hTeamA = h2h.teamA || homeTeam;
      const h2hTeamB = h2h.teamB || awayTeam;

      if (teamAWins >= teamBWins + 3) {
        insights.push(`The historical head-to-head record favors ${h2hTeamA} across ${meetings} meetings.`);
        signals.push({ type: 'H2H', entity: h2hTeamA, winner: h2hTeamA, score: 2, strength: 'moderate', meetings });
      } else if (teamBWins >= teamAWins + 3) {
        insights.push(`The historical head-to-head record favors ${h2hTeamB} across ${meetings} meetings.`);
        signals.push({ type: 'H2H', entity: h2hTeamB, winner: h2hTeamB, score: 2, strength: 'moderate', meetings });
      } else {
        insights.push(`The head-to-head record is relatively balanced across ${meetings} meetings.`);
      }
    }

    const homeAttack = this.perGame(home.goals_for, home.played);
    const awayAttack = this.perGame(away.goals_for, away.played);

    if (homeAttack >= awayAttack + 0.35) {
      signals.push({ type: 'ATTACK', entity: homeTeam, winner: homeTeam, score: 2, strength: 'moderate', margin: this.round(homeAttack - awayAttack, 2) });
    } else if (awayAttack >= homeAttack + 0.35) {
      signals.push({ type: 'ATTACK', entity: awayTeam, winner: awayTeam, score: 2, strength: 'moderate', margin: this.round(awayAttack - homeAttack, 2) });
    }

    const homeDefence = this.perGame(home.goals_against, home.played);
    const awayDefence = this.perGame(away.goals_against, away.played);

    if (homeDefence <= awayDefence - 0.30) {
      signals.push({ type: 'DEFENCE', entity: homeTeam, winner: homeTeam, score: 2, strength: 'moderate' });
    } else if (awayDefence <= homeDefence - 0.30) {
      signals.push({ type: 'DEFENCE', entity: awayTeam, winner: awayTeam, score: 2, strength: 'moderate' });
    }

    const consensus = this.determineConsensus(signals, homeTeam, awayTeam);
    const verdict = this.buildMatchupVerdict(homeTeam, awayTeam, consensus);

    return {
      type: 'MATCHUP_ANALYSIS',
      version: this.VERSION,
      homeTeam,
      awayTeam,
      verdict,
      summary: insights.join(' '),
      insights,
      signals,
      consensus,
      metrics: {
        homeElo,
        awayElo,
        adjustedHomeElo,
        adjustedAwayElo: awayElo,
        eloDifference,
        homeWinRate,
        awayWinRate,
        homeAttack,
        awayAttack,
        homeDefence,
        awayDefence
      },
      confidence: this.calculateMatchupConfidence(signals)
    };
  }

  /* ============================================================
     TEAM COMPARISON
  ============================================================ */

  compareTeams(teamA, teamB, intelA = {}, intelB = {}) {
    const advantagesA = [];
    const advantagesB = [];
    const metrics = [];

    const eloA = this.num(intelA.elo?.current ?? intelA.elo, this.DEFAULT_ELO);
    const eloB = this.num(intelB.elo?.current ?? intelB.elo, this.DEFAULT_ELO);
    this.addComparison(metrics, advantagesA, advantagesB, teamA, teamB, 'Elo', eloA, eloB, 50, 'higher Elo rating', true);

    const winRateA = this.percent(intelA.overall?.win, intelA.overall?.played);
    const winRateB = this.percent(intelB.overall?.win, intelB.overall?.played);
    this.addComparison(metrics, advantagesA, advantagesB, teamA, teamB, 'Win rate', winRateA, winRateB, 10, 'better win rate', true);

    const ppgA = this.perGame(this.num(intelA.overall?.win) * 3 + this.num(intelA.overall?.draw), intelA.overall?.played);
    const ppgB = this.perGame(this.num(intelB.overall?.win) * 3 + this.num(intelB.overall?.draw), intelB.overall?.played);
    this.addComparison(metrics, advantagesA, advantagesB, teamA, teamB, 'Points per game', ppgA, ppgB, 0.25, 'better points return', true);

    const attackA = this.perGame(intelA.overall?.goals_for, intelA.overall?.played);
    const attackB = this.perGame(intelB.overall?.goals_for, intelB.overall?.played);
    this.addComparison(metrics, advantagesA, advantagesB, teamA, teamB, 'Goals per game', attackA, attackB, 0.25, 'more productive attack', true);

    const defenceA = this.perGame(intelA.overall?.goals_against, intelA.overall?.played);
    const defenceB = this.perGame(intelB.overall?.goals_against, intelB.overall?.played);
    this.addComparison(metrics, advantagesA, advantagesB, teamA, teamB, 'Goals conceded per game', defenceA, defenceB, 0.20, 'tighter defence', false, true);

    const overA = this.num(intelA.goal_patterns?.overall?.over_2_5_pct);
    const overB = this.num(intelB.goal_patterns?.overall?.over_2_5_pct);
    metrics.push({ category: 'Over 2.5 rate', teamA: overA, teamB: overB, leader: overA > overB ? teamA : overB > overA ? teamB : null });

    const bttsA = this.num(intelA.goal_patterns?.overall?.btts_pct);
    const bttsB = this.num(intelB.goal_patterns?.overall?.btts_pct);
    metrics.push({ category: 'BTTS rate', teamA: bttsA, teamB: bttsB, leader: bttsA > bttsB ? teamA : bttsB > bttsA ? teamB : null });

    const scoreA = advantagesA.length;
    const scoreB = advantagesB.length;

    let verdict;
    if (scoreA > scoreB) {
      verdict = `${teamA} have the stronger statistical profile, leading in ${scoreA} key categories compared with ${scoreB}.`;
    } else if (scoreB > scoreA) {
      verdict = `${teamB} have the stronger statistical profile, leading in ${scoreB} key categories compared with ${scoreA}.`;
    } else {
      verdict = `The statistical comparison is very close, with neither ${teamA} nor ${teamB} holding a clear overall advantage.`;
    }

    return {
      type: 'TEAM_COMPARISON',
      version: this.VERSION,
      teamA,
      teamB,
      verdict,
      advantages: { [teamA]: advantagesA, [teamB]: advantagesB },
      metrics,
      score: { [teamA]: scoreA, [teamB]: scoreB },
      confidence: this.calculateComparisonConfidence(metrics)
    };
  }

  /* ============================================================
     FORM ANALYSIS
  ============================================================ */

  analyzeForm(form = [], teamName = 'The team') {
    if (!Array.isArray(form) || !form.length) {
      return {
        type: 'FORM_ANALYSIS',
        team: teamName,
        confidence: 0,
        trend: 'unknown',
        summary: 'There is not enough recent form data to evaluate the trend.',
        signals: []
      };
    }

    const normalized = form.map(x => String(x).trim().toUpperCase()).filter(x => ['W', 'D', 'L'].includes(x));

    if (!normalized.length) {
      return {
        type: 'FORM_ANALYSIS',
        team: teamName,
        confidence: 0,
        trend: 'unknown',
        summary: 'The supplied form data could not be interpreted.',
        signals: []
      };
    }

    const wins = normalized.filter(x => x === 'W').length;
    const draws = normalized.filter(x => x === 'D').length;
    const losses = normalized.filter(x => x === 'L').length;
    const total = normalized.length;

    const winRate = this.percent(wins, total);
    const lossRate = this.percent(losses, total);
    const weightedPoints = this.calculateWeightedForm(normalized);

    let trend = 'mixed';
    if (winRate >= 70) trend = 'excellent';
    else if (winRate >= 55) trend = 'strong';
    else if (lossRate >= 70) trend = 'poor';
    else if (lossRate >= 55) trend = 'negative';
    else if (wins > losses) trend = 'positive';
    else if (losses > wins) trend = 'negative';

    const streakType = normalized[normalized.length - 1];
    let streakLength = 1;

    for (let i = normalized.length - 2; i >= 0; i--) {
      if (normalized[i] === streakType) {
        streakLength++;
      } else {
        break;
      }
    }

    const insights = [];
    switch (trend) {
      case 'excellent': insights.push(`${teamName} are in excellent recent form.`); break;
      case 'strong': insights.push(`${teamName}'s recent results are strongly positive.`); break;
      case 'poor': insights.push(`${teamName} are going through a very poor run.`); break;
      case 'negative': insights.push(`${teamName}'s recent results lean negative.`); break;
      case 'positive': insights.push(`${teamName}'s recent form leans positive.`); break;
      default: insights.push(`${teamName}'s recent form has been mixed.`);
    }

    if (streakLength >= 3) {
      const labels = { W: 'winning', D: 'drawing', L: 'losing' };
      insights.push(`They are currently on a ${streakLength}-match ${labels[streakType]} streak.`);
    }

    return {
      type: 'FORM_ANALYSIS',
      version: this.VERSION,
      team: teamName,
      confidence: this.calculateSampleConfidence(total),
      trend,
      record: { wins, draws, losses, total, winRate, lossRate },
      weightedPoints,
      streak: { type: streakType, length: streakLength },
      summary: insights.join(' '),
      insights,
      signals: [
        {
          type: 'RECENT_FORM',
          direction: ['excellent', 'strong', 'positive'].includes(trend) ? 'positive' : ['poor', 'negative'].includes(trend) ? 'negative' : 'neutral',
          strength: total >= 5 ? 'moderate' : 'weak'
        }
      ]
    };
  }

  /* ============================================================
     MATCH PROBABILITIES
  ============================================================ */

  estimateMatchProbabilities(homeIntel = {}, awayIntel = {}) {
    const homeElo = this.num(homeIntel.elo?.current ?? homeIntel.elo, this.DEFAULT_ELO);
    const awayElo = this.num(awayIntel.elo?.current ?? awayIntel.elo, this.DEFAULT_ELO);

    const adjustedHomeElo = homeElo + this.HOME_ADVANTAGE_ELO;
    const expectedHome = 1 / (1 + Math.pow(10, (awayElo - adjustedHomeElo) / 400));

    const closeness = Math.abs(adjustedHomeElo - awayElo);
    let drawProbability;

    if (closeness < 50) drawProbability = 0.30;
    else if (closeness < 100) drawProbability = 0.27;
    else if (closeness < 200) drawProbability = 0.24;
    else drawProbability = 0.20;

    const nonDraw = 1 - drawProbability;
    let homeProbability = expectedHome * nonDraw;
    let awayProbability = (1 - expectedHome) * nonDraw;

    const total = homeProbability + drawProbability + awayProbability;
    homeProbability /= total;
    drawProbability /= total;
    awayProbability /= total;

    return {
      type: 'KIM_STATISTICAL_ESTIMATE',
      version: this.VERSION,
      probabilities: {
        homeWin: this.round(homeProbability * 100, 1),
        draw: this.round(drawProbability * 100, 1),
        awayWin: this.round(awayProbability * 100, 1)
      },
      raw: { homeWin: homeProbability, draw: drawProbability, awayWin: awayProbability },
      basis: ['Elo rating', 'home advantage', 'rating proximity'],
      warning: 'This is a statistical estimate, not a guaranteed outcome.'
    };
  }

  /* ============================================================
     CONSENSUS & VERDICT
  ============================================================ */

  determineConsensus(signals = [], teamA, teamB) {
    const scores = { [teamA]: 0, [teamB]: 0 };
    const evidence = { [teamA]: [], [teamB]: [] };

    for (const signal of signals) {
      // Associate the signal with the entity it pertains to
      const entity = signal.entity || signal.winner;
      if (entity !== teamA && entity !== teamB) continue;

      // Use signed score for net evidence calculation
      const weight = signal.score !== undefined
        ? this.num(signal.score)
        : (signal.winner ? this.signalWeight(signal.strength) : 0);

      scores[entity] += weight;
      evidence[entity].push({ type: signal.type, weight, reason: signal.reason || null });
    }

    const total = Math.abs(scores[teamA]) + Math.abs(scores[teamB]);
    const difference = Math.abs(scores[teamA] - scores[teamB]);

    let winner = null;
    if (scores[teamA] > scores[teamB]) winner = teamA;
    else if (scores[teamB] > scores[teamA]) winner = teamB;

    let confidence = 0.35;
    if (total > 0) {
      const dominance = difference / total;
      confidence = 0.40 + dominance * 0.50;
    }
    confidence = this.clamp(confidence, this.MIN_CONFIDENCE, this.MAX_CONFIDENCE);

    const contradictory = this.detectContradiction(signals, teamA, teamB);

    return {
      winner,
      scores,
      evidence,
      difference,
      totalEvidence: total,
      confidence,
      confidencePercent: this.round(confidence * 100, 1),
      contradictory
    };
  }

  buildMatchupVerdict(homeTeam, awayTeam, consensus) {
    if (!consensus || !consensus.winner) {
      return `The available indicators do not establish a clear favorite between ${homeTeam} and ${awayTeam}.`;
    }

    const confidence = Math.round(consensus.confidence * 100);

    if (consensus.contradictory) {
      return `${consensus.winner} have the stronger statistical case, but the indicators are conflicting, so confidence is limited (${confidence}%).`;
    }

    return `${consensus.winner} currently have the stronger statistical case, with ${confidence}% reasoning confidence from the available evidence.`;
  }

  /* ============================================================
     FULL MATCH INTELLIGENCE
  ============================================================ */

  analyzeFullMatch(homeTeam, awayTeam, homeIntel = {}, awayIntel = {}, matchupIntel = {}) {
    const homeAnalysis = this.analyzeTeamStats(homeIntel, homeTeam);
    const awayAnalysis = this.analyzeTeamStats(awayIntel, awayTeam);

    const matchup = this.analyzeMatchup(homeTeam, awayTeam, {
      ...matchupIntel,
      home: { ...homeIntel, ...(matchupIntel.home || {}) },
      away: { ...awayIntel, ...(matchupIntel.away || {}) }
    });

    const probabilities = this.estimateMatchProbabilities(homeIntel, awayIntel);
    const allSignals = matchup.signals || [];
    const consensus = this.determineConsensus(allSignals, homeTeam, awayTeam);

    return {
      type: 'FULL_MATCH_INTELLIGENCE',
      version: this.VERSION,
      match: { home: homeTeam, away: awayTeam },
      home: homeAnalysis,
      away: awayAnalysis,
      matchup,
      probabilities,
      consensus,
      overallConfidence: this.calculateFullMatchConfidence(homeAnalysis, awayAnalysis, matchup, probabilities),
      generatedAt: new Date().toISOString()
    };
  }

  /* ============================================================
     STATISTICAL EXTREMES & CONTRADICTION
  ============================================================ */

  detectExtremes(teamIntel = {}, teamName = 'The team') {
    const overall = teamIntel.overall || {};
    const goals = teamIntel.goal_patterns?.overall || {};
    const extremes = [];

    const played = this.num(overall.played);
    const goalsFor = this.perGame(overall.goals_for, played);
    const goalsAgainst = this.perGame(overall.goals_against, played);
    const over25 = this.num(goals.over_2_5_pct);
    const btts = this.num(goals.btts_pct);

    if (goalsFor >= 2.5) {
      extremes.push({ type: 'ELITE_ATTACK', severity: 'high', message: `${teamName} are scoring at an exceptional rate.` });
    }
    if (goalsAgainst >= 2.0) {
      extremes.push({ type: 'WEAK_DEFENCE', severity: 'high', message: `${teamName} are conceding at an exceptionally high rate.` });
    }
    if (over25 >= 75) {
      extremes.push({ type: 'HIGH_SCORING', severity: 'high', message: `${teamName}'s matches are heavily biased toward three or more goals.` });
    }
    if (btts >= 75) {
      extremes.push({ type: 'BTTS_HEAVY', severity: 'high', message: `Both teams score in a very large proportion of ${teamName}'s matches.` });
    }

    return extremes;
  }

  detectContradiction(signals = [], teamA, teamB) {
    const entities = signals.map(s => s.entity || s.winner).filter(Boolean);
    const a = entities.filter(x => x === teamA).length;
    const b = entities.filter(x => x === teamB).length;

    return a >= 2 && b >= 2 && Math.abs(a - b) <= 2;
  }

  /* ============================================================
     CONFIDENCE CALCULATIONS
  ============================================================ */

  calculateFullMatchConfidence(home, away, matchup, probabilities) {
    const values = [
      this.num(home?.confidence),
      this.num(away?.confidence),
      this.num(matchup?.confidence)
    ].filter(x => x > 0);

    if (!values.length) return 0.35;

    let confidence = values.reduce((a, b) => a + b, 0) / values.length;

    if (matchup?.consensus?.contradictory) {
      confidence -= 0.12;
    }

    return this.clamp(confidence, this.MIN_CONFIDENCE, this.MAX_CONFIDENCE);
  }

  calculateSampleConfidence(matches) {
    const n = this.num(matches);
    if (n <= 0) return 0;
    
    // Asymptotic confidence curve: ~0.35 at 0, ~0.72 at 5, ~0.86 at 10, ~0.91 at 15
    const confidence = 0.35 + 0.55 * (1 - Math.exp(-n / 12));
    return this.clamp(confidence, this.MIN_CONFIDENCE, this.MAX_CONFIDENCE);
  }

  calculateMatchupConfidence(signals = []) {
    if (!signals.length) return 0.35;

    const useful = signals.filter(s => s.winner);
    if (!useful.length) return 0.35;

    const strong = useful.filter(s => s.strength === 'strong' || Math.abs(this.num(s.score)) >= 3).length;
    const moderate = useful.filter(s => s.strength === 'moderate' || Math.abs(this.num(s.score)) === 2).length;

    return this.clamp(0.40 + strong * 0.10 + moderate * 0.05, this.MIN_CONFIDENCE, this.MAX_CONFIDENCE);
  }

  calculateComparisonConfidence(metrics = []) {
    const useful = metrics.filter(metric => metric.teamA !== 0 || metric.teamB !== 0).length;
    return this.clamp(0.40 + useful * 0.07, this.MIN_CONFIDENCE, this.MAX_CONFIDENCE);
  }

  /* ============================================================
     FORM WEIGHTING & COMPARISON HELPER
  ============================================================ */

  calculateWeightedForm(form = []) {
    if (!form.length) return 0;

    let weighted = 0;
    let totalWeight = 0;

    for (let i = 0; i < form.length; i++) {
      const result = form[form.length - 1 - i];
      const weight = Math.pow(0.85, i);
      const points = result === 'W' ? 3 : result === 'D' ? 1 : 0;

      weighted += points * weight;
      totalWeight += 3 * weight;
    }

    return this.round((weighted / totalWeight) * 100, 2);
  }

  addComparison(metrics, advantagesA, advantagesB, teamA, teamB, category, valueA, valueB, threshold, label, higherIsBetter = true, lowerIsBetter = false) {
    let leader = null;

    if (Math.abs(valueA - valueB) >= threshold) {
      if (higherIsBetter) {
        if (valueA > valueB) {
          leader = teamA;
          advantagesA.push(label);
        } else {
          leader = teamB;
          advantagesB.push(label);
        }
      } else if (lowerIsBetter) {
        if (valueA < valueB) {
          leader = teamA;
          advantagesA.push(label);
        } else {
          leader = teamB;
          advantagesB.push(label);
        }
      }
    }

    metrics.push({ category, teamA: this.round(valueA, 2), teamB: this.round(valueB, 2), leader });
  }

  /* ============================================================
     UTILITY HELPERS
  ============================================================ */

  signal(type, entity, score, value, reason = null) {
    const abs = Math.abs(score);
    return {
      type,
      entity,
      score,
      value,
      strength: abs >= 3 ? 'strong' : abs >= 2 ? 'moderate' : 'weak',
      direction: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
      winner: score > 0 ? entity : null,
      reason
    };
  }

  signalWeight(strength) {
    return this.WEIGHTS[strength] || 1;
  }

  num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  percent(numerator, denominator, decimals = 1) {
    const a = this.num(numerator);
    const b = this.num(denominator);
    if (b <= 0) return 0;
    return this.round((a / b) * 100, decimals);
  }

  perGame(total, games, decimals = 2) {
    const a = this.num(total);
    const b = this.num(games);
    if (b <= 0) return 0;
    return this.round(a / b, decimals);
  }

  round(value, decimals = 2) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
}

module.exports = new ReasoningEngine();