// src/services/predictions.js
import { db } from '../utils/firebase';
import { 
  collection, query, where, doc, setDoc, getDoc, getDocs, writeBatch, 
  serverTimestamp, increment, runTransaction 
} from 'firebase/firestore';
import { todayStr, getWeekStart, getMonthStart } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { PATHS, calcPoints } from '../utils/constants';
import { buildDailySummaryData, buildPeriodSummaryData } from '../engine/leaderboardEngine';

export async function savePrediction(uid, displayName, pred, h, a) {
  if (!db) throw new Error('Firestore not initialized');
  const matchId = String(pred.matchId || pred.id);
  const dateStr = pred.matchDate || pred._dateStr || todayStr();
  const predId = `${uid}_${matchId}`;

  const homeTeamName = typeof pred.homeTeam === 'object' ? (pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home') : (pred.homeTeam || 'Home');
  const awayTeamName = typeof pred.awayTeam === 'object' ? (pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away') : (pred.awayTeam || 'Away');
  const leagueName = typeof pred.league === 'object' ? (pred.league?.name || 'Other') : (pred.league || 'Other');

  await setDoc(doc(db, PATHS.USER_PREDICTIONS, predId), {
    userId: uid, displayName: displayName || 'Anonymous', matchId, predId,
    homeScore: Number(h), awayScore: Number(a), matchDate: dateStr,
    homeTeam: homeTeamName, awayTeam: awayTeamName,
    homeLogo: pred.homeLogo || pred.homeTeam?.crest || pred.homeTeam?.logo || null,
    awayLogo: pred.awayLogo || pred.awayTeam?.crest || pred.awayTeam?.logo || null,
    league: leagueName, kickoff: pred.kickoff || null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }, { merge: true });

  eventBus.emit(EVENT.USER_PREDICTION_SAVED, { uid, matchId, predId, dateStr, homeScore: Number(h), awayScore: Number(a) });
}

export async function saveZokaVote(uid, matchId, vote) {
  if (!db) return;
  const dateStr = todayStr();
  const voteRef = doc(db, PATHS.ZOKA_VOTE_STATS, dateStr);
  const fieldPath = `stats.${matchId}`;
  await setDoc(voteRef, {
    [`${fieldPath}.agree`]: increment(vote === 'agree' ? 1 : 0),
    [`${fieldPath}.disagree`]: increment(vote === 'disagree' ? 1 : 0),
    [`${fieldPath}.total`]: increment(1),
    updatedAt: serverTimestamp(),
    date: dateStr,
  }, { merge: true });
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote, dateStr });
}

export async function removeZokaVote(uid, matchId, newVote) {
  if (!db) return;
  const dateStr = todayStr();
  const key = `zoka_votes_${dateStr}`;
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
  const oldV = existing[matchId];

  await runTransaction(db, async (transaction) => {
    const ref = doc(db, PATHS.ZOKA_VOTE_STATS, dateStr);
    const snap = await transaction.get(ref);
    const current = snap.exists() ? snap.data().stats?.[matchId] : null;
    if (!current) return;
    const matchStats = { ...current };
    if (oldV === 'agree') { matchStats.agree = Math.max(0, (matchStats.agree || 1) - 1); matchStats.total = Math.max(0, (matchStats.total || 1) - 1); } 
    else if (oldV === 'disagree') { matchStats.disagree = Math.max(0, (matchStats.disagree || 1) - 1); matchStats.total = Math.max(0, (matchStats.total || 1) - 1); }
    if (newVote) {
      if (newVote === 'agree') matchStats.agree = (matchStats.agree || 0) + 1;
      else matchStats.disagree = (matchStats.disagree || 0) + 1;
      matchStats.total = (matchStats.total || 0) + 1;
    }
    transaction.set(ref, { stats: { [matchId]: matchStats }, updatedAt: serverTimestamp() }, { merge: true });
  });
  eventBus.emit(EVENT.ZOKA_VOTE_CAST, { matchId, vote: newVote, dateStr });
}

const _resolvingNow = new Set();

