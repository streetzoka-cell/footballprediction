// src/engine/matchEngine.js
import { getLocalDateFromUtc, formatTime } from '../utils/dates'; // ★ FIX: Import formatTime

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

  // ★ FIX: Use API dateStr if available, otherwise parse UTC
  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  
  // ★ FIX: Properly format kickoff time to HH:MM
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    utcDate: raw.utcDate || raw.date, 
    dateStr: matchDateStr, // ★ FIX: Use safe dateStr
    timestamp: raw.timestamp,
    kickoff: kickoffTime, // ★ FIX: Use formatted time
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


// Smart Minute Calculator & Dropper
export function applySmartMinute(m, now = Date.now()) {
  if (!m || m.isFinished) return m;

  // ★ FIX: If the match is Postponed (PST), Suspended (SUSP), Interrupted (INT), or Canceled (CANC), 
  // respect the backend status and DO NOT force it live based on kickoff time.
  const statusUpper = (m.status || '').toUpperCase();
  const isInactive = statusUpper === 'PST' || statusUpper === 'SUSP' || statusUpper === 'INT' || statusUpper === 'CANC' || statusUpper === 'ABD' || statusUpper === 'POSTP';
  if (isInactive) {
    return m; 
  }

  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedMs = now - matchStartTime;
  
  // If the match hasn't started yet (kickoff is in the future), do not force it live.
  if (elapsedMs < 0 && !m.isLive && !m.isHT) {
    return m;
  }

  const elapsedSinceKickoffMins = Math.floor(elapsedMs / 60000);

  let smartMinute = m.minute || 0;
  let status = m.status;
  let isHT = m.isHT;
  let isLive = m.isLive;
  let isFinished = m.isFinished;
  let isHidden = m.isHidden || false;

  const isExtendedTime = status === 'ET' || status === 'P' || status === 'BREAK' || status === 'BT';

  if (!isExtendedTime) {
    if (elapsedSinceKickoffMins >= 98) {
      // Force FT after 98 minutes. 
      smartMinute = 90;
      status = 'FT';
      isLive = false;
      isHT = false;
      isFinished = true;
    } else if (elapsedSinceKickoffMins > 90) {
      smartMinute = 90;
      status = '2H';
      isLive = true;
      isHT = false;
    } else if (elapsedSinceKickoffMins > 60) {
      smartMinute = 45 + (elapsedSinceKickoffMins - 60);
      status = '2H';
      isLive = true;
      isHT = false;
    } else if (elapsedSinceKickoffMins > 45) {
      smartMinute = 45;
      status = 'HT';
      isHT = true;
      isLive = false;
    } else if (elapsedSinceKickoffMins >= 0) {
      smartMinute = elapsedSinceKickoffMins;
      status = '1H';
      isLive = true;
      isHT = false;
    }
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: isLive,
    isFinished: isFinished,
    isStarted: isLive && !isHT,
    isHidden: isHidden
  };
}


export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;