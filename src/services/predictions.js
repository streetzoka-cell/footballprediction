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
    matchId, predId,
    homeScore: Number(h),
    awayScore: Number(a),
    matchDate: dateStr,
    homeTeam: homeTeamName,
    awayTeam: awayTeamName,
    homeLogo: pred.homeLogo || pred.homeTeam?.crest || pred.homeTeam?.logo || null,
    awayLogo: pred.awayLogo || pred.awayTeam?.crest || pred.awayTeam?.logo || null,
    league: leagueName,
    kickoff: pred.kickoff || pred.utcDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const res = await footballApi.saveUserPrediction(payload);
  if (!res?.success) throw new Error('Backend prediction save failed');

  eventBus.emit(EVENT.USER_PREDICTION_SAVED, { uid, matchId, predId, dateStr, homeScore: Number(h), awayScore: Number(a) });
  return { success: true, backend: true, status: res.status };
}

export async function saveZokaVote(uid, matchId, vote) {
  const dateStr = todayStr();
  await safeWrite(PATHS.ZOKA_VOTE_STATS, dateStr, {
    [`stats.${matchId}.agree`]: vote === 'agree' ? 1 : 0,
    [`stats.${matchId}.disagree`]: vote === 'disagree' ? 1 : 0,
    [`stats.${matchId}.total`]: 1,
    [`stats.${matchId}.lastVote`]: vote,
    [`stats.${matchId}.voter`]: uid,
    updatedAt: new Date().toISOString(),
    date: dateStr,
  }, { merge: true });
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote, dateStr, uid });
}

export async function removeZokaVote(uid, matchId, newVote) {
  const dateStr = todayStr();
  await safeWrite(PATHS.ZOKA_VOTE_STATS, dateStr, {
    [`stats.${matchId}`]: { agree: newVote === 'agree' ? 1 : 0, disagree: newVote === 'disagree' ? 1 : 0, total: 1, lastVote: newVote, voter: uid },
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote: newVote, dateStr, uid });
}

// Back-compat aliases
export const saveUserPrediction = savePrediction;
