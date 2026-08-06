const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/firebase');

// ==========================================
// GET /api/v1/match/:id
// Fetches a single match's details for the MatchPage
// ==========================================
router.get('/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const db = getDb();
    
    // 1. Try to fetch from Firestore (active predictions / matches)
    const matchDoc = await db.collection('active_predictions').doc(matchId).get();
    
    if (matchDoc.exists) {
      return res.json({ 
        success: true, 
        data: { id: matchDoc.id, ...matchDoc.data() } 
      });
    }

    // 2. Fallback: Check finished matches collection if needed
    const finishedDoc = await db.collection('finished_matches').doc(matchId).get();
    if (finishedDoc.exists) {
      return res.json({ 
        success: true, 
        data: { id: finishedDoc.id, ...finishedDoc.data() } 
      });
    }

    // 3. If not found anywhere, return 404
    return res.status(404).json({ 
      success: false, 
      error: 'Match not found' 
    });

  } catch (err) {
    console.error('[Match Route] Error fetching match:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

module.exports = router;