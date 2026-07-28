import { initializeDb } from '../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const db = initializeDb();
  try {
    const snap = await db.collection('meta').doc('backend_status').get();
    if (snap.exists) {
      return res.status(200).json(snap.data());
    }
    return res.status(404).json({ error: 'Backend status not found' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}