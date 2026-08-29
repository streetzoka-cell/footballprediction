// src/engine/matchEngine.js
import { getLocalDateFromUtc, formatTime, toLocalDateStr } from '../utils/dates';

const FT_STATUSES = new Set(['FT', 'AET', 'PEN', 'AW', 'WO']);
const FT_THRESHOLD = 3 * 60 * 60 * 1000;
const HIDE_THRESHOLD = 24 * 60 * 60 * 1000;
const HALF = 45, FULL = 90, HT_BREAK = 15, ET_HALF = 15, ET_BREAK = 5, ET_HT = 5;
const ADDED_1H = 3, ADDED_2H = 8, ADDED_ET = 3;

/* ★ Per-match pick_groups mirror (fixtures/<date>.json additive keys).
   Renders as: 🔥 TOP10 · G1 · #5 · STRONG | 🔒 1X2 · G1 · #3 · STRONG | ... */
const PG_PRIORITY = ['TOP10_DAILY', 'PURE_1X2', 'GG_BTTS', 'OVER_UNDER', 'SCORE'];
const PG_LABEL = {
  TOP10_DAILY: '🔥 TOP10', PURE_1X2: '🔒 1X2', GG_BTTS: '⚽ GG',
  OVER_UNDER: '📈 O/U', SCORE: '🎯 CS',
};

export function bestPickGroupBadge(raw) {
  const pg = raw?.pick_groups;
  if (!pg || typeof pg !== 'object') return null;
  const keys = [...PG_PRIORITY, ...Object.keys(pg).filter((k) => !PG_PRIORITY.includes(k))];
  for (const fam of keys) {
    const g = pg[fam];
    if (g?.tier) {
      const label = PG_LABEL[fam] || fam;
      return `${label} · G${g.tier} · #${g.rank}${g.quality ? ` · ${g.quality}` : ''}`;
    }
  }
  return null;
}

