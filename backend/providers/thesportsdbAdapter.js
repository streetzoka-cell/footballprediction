const axios = require('axios');
const logger = require('../utils/logger');

const api = axios.create({
  // ★ FIX: Changed from 3 to 123 (Official Free User Key)
  baseURL: 'https://www.thesportsdb.com/api/v1/json/123',
  timeout: 15000,
});

class TheSportsDbAdapter {
  async getFixtures(dateStr) {
    try {
      // TheSportsDB uses eventsday.php to get all soccer events for a specific date
      const res = await api.get('/eventsday.php', { params: { d: dateStr, s: 'Soccer' } });
      const events = res.data?.events || [];
      
      if (events.length === 0) {
        logger.info(`[TheSportsDB] No fixtures found for ${dateStr}.`);
        return [];
      }
      
      logger.info(`[TheSportsDB] Successfully fetched ${events.length} fixtures for ${dateStr}.`);
      return events.map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[TheSportsDB] Fetch fixtures failed: ${err.message}`);
      throw err;
    }
  }

  // Maps TheSportsDB data to your exact API-Football shape
  normalizeMatch(e) {
    // TheSportsDB provides date (YYYY-MM-DD) and time (HH:mm:ss) separately
    const dateTimeStr = e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}Z` : (e.dateEvent || null);
    
    return {
      fixture: {
        id: e.idEvent,
        date: dateTimeStr ? new Date(dateTimeStr).toISOString() : null,
        timestamp: dateTimeStr ? new Date(dateTimeStr).getTime() / 1000 : null,
        status: { short: e.strStatus || 'NS', long: e.strStatus || 'Not Started', elapsed: null }
      },
      league: {
        id: e.idLeague, 
        name: e.strLeague, 
        country: e.strCountry || null,
        logo: e.strLeagueBadge || null, 
        flag: e.strThumb || null, 
        season: new Date().getFullYear(), 
        round: e.strRound || null
      },
      teams: {
        home: { id: e.idHomeTeam, name: e.strHomeTeam, logo: e.strHomeTeamBadge || null },
        away: { id: e.idAwayTeam, name: e.strAwayTeam, logo: e.strAwayTeamBadge || null }
      },
      goals: { home: e.intHomeScore != null ? parseInt(e.intHomeScore, 10) : null, away: e.intAwayScore != null ? parseInt(e.intAwayScore, 10) : null },
      score: {
        halftime: { home: null, away: null },
        fulltime: { home: e.intHomeScore != null ? parseInt(e.intHomeScore, 10) : null, away: e.intAwayScore != null ? parseInt(e.intAwayScore, 10) : null },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null }
      }
    };
  }
}

module.exports = new TheSportsDbAdapter();