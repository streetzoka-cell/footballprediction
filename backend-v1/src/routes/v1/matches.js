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

// GET /api/v1/matches?date=YYYY-MM-DD&status=live|finished&view=home
router.get('/', async (req, res, next) => {
  try {
    const { status, date, view } = req.query;
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    const tomorrow = getDateOffset(1);

    // ==========================================
    // VIEW: HOME (Uses the Ranking Engine)
    // ==========================================
    if (view === 'home') {
      const snap = await snapshotService.getSnapshotData(today);
      
      // 1. Gather all matches for today
      let allMatches = dedupMatches([
        ...(snap.matches || []), 
        ...(snap.live || []), 
        ...(snap.finished || [])
      ]);

      // 2. ★ PHASE 15: APPLY RANKING ENGINE
      // This sorts them by importance and tags the top 3 as 'FEATURED'
      allMatches = rankAndTagMatches(allMatches);

      // 3. Split into views based on status
      const live = allMatches
        .filter(m => LIVE_STATUSES.includes(m.status))
        .sort(sortMatchesByTime);
      
      const upcoming = allMatches
        .filter(m => SCHEDULED_STATUSES.includes(m.status) || (m.timestamp && m.timestamp * 1000 > Date.now()))
        .sort(sortMatchesByTime);

      // 4. Extract the Top 3 (The algorithmic winners)
      const featured = allMatches
        .filter(m => m.category === 'FEATURED')
        .slice(0, 3); // ★ STRICTLY TOP 3

      return res.json({ success: true, live, featured, upcoming });
    }

    // ==========================================
    // STATUS: LIVE
    // ==========================================
    if (status === 'live') {
      const snaps = await Promise.all([
        snapshotService.getSnapshotData(today),
        snapshotService.getSnapshotData(yesterday),
        snapshotService.getSnapshotData(tomorrow),
      ]);

      let allMatches = [];
      snaps.forEach(s => {
        allMatches = allMatches.concat(s.matches || [], s.live || []);
      });

      const liveMatches = allMatches.filter(m => LIVE_STATUSES.includes(m.status));
      const uniqueLive = dedupMatches(liveMatches);

      return res.json({ success: true, data: uniqueLive.sort(sortMatchesByTime) });
    }

    // ==========================================
    // STATUS: FINISHED
    // ==========================================
    if (status === 'finished') {
      const snap = await snapshotService.getSnapshotData(today);
      const finished = (snap.finished || []).sort(sortMatchesByTime);

      return res.json({ success: true, data: finished });
    }

    // ==========================================
    // DATE: SPECIFIC DAY
    // ==========================================
    if (date) {
      const snap = await snapshotService.getSnapshotData(date);
      const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
      const unique = dedupMatches(allMatches);

      return res.json({ success: true, data: unique.sort(sortMatchesByTime) });
    }

    // If no parameters are provided, return 400
    res.status(400).json({ success: false, error: 'Missing date, status, or view parameter' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;