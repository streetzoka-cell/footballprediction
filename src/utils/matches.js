// src/utils/matches.js
import { formatTime } from './dates';
import { SPORT, isLiveStatus, isFinishedStatus, isScheduledStatus, getLeagueColor } from './constants';

export function transformMatch(m) {
  if (!m) return null;
  if (m.sport === SPORT.BASKETBALL || m.pointsHome !== undefined || m.q1Home !== undefined) return transformBasketball(m);
  return transformFootball(m);
}

function transformFootball(m) {
  const id = String(m.id || ''), s = m.status || '';
  return {
    id, sport: SPORT.FOOTBALL, date: m.date || null, kickoff: formatTime(m.date), timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD' }, awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD' },
    homeId: String(m.homeTeamId || ''), awayId: String(m.awayTeamId || ''), homeLogo: m.homeTeamLogo || null, awayLogo: m.awayTeamLogo || null,
    league: { id: String(m.leagueId || ''), name: m.leagueName || 'Other', color: getLeagueColor(m.leagueId), emblem: m.leagueLogo || null, country: m.leagueCountry || '', flag: m.leagueFlag || null, season: m.season || null, round: m.round || null },
    leagueKey: String(m.leagueId || 'OTHER'), leagueCountry: m.leagueCountry || '', status: s, rawStatus: s, statusLong: m.statusLong || '',
    homeScore: m.goalsHome ?? null, awayScore: m.goalsAway ?? null,
    score: { home: m.goalsHome ?? null, away: m.goalsAway ?? null, halfTime: { home: m.scoreHalftimeHome ?? null, away: m.scoreHalftimeAway ?? null }, fullTime: { home: m.scoreFulltimeHome ?? m.goalsHome ?? null, away: m.scoreFulltimeAway ?? m.goalsAway ?? null }, extraTime: { home: m.scoreExtratimeHome ?? null, away: m.scoreExtratimeAway ?? null }, penalties: { home: m.scorePenaltyHome ?? null, away: m.scorePenaltyAway ?? null } },
    isLive: isLiveStatus(s, SPORT.FOOTBALL), isFinished: isFinishedStatus(s, SPORT.FOOTBALL), isScheduled: isScheduledStatus(s, SPORT.FOOTBALL),
    minute: m.elapsed ?? null, venue: null, referee: null,
    
    // ★ NEW INTELLIGENCE FIELDS ★
    matchScore: m.matchScore || 0,
    category: m.category || 'NORMAL',
  };
}

function transformBasketball(m) {
  const id = String(m.id || ''), s = m.status || '', periodMap = { 1: 'Q1', 2: 'Q2', 3: 'Q3', 4: 'Q4', 5: 'OT' }, minute = m.currentPeriod ? (periodMap[m.currentPeriod] || s) : (s || null);
  return {
    id, sport: SPORT.BASKETBALL, date: m.date || null, kickoff: formatTime(m.date), timestamp: m.timestamp || null,
    homeTeam: { id: String(m.homeTeamId || ''), name: m.homeTeamName || 'TBD' }, awayTeam: { id: String(m.awayTeamId || ''), name: m.awayTeamName || 'TBD' },
    homeId: String(m.homeTeamId || ''), awayId: String(m.awayTeamId || ''), homeLogo: m.homeTeamLogo || null, awayLogo: m.awayTeamLogo || null,
    league: { id: String(m.leagueId || ''), name: m.leagueName || 'Other', color: getLeagueColor(m.leagueId), emblem: m.leagueLogo || null, country: m.leagueCountry || '', flag: null, season: m.season || null, round: null },
    leagueKey: String(m.leagueId || 'OTHER'), leagueCountry: m.leagueCountry || '', status: s, rawStatus: s, statusLong: m.statusLong || '',
    homeScore: m.pointsHome ?? null, awayScore: m.pointsAway ?? null,
    score: { home: m.pointsHome ?? null, away: m.pointsAway ?? null, halfTime: null, fullTime: { home: m.pointsHome ?? null, away: m.pointsAway ?? null }, extraTime: null, penalties: null, q1: { home: m.q1Home ?? null, away: m.q1Away ?? null }, q2: { home: m.q2Home ?? null, away: m.q2Away ?? null }, q3: { home: m.q3Home ?? null, away: m.q3Away ?? null }, q4: { home: m.q4Home ?? null, away: m.q4Away ?? null }, ot: { home: m.otHome ?? null, away: m.otAway ?? null } },
    isLive: isLiveStatus(s, SPORT.BASKETBALL), isFinished: isFinishedStatus(s, SPORT.BASKETBALL), isScheduled: isScheduledStatus(s, SPORT.BASKETBALL),
    minute, venue: null, referee: null,
    
    // ★ NEW INTELLIGENCE FIELDS ★
    matchScore: m.matchScore || 0,
    category: m.category || 'NORMAL',
  };
}