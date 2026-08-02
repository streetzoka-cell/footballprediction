// footballprediction/src/engine/matchEngine.js

import { getLocalDateFromUtc, formatTime, toLocalDateStr } from '../utils/dates';

export function normalizeMatch(raw, isPrimary = true, now = Date.now()) {
  if (!raw) return null;

  const display = raw.display || {};
  const time = raw.time || {};
  const score = display.score || {};

  const homeName = raw.homeName || raw.homeTeam?.name || 'TBD';
  const awayName = raw.awayName || raw.awayTeam?.name || 'TBD';
  const homeLogo = raw.homeLogo || raw.homeTeam?.crest || null;
  const awayLogo = raw.awayLogo || raw.awayTeam?.crest || null;
  const leagueName = raw.leagueName || raw.league?.name || raw.competition?.name || 'Other';
  const leagueLogo = raw.leagueLogo || raw.league?.emblem || raw.competition?.emblem || null;

  let isLive = display.isLive || false;
  let isFinished = display.isFinished || false;
  let status = raw.status;
  let minute = display.minute || raw.minute || 0;
  let isHidden = false;

  // ★ FIX: Fallback timestamp calculation from utcDate
  let timestamp = raw.timestamp;
  if (!timestamp) {
    const dateStr = raw.utcDate || raw.date;
    if (dateStr) {
      const parsed = new Date(dateStr).getTime();
      if (!isNaN(parsed)) timestamp = Math.floor(parsed / 1000);
    }
  }

  // ★ FIX: Increased thresholds to 3.5 hours to prevent delayed matches from forcing FT early
  const FT_THRESHOLD_MS = 3.5 * 60 * 60 * 1000;        // 3.5h — hard cap force FT
  const STUCK_LIVE_MS = 3 * 60 * 60 * 1000;            // 3h — if at 90' for a long time, force FT
  const HIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;       // 24h — hide completely

  if (timestamp) {
    const matchStartTime = timestamp * 1000;
    const elapsed = now - matchStartTime;

    if (elapsed > HIDE_THRESHOLD_MS && (isLive || status === '90' || status === '2H')) {
      isHidden = true;
      isLive = false;
      isFinished = false;
      status = 'HIDDEN';
    }
    // ★ If minute already at 90' and elapsed > 3h → FT NOW
    else if (isLive && (minute >= 90 || status === '90' || status === '2H') && elapsed > STUCK_LIVE_MS) {
      isLive = false;
      isFinished = true;
      status = 'FT';
      minute = 90;
    }
    // Hard cap: any match older than 3.5h → FT
    else if (elapsed > FT_THRESHOLD_MS && isLive) {
      isLive = false;
      isFinished = true;
      status = 'FT';
      minute = 90;
    }
  }

  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    utcDate: raw.utcDate || raw.date,

    dateStr: matchDateStr,                              // UTC — backend key (do not change)
    localDateStr: toLocalDateStr(raw.utcDate || raw.date), // LOCAL — for display bucketing
    timestamp: timestamp, // ★ FIX: Use calculated timestamp
    kickoff: kickoffTime,
    kickoffUtc: raw.kickoffUtc || raw.utcDate || raw.date,
    status: status,
    statusLong: raw.statusLong,
    isLive: isLive,
    isFinished: isFinished,
    isScheduled: display.isUpcoming || false,
    isHT: display.isHalfTime || false,
    isStarted: isLive && !display.isHalfTime,
    minute: minute,
    displayMinute: minute,
    lastUpdated: raw.dataQuality?.lastUpdated || raw.lastUpdated || null, // ★ FIX: ensure lastUpdated is captured
    isHidden: isHidden,

    homeTeamId: raw.homeTeamId,
    homeName: homeName,
    homeTeamName: homeName,
    homeTeamLogo: homeLogo,
    homeLogo: homeLogo,
    awayTeamId: raw.awayTeamId,
    awayName: awayName,
    awayTeamName: awayName,
    awayTeamLogo: awayLogo,
    awayLogo: awayLogo,
    homeScore: score.home,
    awayScore: score.away,
    goalsHome: score.home,
    goalsAway: score.away,
    leagueId: raw.leagueId,
    leagueName: leagueName,
    leagueLogo: leagueLogo,
    leagueCountry: raw.leagueCountry,
    matchScore: raw.importance || 0,
    category: raw.category || 'NORMAL',

    homeTeam: { name: homeName, shortName: homeName, crest: homeLogo, id: raw.homeTeamId },
    awayTeam: { name: awayName, shortName: awayName, crest: awayLogo, id: raw.awayTeamId },
    league: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
    competition: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
  };
}

// ★ Bulletproof Smart Minute Calculator (SAFETY CHECK & RESET ADDED)
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;

  if (m.isFinished) {
    return { ...m, displayMinute: 90, minute: 90, isLive: false, isHT: false };
  }

  const statusUpper = String(m.status || "").toUpperCase();

  if (['PST', 'SUSP', 'INT', 'CANC', 'ABD', 'POSTP', 'TBD', 'PENDING', 'NS'].includes(statusUpper)) {
    return m;
  }

  // If we don't have a timestamp, we can't calculate smart minute
  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedMs = now - matchStartTime;

  if (elapsedMs < 0) {
    return {
      ...m,
      isLive: false,
      isHT: false,
      isFinished: false,
      isStarted: false,
      status: 'NS',
      minute: 0,
      displayMinute: 0
    };
  }

  const apiMinute = m.minute || 0;
  let smartMinute = 0;
  let status = statusUpper;
  let isHT = m.isHT || false;
  let isLive = true; // ★ FIX: If we are calculating smart minute, the match MUST be live

  // 1. If API provides a minute > 0, ALWAYS anchor to it and the lastUpdated time
  if (apiMinute > 0) {
    // ★ RESET: Start exactly at the API's latest minute
    smartMinute = apiMinute;
    
    if (m.lastUpdated) {
      const lastUpdateTime = new Date(m.lastUpdated).getTime();
      if (!isNaN(lastUpdateTime) && lastUpdateTime > 0) {
        const elapsedSinceUpdateMs = now - lastUpdateTime;
        
        // ★ SAFETY CHECK: Only count forward from the last update
        if (elapsedSinceUpdateMs > 0) {
          const extraMins = Math.floor(elapsedSinceUpdateMs / 60000);
          smartMinute += extraMins;
        }
      }
    }
  } else {
    // 2. API Minute is 0 (missing data). Calculate purely from kickoff time.
    const elapsedMins = Math.floor(elapsedMs / 60000);

    if (elapsedMins > 60) {
      smartMinute = 45 + (elapsedMins - 60); // = elapsed - 15 (halftime subtracted)
      status = '2H';
    } else if (elapsedMins > 50) {
      smartMinute = 45;
      status = 'HT';
      isHT = true;
      isLive = false; // HT is technically not live play
    } else if (elapsedMins > 45) {
      smartMinute = 45;
      status = '1H';
    } else {
      smartMinute = elapsedMins;
      status = '1H';
    }
  }

  if (statusUpper === 'HT') {
    isHT = true;
    isLive = false;
    smartMinute = 45;
    status = 'HT';
  }

  // Cap at 90 minutes unless it's Extra Time or Penalties
  if (smartMinute > 90 && statusUpper !== 'ET' && statusUpper !== 'P') {
    smartMinute = 90;
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: isLive,
    isFinished: false,
    isStarted: !isHT
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;