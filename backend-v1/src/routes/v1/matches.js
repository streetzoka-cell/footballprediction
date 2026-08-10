// backend-v1/src/routes/v1/matches.js
const express = require('express');
const router = express.Router();
const snapshotService = require('../../services/SnapshotService');
const { getDateOffset } = require('../../config/constants');
const { rankAndTagMatches } = require('../../services/MatchRankingService'); // ★ NEW IMPORT

function sortMatchesByTime(a, b) {
  return (a.timestamp || a.kickoff || 0) - (b.timestamp || b.kickoff || 0);
}

function dedupMatches(matches) {
  return Array.from(new Map(matches.map(m => [String(m.id), m])).values());
}

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
const SCHEDULED_STATUSES = ['NS', 'TBD'];

// GET /api/v1/matches?view=home
router.get('/', async (req, res, next) => {
  try {
    const { view } = req.query;

    if (view === 'home') {
      const today = getDateOffset(0);
      const snap = await snapshotService.getSnapshotData(today);
      
      // 1. Gather all matches
      let allMatches = dedupMatches([...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])]);

      // ★ PHASE 15: APPLY RANKING ENGINE
      // This sorts them and tags the best 3 as 'FEATURED'
      allMatches = rankAndTagMatches(allMatches);

      // 2. Split into views
      const live = allMatches.filter(m => LIVE_STATUSES.includes(m.status)).sort(sortMatchesByTime);
      
      const upcoming = allMatches
        .filter(m => SCHEDULED_STATUSES.includes(m.status) || (m.timestamp && m.timestamp * 1000 > Date.now()))
        .sort(sortMatchesByTime);

      // 3. Extract the Top 3 (The algorithmic winners)
      const featured = allMatches
        .filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT' || m.importance >= 8)
        .slice(0, 3); // ★ STRICTLY TOP 3

      return res.json({ success: true, live, featured, upcoming });
    }

    // ... keep your other status/date logic exactly as it was ...
    if (req.query.status === 'live') { /* ... */ }
    if (req.query.status === 'finished') { /* ... */ }
    if (req.query.date) { /* ... */ }

    res.status(400).json({ success: false, error: 'Missing parameters' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;