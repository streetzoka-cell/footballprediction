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
  let status = raw.status;
  let minute = display.minute;
  let isHidden = false;

  // ★ FIX: Increased thresholds to 3.5 hours to prevent delayed matches from forcing FT early
  const FT_THRESHOLD_MS = 3.5 * 60 * 60 * 1000;        // 3.5h — hard cap force FT
  const STUCK_LIVE_MS = 3 * 60 * 60 * 1000;            // 3h — if at 90' for a long time, force FT
  const HIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;       // 24h — hide completely

  if (raw.timestamp) {
    const matchStartTime = raw.timestamp * 1000;
    const elapsed = now - matchStartTime;

    if (elapsed > HIDE_THRESHOLD_MS && (isLive || status === '90' || status === '2H')) {
      isHidden = true;
      isLive = false;
      isFinished = false;
      status = 'HIDDEN';
    }
    // ★ If minute already at 90' and elapsed > 3h → FT NOW
    else if (isLive && (minute >= 90 || status === '90' || status === '2H') && elapsed > STUCK_LIVE_MS) {
      isLive = false;
      isFinished = true;
      status = 'FT';
      minute = 90;
    }
    // Hard cap: any match older than 3.5h → FT
    else if (elapsed > FT_THRESHOLD_MS && isLive) {
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

    dateStr: matchDateStr,                              // UTC — backend key (do not change)
    localDateStr: toLocalDateStr(raw.utcDate || raw.date), // LOCAL — for display bucketing
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

// ★ Bulletproof Smart Minute Calculator (DELAYED MATCH BUG FIXED)
export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;

  if (m.isFinished) {
    return { ...m, displayMinute: 90, minute: 90, isLive: false, isHT: false };
  }

  const statusUpper = String(m.status || "").toUpperCase();

  if (['PST', 'SUSP', 'INT', 'CANC', 'ABD', 'POSTP', 'TBD', 'PENDING', 'NS'].includes(statusUpper)) {
    return m;
  }

  const matchStartTime = m.timestamp ? m.timestamp * 1000 : null;
  if (!matchStartTime) return m;

  const elapsedMs = now - matchStartTime;

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

  // If API provides a minute > 0, ALWAYS trust it over our local calculation.
  if (apiMinute > 0) {
    smartMinute = apiMinute;

    if (m.lastUpdated) {
      const lastUpdateTime = new Date(m.lastUpdated).getTime();
      if (!isNaN(lastUpdateTime)) {
        let extraMins = Math.floor((now - lastUpdateTime) / 60000);

        const totalElapsedMins = Math.floor(elapsedMs / 60000);
        const lastUpdateElapsedMins = Math.floor((lastUpdateTime - matchStartTime) / 60000);

        // Subtract halftime if we crossed the 60m mark since last update
        if (lastUpdateElapsedMins <= 60 && totalElapsedMins > 60) {
          extraMins -= 15;
        }

        smartMinute += Math.max(0, extraMins);
      }
    }
  } else {
    // API Minute is 0 (likely missing data). Calculate purely from elapsed time.
    const elapsedMins = Math.floor(elapsedMs / 60000);

    if (elapsedMins > 60) {
      smartMinute = 45 + (elapsedMins - 60); // = elapsed - 15 (halftime subtracted)
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
  }

  if (statusUpper === 'HT') {
    isHT = true;
    smartMinute = 45;
    status = 'HT';
  }

  // Cap at 90 minutes unless it's Extra Time or Penalties
  if (smartMinute > 90 && statusUpper !== 'ET' && statusUpper !== 'P') {
    smartMinute = 90;
  }

  // Never let the calculated minute go backwards
  if (apiMinute > smartMinute) {
    smartMinute = apiMinute;
  }

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status: status,
    isHT: isHT,
    isLive: true,
    isFinished: false,
    isStarted: !isHT
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;