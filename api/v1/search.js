import { initializeDb } from '../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  const { q } = req.query;
  if (!q || q.length < 2) return res.status(200).json({ hits: [] });
  
  const db = initializeDb();
  const today = new Date().toISOString().split('T')[0];
  const snap = await db.collection('fixture_snapshots').doc(today).get();
  
  if (!snap.exists) return res.status(200).json({ hits: [] });
  
  const matches = [...(snap.data().matches || []), ...(snap.data().live || [])];
  const query = q.toLowerCase();
  
  const hits = matches.filter(m => 
    (m.homeTeamName || '').toLowerCase().includes(query) ||
    (m.awayTeamName || '').toLowerCase().includes(query) ||
    (m.leagueName || '').toLowerCase().includes(query)
  ).slice(0, 20).map(m => ({
    objectID: m.id,
    homeTeamName: m.homeTeamName,
    awayTeamName: m.awayTeamName,
    leagueName: m.leagueName,
    status: m.status,
    date: m.date
  }));
  
  return res.status(200).json({ hits });
}