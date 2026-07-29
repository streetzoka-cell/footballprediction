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

  // ★ ANTI-STUCK LOGIC: If a match is marked live but started over 3.5 hours ago, mark it as finished
  if (isLive && raw.timestamp) {
    const matchStartTime = raw.timestamp * 1000; // API timestamp is in seconds, convert to ms
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
    
    // Flat properties (used by Fixtures.jsx)
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
    
    // Nested objects (used by AdminPage components)
    homeTeam: { name: homeName, shortName: homeName, crest: homeLogo, id: raw.homeTeamId },
    awayTeam: { name: awayName, shortName: awayName, crest: awayLogo, id: raw.awayTeamId },
    league: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
    competition: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;