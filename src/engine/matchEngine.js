// src/engine/matchEngine.js
import { getLocalDateFromUtc } from '../utils/dates';

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

  // ANTI-STUCK LOGIC: If a match is marked live but started over 3.5 hours ago, mark it as finished
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

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    dateStr: getLocalDateFromUtc(raw.date),
    timestamp: raw.timestamp,
    kickoff: time.kickoffLocal || 'TBD',
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
    isHidden: false, // ★ NEW: Initialize isHidden
    
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

// ★ NEW: Smart Minute Calculator & Dropper
export function applySmartMinute(m, now = Date.now()) {
  if (!m || m.isFinished) return m;

  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedSinceKickoffMins = Math.max(0, Math.floor((now - matchStartTime) / 60000));

  // If the match hasn't started yet according to kickoff time, don't force live status
  if (elapsedSinceKickoffMins < 0 && !m.isLive && !m.isHT) return m;

  let smartMinute = m.minute || 0;
  let status = m.status;
  let isHT = m.isHT;
  let isLive = m.isLive;
  let isFinished = m.isFinished;
  let isHidden = m.isHidden || false;

  // If the backend already says it's Extra Time or Penalties, we trust it and don't force FT
  const isExtendedTime = status === 'ET' || status === 'P' || status === 'BREAK' || status === 'BT';

  if (!isExtendedTime) {
    if (elapsedSinceKickoffMins >= 118) {
      // 98 mins (90+8) + 20 mins grace period passed. Backend hasn't marked as FT. Drop it.
      isHidden = true;
      return { ...m, isHidden };
    }

    if (elapsedSinceKickoffMins >= 98) {
      // Force FT after 90+8
      smartMinute = 90;
      status = 'FT';
      isLive = false;
      isHT = false;
      isFinished = true;
    } else if (elapsedSinceKickoffMins > 90) {
      // Waiting for FT (added time)
      smartMinute = 90;
      status = '2H';
      isLive = true;
      isHT = false;
    } else if (elapsedSinceKickoffMins > 60) {
      // 2nd Half (45 mins play + 15 mins HT = 60)
      smartMinute = 45 + (elapsedSinceKickoffMins - 60);
      status = '2H';
      isLive = true;
      isHT = false;
    } else if (elapsedSinceKickoffMins > 45) {
      // Half Time (15 mins)
      smartMinute = 45;
      status = 'HT';
      isHT = true;
      isLive = false;
    } else if (elapsedSinceKickoffMins >= 0) {
      // 1st Half
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