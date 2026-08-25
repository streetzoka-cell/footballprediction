import { calcPoints, RESULT_TYPE } from '../utils/constants';

export function mergeLiveIntoPredictions(preds, fixtureMap) {
  if (!preds?.length || !fixtureMap) return preds || [];
  return preds.map(p => {
    const fx = fixtureMap.get(String(p.matchId));
    if (!fx) return p;
    if (fx.isFinished && fx.homeScore != null) {
      return { ...p, homeScore: fx.homeScore, awayScore: fx.awayScore, status: 'finished', isFinished: true, minute: fx.displayMinute };
    }
    if (fx.isLive) {
      return { ...p, homeScore: fx.homeScore, awayScore: fx.awayScore, status: 'live', isLive: true, minute: fx.displayMinute };
    }
    if (['PST', 'CANC', 'SUSP', 'POSTP'].includes(fx.status)) return { ...p, status: fx.status };
    return p;
  });
}

export function calculateUserStats(userPredictions, activePredictions, results) {
  let pts = 0, ex = 0, rs = 0, mi = 0, pred = 0, resolved = 0;
  let currentStreak = 0, maxStreak = 0;

  const matchesMap = new Map();
  (activePredictions || []).forEach(p => matchesMap.set(String(p.matchId), p));

  const sorted = [...(userPredictions || [])].sort((a, b) => {
    const da = a.matchDate || '', db = b.matchDate || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.kickoff || '').localeCompare(String(b.kickoff || ''));
  });

  sorted.forEach(p => {
    pred++;
    const match = matchesMap.get(String(p.matchId));
    if (!match) return;
    if ((match.isFinished || match.status === 'finished') && match.homeScore != null) {
      const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
      if (r.type !== RESULT_TYPE.PENDING) {
        resolved++;
        pts += r.points || 0;
        if (r.type === RESULT_TYPE.EXACT) { ex++; currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else if (r.type === RESULT_TYPE.RESULT) { rs++; currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
        else { mi++; currentStreak = 0; }
      }
    }
  });

  return {
    pts, ex, rs, mi, pred, resolved,
    pn: pred - resolved,
    streak: currentStreak,
    maxStreak,
    accuracy: resolved > 0 ? Math.round(((ex + rs) / resolved) * 100) : 0,
    allResolved: pred > 0 && resolved === pred,
  };
}
