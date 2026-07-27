import { initializeDb } from '../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
  
  const { code } = req.query; 
  const db = initializeDb();
  
  try {
    if (code) {
      // ★ FIX: Query by 'id' instead of 'leagueId'
      const colRef = db.collection('standings');
      const q = colRef.where('id', '==', Number(code)).limit(1);
      const snap = await q.get();
      
      if (!snap.empty) {
        const data = snap.docs[0].data();
        // ★ FIX: Return the standings array directly
        return res.status(200).json({ data: data.standings || [], lastUpdated: data._updatedAt || null });
      }
      return res.status(404).json({ error: 'Standings not found for this league' });
    }
    
    const snap = await db.collection('standings').get();
    const all = snap.docs.map(doc => doc.data());
    return res.status(200).json({ data: all, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error('[API/v1/standings] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}