import { initializeDb } from '../_firebase.js';
import { validateMatch } from './_schemas.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  
  const { status, date, sport, view } = req.query;
  const db = initializeDb();
  const prefix = sport === 'basketball' ? 'basketball_' : '';
  
  try {
    // Home View Endpoint
    if (view === 'home') {
      const today = new Date().toISOString().split('T')[0];
      const snap = await db.collection('fixture_snapshots').doc(`${prefix}${today}`).get();
      
      if (!snap.exists) {
        return res.status(200).json({ live: [], featured: [], upcoming: [] });
      }

      const data = snap.data();
      const allMatches = [
        ...(data.matches || []),
        ...(data.live || []),
        ...(data.finished || [])
      ];

      const uniqueMatches = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      const validMatches = uniqueMatches.map(validateMatch).filter(Boolean);

      const liveStatuses = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      
      const live = validMatches.filter(m => liveStatuses.includes(m.status));
      const upcoming = validMatches.filter(m => m.status === 'NS' || m.status === 'TBD');
      const featured = upcoming.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT');

      // ★ FIX: Removed .slice() limits so frontend gets ALL matches
      return res.status(200).json({
        live: live,
        featured: featured,
        upcoming: upcoming
      });
    }

    // Live Logic (Checks today, yesterday, tomorrow in case of midnight crossover)
    if (status === 'live') {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const snaps = await Promise.all([
        db.collection('fixture_snapshots').doc(`${prefix}${today}`).get(),
        db.collection('fixture_snapshots').doc(`${prefix}${yesterday}`).get(),
        db.collection('fixture_snapshots').doc(`${prefix}${tomorrow}`).get()
      ]);

      let allMatches = [];
      snaps.forEach(snap => {
        if (snap.exists) {
          allMatches = allMatches.concat(snap.data().matches || [], snap.data().live || []);
        }
      });

      const liveStatuses = sport === 'basketball' 
        ? ['1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT', 'HT', 'LIVE']
        : ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
      
      const liveMatches = allMatches.filter(m => liveStatuses.includes(m.status));
      const uniqueLive = Array.from(new Map(liveMatches.map(m => [String(m.id), m])).values());
      const validLive = uniqueLive.map(validateMatch).filter(Boolean);

      return res.status(200).json({ data: validLive });
    }
    
    // Finished Logic
    if (status === 'finished') {
      const today = new Date().toISOString().split('T')[0];
      const snap = await db.collection('fixture_snapshots').doc(`${prefix}${today}`).get();
      if (snap.exists) {
        const finished = snap.data().finished || [];
        const validFinished = finished.map(validateMatch).filter(Boolean);
        return res.status(200).json({ data: validFinished });
      }
      return res.status(200).json({ data: [] });
    }
    
          // ★ FIX: Strict Date Logic - ONLY fetch the exact date requested
    if (date) {
      const snap = await db.collection('fixture_snapshots').doc(`${prefix}${date}`).get();
      
      let allMatches = [];
      if (snap.exists) {
        allMatches = allMatches.concat(
          snap.data().matches || [], 
          snap.data().live || [], 
          snap.data().finished || []
        );
      }
      
      const uniqueMatches = Array.from(new Map(allMatches.map(m => [String(m.id), m])).values());
      
      // ★ FIX: Return raw unique matches. Do not use validateMatch here, 
      // as it was dropping hundreds of valid matches due to strict typing.
      return res.status(200).json({ data: uniqueMatches });
    }
     
    
    return res.status(400).json({ error: "Invalid date, status, or view parameter" });
    
  } catch (err) {
    console.error('[API/v1/matches] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}