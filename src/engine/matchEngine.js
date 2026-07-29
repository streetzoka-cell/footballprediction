// src/engine/matchEngine.js
import { getLocalDateFromUtc } from '../utils/dates';

export function normalizeMatch(raw, isPrimary = true, now = Date.now()) {
  if (!raw) return null;
  
  const display = raw.display || {};
  const time = raw.time || {};
  const score = display.score || {};

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    dateStr: getLocalDateFromUtc(raw.date),
    timestamp: raw.timestamp,
    kickoff: time.kickoffLocal || 'TBD',
    status: raw.status,
    statusLong: raw.statusLong,
    isLive: display.isLive || false,
    isFinished: display.isFinished || false,
    isScheduled: display.isUpcoming || false,
    isHT: display.isHalfTime || false,
    isStarted: display.isLive && !display.isHalfTime,
    minute: display.minute,
    displayMinute: display.minute,
    homeTeamId: raw.homeTeamId,
    homeTeamName: raw.homeName,
    homeName: raw.homeName,
    homeTeamLogo: raw.homeLogo,
    homeLogo: raw.homeLogo,
    awayTeamId: raw.awayTeamId,
    awayTeamName: raw.awayName,
    awayName: raw.awayName,
    awayTeamLogo: raw.awayLogo,
    awayLogo: raw.awayLogo,
    homeScore: score.home,
    awayScore: score.away,
    goalsHome: score.home,
    goalsAway: score.away,
    leagueId: raw.leagueId,
    leagueName: raw.leagueName,
    leagueLogo: raw.leagueLogo,
    leagueCountry: raw.leagueCountry,
    matchScore: raw.importance || 0,
    category: raw.category || 'NORMAL',
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;