export function normalizeMatch(raw, isPrimary = true, now = Date.now(), isDataFresh = true) {
  if (!raw) return null;
  const display = raw.display || {};
  const time = raw.time || {};
  const score = { home: raw.homeScore || display.score?.home || 0, away: raw.awayScore || display.score?.away || 0 };
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

  if (FT_STATUSES.has(status)) { isFinished = true; isLive = false; if (minute < 90) minute = 90; }

  let timestamp = raw.timestamp;
  if (!timestamp) {
    const d = raw.utcDate || raw.date;
    if (d) { const p = new Date(d).getTime(); if (!isNaN(p)) timestamp = Math.floor(p / 1000); }
  }

  if (timestamp && isDataFresh) {
    const start = timestamp * 1000;
    const elapsed = now - start;
    if (elapsed > HIDE_THRESHOLD && !isFinished) { isHidden = true; isLive = false; isFinished = false; status = 'HIDDEN'; }
    else if (elapsed > FT_THRESHOLD && !isFinished) { isLive = false; isFinished = true; status = 'FT'; minute = 90; }
  }

  const isHT = display.isHalfTime || status === 'HT';
  const isScheduled = !isLive && !isFinished && !isHT && (status === 'NS' || status === 'TBD' || display.isUpcoming);

  const matchDateStr = raw.dateStr || getLocalDateFromUtc(raw.date || raw.utcDate);
  const kickoffTime = time.kickoffLocal || (raw.utcDate || raw.date ? formatTime(raw.utcDate || raw.date) : 'TBD');
  const updatedAt = raw.dataQuality?.lastUpdated || raw.lastUpdated || raw.updatedAt || Date.now();

  let statusLabel = '', statusClass = 'status-upcoming', timelineProgress = 0;
  if (isLive) {
    statusClass = 'status-live';
    if (isHT) { statusLabel = 'Half Time'; statusClass = 'status-ht'; timelineProgress = 50; }
    else { statusLabel = formatMinute(minute, status); timelineProgress = Math.min((minute / 90) * 100, 100); }
  } else if (isFinished) {
    statusLabel = status === 'AET' ? 'AET' : status === 'PEN' ? 'PEN' : 'Full Time';
    statusClass = 'status-ft'; timelineProgress = 100;
  } else if (isScheduled) { statusLabel = kickoffTime; }
  else { statusLabel = status || 'Scheduled'; }
  if (isStaleData && isLive) statusClass = 'status-live-stale';

  // Stats
  const rawStats = raw.statistics || raw.stats;
  const stats = { possession: null, shots: null, shotsOnTarget: null, corners: null, fouls: null, yellowCards: null, redCards: null, offsides: null };
  if (Array.isArray(rawStats)) {
    rawStats.forEach(s => {
      const t = String(s.type || '').toLowerCase();
      const h = s.home ?? s.homeValue ?? 0, a = s.away ?? s.awayValue ?? 0;
      if (t.includes('possession')) stats.possession = { home: parseInt(h) || 0, away: parseInt(a) || 0 };
      else if (t.includes('shots on goal') || t.includes('shots on target')) stats.shotsOnTarget = { home: h, away: a };
      else if (t.includes('total shots') || t === 'shots') stats.shots = { home: h, away: a };
      else if (t.includes('corner')) stats.corners = { home: h, away: a };
      else if (t.includes('foul')) stats.fouls = { home: h, away: a };
      else if (t.includes('yellow card')) stats.yellowCards = { home: h, away: a };
      else if (t.includes('red card')) stats.redCards = { home: h, away: a };
      else if (t.includes('offside')) stats.offsides = { home: h, away: a };
    });
  }
  const hasRealStats = !!(stats.possession || stats.shots || stats.shotsOnTarget || stats.corners);

  // Odds
  const rawOdds = raw.odds || raw.bookmakers?.[0]?.bets?.find(b => b.id === 1)?.values || raw.bets?.find(b => b.id === 1)?.values || null;
  const odds = rawOdds ? {
    home: rawOdds.find(v => v.value === 'Home')?.odd || rawOdds.home,
    draw: rawOdds.find(v => v.value === 'Draw')?.odd || rawOdds.draw,
    away: rawOdds.find(v => v.value === 'Away')?.odd || rawOdds.away,
    over25: raw.odds?.over_25 || raw.odds?.over25,
    under25: raw.odds?.under_25 || raw.odds?.under25
  } : null;

  return {
    id: String(raw.id || ''), sport: raw.sport || 'football',
    date: raw.date, utcDate: raw.utcDate || raw.date, dateStr: matchDateStr, localDateStr: toLocalDateStr(raw.utcDate || raw.date),
    timestamp, kickoff: kickoffTime, kickoffUtc: raw.kickoffUtc || raw.utcDate || raw.date,
    status, statusLong: raw.statusLong, isLive, isFinished, isScheduled, isHT, isStarted: isLive && !isHT,
    minute, displayMinute: minute, updatedAt, isHidden, isStaleData, statusLabel, statusClass, timelineProgress,
    homeTeamId: raw.homeTeamId, homeName, homeTeamName: homeName, homeTeamLogo: homeLogo, homeLogo,
    awayTeamId: raw.awayTeamId, awayName, awayTeamName: awayName, awayTeamLogo: awayLogo, awayLogo,
    homeScore: score.home, awayScore: score.away, goalsHome: score.home, goalsAway: score.away,
    leagueId: raw.leagueId, leagueName, leagueLogo, leagueCountry: raw.leagueCountry,

    /* ★ pipeline passthrough — was stripped before: */
    mustHave: raw.mustHave === true,
    matchScore: raw.matchScore ?? raw.importance ?? 0,
    category: raw.category || 'NORMAL',
    ids: raw.ids || null,
    venue: raw.venue || null,
    referee: raw.referee || null,
    pickGroups: raw.pick_groups || null,                          // ★ per-match group mirror (badges)
    pickGroupBadge: bestPickGroupBadge(raw),                      // ★ precomputed label
    topCorrectScore: raw.top_correct_score || null,               // ★ CS headline on fixture rows
    topCsProb: raw.top_cs_prob ?? null,

    stats, hasRealStats, odds, mlPredictions: raw.prediction || raw.mlPredictions || null, intelData: raw.intelData || null,
    homeTeam: { name: homeName, shortName: homeName, crest: homeLogo, id: raw.homeTeamId },
    awayTeam: { name: awayName, shortName: awayName, crest: awayLogo, id: raw.awayTeamId },
    league: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
    competition: { name: leagueName, emblem: leagueLogo, id: raw.leagueId },
  };
}

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

