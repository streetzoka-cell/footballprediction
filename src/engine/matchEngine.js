// src/engine/matchEngine.js
import { formatTime, getLocalDateFromUtc, parseDateAsUTC } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, isScheduledStatus, SPORT, getLeagueColor } from '../utils/constants';

/**
 * Extracts and standardizes the tournament stage from a raw match object.
 * Returns an object { type: 'final'|'weekend'|'group'|'knockout'|'league', name: string } or null.
 */
export function extractTournamentStage(raw) {
  if (!raw) return null;

  const stageKeywords = {
    final: ['final', 'finals', 'championship', 'super bowl'],
    weekend: ['weekend', 'usl w'],
    group: ['group', 'group stage', 'league stage'],
    knockout: ['knockout', 'ro16', 'round of 16', 'quarterfinal', 'semi-final', 'semifinal', 'playoff', 'playoffs', 'bracket']
  };

  const explicitStage = raw.tournamentStage || raw.stage || raw.stageType || (raw.season && raw.season.stage);
  
  if (explicitStage) {
    const lowerStage = explicitStage.toLowerCase();

    // Check for exact match
    for (const [type, keywords] of Object.entries(stageKeywords)) {
      if (keywords.includes(lowerStage)) {
        return { type, name: explicitStage };
      }
    }

    // Check for partial match (if a keyword is included within the string)
    for (const [type, keywords] of Object.entries(stageKeywords)) {
      if (keywords.some(keyword => lowerStage.includes(keyword))) {
        return { type, name: explicitStage };
      }
    }
  }

  // Fallback to raw.type or null
  return raw.type ? { type: raw.type, name: raw.type } : null;
}

/**
 * Extracts the local date string (YYYY-MM-DD) from a raw match object.
 */
