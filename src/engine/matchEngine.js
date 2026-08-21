// frontend/src/engine/matchEngine.js
import { getLocalDateFromUtc, formatTime, toLocalDateStr } from '../utils/dates';

// normalizeMatch(raw, isPrimary, now, isDataFresh)
// isDataFresh: whether this normalization is backed by a recent, successful
// fetch. When false (network/API outage, stale cache), we must NOT let the
// clock-based FT/HIDE fallback declare a result — that fallback exists to
// catch matches the backend forgot to mark finished, not to paper over an
// outage on the client. Doing so previously caused matches to freeze at
// stale scores and get force-labeled "Full Time" during any connectivity gap.
export function normalizeMatch(raw, isPrimary = true, now = Date.now(), isDataFresh = true) {
  if (!raw) return null;

  const display = raw.display || {};
  const time = raw.time || {};
  // ★ FIX: Fallback to display.score if root homeScore/awayScore is 0 but display has a score
  const score = {
    home: raw.homeScore || display.score?.home || 0,
    away: raw.awayScore || display.score?.away || 0
  };

  const homeName = raw.homeName || raw.homeTeam?.name || 'TBD';
  const awayName = raw.awayName || raw.awayTeam?.name || 'TBD';
  const homeLogo = raw.homeLogo || raw.homeTeam?.crest || null;
  const awayLogo = raw.awayLogo || raw.awayTeam?.crest || null;
  const leagueName = raw.leagueName || raw.league?.name || raw.competition?.name || 'Other';
  const leagueLogo = raw.leagueLogo || raw.league?.emblem || raw.competition?.emblem || null;

  let isLive = display.isLive || false;
  let isFinished = display.isFinished || false;
  let status = raw.status || display.status;
  let minute = display.minute || raw.minute || 0;
  let isHidden = false;
  let isStaleData = !isDataFresh;

  // ★ HARDENED FT LOGIC: Trust the root API status over a malformed display object
  const finishedStatuses = ['FT', 'AET', 'PEN', 'AW', 'WO'];
  if (finishedStatuses.includes(status)) {
    isFinished = true;
    isLive = false;
    if (minute < 90) minute = 90;
  }

  let timestamp = raw.timestamp;
  if (!timestamp) {
    const dateStr = raw.utcDate || raw.date;
    if (dateStr) {
      const parsed = new Date(dateStr).getTime();
      if (!isNaN(parsed)) timestamp = Math.floor(parsed / 1000);
    }
  }

  const FT_THRESHOLD_MS = 3 * 60 * 60 * 1000;
  const HIDE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  // ★ FIX: only let the clock-based fallback force a terminal state when we
  // know this data came from a fresh, successful fetch. If the app has lost
  // connectivity and is showing cached/placeholder data, elapsed time since
  // kickoff tells us nothing about whether the match actually finished —
  // it just means we haven't heard from the backend in a while.
  if (timestamp && isDataFresh) {
    const matchStartTime = timestamp * 1000;
    const elapsed = now - matchStartTime;

    if (elapsed > HIDE_THRESHOLD_MS && !isFinished) {
      isHidden = true;
      isLive = false;
      isFinished = false;
      status = 'HIDDEN';
    } else if (elapsed > FT_THRESHOLD_MS && !isFinished) {
      isLive = false;
      isFinished = true;
      status = 'FT';
      minute = 90;
    }
  }

  const isHT = display.isHalfTime || status === 'HT';
  const isScheduled = !isLive && !isFinished && !isHT &&
    (status === 'NS' || status === 'TBD' || display.isUpcoming || false);

  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');

  const updatedAt = raw.dataQuality?.lastUpdated || raw.lastUpdated || raw.updatedAt || Date.now();

  let statusLabel = '';
  let statusClass = 'status-upcoming';
  let timelineProgress = 0;

  if (isLive) {
    statusClass = 'status-live';
    if (isHT) {
      statusLabel = 'Half Time';
      statusClass = 'status-ht';
      timelineProgress = 50;
    } else {
      statusLabel = formatMinute(minute, status);
      timelineProgress = Math.min((minute / 90) * 100, 100);
    }
  } else if (isFinished) {
    statusLabel = status === 'AET' ? 'AET' : status === 'PEN' ? 'PEN' : 'Full Time';
    statusClass = 'status-ft';
    timelineProgress = 100;
  } else if (isScheduled) {
    statusLabel = kickoffTime;
    statusClass = 'status-upcoming';
  } else {
    statusLabel = status || 'Scheduled';
  }

  // ★ Surface staleness to the UI so it can show "reconnecting" rather than
  // silently presenting a possibly-outdated live score/status as current.
  if (isStaleData && isLive) {
    statusClass = 'status-live-stale';
  }

  const rawStats = raw.statistics || raw.stats;
  const stats = {
    possession: null, shots: null, shotsOnTarget: null, corners: null,
    fouls: null, yellowCards: null, redCards: null, offsides: null,
  };

  if (Array.isArray(rawStats) && rawStats.length > 0) {
    rawStats.forEach(s => {
      const type = String(s.type || '').toLowerCase();
      const home = s.home ?? s.homeValue ?? 0;
      const away = s.away ?? s.awayValue ?? 0;

      if (type.includes('possession')) stats.possession = { home: parseInt(home) || 0, away: parseInt(away) || 0 };
      else if (type.includes('shots on goal') || type.includes('shots on target')) stats.shotsOnTarget = { home, away };
      else if (type.includes('total shots') || type === 'shots') stats.shots = { home, away };
      else if (type.includes('corner')) stats.corners = { home, away };
      else if (type.includes('foul')) stats.fouls = { home, away };
      else if (type.includes('yellow card')) stats.yellowCards = { home, away };
      else if (type.includes('red card')) stats.redCards = { home, away };
      else if (type.includes('offside')) stats.offsides = { home, away };
    });
  }

  const hasRealStats = !!(stats.possession || stats.shots || stats.shotsOnTarget || stats.corners);

  const rawOdds = raw.odds || raw.bookmakers?.[0]?.bets?.find(b => b.id === 1)?.values || raw.bets?.find(b => b.id === 1)?.values || null;

  const odds = rawOdds ? {
    home: rawOdds.find(v => v.value === 'Home')?.odd || rawOdds.home,
    draw: rawOdds.find(v => v.value === 'Draw')?.odd || rawOdds.draw,
    away: rawOdds.find(v => v.value === 'Away')?.odd || rawOdds.away,
    over25: raw.odds?.over_25 || raw.odds?.over25,
    under25: raw.odds?.under_25 || raw.odds?.under25
  } : null;

  return {
    id: String(raw.id || ''),
    sport: raw.sport || 'football',
    date: raw.date,
    utcDate: raw.utcDate || raw.date,
    dateStr: matchDateStr,
    localDateStr: toLocalDateStr(raw.utcDate || raw.date),
    timestamp: timestamp,
    kickoff: kickoffTime,
    kickoffUtc: raw.kickoffUtc || raw.utcDate || raw.date,
    status: status,
    statusLong: raw.statusLong,
    isLive: isLive,
    isFinished: isFinished,
    isScheduled: isScheduled,
    isHT: isHT,
    isStarted: isLive && !isHT,
    minute: minute,
    displayMinute: minute,
    updatedAt: updatedAt,
    isHidden: isHidden,
    isStaleData: isStaleData,
    statusLabel: statusLabel,
    statusClass: statusClass,
    timelineProgress: timelineProgress,
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
    stats,
    hasRealStats,
    odds,
    mlPredictions: raw.prediction || raw.mlPredictions || null,
    intelData: raw.intelData || null,
    homeTeam: { name: homeName, shortName: homeName, crest: homeLogo, id: raw.homeTeamId },
    awayTeam: { name: awayName, shortName: awayName, crest: awayLogo, id: raw.awayTeamId },
    league: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
    competition: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
  };
}

