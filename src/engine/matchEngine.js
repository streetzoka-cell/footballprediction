import { formatTime, getLocalDateFromUtc, parseDateAsUTC } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, isScheduledStatus, SPORT, getLeagueColor } from '../utils/constants';

export function extractTournamentStage(raw) {
  if (!raw) return null;
  const stageKeywords = {
    final: ['final', 'finals', 'championship'],
    weekend: ['weekend'],
    group: ['group', 'group stage', 'league stage'],
    knockout: ['knockout', 'ro16', 'round of 16', 'quarterfinal', 'semi-final', 'semifinal', 'playoff']
  };
  const explicitStage = raw.tournamentStage || raw.stage || raw.round;
  if (explicitStage) {
    const lowerStage = explicitStage.toLowerCase();
    for (const [type, keywords] of Object.entries(stageKeywords)) {
      if (keywords.some(keyword => lowerStage.includes(keyword))) return { type, name: explicitStage };
    }
  }
  return raw.type ? { type: raw.type, name: raw.type } : null;
}

export function extractMatchDate(m) {
  if (!m) return '';
  const rawDate = m.date;
  if (rawDate && rawDate.length === 10) return rawDate;
  if (rawDate) return getLocalDateFromUtc(rawDate);
  if (m.timestamp) {
    const d = new Date(m.timestamp * 1000); // backend sends seconds, not ms
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return '';
}

export function normalizeMatch(raw, isPrimary = true, now = Date.now()) {
  if (!raw) return null;
  
  const id = String(raw.id || raw.matchId);
  let status = raw.status || '';
  const dateStr = extractMatchDate(raw);
  
  let kickoff = 'TBD';
  let timestamp = 0;
  const rawDate = raw.date;
  
  if (rawDate) {
    try {
      const dt = parseDateAsUTC(rawDate);
      kickoff = formatTime(rawDate);
      timestamp = dt.getTime();
    } catch { /* ignore */ }
  }

  const homeTeam = {
    id: String(raw.homeTeamId || raw.homeTeam?.id || ''),
    name: raw.homeTeamName || raw.homeTeam?.name || 'TBD',
    crest: raw.homeTeamLogo || raw.homeTeam?.logo || raw.homeTeamCrest || null
  };
  const awayTeam = {
    id: String(raw.awayTeamId || raw.awayTeam?.id || ''),
    name: raw.awayTeamName || raw.awayTeam?.name || 'TBD',
    crest: raw.awayTeamLogo || raw.awayTeam?.logo || raw.awayTeamCrest || null
  };
  
  const league = {
    id: String(raw.leagueId || raw.league?.id || ''),
    name: raw.leagueName || raw.league?.name || 'Other',
    emblem: raw.leagueLogo || raw.league?.logo || raw.leagueEmblem || null,
    country: raw.leagueCountry || raw.league?.country || null,
    flag: raw.leagueFlag || raw.league?.flag || null,
    season: raw.season || raw.league?.season || null,
    round: raw.round || raw.league?.round || null,
    tournamentStage: extractTournamentStage(raw)
  };

  let isLive = isLiveStatus(status, SPORT.FOOTBALL);
  let isHT = status === 'HT' || status === 'BT';
  let isFinished = isFinishedStatus(status, SPORT.FOOTBALL);
  let isStarted = false;
  let displayMinute = raw.minute || raw.elapsed || 0;

  const kickoffTime = timestamp;
  const elapsedMins = Math.floor((now - kickoffTime) / 60000);
  let smartStatus = status;

  if (kickoffTime > 0) {
    if (!isLive && !isFinished && now > kickoffTime) {
      if (elapsedMins >= 120) { isFinished = true; status = 'FT'; smartStatus = 'FT'; }
      else if (elapsedMins >= 50) { isHT = true; status = 'HT'; smartStatus = 'HT'; }
      else { isStarted = true; status = '1H'; smartStatus = '1H'; }
    }
    if (isLive || isStarted) {
      if (elapsedMins >= 100) { isFinished = true; isLive = false; isHT = false; status = 'FT'; smartStatus = 'FT'; }
      else if (status === 'HT') { isHT = true; smartStatus = 'HT'; }
      else { smartStatus = status; }
    }
  }

  const homeScore = raw.homeScore ?? raw.goalsHome ?? raw.score?.fulltime?.home ?? raw.score?.halftime?.home ?? null;
  const awayScore = raw.awayScore ?? raw.goalsAway ?? raw.score?.fulltime?.away ?? raw.score?.halftime?.away ?? null;

  return {
    id, dateStr, kickoff, timestamp, status: smartStatus, isLive, isHT, isFinished,
    minute: raw.minute || raw.elapsed || null,
    displayMinute, isStarted,
    homeName: homeTeam.name, awayName: awayTeam.name,
    homeLogo: homeTeam.crest, awayLogo: awayTeam.crest,
    homeTeamId: homeTeam.id, awayTeamId: awayTeam.id,
    homeScore, awayScore,
    leagueName: league.name, leagueId: league.id, leagueLogo: league.emblem,
    leagueCountry: league.country, leagueFlag: league.flag,
    tournamentStage: league.tournamentStage,
    score: raw.score || {},
    matchScore: raw.matchScore || 0,
    category: raw.category || 'NORMAL',
  };
}

export const extractDate = extractMatchDate;