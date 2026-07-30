// src/engine/matchEngine.js
import { getLocalDateFromUtc, formatTime } from '../utils/dates';

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
  let minute = display.minute;

  // ANTI-STUCK LOGIC
  if (isLive && raw.timestamp) {
    const matchStartTime = raw.timestamp * 1000; 
    const elapsed = now - matchStartTime;
    const threeAndHalfHoursMs = 3.5 * 60 * 60 * 1000; 
    
    if (elapsed > threeAndHalfHoursMs) {
      isLive = false;
      isFinished = true;
      status = 'FT';
    }
  }

  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    utcDate: raw.utcDate || raw.date, 
    dateStr: matchDateStr, 
    timestamp: raw.timestamp,
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
    lastUpdated: raw.dataQuality?.lastUpdated || null,
    isHidden: false, 
    
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

// ★ FIX: Bulletproof Smart Minute Calculator
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;
  
  if (m.isFinished) {
    return { ...m, displayMinute: 90, minute: 90, isLive: false, isHT: false };
  }

  const statusUpper = (m.status || '').toUpperCase();
  
  // 1. NEVER force live if postponed/canceled
  const isInactive = statusUpper === 'PST' || statusUpper === 'SUSP' || statusUpper === 'INT' || statusUpper === 'CANC' || statusUpper === 'ABD' || statusUpper === 'POSTP' || statusUpper === 'TBD' || statusUpper === 'PENDING';
  if (isInactive) return m;

  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedMs = now - matchStartTime;
  
  // ★ FIX 2: If kickoff is in the future, force it to be Scheduled (NS)
  // This fixes the bug where a delayed match (moved to 4 PM) still shows as "HT" or "1H" 
  // because the API forgot to clear the old status.
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

  const elapsedMins = Math.floor(elapsedMs / 60000);

  let smartMinute = m.minute || 0;
  let status = statusUpper;
  let isHT = false;
  let isLive = true; // Default to true for active phases
  let isFinished = false;

  if (elapsedMins >= 105) {
    smartMinute = 90;
    status = 'FT';
    isFinished = true;
    isLive = false;
    isHT = false;
  } else if (elapsedMins > 90) {
    smartMinute = 90;
    status = '2H';
    isLive = true;
    isHT = false;
  } else if (elapsedMins > 60) {
    smartMinute = 45 + (elapsedMins - 60);
    status = '2H';
    isLive = true;
    isHT = false;
  } else if (elapsedMins > 50) {
    smartMinute = 45;
    status = 'HT';
    // ★ FIX 1: HT matches ARE live. Keep them in the live list and count!
    isHT = true;
    isLive = true; 
  } else if (elapsedMins > 45) {
    smartMinute = 45;
    status = '1H';
    isLive = true;
    isHT = false;
  } else {
    smartMinute = elapsedMins;
    status = '1H';
    isLive = true;
    isHT = false;
  }

  // Prevent jumping backwards
  if (m.minute && m.minute > smartMinute && !isFinished) {
    smartMinute = m.minute;
  }
  
  // If API explicitly says HT, respect it over our time guess
  if (statusUpper === 'HT') {
    isHT = true; 
    isLive = true; // HT is live
    smartMinute = 45;
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: isLive,
    isFinished: isFinished,
    isStarted: isLive && !isHT // isStarted is false during HT, but isLive is true
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;