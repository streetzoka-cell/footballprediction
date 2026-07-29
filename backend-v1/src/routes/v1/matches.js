const express = require('express');
const router = express.Router();
const snapshotService = require('../../services/SnapshotService');
const { getDateOffset } = require('../../config/constants');

// Helper for SofaScore style sorting
function sortMatchesByTime(a, b) {
  return (a.timestamp || 0) - (b.timestamp || 0);
}

// GET /api/v1/matches?date=YYYY-MM-DD&status=live|finished&view=home
router.get('/', async (req, res, next) => {
  try {
    const { status, date, view } = req.query;
    const today = getDateOffset(0);
    const yesterday = getDateOffset(-1);
    const tomorrow = getDateOffset(1);

    if (view === 'home') {
      const snap = await snapshotService.getSnapshotData(today);
      const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
      const unique = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      
      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      const live = unique.filter(m => liveStatuses.includes(m.status)).sort(sortMatchesByTime);
      const upcoming = unique.filter(m => m.status === 'NS' || m.status === 'TBD').sort(sortMatchesByTime);
      const featured = upcoming.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT').slice(0, 10);
      
      return res.json({ live, featured, upcoming });
    }

    if (status === 'live') {
      const snaps = await Promise.all([
        snapshotService.getSnapshotData(today),
        snapshotService.getSnapshotData(yesterday),
        snapshotService.getSnapshotData(tomorrow)
      ]);
      let allMatches = [];
      snaps.forEach(s => allMatches = allMatches.concat(s.matches || [], s.live || []));
      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      const liveMatches = allMatches.filter(m => liveStatuses.includes(m.status));
      const uniqueLive = Array.from(new Map(liveMatches.map(m => [String(m.id), m])).values());
      return res.json(uniqueLive.sort(sortMatchesByTime));
    }

    if (status === 'finished') {
      const snap = await snapshotService.getSnapshotData(today);
      return res.json((snap.finished || []).sort(sortMatchesByTime));
    }

    if (date) {
      const snap = await snapshotService.getSnapshotData(date);
      const allMatches = [...(snap.matches || []), ...(snap.live || []), ...(snap.finished || [])];
      const unique = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      return res.json(unique.sort(sortMatchesByTime));
    }

    res.status(400).json({ error: 'Missing date, status, or view parameter' });
  } catch (err) { next(err); }
});

module.exports = router;