// Pure formatter: given an already-known minute + status, returns the
// "45+2'" style label. Does not tick or estimate — safe to use anywhere
// you already have a trustworthy minute value (e.g. finished/archived data).
export function formatMinute(min, status) {
  if (status === 'HT') return 'HT';
  if (status === 'FT' || status === 'AET' || status === 'PEN') return 'FT';
  if (status === 'NS' || status === 'TBD' || status === 'PST') return '';
  min = Math.max(0, min);
  if (status === '1H' && min > 45) return `45+${min - 45}'`;
  if (status === '2H' && min > 90) return `90+${min - 90}'`;
  if (status === 'ET') {
    if (min > 105 && min <= 120) return `105+${min - 105}'`;
    if (min > 120) return `120+${min - 120}'`;
  }
  return `${min}'`;
}

// ============================================================
// ★ SMART MINUTE ENGINE
// ============================================================

// Typical period lengths used to approximate minute from kickoff time,
// same approach livescore apps use as a fallback between live updates.
const HALF_LEN = 45;
const FULL_LEN = 90;
const HT_BREAK = 15;      // avg half-time break
const ET_HALF_LEN = 15;
const ET_BREAK = 5;       // break before extra time
const ET_HT_BREAK = 5;    // break between ET halves

// ★ Default added-time allowance used ONLY while we're extrapolating locally
// (i.e. the API hasn't sent a fresher minute yet). These are fallbacks, not
// promises — a real API update always overrides them (see capMinuteForPeriod).
const FIRST_HALF_ADDED_CAP_DEFAULT = 3;   // 45+3 max, by default
const SECOND_HALF_ADDED_CAP_DEFAULT = 8;  // 90+8 max, by default
const ET_ADDED_CAP_DEFAULT = 3;           // small default buffer past 105'/120'

