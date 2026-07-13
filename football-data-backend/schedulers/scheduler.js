// FILE: backend/schedulers/scheduler.js

const env = require('../config/env');
const logger = require('../utils/logger');
const cache = require('../utils/cache');
const frontendSync = require('../services/frontendSync');

// ─── RATE LIMIT HELPER ───────────────────────────────────────────────
// Football-data.org allows 10 requests per minute.
// We pause 7 seconds between requests to stay safely under the limit.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const API_PAUSE = 7000; // 7 seconds

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
  // TEMPORARY: Hardcoded to a busy football weekend in 2024 to test the pipeline
  const d = new Date('2024-05-15T12:00:00Z'); 
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}
// ─── SEED FUNCTIONS (Run on boot) ───────────────────────────────────────

async function seedFixtures() {
  logger.info('[SEED] Fetching fixtures for dates -7 to +7...');
  const dates = [];
  for (let i = -7; i <= 7; i++) dates.push(getDateStr(i));

  let totalMatches = 0;
  const allMatches = []; // <-- COLLECT matches here instead of a second API call

  for (const dateStr of dates) {
    try {
      const data = await fetchAPI(`/matches?dateFrom=${dateStr}&dateTo=${dateStr}`);
      const matches = data.matches || [];
      totalMatches += matches.length;
      
      allMatches.push(...matches); // <-- ADD to our master list

      const cacheDocs = matches.map(m => ({ id: String(m.id), data: m }));
      await cache.replaceCollection('fixtures_date_' + dateStr, cacheDocs);
      await frontendSync.syncFixturesByDate(matches);
      
    } catch (err) {
      logger.error(`[SEED] Failed fixtures for ${dateStr}: ${err.message}`);
    }
    await sleep(API_PAUSE);
  }
  
  // Write to general cache using the data we ALREADY fetched (no extra API call needed!)
  try {
    const cacheDocs = allMatches.map(m => ({ id: String(m.id), data: m }));
    await cache.replaceCollection('fixtures', cacheDocs);
    await cache.setLastUpdated('fixtures', { count: allMatches.length });
  } catch (err) {
    logger.error(`[SEED] Failed writing general fixtures cache: ${err.message}`);
  }

  logger.info(`[SEED] Fixtures done: ${totalMatches} matches across ${dates.length} dates`);
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
    logger.error(`[SEED] Failed competitions: ${err.message}`);
  }
}

async function seedStandingsAndTeams() {
  logger.info('[SEED] Fetching standings & teams for leagues: ' + env.competitions.join(', '));
  
  for (const code of env.competitions) {
    try {
      // Standings
      const standData = await fetchAPI(`/competitions/${code}/standings`);
      const standings = standData.standings || [];
      
      await cache.setDocument('standings', code, { standings });
      await frontendSync.syncStandings(code, standings);

      await sleep(API_PAUSE); // PAUSE between standings and teams fetch

      // Teams
      const teamData = await fetchAPI(`/competitions/${code}/teams`);
      const teams = teamData.teams || [];
      
      const cacheDocs = teams.map(t => ({ id: String(t.id), data: t }));
      await cache.replaceCollection('teams_' + code, cacheDocs);
      await frontendSync.syncTeams(code, teams);

      logger.info(`[SEED] ${code}: ${standings.length} standings, ${teams.length} teams`);
    } catch (err) {
      logger.error(`[SEED] Failed ${code} standings/teams: ${err.message}`);
    }
    await sleep(API_PAUSE); // PAUSE before the next competition
  }
  await cache.setLastUpdated('standings', {});
  await cache.setLastUpdated('teams', {});
}

// ─── PERIODIC SYNC FUNCTIONS ────────────────────────────────────────────
async function syncFixtures() {
  logger.info('[SYNC] Fixtures sync started');
  const dates = [];
  for (let i = -7; i <= 7; i++) dates.push(getDateStr(i));
  
  let totalMatches = 0;
  const allMatches = []; // <-- COLLECT matches here instead of a second API call
  
  for (const dateStr of dates) {
    try {
      const data = await fetchAPI(`/matches?dateFrom=${dateStr}&dateTo=${dateStr}`);
      const matches = data.matches || [];
      totalMatches += matches.length;
      
      allMatches.push(...matches); // <-- ADD to our master list

      const cacheDocs = matches.map(m => ({ id: String(m.id), data: m }));
      await cache.replaceCollection('fixtures_date_' + dateStr, cacheDocs);
      await frontendSync.syncFixturesByDate(matches);
      
    } catch (err) {
      logger.error(`[SYNC] Fixtures failed for ${dateStr}: ${err.message}`);
    }
    await sleep(API_PAUSE);
  }

  // Write to general cache using the data we ALREADY fetched (no extra API call needed!)
  try {
    const cacheDocs = allMatches.map(m => ({ id: String(m.id), data: m }));
    await cache.replaceCollection('fixtures', cacheDocs);
    await cache.setLastUpdated('fixtures', { count: allMatches.length });
  } catch (err) {
    logger.error(`[SYNC] Failed writing general fixtures cache: ${err.message}`);
  }

  // Keep 8 days of history in Firestore (7 past + today)
  await frontendSync.cleanupOldFixtures(8);
  
  logger.info(`[SYNC] Fixtures sync done: ${totalMatches} matches updated`);
}



async function syncLive() {
  try {
    // FIX: Removed "HALFTIME" as it is not a valid football-data.org status enum
    const data = await fetchAPI('/matches?status=LIVE,IN_PLAY,PAUSED');
    const matches = data.matches || [];

    const cacheDocs = matches.map(m => ({ id: String(m.id), data: m }));
    await cache.replaceCollection('live', cacheDocs);
    
    // frontendSync.syncLive has hash-check built in to save Firestore quota
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
      logger.error(`[SYNC] ${code} standings/teams failed: ${err.message}`);
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
  
  // Run sequentially to avoid hitting football-data.org rate limits (10 req/min)
  await seedCompetitions();
  await seedFixtures();
  await seedStandingsAndTeams();
  
  // Fetch initial live state
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

  // Fixtures: every 5 minutes
  intervals.push(setInterval(() => {
    syncFixtures().catch(err => logger.error(`[SCHED] Fixtures error: ${err.message}`));
  }, 5 * 60 * 1000));

  // Live: every 45 seconds (Frontend sync hashes prevent unnecessary Firestore writes)
  intervals.push(setInterval(() => {
    syncLive().catch(err => logger.error(`[SCHED] Live error: ${err.message}`));
  }, 45 * 1000));

  // Standings & Teams: every 2 hours
  intervals.push(setInterval(() => {
    syncStandingsAndTeams().catch(err => logger.error(`[SCHED] Standings error: ${err.message}`));
  }, 2 * 60 * 60 * 1000));

  // Competitions: every 24 hours
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