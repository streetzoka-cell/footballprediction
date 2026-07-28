import { initializeDb } from '../../_firebase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  const { id } = req.query;
  const db = initializeDb();
  
  try {
    const snap = await db.collection('match_details').doc(String(id)).get();
    
    if (snap.exists && snap.data().intelligence) {
      // Return the real intelligence data
      return res.status(200).json({ data: { intelligence: snap.data().intelligence } });
    }
    
    // ★ FIX: Graceful fallback if backend hasn't generated intelligence yet
    return res.status(200).json({ 
      data: { 
        intelligence: {
          xG: { home: "1.35", away: "1.35" },
          winProbability: { home: 40, draw: 30, away: 30 },
          form: { home: 'N/A', away: 'N/A' },
          story: "Detailed AI predictions and statistics for this match are currently unavailable. Please check back closer to kickoff for updated insights."
        }
      } 
    });
    
  } catch (err) {
    console.error('[API/v1/matches/[id]] Error:', err.message);
    
    // Return fallback on error as well to prevent frontend crashes
    return res.status(200).json({ 
      data: { 
        intelligence: {
          xG: { home: "1.35", away: "1.35" },
          winProbability: { home: 40, draw: 30, away: 30 },
          form: { home: 'N/A', away: 'N/A' },
          story: "Match insights are temporarily unavailable."
        }
      } 
    });
  }
}