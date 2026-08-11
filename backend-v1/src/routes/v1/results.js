// backend-v1/src/routes/v1/results.js
const express = require('express');
const fs = require('fs').promises; // ★ FIX: Use async promises
const path = require('path');
const router = express.Router();

const RESULTS_DIR = path.join(process.cwd(), 'public_data', 'results');

// ★ PHASE 8: In-Memory Cache for Lightning-Fast Historical Queries
let resultsCache = {
  byDate: {},       
  byTeam: {},       
  byLeague: {},     
  loaded: false,
  lastScan: 0
};

const SCAN_TTL = 15 * 60 * 1000; // Re-scan disk every 15 minutes

async function loadResults() {
  console.log('[Results] Scanning historical archive...');
  const byDate = {};
  const byTeam = {};
  const byLeague = {};

  try {
    // ★ FIX: Async directory check
    await fs.access(RESULTS_DIR);
    const files = (await fs.readdir(RESULTS_DIR)).filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f));

    for (const file of files) {
      try {
        const dateStr = file.replace('.json', '');
        // ★ FIX: Async file read
        const raw = await fs.readFile(path.join(RESULTS_DIR, file), 'utf8');
        const parsed = JSON.parse(raw);
        const matches = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed?.matches) ? parsed.matches : [];
        
        byDate[dateStr] = matches;

        for (const m of matches) {
          // Index by Team
          const hId = String(m.homeTeam?.id || m.homeTeamId);
          const aId = String(m.awayTeam?.id || m.awayTeamId);
          if (hId && hId !== 'undefined') {
            if (!byTeam[hId]) byTeam[hId] = [];
            byTeam[hId].push(m);
          }
          if (aId && aId !== 'undefined') {
            if (!byTeam[aId]) byTeam[aId] = [];
            byTeam[aId].push(m);
          }

          // Index by League
          const lId = String(m.league?.id || m.leagueId);
          if (lId && lId !== 'undefined') {
            if (!byLeague[lId]) byLeague[lId] = [];
            byLeague[lId].push(m);
          }
        }
      } catch (e) {
        console.error(`[Results] Failed to parse ${file}`);
      }
    }
    
    // Sort descending by time so newest results appear first
    for (const k in byTeam) byTeam[k].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    for (const k in byLeague) byLeague[k].sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));

    resultsCache.byDate = byDate;
    resultsCache.byTeam = byTeam;
    resultsCache.byLeague = byLeague;
    resultsCache.loaded = true;
    resultsCache.lastScan = Date.now();
    console.log(`[Results] Loaded ${files.length} days of history.`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('[Results] Results directory does not exist yet.');
    } else {
      console.error('[Results] Error loading results:', err);
    }
  }
}

function ensureCache() {
  if (!resultsCache.loaded || (Date.now() - resultsCache.lastScan > SCAN_TTL)) {
    return loadResults(); // Returns a Promise
  }
  return Promise.resolve();
}

// GET /api/v1/results?date=YYYY-MM-DD&teamId=33&leagueId=39&limit=20
router.get('/', async (req, res) => {
  try {
    await ensureCache(); // ★ FIX: Await cache loading
    
    const { date, teamId, leagueId, limit = 20 } = req.query;
    
    let matches = [];
    if (date && resultsCache.byDate[date]) {
      matches = resultsCache.byDate[date];
    } else if (teamId && resultsCache.byTeam[teamId]) {
      matches = resultsCache.byTeam[teamId];
    } else if (leagueId && resultsCache.byLeague[leagueId]) {
      matches = resultsCache.byLeague[leagueId];
    } else if (!teamId && !leagueId && !date) {
      // ★ FIX: Only return global results if NO teamId, leagueId, or date is requested.
      // If a teamId was requested but not found in cache, return empty [] instead of random global matches!
      const dates = Object.keys(resultsCache.byDate).sort().reverse().slice(0, 7);
      for (const d of dates) matches = matches.concat(resultsCache.byDate[d]);
      matches.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const paginated = matches.slice(0, limitNum);

    res.json({
      success: true,
      data: paginated,
      total: matches.length,
      limit: limitNum
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch historical results' });
  }
});

module.exports = router;