export async function resolveMatchForAllUsers(matchId, actualH, actualA, matchDate) {
  if (!db) return 0;
  if (_resolvingNow.has(matchId)) return 0;
  _resolvingNow.add(matchId);

  try {
    const dateKey = matchDate || todayStr();
    const numH = Number(actualH), numA = Number(actualA);
    if (isNaN(numH) || isNaN(numA)) return 0;

    // 1. Prevent double resolution
    const statusRef = doc(db, PATHS.MATCH_RESOLUTION_STATUS, dateKey);
    let alreadyResolved = false;
    await runTransaction(db, async (transaction) => {
      const statusSnap = await transaction.get(statusRef);
      const resolvedMatches = statusSnap.exists() ? statusSnap.data().resolvedMatches || [] : [];
      if (resolvedMatches.includes(String(matchId))) { alreadyResolved = true; return; }
      resolvedMatches.push(String(matchId));
      transaction.set(statusRef, { resolvedMatches, lastResolvedAt: serverTimestamp(), date: dateKey }, { merge: true });
    });
    if (alreadyResolved) return 0;

    // 2. Fetch and calculate points for all users
    const predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('matchId', '==', String(matchId))));
    if (predsSnap.empty) return 0;

    const resolvedList = [];
    let batch = writeBatch(db);
    let ops = 0;
    
    predsSnap.forEach((d) => {
      const p = d.data();
      const uid = p.userId;
      const r = calcPoints(p.homeScore, p.awayScore, numH, numA);
      const points = r.points ?? 0;
      const resultType = r.type ?? 'miss';

      resolvedList.push({ userId: uid, displayName: p.displayName || 'Player', matchId: String(matchId), points, resultType, actualH: numH, actualA: numA });

      batch.set(doc(db, PATHS.PREDICTION_RESULTS, `${uid}_${matchId}`), {
        userId: uid, matchId: String(matchId), predId: `${uid}_${matchId}`, matchDate: p.matchDate || dateKey,
        homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away', homeLogo: p.homeLogo || null, awayLogo: p.awayLogo || null,
        league: p.league || '', kickoff: p.kickoff || null, predictedHome: p.homeScore, predictedAway: p.awayScore,
        actualHome: numH, actualAway: numA, points, resultType, resolvedAt: serverTimestamp(),
      }, { merge: true });

      batch.set(doc(db, PATHS.USER_POINTS_TOTAL, uid), {
        totalPoints: increment(points), exactCount: increment(resultType === 'exact' ? 1 : 0),
        resultCount: increment(resultType === 'result' ? 1 : 0), missCount: increment(resultType === 'miss' ? 1 : 0),
        predictionsCount: increment(1), updatedAt: serverTimestamp(),
      }, { merge: true });
      
      ops += 2;
      if (ops >= 450) { 
        batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    });

    if (ops > 0) await batch.commit();

    // 3. Update Zoka Picks meta if this match was a Zoka Pick
    const metaBatch = writeBatch(db);
    const zokaSnap = await getDoc(doc(db, PATHS.ZOKA_PICKS, dateKey));
    let zokaChanged = false;
    if (zokaSnap.exists()) {
      const zokaData = zokaSnap.data();
      const matches = zokaData.matches || [];
      const updated = matches.map((m) => {
        if (String(m.matchId) === String(matchId) && m.status !== 'finished') { zokaChanged = true; return { ...m, homeScore: numH, awayScore: numA, status: 'finished' }; }
        return m;
      });
      if (zokaChanged) metaBatch.set(doc(db, PATHS.ZOKA_PICKS, dateKey), { ...zokaData, matches: updated, updatedAt: serverTimestamp() }, { merge: true });
    }
    try { await metaBatch.commit(); } catch (err) { console.error('[Resolver] Meta batch failed:', err); }

    eventBus.emit(EVENT.MATCH_RESOLVED, {
      matchId: String(matchId), dateStr: dateKey, actualH: numH, actualA: numA,
      results: resolvedList, affectedUsers: resolvedList.map((r) => r.userId),
    });

    return resolvedList.length;
  } catch (e) {
    console.error('[Resolver] Failed for match', matchId, e);
    return 0;
  } finally {
    _resolvingNow.delete(matchId);
  }
}

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();
  try {
    const resultsSnap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('matchDate', '==', dateStr)));
    let predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('matchDate', '==', dateStr)));
    if (predsSnap.empty) predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '!=', '')));
    const activeSnap = await getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr)));

    const summaryData = buildDailySummaryData(resultsSnap, predsSnap, activeSnap);
    
    await setDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr), {
      ...summaryData,
      updatedAt: serverTimestamp(),
      date: dateStr
    });

    eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries: summaryData.entries });
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr });
  } catch (e) { console.error('[Summary] Rebuild failed:', e); }
}

export async function rebuildGoatLeaderboard() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, PATHS.USER_POINTS_TOTAL));
    const mappedList = snap.docs.map((d) => {
      const u = d.data();
      return {
        uid: d.id,
        displayName: u.displayName || 'Player',
        points: u.totalPoints || 0,
        predictions: u.predictionsCount || 0,
        exact: u.exactCount || 0,
        result: u.resultCount || 0,
        miss: u.missCount || 0,
        resolved: u.predictionsCount || 0
      };
    }).filter((u) => u.predictions > 0);

    const summaryData = buildPeriodSummaryData({ docs: mappedList.map(u => ({ data: () => u })) }, 'goat', null);
    
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'), {
      ...summaryData,
      updatedAt: serverTimestamp()
    });
    eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries: summaryData.entries });
  } catch (e) { console.error('[GOAT] Rebuild failed:', e); }
}

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;
  if (!startDate) {
    if (period === 'weekly') startDate = getWeekStart();
    else if (period === 'monthly') startDate = getMonthStart();
    else return;
  }
  const docId = period === 'goat' ? 'current' : `${period}_${startDate}`;
  try {
    const snap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))));
    const summaryData = buildPeriodSummaryData(snap, period, startDate);
    
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId), {
      ...summaryData,
      updatedAt: serverTimestamp()
    });
    eventBus.emit(EVENT.LEADERBOARD_UPDATED, { period, entries: summaryData.entries });
  } catch (e) { console.error(`[Period] Rebuild ${period} failed:`, e); }
}

export async function rebuildAllLeaderboards() {
  await Promise.all([
    rebuildDailySummary(todayStr()),
    rebuildGoatLeaderboard(),
    rebuildPeriodLeaderboard('weekly'),
    rebuildPeriodLeaderboard('monthly')
  ]);
}