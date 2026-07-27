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
    const startTime = Date.now();
    const today = new Date().toDateString();
    if (this.lastReset !== today) {
      this.callsToday = 0;
      this.lastReset = today;
    }

    if (this.callsToday >= 12) {
      return { success: true, skipped: true, reason: "Daily limit reached", duration: Date.now() - startTime };
    }

    const db = getDb();
    
    const liveSnap = await db.collection(COLLECTIONS.LIVE_FIXTURES).get();
    if (liveSnap.empty) {
      return { success: true, skipped: true, reason: "No live matches", duration: Date.now() - startTime };
    }

    const liveMatches = liveSnap.docs.map(d => d.data());

    const topLive = liveMatches.filter(m => {
      const home = (m.homeTeamName || '').toLowerCase();
      const away = (m.awayTeamName || '').toLowerCase();
      return TOP_TEAMS_SET.has(home) || TOP_TEAMS_SET.has(away);
    });

    if (topLive.length === 0) {
      return { success: true, skipped: true, reason: "No top matches live", duration: Date.now() - startTime };
    }

    let fetched = 0;
    for (const m of topLive) {
      if (this.callsToday >= 12 || fetched >= 4) break;

      const matchId = m.id;
      const docRef = db.collection('match_details').doc(String(matchId));
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const age = Date.now() - (docSnap.data().cachedAt || 0);
        if (age < 300000) continue; 
      }

      if (!isBudgetAvailable(3)) break;

      try {
        const [eventsRes, lineupsRes, statsRes] = await Promise.all([
          api.get("/fixtures/events", { params: { fixture: matchId } }),
          api.get("/fixtures/lineups", { params: { fixture: matchId } }),
          api.get("/fixtures/statistics", { params: { fixture: matchId } })
        ]);

        this.callsToday += 3;

        await docRef.set({
          id: matchId,
          events: eventsRes.data?.response || [],
          lineups: lineupsRes.data?.response || [],
          statistics: statsRes.data?.response || [],
          cachedAt: Date.now()
        }, { merge: true });

        fetched++;
        logger.info(`[TopMatches] Fetched details for ${m.homeTeamName} vs ${m.awayTeamName} (Cost: 3 calls)`);
      } catch (err) {
        logger.error(`[TopMatches] Failed for ${matchId}: ${err.message}`);
      }
    }

    return { 
      success: true, 
      fetched, 
      duration: Date.now() - startTime,
      callsUsed: this.callsToday 
    };
  }
}

module.exports = TopMatchesDetailsService;