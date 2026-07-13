const api = require("../config/api");
const cache = require("../utils/cache");
const retry = require("../utils/retry");
const logger = require("../utils/logger");

const FIXTURES_COL = "fixtures";
const LIVE_COL = "liveMatches";

function v(x) { return (x !== undefined && x !== null) ? x : null; }

function normaliseMatch(m) {
  var score = m.score || {};
  var goals = (score.goals || []).map(function(g) {
    return {
      team: g.team ? { id: v(g.team.id), name: v(g.team.name) } : null,
      scorer: g.scorer ? { id: v(g.scorer.id), name: v(g.scorer.name) } : null,
      assist: g.assist ? { id: v(g.assist.id), name: v(g.assist.name) } : null,
      minute: v(g.minute),
      type: v(g.type),
      extraTime: !!g.extraTime,
      penaltyShootout: !!g.penaltyShootout,
    };
  });
  var cards = (score.cards || []).map(function(c) {
    return {
      team: c.team ? { id: v(c.team.id), name: v(c.team.name) } : null,
      player: c.player ? { id: v(c.player.id), name: v(c.player.name) } : null,
      minute: v(c.minute),
      type: v(c.type),
    };
  });
  var referees = (m.referees || []).map(function(r) {
    return { id: v(r.id), name: v(r.name), role: v(r.role), nationality: v(r.nationality) };
  });

  return {
    id: String(m.id),
    date: m.utcDate ? m.utcDate.split("T")[0] : null,
    utcDate: v(m.utcDate),
    status: m.status || "SCHEDULED",
    matchday: v(m.matchday),
    competition: m.competition ? {
      id: m.competition.id, name: m.competition.name,
      code: v(m.competition.code), emblem: v(m.competition.emblem), type: v(m.competition.type),
    } : null,
    season: m.season ? { id: m.season.id } : null,
    homeTeam: m.homeTeam ? {
      id: m.homeTeam.id, name: m.homeTeam.name,
      shortName: v(m.homeTeam.shortName), crest: v(m.homeTeam.crest),
    } : null,
    awayTeam: m.awayTeam ? {
      id: m.awayTeam.id, name: m.awayTeam.name,
      shortName: v(m.awayTeam.shortName), crest: v(m.awayTeam.crest),
    } : null,
    score: {
      halfTime:  { home: v(score.halfTime ? score.halfTime.home : null),  away: v(score.halfTime ? score.halfTime.away : null) },
      fullTime:  { home: v(score.fullTime ? score.fullTime.home : null),  away: v(score.fullTime ? score.fullTime.away : null) },
      extraTime: { home: v(score.extraTime ? score.extraTime.home : null), away: v(score.extraTime ? score.extraTime.away : null) },
      penalties: { home: v(score.penalties ? score.penalties.home : null), away: v(score.penalties ? score.penalties.away : null) },
      winner: v(score.winner),
      duration: v(score.duration),
      goals: goals,
      cards: cards,
      corners: score.corners ? { home: v(score.corners.home), away: v(score.corners.away) } : null,
    },
    referees: referees,
    fetchedAt: new Date().toISOString(),
  };
}

function getDateStr(offset) {
  var d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
}

async function fetchTodayFromApi() {
  logger.debug("[MATCHES] Fetching today ...");
  var r = await retry(function() { return api.get("/matches"); }, { label: "matches-today" });
  return (r.data.matches || []).map(normaliseMatch);
}

async function fetchRangeFromApi(dateFrom, dateTo) {
  logger.info("[MATCHES] Range " + dateFrom + " to " + dateTo + " ...");
  var r = await retry(function() { return api.get("/matches", { params: { dateFrom: dateFrom, dateTo: dateTo } }); }, { label: "range-" + dateFrom });
  return (r.data.matches || []).map(normaliseMatch);
}

async function cacheTodayMatches() {
  var matches = await fetchTodayFromApi();
  var live = matches.filter(function(m) { return m.status === "IN_PLAY" || m.status === "PAUSED"; });
  if (matches.length) await cache.batchSet(FIXTURES_COL, matches.map(function(m) { return { id: m.id, data: m }; }));
  await cache.replaceCollection(LIVE_COL, live.map(function(m) { return { id: m.id, data: m }; }));
  await cache.setLastUpdated("liveMatches", { count: live.length });
  logger.info("[MATCHES] Today: " + matches.length + " total, " + live.length + " live");
  return { matches: matches, live: live };
}

async function cacheDateRange() {
  var fp = getDateStr(-8), td = getDateStr(0), ff = getDateStr(1), tf = getDateStr(8);
  logger.info("[MATCHES] 16-day range (two batches) ...");
  var past = await fetchRangeFromApi(fp, td);
  logger.info("[MATCHES] Past 8: " + past.length);
  if (past.length) await cache.batchSet(FIXTURES_COL, past.map(function(m) { return { id: m.id, data: m }; }));
  var future = await fetchRangeFromApi(ff, tf);
  logger.info("[MATCHES] Next 8: " + future.length);
  if (future.length) await cache.batchSet(FIXTURES_COL, future.map(function(m) { return { id: m.id, data: m }; }));
  var total = past.length + future.length;
  await cache.setLastUpdated("fixturesRange", { count: total });
  logger.info("[MATCHES] Range: " + total + " total");
  return total;
}

async function getCachedAll() {
  var all = await cache.getCollection(FIXTURES_COL);
  return all.map(function(r) { return r.data; });
}

async function getCachedByDateRange(dateFrom, dateTo) {
  var all = await cache.getCollection(FIXTURES_COL);
  return all.map(function(r) { return r.data; }).filter(function(m) { return m.date && m.date >= dateFrom && m.date <= dateTo; });
}
async function getCachedToday() { var t = getDateStr(0); return getCachedByDateRange(t, t); }
async function getCachedLive() { var r = await cache.getCollection(LIVE_COL); return r.map(function(r) { return r.data; }); }
async function getCachedFinished() { var a = await cache.getCollection(FIXTURES_COL); return a.map(function(r) { return r.data; }).filter(function(m) { return m.status === "FINISHED"; }); }

module.exports = {
  cacheTodayMatches: cacheTodayMatches,
  cacheDateRange: cacheDateRange,
  getCachedAll: getCachedAll,
  getCachedByDateRange: getCachedByDateRange,
  getCachedToday: getCachedToday,
  getCachedLive: getCachedLive,
  getCachedFinished: getCachedFinished,
  fetchTodayFromApi: fetchTodayFromApi,
  normaliseMatch: normaliseMatch,
  getDateStr: getDateStr
};
