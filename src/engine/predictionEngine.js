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
  let currentStreak = 0;
  
  const matchesMap = new Map();
  activePredictions.forEach(p => matchesMap.set(String(p.matchId), p));
  
  // ★ CRITICAL FIX: Sort predictions chronologically for accurate streak calculation
  const sortedPreds = [...userPredictions].sort((a, b) => {
    const dateA = a.matchDate || '';
    const dateB = b.matchDate || '';
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return (a.kickoff || '').localeCompare(b.kickoff || '');
  });
  
  sortedPreds.forEach(p => {
    pred++;
    const match = matchesMap.get(String(p.matchId));
    
    // Check if match is finished and has scores
    if (match && (match.isFinished || match.status === 'finished') && match.homeScore != null) {
      const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
      if (r.type !== RESULT_TYPE.PENDING) {
        resolved++;
        pts += r.points || 0;
        
        if (r.type === RESULT_TYPE.EXACT) {
          ex++;
          currentStreak++;
        } else if (r.type === RESULT_TYPE.RESULT) {
          rs++;
          currentStreak++;
        } else {
          mi++;
          currentStreak = 0; // Reset streak on miss
        }
      }
    }
  });
  
  // ★ CRITICAL FIX: Professional accuracy calculation: (Exact + Result) / Resolved * 100
  const accuracy = resolved > 0 ? Math.round(((ex + rs) / resolved) * 100) : 0;
  
  return { 
    pts, 
    ex, 
    rs, 
    mi, 
    pred, 
    resolved,
    pn: pred - resolved,
    streak: currentStreak,
    accuracy,
    allResolved: pred > 0 && resolved === pred
  };
}