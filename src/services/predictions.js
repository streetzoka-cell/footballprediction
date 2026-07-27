import { db } from '../utils/firebase';
import { 
  collection, query, where, doc, setDoc, getDoc, getDocs, writeBatch, 
  serverTimestamp, increment, runTransaction 
} from 'firebase/firestore';
import { todayStr, getWeekStart, getMonthStart } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { PATHS, calcPoints, RESULT_TYPE } from '../utils/constants';

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
  
  // Use dot notation to safely increment without overwriting sibling matches
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
  try { existing = JSON.parse(localStorage.getItem(key) || '{}'); } catch (err) {}
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

      batch.set(doc(db, 'prediction_results', `${uid}_${matchId}`), {
        userId: uid, matchId: String(matchId), predId: `${uid}_${matchId}`, matchDate: p.matchDate || dateKey,
        homeTeam: p.homeTeam || 'Home', awayTeam: p.awayTeam || 'Away', homeLogo: p.homeLogo || null, awayLogo: p.awayLogo || null,
        league: p.league || '', kickoff: p.kickoff || null, predictedHome: p.homeScore, predictedAway: p.awayScore,
        actualHome: numH, actualAway: numA, points, resultType, resolvedAt: serverTimestamp(),
      }, { merge: true });

      batch.set(doc(db, 'user_points_total', uid), {
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

function computeStats(entries) {
  if (!entries.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
  return {
    avg: (entries.reduce((s, u) => s + u.accuracy, 0) / entries.length).toFixed(1),
    preds: entries.reduce((s, u) => s + u.predictions, 0),
    exact: entries.reduce((s, u) => s + u.exact, 0),
    players: entries.length,
  };
}

function rankEntries(list) {
  return list
    .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
    .map((u, i) => ({
      ...u,
      rank: i + 1,
      accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0,
    }));
}

export async function rebuildDailySummary(dateStr) {
  if (!db) return;
  dateStr = dateStr || todayStr();
  try {
    const resultsSnap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('matchDate', '==', dateStr)));
    let predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('matchDate', '==', dateStr)));
    if (predsSnap.empty) predsSnap = await getDocs(query(collection(db, PATHS.USER_PREDICTIONS), where('userId', '!=', '')));
    const activeSnap = await getDocs(query(collection(db, PATHS.ACTIVE_PREDICTIONS), where('matchDate', '==', dateStr)));

    const scoreMap = {};
    activeSnap.docs.forEach((d) => { const p = d.data(); if (p.status === 'finished' && p.homeScore != null) scoreMap[String(p.matchId)] = { h: p.homeScore, a: p.awayScore }; });

    const userStats = {};
    resultsSnap.docs.forEach((d) => {
      const r = d.data();
      if (!userStats[r.userId]) userStats[r.userId] = { uid: r.userId, displayName: 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      const u = userStats[r.userId]; u.predictions++; u.resolved++; u.points += r.points || 0;
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++; else if (r.resultType === RESULT_TYPE.RESULT) u.result++; else u.miss++;
    });

    const resolvedIds = new Set(resultsSnap.docs.map((d) => String(d.data().matchId)));
    predsSnap.docs.forEach((d) => {
      const p = d.data(); if (p.matchDate && p.matchDate !== dateStr) return; const mid = String(p.matchId);
      if (resolvedIds.has(mid)) { if (userStats[p.userId]) userStats[p.userId].displayName = p.displayName || 'Player'; return; }
      if (!userStats[p.userId]) userStats[p.userId] = { uid: p.userId, displayName: p.displayName || 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      const u = userStats[p.userId]; u.predictions++; const actual = scoreMap[mid]; if (!actual) return; u.resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a); u.points += r.points;
      if (r.type === RESULT_TYPE.EXACT) u.exact++; else if (r.type === RESULT_TYPE.RESULT) u.result++; else u.miss++;
    });

    const entries = rankEntries(Object.values(userStats).filter((u) => u.predictions > 0));
    await setDoc(doc(db, PATHS.DAILY_LEADERBOARD, dateStr), { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), scoreMap, updatedAt: serverTimestamp(), date: dateStr });

    eventBus.emit(EVENT.DAILY_LEADERBOARD_UPDATED, { dateStr, entries });
    eventBus.emit(EVENT.PREDICTIONS_UPDATED, { dateStr });
  } catch (e) { console.error('[Summary] Rebuild failed:', e); }
}

export async function rebuildGoatLeaderboard() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, PATHS.USER_POINTS_TOTAL));
    const entries = rankEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => (u.predictionsCount || 0) > 0).map((u) => ({ uid: u.id, displayName: u.displayName || 'Player', points: u.totalPoints || 0, predictions: u.predictionsCount || 0, exact: u.exactCount || 0, result: u.resultCount || 0, miss: u.missCount || 0, resolved: u.predictionsCount || 0 })));
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, 'current'), { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), updatedAt: serverTimestamp() });
    eventBus.emit(EVENT.GOAT_LEADERBOARD_UPDATED, { entries });
  } catch (e) { console.error('[GOAT] Rebuild failed:', e); }
}

export async function rebuildPeriodLeaderboard(period, startDate) {
  if (!db) return;
  if (!startDate) { if (period === 'weekly') startDate = getWeekStart(); else if (period === 'monthly') startDate = getMonthStart(); else return; }
  const docId = period === 'goat' ? 'current' : period === 'weekly' ? `weekly_${startDate}` : `monthly_${startDate}`;
  try {
    const snap = await getDocs(query(collection(db, PATHS.PREDICTION_RESULTS), where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))));
    const userMap = {};
    snap.docs.forEach((d) => {
      const r = d.data(); if (!userMap[r.userId]) userMap[r.userId] = { uid: r.userId, displayName: 'Player', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      const u = userMap[r.userId]; u.predictions++; u.resolved++; u.points += r.points || 0;
      if (r.resultType === RESULT_TYPE.EXACT) u.exact++; else if (r.resultType === RESULT_TYPE.RESULT) u.result++; else u.miss++;
    });
    const entries = rankEntries(Object.values(userMap).filter((u) => u.predictions > 0));
    await setDoc(doc(db, PATHS.LEADERBOARD_SUMMARIES, docId), { entries, top3: entries.slice(0, 3), rest: entries.slice(3), stats: computeStats(entries), period, startDate, updatedAt: serverTimestamp() });
    eventBus.emit(EVENT.LEADERBOARD_UPDATED, { period, entries });
  } catch (e) { console.error(`[Period] Rebuild ${period} failed:`, e); }
}

export async function rebuildAllLeaderboards() {
  await Promise.all([rebuildDailySummary(todayStr()), rebuildGoatLeaderboard(), rebuildPeriodLeaderboard('weekly'), rebuildPeriodLeaderboard('monthly')]);
}