// Estimate current minute purely from kickoff timestamp + period math.
// Used as a fallback when we don't have a recent enough API update to trust.
function estimateMinuteFromKickoff(kickoffMs, status, now) {
  if (!kickoffMs) return null;
  const elapsedMin = (now - kickoffMs) / 60000;
  if (elapsedMin < 0) return null; // hasn't kicked off yet

  switch (status) {
    case '1H':
    case 'LIVE':
      return Math.min(Math.max(1, Math.round(elapsedMin)), HALF_LEN + 10);

    case 'HT':
      return HALF_LEN;

    case '2H': {
      const secondHalfStart = HALF_LEN + HT_BREAK; // minutes from kickoff
      const into2H = elapsedMin - secondHalfStart;
      return Math.min(Math.max(HALF_LEN + 1, HALF_LEN + Math.round(Math.max(into2H, 0))), 90 + 10);
    }

    case 'ET': {
      const et1Start = HALF_LEN * 2 + HT_BREAK + ET_BREAK;
      const et1End = et1Start + ET_HALF_LEN;
      if (elapsedMin <= et1End + ET_HT_BREAK) {
        const into = elapsedMin - et1Start;
        return Math.min(Math.max(91, 90 + Math.round(Math.max(into, 0))), 105 + 1);
      }
      const et2Start = et1End + ET_HT_BREAK;
      const into2 = elapsedMin - et2Start;
      return Math.min(Math.max(106, 105 + Math.round(Math.max(into2, 0))), 120 + 1);
    }

    case 'PEN':
      return 120;

    default:
      return null;
  }
}

// ★ Caps how far local ticking can extrapolate a match's minute beyond a
// period boundary (45'/90'/etc.) when we haven't heard from the API
// recently. This stops the clock from counting up forever during a gap
// between polls — it freezes at the default added-time allowance instead.
//
// Crucially, the ceiling is never set BELOW what the API has actually
// confirmed: if a fresh fetch reports 45+6 (a real, longer stoppage), that
// becomes the new ceiling immediately, overriding the 3-minute default.
// Ticking then resumes from that fresh value on subsequent ticks, up to
// max(latestApiMinute, periodLen + defaultCap) again.
function capMinuteForPeriod(rawEstimate, apiMinute, periodLen, addedCapDefault) {
  const defaultCeiling = periodLen + addedCapDefault;
  const ceiling = Math.max(apiMinute, defaultCeiling);
  return Math.min(rawEstimate, ceiling);
}

// ★ Formats a (possibly capped) total minute into the "45+2'" style label,
// mirroring formatMinute() but working off a raw total rather than status.
function formatPeriodLabel(totalMinute, periodLen) {
  if (totalMinute <= periodLen) return `${totalMinute}'`;
  return `${periodLen}+${totalMinute - periodLen}'`;
}

