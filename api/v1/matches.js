import { initializeDb } from '../_firebase.js';
import { validateMatch } from './_schemas.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  
  const { status, date, view } = req.query;
  const db = initializeDb();
  
  try {
    // ★ NEW: Home View Endpoint for React Frontend
    // Returns categorized matches exactly like LiveScore/SofaScore
    if (view === 'home') {
      const today = new Date().toISOString().split('T')[0];
      const snap = await db.collection('fixture_snapshots').doc(today).get();
      
      if (!snap.exists) {
        return res.status(200).json({ live: [], featured: [], upcoming: [] });
      }

      const data = snap.data();
      const allMatches = [
        ...(data.matches || []),
        ...(data.live || []),
        ...(data.finished || [])
      ];

      // Deduplicate
      const uniqueMatches = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      const validMatches = uniqueMatches.map(validateMatch).filter(Boolean);

      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      
      const live = validMatches.filter(m => liveStatuses.includes(m.status));
      const upcoming = validMatches.filter(m => m.status === 'NS' || m.status === 'TBD');
      
      // Featured = Important matches that are not live yet
      const featured = upcoming.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT');

      return res.status(200).json({
        live: live.slice(0, 20),
        featured: featured.slice(0, 15),
        upcoming: upcoming.slice(0, 30)
      });
    }

    // Existing Live Logic
    if (status === 'live') {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const snaps = await Promise.all([
        db.collection('fixture_snapshots').doc(today).get(),
        db.collection('fixture_snapshots').doc(yesterday).get(),
        db.collection('fixture_snapshots').doc(tomorrow).get()
      ]);

      let allMatches = [];
      snaps.forEach(snap => {
        if (snap.exists) {
          allMatches = allMatches.concat(snap.data().matches || [], snap.data().live || []);
        }
      });

      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      const liveMatches = allMatches.filter(m => liveStatuses.includes(m.status));
      
      const uniqueLive = Array.from(new Map(liveMatches.map(m => [String(m.id), m])).values());
      const validLive = uniqueLive.map(validateMatch).filter(Boolean);

      return res.status(200).json({ data: validLive });
    }
    
    // Existing Finished Logic
    if (status === 'finished') {
      const today = new Date().toISOString().split('T')[0];
      const snap = await db.collection('fixture_snapshots').doc(today).get();
      if (snap.exists) {
        const finished = snap.data().finished || [];
        const validFinished = finished.map(validateMatch).filter(Boolean);
        return res.status(200).json({ data: validFinished });
      }
      return res.status(200).json({ data: [] });
    }
    
    // Existing Date Logic
    if (date) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const snaps = await Promise.all([
        db.collection('fixture_snapshots').doc(date).get(),
        db.collection('fixture_snapshots').doc(yesterday).get(),
        db.collection('fixture_snapshots').doc(tomorrow).get()
      ]);
      
      let allMatches = [];
      snaps.forEach(snap => {
        if (snap.exists) {
          allMatches = allMatches.concat(snap.data().matches || [], snap.data().live || [], snap.data().finished || []);
        }
      });
      
      const uniqueMatches = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      const validMatches = uniqueMatches.map(validateMatch).filter(Boolean);
      
      return res.status(200).json({ data: validMatches });
    }
    
    return res.status(400).json({ error: "Invalid date, status, or view parameter" });
    
  } catch (err) {
    console.error('[API/v1/matches] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}