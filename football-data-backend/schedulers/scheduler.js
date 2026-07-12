const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const matchesService = require('../services/matches');
const liveService = require('../services/liveMatches');
const finishedService = require('../services/finishedMatches');
const competitionsService = require('../services/competitions');
const standingsService = require('../services/standings');
const teamsService = require('../services/teams');

async function refreshLiveAndToday() {
  try {
    var result = await matchesService.cacheTodayMatches();
    await liveService.cacheLiveMatches(result.live);
    var finished = result.matches.filter(function(m) { return m.status === 'FINISHED'; });
    await finishedService.cacheFromToday(finished);
  } catch (e) { logger.error('[SCHEDULER] refreshLiveAndToday: ' + e.message); }
}

async function refreshFullRange() {
  try { await matchesService.cacheDateRange(); }
  catch (e) { logger.error('[SCHEDULER] refreshFullRange: ' + e.message); }
}

async function refreshStandings() {
  try { await standingsService.fetchAndCacheAll(); }
  catch (e) { logger.error('[SCHEDULER] refreshStandings: ' + e.message); }
}

async function refreshTeams() {
  try { await teamsService.fetchAndCacheAll(); }
  catch (e) { logger.error('[SCHEDULER] refreshTeams: ' + e.message); }
}

async function refreshCompetitions() {
  try { await competitionsService.fetchAndCache(); }
  catch (e) { logger.error('[SCHEDULER] refreshCompetitions: ' + e.message); }
}

async function initialSeed() {
  logger.info('[SCHEDULER] Running initial data seed ...');
  await refreshCompetitions();
  await refreshFullRange();
  await refreshLiveAndToday();
  if (env.competitions.length > 0) {
    await refreshStandings();
    await refreshTeams();
  }
  logger.info('[SCHEDULER] Initial seed complete');
}

function start() {
  if (!env.scheduler.enabled) { logger.info('[SCHEDULER] Disabled'); return; }
  cron.schedule('* * * * *', function() { refreshLiveAndToday(); });
  logger.info('[SCHEDULER] Live+Today -> every minute');
  cron.schedule('*/30 * * * *', function() { refreshFullRange(); });
  logger.info('[SCHEDULER] Full range -> every 30 min');
  if (env.competitions.length > 0) {
    cron.schedule('0 */6 * * *', function() { refreshStandings(); });
    logger.info('[SCHEDULER] Standings -> every 6 hours');
    cron.schedule('0 3 * * *', function() { refreshTeams(); });
    logger.info('[SCHEDULER] Teams -> daily 03:00');
  }
  cron.schedule('0 2 * * *', function() { refreshCompetitions(); });
  logger.info('[SCHEDULER] Competitions -> daily 02:00');
}

module.exports = { start: start, initialSeed: initialSeed };