export function extractMatchDate(m) {
  if (!m) return '';
  const rawDate = m.utcDate || m.date;
  if (rawDate && rawDate.length === 10) return rawDate;
  if (rawDate) return getLocalDateFromUtc(rawDate);
  if (m.timestamp) {
    const d = new Date(m.timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return '';
}

/**
 * Core normalization function for all football matches.
 * Standardizes API responses into a single predictable shape.
 */
export function normalizeMatch(raw, isPrimary = true, now = Date.now()) {
  if (!raw) return null;
  
  const id = String(raw.id || raw.matchId);
  let status = raw.status || '';
  const dateStr = extractMatchDate(raw);
  
  let kickoff = 'TBD';
  let timestamp = 0;
  const rawDate = raw.utcDate || raw.date;
  
  if (rawDate) {
    try {
      const dt = parseDateAsUTC(rawDate);
      kickoff = formatTime(rawDate);
      timestamp = dt.getTime();
    } catch { /* ignore */ }
  } else if (raw.kickoff) {
    kickoff = raw.kickoff;
  }

  const homeTeam = raw.homeTeam || { name: raw.homeTeamName, shortName: raw.homeTeamName, crest: raw.homeTeamLogo };
  const awayTeam = raw.awayTeam || { name: raw.awayTeamName, shortName: raw.awayTeamName, crest: raw.awayTeamLogo };
  
  // REFACTORED: Inject tournamentStage into the league object
  const league = {
    ...(raw.league || raw.competition || { name: raw.leagueName, emblem: raw.leagueLogo }),
    tournamentStage: extractTournamentStage(raw)
  };

  let isLive = isPrimary ? (!!raw.isLive || isLiveStatus(status, SPORT.FOOTBALL)) : isLiveStatus(status, SPORT.FOOTBALL);
  let isHT = status === 'HT' || status === 'BT' || status === 'HALF_TIME';
  let isFinished = isPrimary ? (!!raw.isFinished || isFinishedStatus(status, SPORT.FOOTBALL)) : isFinishedStatus(status, SPORT.FOOTBALL);

  let isStarted = false;
  let isNearFT = false;
  let displayMinute = raw.minute || raw.elapsed || 0;
  let addedMinute = 0;

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
      else if (status === 'HT' || status === 'HALF_TIME') { isHT = true; smartStatus = 'HT'; }
      else { smartStatus = status; }

      if (smartStatus === '1H') {
        let localMinute = raw.minute || Math.min(elapsedMins, 45);
        if (localMinute > 45) { addedMinute = localMinute - 45; displayMinute = 45; } 
        else { displayMinute = localMinute; }
      }
      
      if (smartStatus === '2H' || smartStatus === 'ET') {
        const secondHalfMins = Math.max(0, elapsedMins - 60);
        let localMinute = raw.minute || (45 + secondHalfMins);
        if (localMinute > 90) { addedMinute = localMinute - 90; displayMinute = 90; } 
        else { displayMinute = localMinute; }
      }
      if (elapsedMins >= 75 && !isFinished) isNearFT = true;
    }
  }

  const homeScore = isPrimary ? (raw.homeScore ?? raw.goalsHome ?? raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null) : (raw.goalsHome ?? raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = isPrimary ? (raw.awayScore ?? raw.goalsAway ?? raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null) : (raw.goalsAway ?? raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, dateStr, kickoff, timestamp, status: smartStatus, isLive, isHT, isFinished,
    minute: raw.minute || raw.elapsed || null,
    displayMinute, addedMinute, isStarted, isNearFT,
    homeName: homeTeam.shortName || homeTeam.name || 'TBD',
    awayName: awayTeam.shortName || awayTeam.name || 'TBD',
    homeLogo: homeTeam.crest || homeTeam.logo,
    awayLogo: awayTeam.crest || awayTeam.logo,
    homeTeamId: homeTeam.id, awayTeamId: awayTeam.id,
    homeScore, awayScore,
    leagueName: league.name || 'Other',
    leagueId: league.id || raw.leagueKey,
    leagueLogo: league.emblem || league.logo,
    tournamentStage: league.tournamentStage, // <-- Added here
    score: raw.score, stats: raw.stats || raw.matchStats || [],
    matchScore: raw.matchScore || 0,
    category: raw.category || 'NORMAL',
    homeWinProb: raw.homeWinProb ?? raw.prediction?.homeWinProb ?? null,
    drawProb: raw.drawProb ?? raw.prediction?.drawProb ?? null,
    awayWinProb: raw.awayWinProb ?? raw.prediction?.awayWinProb ?? null,
    predictedHomeScore: raw.predictedHomeScore ?? raw.prediction?.homeScore ?? null,
    predictedAwayScore: raw.predictedAwayScore ?? raw.prediction?.awayScore ?? null,
    homeOdds: raw.homeOdds ?? raw.odds?.home ?? null,
    drawOdds: raw.drawOdds ?? raw.odds?.draw ?? null,
    awayOdds: raw.awayOdds ?? raw.odds?.away ?? null,
  };
}

export function normalizeBasketballGame(raw) {
  if (!raw) return null;
  const status = raw.status || '';
  const isLive = isLiveStatus(status, SPORT.BASKETBALL);
  const isFinished = isFinishedStatus(status, SPORT.BASKETBALL);
  
  return {
    id: String(raw.id),
    status, isLive, isFinished,
    isScheduled: !isLive && !isFinished,
    date: raw.date,
    kickoff: raw.date ? formatTime(raw.date) : '',
    league: { 
      name: raw.leagueName || 'Other', 
      emblem: raw.leagueLogo, 
      color: getLeagueColor(raw.leagueId),
      country: raw.leagueCountry,
      tournamentStage: extractTournamentStage(raw) // <-- Added here
    },
    leagueKey: String(raw.leagueId),
    homeTeam: { name: raw.homeTeamName, logo: raw.homeTeamLogo },
    awayTeam: { name: raw.awayTeamName, logo: raw.awayTeamLogo },
    homeLogo: raw.homeTeamLogo, awayLogo: raw.awayTeamLogo,
    homeScore: raw.pointsHome ?? raw.homeScore,
    awayScore: raw.pointsAway ?? raw.awayScore,
    minute: raw.elapsed,
    score: {
      q1: { home: raw.q1Home, away: raw.q1Away },
      q2: { home: raw.q2Home, away: raw.q2Away },
      q3: { home: raw.q3Home, away: raw.q3Away },
      q4: { home: raw.q4Home, away: raw.q4Away },
      ot: { home: raw.otHome, away: raw.otAway },
    }
  };
}

// Optional alias to fix broken imports elsewhere without changing AdminPage
export const extractDate = extractMatchDate;