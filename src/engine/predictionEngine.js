// src/engine/predictionEngine.js
import { calcPoints, RESULT_TYPE } from '../utils/constants';

/**
 * Calculates user statistics based on predictions and resolved matches.
 */
export function calculateUserStats(userPredictions, activePredictions, liveFixtures) {
  let pts = 0, ex = 0, rs = 0, mi = 0, pred = 0;
  
  const matchesMap = new Map();
  activePredictions.forEach(p => matchesMap.set(String(p.matchId), p));
  
  liveFixtures.forEach(f => {
    const matchId = String(f.id);
    const existing = matchesMap.get(matchId);
    if (existing) {
      matchesMap.set(matchId, {
        ...existing,
        status: f.status || existing.status,
        homeScore: f.homeScore ?? existing.homeScore,
        awayScore: f.awayScore ?? existing.awayScore,
        isLive: f.isLive || existing.isLive,
        isFinished: f.isFinished || existing.isFinished,
      });
    }
  });

  userPredictions.forEach(p => {
    pred++;
    const match = matchesMap.get(String(p.matchId));
    if (match && match.isFinished && match.homeScore != null) {
      const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
      if (r.type !== RESULT_TYPE.PENDING) {
        pts += r.points;
        if (r.type === RESULT_TYPE.EXACT) ex++;
        else if (r.type === RESULT_TYPE.RESULT) rs++;
        else mi++;
      }
    }
  });
  
  return { pts, ex, rs, mi, pred };
}

/**
 * Merges live fixture data into active predictions to avoid duplicate UI renders.
 */
export function mergeLiveIntoPredictions(featuredPreds, fixtureMap) {
  if (!fixtureMap.size) return featuredPreds;
  let changed = false;
  const next = featuredPreds.map(p => {
    const fx = fixtureMap.get(String(p.matchId));
    if (fx) {
      const fxStatus = fx.status || p.status;
      const fxHome = fx.goalsHome ?? fx.homeScore ?? fx.score?.fullTime?.home ?? p.homeScore;
      const fxAway = fx.goalsAway ?? fx.awayScore ?? fx.score?.fullTime?.away ?? p.awayScore;
      const fxMinute = fx.minute ?? fx.elapsed ?? p.minute;
      const fxIsLive = fx.isLive || p.isLive;
      const fxIsFin = fx.isFinished || p.isFinished;
      
      if (p.status !== fxStatus || p.homeScore !== fxHome || p.awayScore !== fxAway || p.minute !== fxMinute || p.isLive !== fxIsLive || p.isFinished !== fxIsFin) {
        changed = true;
        return { ...p, status: fxStatus, homeScore: fxHome, awayScore: fxAway, minute: fxMinute, isLive: fxIsLive, isFinished: fxIsFin };
      }
    }
    return p;
  });
  return changed ? next : featuredPreds;
}