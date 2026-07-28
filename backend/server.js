const express = require('express');
const cors = require('cors');
const { COLLECTIONS, TTL, getDateOffset, formatDate } = require('./config/constants');
const { initializeFirebase, getDb, isExpired } = require('./config/firebase');
const goalApi = require('./config/goalApiAdapter');
const livescoreApi = require('./config/livescoreApiAdapter');
const matchDetailsRepo = require('./repositories/matchDetailsRepository');
const videosRepo = require('./repositories/videosRepository');
const playersRepo = require('./repositories/playersRepository');
const teamsRepo = require('./repositories/teamsRepository');
const cache = require('./utils/cache');
const { eventBus, EVENT } = require('./utils/eventBus');
const logger = require('./utils/logger');

initializeFirebase();
const app = express();
app.use(cors());
app.use(express.json());

// ─── Cache Invalidation Listeners ───
eventBus.on(EVENT.LIVE_FIXTURES_UPDATED, () => cache.invalidate('live:fixtures'));
eventBus.on(EVENT.DAILY_FIXTURES_UPDATED, (payload) => {
  if (payload?.date) cache.invalidate(`fixtures:${payload.date}`);
  cache.invalidatePrefix('results:');
});
eventBus.on(EVENT.STANDINGS_UPDATED, () => cache.invalidatePrefix('standings:'));
eventBus.on(EVENT.CACHE_INVALIDATED, (payload) => {
  if (payload?.prefix) cache.invalidatePrefix(payload.prefix);
});

// ─── Helper: read collection ───
async function readCollection(name, dateField = 'date', dateVal = null) {
  const db = getDb();
  let q = db.collection(name);
  if (dateVal) q = q.where(dateField, '==', dateVal);
  const snap = await q.get();
  return snap.docs.map(d => d.data());
}

// ─── Helper: SofaScore Style Match Sorting ───
function sortMatchesByTime(a, b) {
  const aTime = a.timestamp || 0;
  const bTime = b.timestamp || 0;
  if (aTime < bTime) return -1;
  if (aTime > bTime) return 1;
  return 0;
}

// ─── Helper: Get Aggregated Snapshot ───
async function getSnapshotData(dateStr) {
  const db = getDb();
  const snap = await db.collection('fixture_snapshots').doc(`football_${dateStr}`).get();
  if (!snap.exists) return { matches: [], live: [], finished: [] };
  return snap.data();
}

// ═══════════════════════════════════════════════════
//  HEALTH & HEARTBEAT
// ═══════════════════════════════════════════════════

app.get('/health/simple', (_, res) => res.send('OK'));
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: Math.round(process.uptime()),
    budget: {
      goalApi: goalApi.getRemaining() ?? 'unknown',
      livescore: livescoreApi.getRemaining() ?? 'unknown'
    },
    cache: cache.stats()
  });
});

// ═══════════════════════════════════════════════════
//  V1 COMPATIBILITY ROUTES (Sofascore Style)
// ═══════════════════════════════════════════════════

