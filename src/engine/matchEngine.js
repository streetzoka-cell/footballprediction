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

// ★ FIX: Aggressive Smart Minute Calculator
// Forces FT after 105 mins even if API missed the update.
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;
  
  // If already finished, just ensure minute is capped at 90
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
  if (elapsedMs < 0) return m; // Future match

  const elapsedMins = Math.floor(elapsedMs / 60000);

  let smartMinute = m.minute || 0;
  let status = statusUpper;
  let isHT = m.isHT || false;
  let isLive = m.isLive || false;
  let isFinished = false;

  // 2. If > 105 mins elapsed, force FT (Catches missed API updates!)
  // This fixes the issue where past matches show as '--' because API status is stuck.
  if (elapsedMins >= 105) {
    smartMinute = 90;
    status = 'FT';
    isFinished = true;
    isLive = false;
    isHT = false;
  } 
  // 3. If 96-105 mins, 2nd Half Added Time
  else if (elapsedMins > 90) {
    smartMinute = 90;
    status = '2H';
    isLive = true;
    isHT = false;
  } 
  // 4. If 61-90 mins, 2nd Half
  else if (elapsedMins > 60) {
    smartMinute = 45 + (elapsedMins - 60);
    status = '2H';
    isLive = true;
    isHT = false;
  } 
  // 5. If 51-60 mins, Half Time
  else if (elapsedMins > 50) {
    smartMinute = 45;
    status = 'HT';
    isHT = true;
    isLive = false;
  } 
  // 6. If 46-50 mins, 1st Half Added Time
  else if (elapsedMins > 45) {
    smartMinute = 45;
    status = '1H';
    isLive = true;
    isHT = false;
  } 
  // 7. 0-45 mins, 1st Half
  else {
    smartMinute = elapsedMins;
    status = '1H';
    isLive = true;
    isHT = false;
  }

  // 8. Prevent jumping backwards: If API has a higher minute, trust it
  if (m.minute && m.minute > smartMinute && !isFinished) {
    smartMinute = m.minute;
  }
  
  // If API explicitly says HT, respect it over our time guess
  if (statusUpper === 'HT') {
    isHT = true; isLive = false; smartMinute = 45;
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: isLive,
    isFinished: isFinished,
    isStarted: isLive && !isHT
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;