export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;
  const status = String(m.status || '').toUpperCase();
  const frozenStatuses = ['FT', 'AET', 'PEN', 'NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP', 'SUSP', 'INT', 'PENDING', 'HT'];

  if (frozenStatuses.includes(status) || m.isFinished) {
    let displayMin = m.minute;
    let progress = m.timelineProgress || 0;

    if (status === 'FT' || status === 'AET' || status === 'PEN' || m.isFinished) { displayMin = 90; progress = 100; }
    if (status === 'HT') { displayMin = 45; progress = 50; }
    if (status === 'NS' || status === 'TBD' || status === 'PST') { displayMin = 0; progress = 0; }

    return {
      ...m,
      displayMinute: displayMin,
      isLive: status === 'HT' || status === 'INT' || status === 'SUSP',
      isHT: status === 'HT',
      isStarted: !['NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP'].includes(status),
      timelineProgress: progress,
    };
  }

  // apiMinute = the last value the API actually gave us (may already
  // include added time, e.g. 47 during 1H means "45+2"). This is our
  // source of truth whenever it's fresh, and the floor for any ceiling
  // we apply below — we never show LESS than what the API confirmed.
  const apiMinute = m.minute || 0;
  let apiEstimate = null;
  let isFresh = false;

  // Estimate #1: ticking forward from the last real API update
  if (m.updatedAt) {
    const lastUpdateTime = new Date(m.updatedAt).getTime();
    if (!isNaN(lastUpdateTime) && lastUpdateTime > 0) {
      const elapsedSinceUpdateMs = now - lastUpdateTime;
      if (elapsedSinceUpdateMs >= 0) {
        const elapsedMins = Math.floor(elapsedSinceUpdateMs / 60000);
        apiEstimate = apiMinute + elapsedMins;
        // Treat as "fresh" only while within a window wider than the poll
        // interval, so one missed refetch doesn't break the clock.
        isFresh = elapsedSinceUpdateMs < 90 * 1000;
      }
    }
  }

  // Estimate #2: purely from kickoff time — used when the API estimate
  // is missing or stale (e.g. minute is 0 or the last update is old).
  const kickoffMs = m.timestamp ? m.timestamp * 1000 : null;
  const kickoffEstimate = estimateMinuteFromKickoff(kickoffMs, status, now);

  // Uncapped raw estimate — this is what we'd show if we let ticking run
  // forever. The capping below is what stops that.
  let rawEstimate;
  if (isFresh && apiEstimate) {
    rawEstimate = kickoffEstimate ? Math.max(apiEstimate, kickoffEstimate) : apiEstimate;
  } else if (kickoffEstimate) {
    rawEstimate = Math.max(kickoffEstimate, apiMinute);
  } else {
    rawEstimate = Math.max(apiEstimate || apiMinute, 1);
  }

  // ★ Period-aware capping + "45+X'" / "90+X'" formatting, in place of the
  // old flat Math.min(..., 55/100/121) clamps.
  let smartMinute;
  let newLabel;

  if (status === '1H') {
    smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, HALF_LEN, FIRST_HALF_ADDED_CAP_DEFAULT);
    newLabel = formatPeriodLabel(smartMinute, HALF_LEN);
  } else if (status === '2H' || status === 'LIVE') {
    smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, FULL_LEN, SECOND_HALF_ADDED_CAP_DEFAULT);
    newLabel = formatPeriodLabel(smartMinute, FULL_LEN);
  } else if (status === 'ET') {
    // Two-stage: cap against 105' first, then 120', same "don't count
    // forever" rule applied at whichever boundary we're currently past.
    if (rawEstimate <= 105) {
      smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, 105, ET_ADDED_CAP_DEFAULT);
      newLabel = formatPeriodLabel(smartMinute, 105);
    } else {
      smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, 120, ET_ADDED_CAP_DEFAULT);
      newLabel = formatPeriodLabel(smartMinute, 120);
    }
  } else {
    smartMinute = Math.max(rawEstimate, 1);
    newLabel = `${smartMinute}'`;
  }

  if (smartMinute < 1) smartMinute = 1;

  const newProgress = Math.min((smartMinute / 90) * 100, 100);

  return {
    ...m,
    minute: smartMinute,
    displayMinute: smartMinute,
    status,
    isLive: true,
    isFinished: false,
    isHT: false,
    isStarted: true,
    statusLabel: newLabel,
    statusClass: m.isStaleData ? 'status-live-stale' : 'status-live',
    timelineProgress: newProgress,
  };
}

export const extractTournamentStage = (raw) => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;