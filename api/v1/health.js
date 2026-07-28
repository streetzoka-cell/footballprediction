import { initializeDb } from '../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const db = initializeDb();
  try {
    const snap = await db.collection('meta').doc('backend_status').get();
    if (snap.exists) {
      return res.status(200).json(snap.data());
    }
    return res.status(200).json({ status: 'offline', message: 'Local backend PC is not running.' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}