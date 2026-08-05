// src/services/predictions.js
import { todayStr } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { footballApi } from './footballApi';
import { safeWrite } from './safeWrite';
import { PATHS } from '../utils/constants';

export async function savePrediction(uid, displayName, pred, h, a) {
  const matchId = String(pred.matchId || pred.id);
  const dateStr = pred.matchDate || pred._dateStr || todayStr();
  const predId = `${uid}_${matchId}`;

  const homeTeamName = typeof pred.homeTeam === 'object' ? pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home' : pred.homeTeam || 'Home';
  const awayTeamName = typeof pred.awayTeam === 'object' ? pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away' : pred.awayTeam || 'Away';
  const leagueName = typeof pred.league === 'object' ? pred.league?.name || 'Other' : pred.league || 'Other';

  const payload = {
    userId: uid,
    displayName: displayName || 'Anonymous',
    matchId,
    predId,
    homeScore: Number(h),
    awayScore: Number(a),
    matchDate: dateStr,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeLogo: pred.homeLogo || pred.homeTeam?.crest || pred.homeTeam?.logo || null,
    awayLogo: pred.awayLogo || pred.awayTeam?.crest || pred.awayTeam?.logo || null,
    league: leagueName,
    kickoff: pred.kickoff || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Send to backend (Backend saves locally, updates stats, and queues for Firestore)
  const res = await footballApi.saveUserPrediction(payload);

  if (res?.success) {
    eventBus.emit(EVENT.USER_PREDICTION_SAVED, {
      uid,
      matchId,
      predId,
      dateStr,
      homeScore: Number(h),
      awayScore: Number(a),
    });

    return {
      success: true,
      backend: true,
      queued: false,
      status: res.status,
    };
  }

  throw new Error('Backend prediction save failed');
}

export async function saveZokaVote(uid, matchId, vote) {
  const dateStr = todayStr();
  const fieldPath = `stats.${matchId}`;
  
  // Route through backend queue
  await safeWrite(PATHS.ZOKA_VOTE_STATS, dateStr, {
    [`${fieldPath}.agree`]: vote === 'agree' ? 1 : 0,
    [`${fieldPath}.disagree`]: vote === 'disagree' ? 1 : 0,
    [`${fieldPath}.total`]: 1,
    updatedAt: new Date().toISOString(),
    date: dateStr,
  }, { merge: true });
  
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote, dateStr });
}

export async function removeZokaVote(uid, matchId, newVote) {
  const dateStr = todayStr();
  const matchStats = { agree: 0, disagree: 0, total: 0 };
  
  // This logic is simplified for the queue; backend should ideally handle vote transitions atomically.
  // But for now, we just send the delta.
  if (newVote === 'agree') { matchStats.agree += 1; matchStats.total += 1; }
  else if (newVote === 'disagree') { matchStats.disagree += 1; matchStats.total += 1; }
  
  await safeWrite(PATHS.ZOKA_VOTE_STATS, dateStr, { 
    stats: { [matchId]: matchStats }, 
    updatedAt: new Date().toISOString() 
  }, { merge: true });
  
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote: newVote, dateStr });
}