function estimateMinuteFromKickoff(kickoffMs, status, now) {
  if (!kickoffMs) return null;
  const elapsedMin = (now - kickoffMs) / 60000;
  if (elapsedMin < 0) return null;
  switch (status) {
    case '1H': case 'LIVE': return Math.min(Math.max(1, Math.round(elapsedMin)), HALF + 10);
    case 'HT': return HALF;
    case '2H': {
      const secondHalfStart = HALF + HT_BREAK;
      const into2H = elapsedMin - secondHalfStart;
      return Math.min(Math.max(HALF + 1, HALF + Math.round(Math.max(into2H, 0))), 90 + 10);
    }
    case 'ET': {
      const et1Start = HALF * 2 + HT_BREAK + ET_BREAK;
      const et1End = et1Start + ET_HALF;
      if (elapsedMin <= et1End + ET_HT) { const into = elapsedMin - et1Start; return Math.min(Math.max(91, 90 + Math.round(Math.max(into, 0))), 105 + 1); }
      const et2Start = et1End + ET_HT;
      const into2 = elapsedMin - et2Start;
      return Math.min(Math.max(106, 105 + Math.round(Math.max(into2, 0))), 120 + 1);
    }
    case 'PEN': return 120;
    default: return null;
  }
}

function capMinuteForPeriod(rawEstimate, apiMinute, periodLen, addedCapDefault) {
  const ceiling = Math.max(apiMinute, periodLen + addedCapDefault);
  return Math.min(rawEstimate, ceiling);
}

function formatPeriodLabel(totalMinute, periodLen) {
  if (totalMinute <= periodLen) return `${totalMinute}'`;
  return `${periodLen}+${totalMinute - periodLen}'`;
}

export function applySmartMinute(m, now = Date.now()) {
  if (!m) return m;
  const status = String(m.status || '').toUpperCase();
  const frozen = ['FT', 'AET', 'PEN', 'NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP', 'SUSP', 'INT', 'PENDING', 'HT'];
  if (frozen.includes(status) || m.isFinished) {
    let displayMin = m.minute, progress = m.timelineProgress || 0;
    if (status === 'FT' || status === 'AET' || status === 'PEN' || m.isFinished) { displayMin = 90; progress = 100; }
    if (status === 'HT') { displayMin = 45; progress = 50; }
    if (status === 'NS' || status === 'TBD' || status === 'PST') { displayMin = 0; progress = 0; }
    return { ...m, displayMinute: displayMin, isLive: status === 'HT' || status === 'INT' || status === 'SUSP', isHT: status === 'HT', isStarted: !['NS', 'TBD', 'PST', 'CANC', 'ABD', 'POSTP'].includes(status), timelineProgress: progress };
  }

  const apiMinute = m.minute || 0;
  let apiEstimate = null, isFresh = false;
  if (m.updatedAt) {
    const last = new Date(m.updatedAt).getTime();
    if (!isNaN(last) && last > 0) {
      const elapsed = now - last;
      if (elapsed >= 0) { apiEstimate = apiMinute + Math.floor(elapsed / 60000); isFresh = elapsed < 90 * 1000; }
    }
  }
  const kickoffMs = m.timestamp ? m.timestamp * 1000 : null;
  const kickoffEstimate = estimateMinuteFromKickoff(kickoffMs, status, now);
  let rawEstimate;
  if (isFresh && apiEstimate) rawEstimate = kickoffEstimate ? Math.max(apiEstimate, kickoffEstimate) : apiEstimate;
  else if (kickoffEstimate) rawEstimate = Math.max(kickoffEstimate, apiMinute);
  else rawEstimate = Math.max(apiEstimate || apiMinute, 1);

  let smartMinute, newLabel;
  if (status === '1H') { smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, HALF, ADDED_1H); newLabel = formatPeriodLabel(smartMinute, HALF); }
  else if (status === '2H' || status === 'LIVE') { smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, FULL, ADDED_2H); newLabel = formatPeriodLabel(smartMinute, FULL); }
  else if (status === 'ET') {
    if (rawEstimate <= 105) { smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, 105, ADDED_ET); newLabel = formatPeriodLabel(smartMinute, 105); }
    else { smartMinute = capMinuteForPeriod(rawEstimate, apiMinute, 120, ADDED_ET); newLabel = formatPeriodLabel(smartMinute, 120); }
  } else { smartMinute = Math.max(rawEstimate, 1); newLabel = `${smartMinute}'`; }

  if (smartMinute < 1) smartMinute = 1;
  return { ...m, minute: smartMinute, displayMinute: smartMinute, status, isLive: true, isFinished: false, isHT: false, isStarted: true, statusLabel: newLabel, statusClass: m.isStaleData ? 'status-live-stale' : 'status-live', timelineProgress: Math.min((smartMinute / 90) * 100, 100) };
}

export const extractTournamentStage = () => null;
export const extractMatchDate = (m) => m.dateStr;
export const extractDate = extractMatchDate;