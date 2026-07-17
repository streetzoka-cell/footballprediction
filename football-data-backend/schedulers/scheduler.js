// FILE: backend/schedulers/scheduler.js

const env = require('../config/env');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const frontendSync = require('../services/frontendSync');

// ─── RATE LIMIT HELPER ───────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const API_PAUSE = 7000; // 7 seconds for standings/teams to avoid limits

// ─── API FETCHER ────────────────────────────────────────────────────────
const API_BASE = env.footballData.baseUrl;

async function fetchAPI(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Auth-Token': env.footballData.apiKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text.substring(0, 200)}`);
    }
    return await res.json();
  } catch (err) {
    logger.error(`[API] Fetch failed for ${url}: ${err.message}`);
    throw err;
  }
}

// ─── DATE HELPERS ───────────────────────────────────────────────────────
function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ─── SEED FUNCTIONS ───────────────────────────────────────────────────

async function seedFixtures() {
  logger.info('[SEED] Fetching fixtures for -14 to +14 days (3 fast batches)...');
  const allMatches = [];

  // API allows max 10 days per request, so we split 28 days into 3 batches
  const batches = [
    { from: getDateStr(-14), to: getDateStr(-5) },
    { from: getDateStr(-4),  to: getDateStr(5) },
    { from: getDateStr(6),   to: getDateStr(14) },
  ];

  for (const batch of batches) {
    try {
      const data = await fetchAPI(`/matches?dateFrom=${batch.from}&dateTo=${batch.to}`);
      const matches = data.matches || [];
      allMatches.push(...matches);
      
      if (matches.length) {
        await cache.batchSet('fixtures', matches.map(m => ({ id: String(m.id), data: m })));
      }
    } catch (err) {
      logger.error(`[SEED] Fixtures batch ${batch.from} to ${batch.to} failed: ${err.message}`);
    }
    await sleep(2000); // 2 sec pause between fixture batches
  }

  await frontendSync.syncFixturesByDate(allMatches);
  await cache.setLastUpdated('fixtures', { count: allMatches.length });
  logger.info(`[SEED] Fixtures done: ${allMatches.length} matches`);
}

async function seedCompetitions() {
  logger.info('[SEED] Fetching competitions...');
  try {
    const data = await fetchAPI('/competitions');
    const competitions = (data.competitions || []).filter(c => 
      env.competitions.includes(c.code)
    );

    const cacheDocs = competitions.map(c => ({ id: String(c.id), data: c }));
    await cache.replaceCollection('competitions', cacheDocs);
    await cache.setLastUpdated('competitions', { count: competitions.length });
    await frontendSync.syncCompetitions(competitions);

    logger.info(`[SEED] Competitions done: ${competitions.length}`);
  } catch (err) {
    logger.error(`[SEED] Competitions failed: ${err.message}`);
  }
}

async function seedStandingsAndTeams() {
  logger.info('[SEED] Fetching standings & teams for: ' + env.competitions.join(', '));
  
  for (const code of env.competitions) {
    try {
      const standData = await fetchAPI(`/competitions/${code}/standings`);
      const standings = standData.standings || [];
      
      await cache.setDocument('standings', code, { standings });
      await frontendSync.syncStandings(code, standings);

      await sleep(API_PAUSE);

      const teamData = await fetchAPI(`/competitions/${code}/teams`);
      const teams = teamData.teams || [];
      
      const cacheDocs = teams.map(t => ({ id: String(t.id), data: t }));
      await cache.replaceCollection('teams_' + code, cacheDocs);
      await frontendSync.syncTeams(code, teams);

      logger.info(`[SEED] ${code}: ${standings.length} standings, ${teams.length} teams`);
    } catch (err) {
      // WC/EC will fail here if there's no active tournament. This is normal!
      logger.error(`[SEED] Failed ${code}: ${err.message}`);
    }
    await sleep(API_PAUSE);
  }
  await cache.setLastUpdated('standings', {});
  await cache.setLastUpdated('teams', {});
}

// ─── PERIODIC SYNC FUNCTIONS ────────────────────────────────────────────

