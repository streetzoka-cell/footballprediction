/*
 * topMatchesDetails.js
 * ★ BACKGROUND PRE-FETCHER: Automatically fetches Lineups, Stats, and Events 
 * for the biggest matches (Top 4) and saves them to Firestore.
 * This allows users to view full match details without ever draining the API budget!
 */

const { api, isBudgetAvailable } = require("../config/api");
const { getDb } = require("../config/firebase");
const { COLLECTIONS, TOP_TEAMS_SET } = require("../config/constants");
const logger = require("../utils/logger");

class TopMatchesDetailsService {
  constructor() {
    this.callsToday = 0;
    this.lastReset = new Date().toDateString();
  }

  async run() {
    // Reset daily counter at midnight
    const today = new Date().toDateString();
    if (this.lastReset !== today) {
      this.callsToday = 0;
      this.lastReset = today;
    }

    // Max 12 calls per day (4 matches * 3 calls each)
    if (this.callsToday >= 12) return;

    const db = getDb();
    
    // 1. Read current live matches from Firestore (0 API calls)
    const liveSnap = await db.collection(COLLECTIONS.LIVE_FIXTURES).get();
    if (liveSnap.empty) return;

    const liveMatches = liveSnap.docs.map(d => d.data());

    // 2. Filter for Top Matches (Mega clubs playing right now)
    const topLive = liveMatches.filter(m => {
      const home = (m.homeTeamName || '').toLowerCase();
      const away = (m.awayTeamName || '').toLowerCase();
      return TOP_TEAMS_SET.has(home) || TOP_TEAMS_SET.has(away);
    });

    if (topLive.length === 0) return;

    // 3. Fetch details for up to 4 matches
    let fetched = 0;
    for (const m of topLive) {
      if (this.callsToday >= 12 || fetched >= 4) break;

      const matchId = m.id;
      const docRef = db.collection('match_details').doc(String(matchId));
      const docSnap = await docRef.get();

      // Cache for 5 minutes if live
      if (docSnap.exists) {
        const age = Date.now() - (docSnap.data().cachedAt || 0);
        if (age < 300000) continue; // Skip if updated < 5 mins ago
      }

      if (!isBudgetAvailable(3)) break;

      try {
        // Make 3 API calls simultaneously
        const [eventsRes, lineupsRes, statsRes] = await Promise.all([
          api.get("/fixtures/events", { params: { fixture: matchId } }),
          api.get("/fixtures/lineups", { params: { fixture: matchId } }),
          api.get("/fixtures/statistics", { params: { fixture: matchId } })
        ]);

        this.callsToday += 3;

        await docRef.set({
          id: matchId,
          events: eventsRes.data.response || [],
          lineups: lineupsRes.data.response || [],
          statistics: statsRes.data.response || [],
          cachedAt: Date.now()
        }, { merge: true });

        fetched++;
        logger.info(`[TopMatches] Fetched details for ${m.homeTeamName} vs ${m.awayTeamName} (Cost: 3 calls)`);
      } catch (err) {
        logger.error(`[TopMatches] Failed for ${matchId}: ${err.message}`);
      }
    }
  }
}

module.exports = TopMatchesDetailsService;