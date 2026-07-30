// src/engine/predictionEngine.js
import { calcPoints, RESULT_TYPE } from '../utils/constants';

export function mergeLiveIntoPredictions(preds, fixtureMap) {
  if (!preds || !fixtureMap) return preds || [];
  return preds.map(p => {
    const fx = fixtureMap.get(String(p.matchId));
    if (!fx) return p;
    
    if (fx.isFinished && fx.homeScore != null) {
      return { ...p, homeScore: fx.homeScore, awayScore: fx.awayScore, status: 'finished', isFinished: true, minute: fx.displayMinute };
    }
    if (fx.isLive) {
      return { ...p, homeScore: fx.homeScore, awayScore: fx.awayScore, status: 'live', isLive: true, minute: fx.displayMinute };
    }
    if (fx.status === 'PST' || fx.status === 'CANC' || fx.status === 'SUSP') {
      return { ...p, status: fx.status };
    }
    return p;
  });
}

export function calculateUserStats(userPredictions, activePredictions, results) {
  let pts = 0, ex = 0, rs = 0, mi = 0, pred = 0, resolved = 0;
  let currentStreak = 0; // ★ NEW: Streak tracking
  
  const matchesMap = new Map();
  activePredictions.forEach(p => matchesMap.set(String(p.matchId), p));
  
  // Sort predictions by date to calculate streak accurately
  const sortedPreds = [...userPredictions].sort((a, b) => (a.matchDate || '').localeCompare(b.matchDate || ''));
  
  sortedPreds.forEach(p => {
    pred++;
    const match = matchesMap.get(String(p.matchId));
    if (match && (match.isFinished || match.status === 'finished') && match.homeScore != null) {
      const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
      if (r.type !== RESULT_TYPE.PENDING) {
        resolved++;
        pts += r.points;
        
        if (r.type === RESULT_TYPE.EXACT) {
          ex++;
          currentStreak++; // ★ Increment streak on exact score
        } else if (r.type === RESULT_TYPE.RESULT) {
          rs++;
          currentStreak++; // ★ Increment streak on correct result
        } else {
          mi++;
          currentStreak = 0; // ★ Reset streak on miss
        }
      }
    }
  });
  
  return { 
    pts, ex, rs, mi, pred, resolved,
    pn: pred - resolved,
    streak: currentStreak, // ★ Expose streak
    accuracy: pred > 0 ? Math.round((resolved / pred) * 100) : 0,
    allResolved: pred > 0 && resolved === pred
  };
}