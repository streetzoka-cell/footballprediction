const express = require('express');
const router = express.Router();
const { getDb } = require('../../config/firebase');
const fs = require('fs');
const path = require('path');
const MatchIntelligenceService = require('../../services/MatchIntelligenceService');

// GET /api/v1/match/:id
// Returns the Canonical Match Object
router.get('/:id', async (req, res) => {
  try {
    const matchId = req.params.id;
    const db = getDb();
    
    // 1. Fetch Base Match Data (Live or Finished)
    let baseMatch = null;
    const liveDoc = await db.collection('active_predictions').doc(matchId).get();
    if (liveDoc.exists) {
      baseMatch = { id: liveDoc.id, ...liveDoc.data() };
    } else {
      const finishedDoc = await db.collection('finished_matches').doc(matchId).get();
      if (finishedDoc.exists) {
        baseMatch = { id: finishedDoc.id, ...finishedDoc.data() };
      }
    }

    if (!baseMatch) {
      return res.status(404).json({ success: false, error: 'Match not found' });
    }

    // 2. Fetch Deep Intelligence (Elo, Form, H2H, Goal Patterns)
    let intelligence = null;
    try {
      intelligence = await MatchIntelligenceService.getMatchIntelligence(
        baseMatch.homeTeam?.name || baseMatch.homeName,
        baseMatch.awayTeam?.name || baseMatch.awayName
      );
    } catch (e) {
      console.error('[Match API] Intel fetch failed:', e.message);
    }

    // 3. Construct Canonical Schema
    const canonicalMatch = {
      identity: {
        id: String(baseMatch.id),
        source: baseMatch.source || 'zokascore',
        lastUpdated: baseMatch.updatedAt || new Date().toISOString()
      },
      competition: {
        id: String(baseMatch.league?.id || baseMatch.leagueId || ''),
        name: baseMatch.league?.name || baseMatch.leagueName || 'Unknown'
      },
      status: baseMatch.status || 'NS',
      kickoff: baseMatch.utcDate || baseMatch.date || null,
      teams: {
        home: {
          id: String(baseMatch.homeTeam?.id || baseMatch.homeTeamId || ''),
          name: baseMatch.homeTeam?.name || baseMatch.homeName || 'TBD',
          logo: baseMatch.homeTeam?.crest || baseMatch.homeLogo || null
        },
        away: {
          id: String(baseMatch.awayTeam?.id || baseMatch.awayTeamId || ''),
          name: baseMatch.awayTeam?.name || baseMatch.awayName || 'TBD',
          logo: baseMatch.awayTeam?.crest || baseMatch.awayLogo || null
        }
      },
      score: {
        home: baseMatch.homeScore ?? null,
        away: baseMatch.awayScore ?? null
      },
      odds: baseMatch.odds || null, // Pass through parsed odds if available
      intelligence: intelligence ? {
        elo: {
          home: intelligence.home?.elo || null,
          away: intelligence.away?.elo || null
        },
        form: {
          home: intelligence.home?.form || [],
          away: intelligence.away?.form || []
        },
        h2h: intelligence.h2h || null,
        goalPatterns: {
          home: intelligence.home?.goalPatterns || {},
          away: intelligence.away?.goalPatterns || {}
        }
      } : null,
      zokaPrediction: intelligence?.zokaPick || null
    };

    res.json({ success: true, data: canonicalMatch });
  } catch (err) {
    console.error('[Match Route] Error fetching canonical match:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;