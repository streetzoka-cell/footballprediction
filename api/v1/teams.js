import { initializeDb } from '../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
  
  const { code } = req.query;
  const db = initializeDb();
  
  try {
    if (code) {
      // ★ FIX: Teams are stored as individual documents, so we query the collection
      const colRef = db.collection('teams');
      const q = colRef.where('leagueId', '==', Number(code));
      const snap = await q.get();
      
      if (!snap.empty) {
        // Map the documents into a single array of teams
        const teams = snap.docs.map(doc => doc.data());
        return res.status(200).json({ data: teams, lastUpdated: teams[0]?._updatedAt || null });
      }
      return res.status(404).json({ error: 'Teams not found for this league' });
    }
    
    const snap = await db.collection('teams').get();
    const all = snap.docs.map(doc => doc.data());
    return res.status(200).json({ data: all, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error('[API/v1/teams] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}