async function syncFixtures() {
  logger.info('[SYNC] Fixtures sync started');
  const allMatches = [];

  const batches = [
    { from: getDateStr(-14), to: getDateStr(-5) },
    { from: getDateStr(-4),  to: getDateStr(5) },
    { from: getDateStr(6),   to: getDateStr(14) },
  ];

  for (const batch of batches) {
    try {
      const data = await fetchAPI(`/matches?dateFrom=${batch.from}&dateTo=${batch.to}`);
      const matches = data.matches || [];
      allMatches.push(...matches);

      if (matches.length) {
        await cache.batchSet('fixtures', matches.map(m => ({ id: String(m.id), data: m })));
      }
    } catch (err) {
      logger.error(`[SYNC] Fixtures batch failed: ${err.message}`);
    }
    await sleep(2000);
  }

  await frontendSync.syncFixturesByDate(allMatches);
  await cache.setLastUpdated('fixtures', { count: allMatches.length });
  await frontendSync.cleanupOldFixtures(15);
  logger.info(`[SYNC] Fixtures sync done: ${allMatches.length} matches`);
}

async function syncLive() {
  try {
    const data = await fetchAPI('/matches?status=LIVE,IN_PLAY,PAUSED');
    const matches = data.matches || [];

    const cacheDocs = matches.map(m => ({ id: String(m.id), data: m }));
    await cache.replaceCollection('live', cacheDocs);
    await frontendSync.syncLive(matches);

    if (matches.length > 0) {
      logger.debug(`[SYNC] Live: ${matches.length} matches in play`);
    }
  } catch (err) {
    logger.error(`[SYNC] Live failed: ${err.message}`);
  }
}

async function syncStandingsAndTeams() {
  for (const code of env.competitions) {
    try {
      const standData = await fetchAPI(`/competitions/${code}/standings`);
      const standings = standData.standings || [];
      await cache.setDocument('standings', code, { standings });
      await frontendSync.syncStandings(code, standings);

      await sleep(API_PAUSE);

      const teamData = await fetchAPI(`/competitions/${code}/teams`);
      const teams = teamData.teams || [];
      const cacheDocs = teams.map(t => ({ id: String(t.id), data: t }));
      await cache.replaceCollection('teams_' + code, cacheDocs);
      await frontendSync.syncTeams(code, teams);

    } catch (err) {
      logger.error(`[SYNC] ${code} failed: ${err.message}`);
    }
    await sleep(API_PAUSE);
  }
  await cache.setLastUpdated('standings', {});
  await cache.setLastUpdated('teams', {});
  logger.info('[SYNC] Standings & Teams updated');
}

async function syncCompetitions() {
  try {
    const data = await fetchAPI('/competitions');
    const competitions = (data.competitions || []).filter(c => 
      env.competitions.includes(c.code)
    );
    
    const cacheDocs = competitions.map(c => ({ id: String(c.id), data: c }));
    await cache.replaceCollection('competitions', cacheDocs);
    await frontendSync.syncCompetitions(competitions);
    
    await cache.setLastUpdated('competitions', { count: competitions.length });
    logger.info('[SYNC] Competitions updated');
  } catch (err) {
    logger.error(`[SYNC] Competitions failed: ${err.message}`);
  }
}

// ─── SCHEDULER ORCHESTRATOR ─────────────────────────────────────────────

async function initialSeed() {
  logger.info('========================================================');
  logger.info('  RUNNING INITIAL SEED');
  logger.info('========================================================');
  
  await seedCompetitions();
  await seedFixtures();
  await seedStandingsAndTeams();
  await syncLive();
  
  logger.info('========================================================');
  logger.info('  INITIAL SEED COMPLETE');
  logger.info('========================================================');
}

let intervals = [];

function start() {
  if (!env.scheduler.enabled) {
    logger.info('[SCHEDULER] Disabled by config');
    return;
  }

  logger.info('[SCHEDULER] Starting periodic jobs...');

  intervals.push(setInterval(() => {
    syncFixtures().catch(err => logger.error(`[SCHED] Fixtures error: ${err.message}`));
  }, 5 * 60 * 1000));

  intervals.push(setInterval(() => {
    syncLive().catch(err => logger.error(`[SCHED] Live error: ${err.message}`));
  }, 45 * 1000));

  intervals.push(setInterval(() => {
    syncStandingsAndTeams().catch(err => logger.error(`[SCHED] Standings error: ${err.message}`));
  }, 2 * 60 * 60 * 1000));

  intervals.push(setInterval(() => {
    syncCompetitions().catch(err => logger.error(`[SCHED] Competitions error: ${err.message}`));
  }, 24 * 60 * 60 * 1000));
}

function stop() {
  intervals.forEach(clearInterval);
  intervals = [];
  logger.info('[SCHEDULER] Stopped');
}

module.exports = {
  initialSeed,
  start,
  stop,
  syncFixtures,
  syncLive,
  syncStandingsAndTeams,
  syncCompetitions,
};