app.get('/api/v1/matches', async (req, res) => {
  try {
    const { status, date, view } = req.query;
    const today = getDateOffset(0);
    const tomorrow = getDateOffset(1);
    const yesterday = getDateOffset(-1);

    // 1. HOME VIEW (Live + Featured + Upcoming)
    if (view === 'home') {
      const snap = await getSnapshotData(today);
      const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
      const unique = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      
      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      const live = unique.filter(m => liveStatuses.includes(m.status)).sort(sortMatchesByTime);
      const upcoming = unique.filter(m => m.status === 'NS' || m.status === 'TBD').sort(sortMatchesByTime);
      const featured = upcoming.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT').slice(0, 10);
      
      return res.json({ live, featured, upcoming });
    }

    // 2. LIVE STATUS
    if (status === 'live') {
      const snaps = await Promise.all([
        getSnapshotData(today),
        getSnapshotData(yesterday),
        getSnapshotData(tomorrow)
      ]);
      
      let allMatches = [];
      snaps.forEach(s => {
        allMatches = allMatches.concat(s.matches || [], s.live || []);
      });
      
      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      const liveMatches = allMatches.filter(m => liveStatuses.includes(m.status));
      const uniqueLive = Array.from(new Map(liveMatches.map(m => [String(m.id), m])).values());
      
      return res.json(uniqueLive.sort(sortMatchesByTime));
    }
    
    // 3. FINISHED STATUS
    if (status === 'finished') {
      const snap = await getSnapshotData(today);
      const finished = snap.finished || [];
      return res.json(finished.sort(sortMatchesByTime));
    }
    
    // 4. SPECIFIC DATE
    if (date) {
      const snap = await getSnapshotData(date);
      const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
      const unique = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      return res.json(unique.sort(sortMatchesByTime));
    }

    return res.status(400).json({ error: 'Missing date, status, or view parameter' });
  } catch (err) {
    logger.error(`[Gateway] /api/v1/matches: ${err.message}`);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ═══════════════════════════════════════════════════
//  PHASE 1 & 2 ROUTES (Primary Frontend Gateway)
// ═══════════════════════════════════════════════════

app.get('/api/fixtures', async (req, res) => {
  try {
    const date = req.query.date || getDateOffset(0);
    const snap = await getSnapshotData(date);
    const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
    const unique = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
    res.json({ data: unique.sort(sortMatchesByTime), date, count: unique.length });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/fixtures/live', async (req, res) => {
  try {
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    const snaps = await Promise.all([getSnapshotData(today), getSnapshotData(yesterday)]);
    
    let allMatches = [];
    snaps.forEach(s => { allMatches = allMatches.concat(s.matches || [], s.live || []); });
    
    const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
    const liveMatches = allMatches.filter(m => liveStatuses.includes(m.status));
    const uniqueLive = Array.from(new Map(liveMatches.map(m => [String(m.id), m])).values());
    
    res.json({ data: uniqueLive.sort(sortMatchesByTime), count: uniqueLive.length });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/results', async (req, res) => {
  try {
    const date = req.query.date || getDateOffset(-1);
    const snap = await getSnapshotData(date);
    const finished = snap.finished || [];
    res.json({ data: finished.sort(sortMatchesByTime), date, count: finished.length });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/fixtures/:id', async (req, res) => {
  try {
    const cacheKey = `fixture:${req.params.id}`;
    const data = await cache.getOrSet(cacheKey, async () => {
      const db = getDb();
      const snap = await db.collection(COLLECTIONS.FIXTURES).doc(String(req.params.id)).get();
      return snap.exists ? snap.data() : null;
    }, 60*60*1000);

    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ data });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/standings', async (req, res) => {
  try {
    const leagueId = req.query.league ? String(req.query.league) : 'all';
    const data = await cache.getOrSet(`standings:${leagueId}`, async () => {
      const db = getDb();
      if (req.query.league) {
        const snap = await db.collection(COLLECTIONS.STANDINGS).doc(String(req.query.league)).get();
        return snap.exists ? snap.data() : null;
      }
      const snap = await db.collection(COLLECTIONS.STANDINGS).get();
      return snap.docs.map(d => d.data());
    }, 6*60*60*1000);

    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ data });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/top-scorers', async (req, res) => {
  try {
    const leagueId = req.query.league ? String(req.query.league) : 'all';
    const data = await cache.getOrSet(`top-scorers:${leagueId}`, async () => {
      const db = getDb();
      if (req.query.league) {
        const snap = await db.collection(COLLECTIONS.TOP_SCORERS).doc(String(req.query.league)).get();
        return snap.exists ? snap.data() : null;
      }
      const snap = await db.collection(COLLECTIONS.TOP_SCORERS).get();
      return snap.docs.map(d => d.data());
    }, 24*60*60*1000);

    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json({ data });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

// ─── MATCH DETAILS ───

app.get('/api/fixtures/:id/lineups', async (req, res) => {
  try {
    const cacheKey = `lineups:${req.params.id}`;
    let data = await cache.get(cacheKey);
    if (!data) {
      data = await matchDetailsRepo.getLineups(req.params.id);
      if (data) cache.set(cacheKey, data, 24*60*60*1000);
    }
    if (data) return res.json({ data });
    
    if (goalApi.isBudgetAvailable(1)) {
      const fresh = await goalApi.getLineups(req.params.id);
      await matchDetailsRepo.upsertLineups(req.params.id, fresh);
      cache.set(cacheKey, fresh, 24*60*60*1000);
      return res.json({ data: fresh });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/fixtures/:id/statistics', async (req, res) => {
  try {
    const cacheKey = `statistics:${req.params.id}`;
    let data = await cache.get(cacheKey);
    if (!data) {
      data = await matchDetailsRepo.getStatistics(req.params.id);
      if (data && !isExpired(data)) cache.set(cacheKey, data, 5*60*1000);
    }
    if (data && !isExpired(data)) return res.json({ data });
    
    if (goalApi.isBudgetAvailable(1)) {
      const fresh = await goalApi.getStatistics(req.params.id);
      await matchDetailsRepo.upsertStatistics(req.params.id, fresh);
      cache.set(cacheKey, fresh, 5*60*1000);
      return res.json({ data: fresh });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/fixtures/:id/predictions', async (req, res) => {
  try {
    const cacheKey = `predictions:${req.params.id}`;
    let data = await cache.get(cacheKey);
    if (!data) {
      data = await matchDetailsRepo.getPredictions(req.params.id);
      if (data) cache.set(cacheKey, data, 24*60*60*1000);
    }
    if (data) return res.json({ data });
    
    if (goalApi.isBudgetAvailable(1)) {
      const fresh = await goalApi.getPredictions(req.params.id);
      await matchDetailsRepo.upsertPredictions(req.params.id, fresh);
      cache.set(cacheKey, fresh, 24*60*60*1000);
      return res.json({ data: fresh });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/fixtures/:id/odds', async (req, res) => {
  try {
    const cacheKey = `odds:${req.params.id}`;
    let data = await cache.get(cacheKey);
    if (!data) {
      data = await matchDetailsRepo.getOdds(req.params.id);
      if (data && !isExpired(data)) cache.set(cacheKey, data, 4*60*60*1000);
    }
    if (data && !isExpired(data)) return res.json({ data });
    
    if (goalApi.isBudgetAvailable(1)) {
      const fresh = await goalApi.getOdds(req.params.id);
      await matchDetailsRepo.upsertOdds(req.params.id, fresh);
      cache.set(cacheKey, fresh, 4*60*60*1000);
      return res.json({ data: fresh });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/h2h', async (req, res) => {
  try {
    const { team1, team2 } = req.query;
    if (!team1 || !team2) return res.status(400).json({ error: 'Missing team1 or team2' });
    
    const key = `${team1}_${team2}`;
    const cacheKey = `h2h:${key}`;
    let data = await cache.get(cacheKey);
    if (!data) {
      data = await matchDetailsRepo.getH2H(key);
      if (data) cache.set(cacheKey, data, 24*60*60*1000);
    }
    if (data) return res.json({ data });
    
    if (goalApi.isBudgetAvailable(1)) {
      const fresh = await goalApi.getH2H(team1, team2);
      await matchDetailsRepo.upsertH2H(key, fresh);
      cache.set(cacheKey, fresh, 24*60*60*1000);
      return res.json({ data: fresh });
    }
    res.status(404).json({ error: 'Not found' });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

// ─── VIDEOS ───

app.get('/api/videos', async (req, res) => {
  try {
    const data = await cache.getOrSet('videos:recent', () => videosRepo.getVideos(), 60*60*1000);
    res.json({ data, count: data.length });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

// ─── TEAMS & PLAYERS (Lazy Cache) ───

app.get('/api/teams', async (req, res) => {
  try {
    const leagueId = req.query.league ? String(req.query.league) : 'all';
    const data = await cache.getOrSet(`teams:${leagueId}`, async () => {
      const db = getDb();
      if (req.query.league) {
        const snap = await db.collection(COLLECTIONS.TEAMS).where('leagueId', '==', String(req.query.league)).get();
        return snap.docs.map(d => d.data());
      }
      const snap = await db.collection(COLLECTIONS.TEAMS).get();
      return snap.docs.map(d => d.data());
    }, 24*60*60*1000);
    res.json({ data });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/teams/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const cacheKey = `team:${id}`;
    let team = await cache.get(cacheKey);
    
    if (!team || isExpired(team)) {
      team = await teamsRepo.getTeam(id);
      if (team && !isExpired(team)) cache.set(cacheKey, team, 24*60*60*1000);
    }
    
    if (!team || isExpired(team)) {
      if (goalApi.isBudgetAvailable(1)) {
        const fresh = await goalApi.getTeam(id);
        await teamsRepo.upsertTeam(id, fresh);
        cache.set(cacheKey, fresh, 24*60*60*1000);
        team = fresh;
      } else {
        return res.status(404).json({ error: 'Not found and budget exhausted' });
      }
    }
    res.json({ data: team });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/players/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const cacheKey = `player:${id}`;
    let player = await cache.get(cacheKey);
    
    if (!player || isExpired(player)) {
      player = await playersRepo.getPlayer(id);
      if (player && !isExpired(player)) cache.set(cacheKey, player, 7*24*60*60*1000);
    }
    
    if (!player || isExpired(player)) {
      if (goalApi.isBudgetAvailable(1)) {
        const fresh = await goalApi.getPlayer(id);
        await playersRepo.upsertPlayer(id, fresh);
        cache.set(cacheKey, fresh, 7*24*60*60*1000);
        player = fresh;
      } else {
        return res.status(404).json({ error: 'Not found and budget exhausted' });
      }
    }
    res.json({ data: player });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

// ─── USAGE & CACHE INFO ───

app.get('/api/usage', (req, res) => {
  try {
    res.json({
      goalApi: { remaining: goalApi.getRemaining(), isBudgetAvailable: goalApi.isBudgetAvailable(0) },
      livescoreApi: { remaining: livescoreApi.getRemaining(), isBudgetAvailable: livescoreApi.isBudgetAvailable(0) },
      memoryCache: cache.stats()
    });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

app.get('/api/cache-info', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.CACHE_INFO).get();
    res.json({ data: snap.docs.map(d => d.data()) });
  } catch (err) { res.status(500).json({ error: 'Internal error' }); }
});

module.exports = app;