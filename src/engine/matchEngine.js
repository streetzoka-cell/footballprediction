// src/engine/matchEngine.js
import { getLocalDateFromUtc, formatTime } from '../utils/dates';

// src/engine/matchEngine.js

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
  let isHidden = false; // ★ NEW: Track if match should be hidden

  // ★ ENHANCED ANTI-STUCK LOGIC
  if (raw.timestamp) {
    const matchStartTime = raw.timestamp * 1000; 
    const elapsed = now - matchStartTime;
    const threeAndHalfHoursMs = 3.5 * 60 * 60 * 1000; 
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;
    
    // If match is older than 24 hours and still shows as live/90', HIDE IT
    if (elapsed > twentyFourHoursMs && (isLive || status === '90' || status === '2H')) {
      isHidden = true;
      isLive = false;
      isFinished = false;
      status = 'HIDDEN';
    }
    // If match is older than 3.5 hours and still live, force finish
    else if (elapsed > threeAndHalfHoursMs && isLive) {
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
    isHidden: isHidden, // ★ NEW: Flag for frontend to hide
    
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

// ★ Bulletproof Smart Minute Calculator
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;
  
  if (m.isFinished) {
    return { ...m, displayMinute: 90, minute: 90, isLive: false, isHT: false };
  }

  // ★ FIX: Safely convert status to string before calling toUpperCase
  const statusUpper = String(m.status || "").toUpperCase();
  
  // 1. NEVER force live if postponed/canceled/scheduled
  if (['PST', 'SUSP', 'INT', 'CANC', 'ABD', 'POSTP', 'TBD', 'PENDING', 'NS'].includes(statusUpper)) {
    return m;
  }

  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedMs = now - matchStartTime;
  
  // If kickoff is in the future, force Scheduled (NS)
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

  // ★ IF NO API REPLY YET..USE SMARTCOUNTS (pure time-based fallback)
  if (apiMinute === 0) {
    const elapsedMins = Math.floor(elapsedMs / 60000);

    if (elapsedMins >= 105) {
      smartMinute = 90; // Fallback cap if no data for 105 mins
    } else if (elapsedMins > 90) {
      smartMinute = 90;
    } else if (elapsedMins > 60) {
      smartMinute = 45 + (elapsedMins - 60);
      status = '2H';
    } else if (elapsedMins > 50) {
      smartMinute = 45;
      status = 'HT';
      isHT = true;
    } else if (elapsedMins > 45) {
      smartMinute = 45;
      status = '1H';
    } else {
      smartMinute = elapsedMins;
      status = '1H';
    }
  } else {
    // ★ PICK FROM LAST API CALL, AND UPDATE THEN COUNT!
    // Start with the exact minute the API provided
    smartMinute = apiMinute;
    
    // Add local time elapsed since the API's last update
    if (m.lastUpdated) {
      const lastUpdateTime = new Date(m.lastUpdated).getTime();
      if (!isNaN(lastUpdateTime)) {
        const extraMins = Math.floor((now - lastUpdateTime) / 60000);
        smartMinute += extraMins;
      }
    }
  }

  // If API explicitly says HT, force minute 45
  if (statusUpper === 'HT') {
    isHT = true; 
    smartMinute = 45;
    status = 'HT';
  }

  // Cap at 90 for normal time (unless Extra Time or Penalties)
  if (smartMinute > 90 && statusUpper !== 'ET' && statusUpper !== 'P') {
    smartMinute = 90;
  }

  // Prevent minute from going backwards
  if (apiMinute > smartMinute) {
    smartMinute = apiMinute;
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: true, // If we reached here, it's live
    isFinished: false,
    isStarted: !isHT
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;