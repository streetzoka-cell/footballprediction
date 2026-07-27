import { initializeDb } from '../_firebase.js';
import { validateCompetition } from './_schemas.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
  const db = initializeDb();
  
  try {
    const snapshot = await db.collection('leagues').get();
    const validComps = snapshot.docs
      .map(doc => validateCompetition(doc.data()))
      .filter(Boolean);
      
    return res.status(200).json({ data: validComps });
  } catch (err) {
    console.error('[API/v1/competitions] Error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}