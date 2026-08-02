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
  let status = raw.status || display.status;
  let minute = display.minute || raw.minute || 0;
  let isHidden = false;

  // Fallback timestamp calculation from utcDate
  let timestamp = raw.timestamp;
  if (!timestamp) {
    const dateStr = raw.utcDate || raw.date;
    if (dateStr) {
      const parsed = new Date(dateStr).getTime();
      if (!isNaN(parsed)) timestamp = Math.floor(parsed / 1000);
    }
  }

  // Hard caps to prevent stuck live matches (3.5 hours max)
  const FT_THRESHOLD_MS = 3.5 * 60 * 60 * 1000; 
  const HIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000; 

  if (timestamp) {
    const matchStartTime = timestamp * 1000;
    const elapsed = now - matchStartTime;

    if (elapsed > HIDE_THRESHOLD_MS && (isLive || status === '90' || status === '2H')) {
      isHidden = true;
      isLive = false;
      isFinished = false;
      status = 'HIDDEN';
    } else if (elapsed > FT_THRESHOLD_MS && isLive) {
      isLive = false;
      isFinished = true;
      status = 'FT';
      minute = 90;
    }
  }

  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');

  // ★ CRITICAL: Get the exact time the backend received this update
  const updatedAt = raw.dataQuality?.lastUpdated || raw.lastUpdated || raw.updatedAt || null;

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    utcDate: raw.utcDate || raw.date,
    dateStr: matchDateStr, 
    localDateStr: toLocalDateStr(raw.utcDate || raw.date), 
    timestamp: timestamp,
    kickoff: kickoffTime,
    kickoffUtc: raw.kickoffUtc || raw.utcDate || raw.date,
    status: status,
    statusLong: raw.statusLong,
    isLive: isLive,
    isFinished: isFinished,
    isScheduled: display.isUpcoming || false,
    isHT: display.isHalfTime || status === 'HT',
    isStarted: isLive && !display.isHalfTime,
    minute: minute,
    displayMinute: minute,
    updatedAt: updatedAt, // ★ NEW: Pass this to the frontend for hybrid calculation
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

// ★ NEW: Format minute to show stoppage time correctly (45+1', 90+3')
export function formatMinute(min, status) {
  if (status === 'HT') return 'HT';
  if (status === 'FT' || status === 'AET' || status === 'PEN') return 'FT';
  if (status === 'NS' || status === 'TBD' || status === 'PST') return '';
  
  min = Math.max(0, min);
  
  // 1st Half Stoppage Time
  if (status === '1H' && min > 45) {
    return `45+${min - 45}'`;
  }
  
  // 2nd Half Stoppage Time
  if (status === '2H' && min > 90) {
    return `90+${min - 90}'`;
  }
  
  // Extra Time Stoppage Time
  if (status === 'ET') {
    if (min > 105 && min <= 110) return `105+${min - 105}'`;
    if (min > 120) return `120+${min - 120}'`;
  }
  
  return `${min}'`;
}

// ★ NEW: Hybrid Smart Minute Calculator
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;

  const status = String(m.status || "").toUpperCase();

  // 1. Freeze clock for non-play states (NS, HT, FT, INTERRUPTED, SUSPENDED, etc.)
  const frozenStatuses = ['FT', 'AET', 'PEN', 'NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP', 'SUSP', 'INT', 'PENDING', 'HT'];
  
  if (frozenStatuses.includes(status) || m.isFinished) {
    let displayMin = m.minute;
    if (status === 'FT' || status === 'AET' || status === 'PEN' || m.isFinished) displayMin = 90;
    if (status === 'HT') displayMin = 45;
    if (status === 'NS' || status === 'TBD' || status === 'PST') displayMin = 0;
    
    return { 
      ...m, 
      displayMinute: displayMin, 
      isLive: status === 'HT' || status === 'INT' || status === 'SUSP', // Interrupted is technically "live" but frozen
      isHT: status === 'HT',
      isStarted: !['NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP'].includes(status)
    };
  }

  // 2. Match is LIVE (1H, 2H, ET, P) -> Calculate local minute
  const apiMinute = m.minute || 0;
  let smartMinute = apiMinute;

  // ★ RESYNC LOGIC: Anchor strictly to updatedAt timestamp from backend
  if (m.updatedAt) {
    const lastUpdateTime = new Date(m.updatedAt).getTime();
    if (!isNaN(lastUpdateTime) && lastUpdateTime > 0) {
      const elapsedSinceUpdateMs = now - lastUpdateTime;
      
      // Only count forward if time has passed
      if (elapsedSinceUpdateMs > 0) {
        const elapsedMins = Math.floor(elapsedSinceUpdateMs / 60000);
        smartMinute = apiMinute + elapsedMins;
      }
    }
  }

  // 3. Cap the minutes based on status to prevent infinite counting
  if (status === '1H') {
    smartMinute = Math.min(smartMinute, 50); // Cap at 45+5
  } else if (status === '2H' || status === 'LIVE') {
    smartMinute = Math.min(smartMinute, 95); // Cap at 90+5
  } else if (status === 'ET') {
    smartMinute = Math.min(smartMinute, 125); // Cap at 120+5
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isLive: true,
    isFinished: false,
    isHT: false,
    isStarted: true
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;