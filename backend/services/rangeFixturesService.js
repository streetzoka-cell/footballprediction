const { getDb } = require("../config/firebase");
const { getDateOffset } = require("../config/constants");
const { calculateMatchScore, categorizeMatch } = require("./matchScoreEngine");
const providerManager = require("../providers/providerManager");
const logger = require("../utils/logger");

class RangeFixturesService {
  async run() {
    const startTime = Date.now();
    const db = getDb();
    
    const pastDate = getDateOffset(-10);
    const futureDate = getDateOffset(14);
    
    logger.info(`[RangeFixtures] Fetching from ${pastDate} to ${futureDate} using FootballData.org...`);

    let rawMatches = [];
    
    // ★ FIX: Split the range into 8-day chunks to avoid 400 Bad Request (API limit is 10 days)
    const chunkSize = 8;
    let currentStart = new Date(pastDate);
    const end = new Date(futureDate);

    while (currentStart <= end) {
      let currentEnd = new Date(currentStart);
      currentEnd.setDate(currentEnd.getDate() + chunkSize - 1);
      if (currentEnd > end) currentEnd = new Date(end);

      const fromStr = currentStart.toISOString().split('T')[0];
      const toStr = currentEnd.toISOString().split('T')[0];

      try {
        logger.info(`[RangeFixtures] Fetching chunk: ${fromStr} to ${toStr}`);
        const chunkMatches = await providerManager.getFixturesRange(fromStr, toStr);
        rawMatches = rawMatches.concat(chunkMatches);
      } catch (err) {
        logger.error(`[RangeFixtures] Failed to fetch chunk ${fromStr} to ${toStr}: ${err.message}`);
      }

      // Move to the next day after the current chunk
      currentStart = new Date(currentEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }

    if (rawMatches.length === 0) {
      logger.info(`[RangeFixtures] No matches found in range.`);
      return { total: 0, writes: 0, duration: Date.now() - startTime };
    }

    const matchesByDate = new Map();
    
    rawMatches.forEach(fixture => {
      const f = fixture.fixture, l = fixture.league, t = fixture.teams, g = fixture.goals, s = fixture.score;
      const matchDateStr = f.date ? new Date(f.date).toISOString().split('T')[0] : null;
      if (!matchDateStr) return;

      const doc = {
        id: f.id, date: f.date, timestamp: f.timestamp,
        status: f.status.short, statusLong: f.status.long, elapsed: f.status.elapsed ?? null,
        leagueId: l.id, leagueName: l.name, leagueCountry: l.country, leagueLogo: l.logo, leagueFlag: l.flag ?? null,
        season: l.season, round: l.round,
        homeTeamId: t.home.id, homeTeamName: t.home.name, homeTeamLogo: t.home.logo,
        awayTeamId: t.away.id, awayTeamName: t.away.name, awayTeamLogo: t.away.logo,
        goalsHome: g.home, goalsAway: g.away, sport: "football",
        scoreHalftimeHome: s?.halftime?.home ?? null, scoreHalftimeAway: s?.halftime?.away ?? null,
        scoreFulltimeHome: s?.fulltime?.home ?? null, scoreFulltimeAway: s?.fulltime?.away ?? null,
        _updatedAt: new Date().toISOString(),
      };

      doc.matchScore = calculateMatchScore(doc);
      doc.category = categorizeMatch(doc.matchScore);

      if (!matchesByDate.has(matchDateStr)) matchesByDate.set(matchDateStr, []);
      matchesByDate.get(matchDateStr).push(doc);
    });

    let totalWrites = 0;

    for (const [dateStr, newMatches] of matchesByDate) {
      const snapRef = db.collection('fixture_snapshots').doc(dateStr);
      const snap = await snapRef.get();
      
      let existingMatches = snap.exists ? (snap.data().matches || []) : [];
      const matchMap = new Map();
      
      existingMatches.forEach(m => matchMap.set(String(m.id), m));
      newMatches.forEach(m => matchMap.set(String(m.id), m));
      
      const finalMatches = Array.from(matchMap.values());

      await snapRef.set({
        matches: finalMatches,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      totalWrites += newMatches.length;
    }

    const duration = Date.now() - startTime;
    logger.info(`[RangeFixtures] Complete. Updated ${matchesByDate.size} days with ${totalWrites} matches in ${duration}ms.`);
    
    return { total: totalWrites, writes: totalWrites, duration };
  }
}

module.exports = RangeFixturesService;