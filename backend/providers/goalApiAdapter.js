const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');

const api = axios.create({
  baseURL: 'https://api.goal-api.com/v1',
  timeout: 15000,
  headers: {
    'Authorization': `Bearer ${env.GOAL_API_KEY}`
  }
});

class GoalApiAdapter {
  async getFixtures(dateStr) {
    try {
      let allMatches = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        // ★ FIX: Using the official /fixtures/date/:date endpoint
        const res = await api.get(`/fixtures/date/${dateStr}`, { params: { page: page, limit: 100 } });
        const data = res.data?.data || res.data?.response || [];
        const matchArray = Array.isArray(data) ? data : (data.matches || []);
        
        allMatches = allMatches.concat(matchArray);

        if (res.data?.pagination?.hasMore) {
          page++;
        } else {
          hasMore = false;
        }
        
        if (page > 10) hasMore = false; // Safety break (up to 1000 matches)
      }

      logger.info(`[GoalAPI] Fetched ${allMatches.length} fixtures for ${dateStr}.`);
      return allMatches.map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[GoalAPI] Fetch fixtures failed: ${err.message}`);
      throw err;
    }
  }

  async getLive() {
    try {
      // ★ FIX: Using the official /fixtures/live endpoint
      const res = await api.get('/fixtures/live');
      const matches = res.data?.data || res.data?.response || [];
      const matchArray = Array.isArray(matches) ? matches : (matches.matches || []);
      
      logger.info(`[GoalAPI] Fetched ${matchArray.length} live matches.`);
      return matchArray.map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[GoalAPI] Fetch live failed: ${err.message}`);
      throw err;
    }
  }

  async getStandings(leagueId) {
    try {
      const res = await api.get(`/leagues/${leagueId}/standings`);
      const data = res.data?.data || res.data?.response || [];
      const standingsArray = Array.isArray(data) ? data : [data];
      
      logger.info(`[GoalAPI] Fetched standings for league ${leagueId}.`);
      return { response: standingsArray.map(this.normalizeStandings) };
    } catch (err) {
      logger.error(`[GoalAPI] Fetch standings failed: ${err.message}`);
      throw err;
    }
  }

  async getTeams(leagueId) {
    try {
      const res = await api.get(`/leagues/${leagueId}/teams`);
      const data = res.data?.data || res.data?.response || [];
      const teamsArray = Array.isArray(data) ? data : [data];
      
      logger.info(`[GoalAPI] Fetched teams for league ${leagueId}.`);
      return { response: teamsArray.map(this.normalizeTeam) };
    } catch (err) {
      logger.error(`[GoalAPI] Fetch teams failed: ${err.message}`);
      throw err;
    }
  }

  // ───────────────────────────────────────────────
  // Normalizers (Maps GOAL API flat structure to your exact API-Football shape)
  // ───────────────────────────────────────────────
  normalizeMatch(m) {
    const rawDate = m.matchDate ? (m.matchTime ? `${m.matchDate}T${m.matchTime}Z` : `${m.matchDate}T00:00:00Z`) : null;
    let formattedDate = null;
    let timestamp = null;
    
    if (rawDate) {
      const dateObj = new Date(rawDate);
      if (!isNaN(dateObj.getTime())) {
        formattedDate = dateObj.toISOString();
        timestamp = dateObj.getTime() / 1000;
      }
    }

    return {
      fixture: {
        id: m.id || m.apiId,
        date: formattedDate,
        timestamp: timestamp,
        status: { 
          short: m.matchStatus === 'SCHEDULED' ? 'NS' : (m.matchStatus || 'NS'), 
          long: m.matchStatus || 'Not Started', 
          elapsed: m.matchLive === '1' ? 1 : null 
        }
      },
      league: {
        id: m.leagueId, 
        name: m.leagueName, 
        country: m.countryName,
        logo: m.leagueLogo || m.league?.logo, 
        flag: m.countryLogo, 
        season: m.leagueYear, 
        round: m.stageName || m.matchRound
      },
      teams: {
        home: { id: m.homeTeamId, name: m.homeTeamName, logo: m.teamHomeBadge || m.homeTeam?.badge },
        away: { id: m.awayTeamId, name: m.awayTeamName, logo: m.teamAwayBadge || m.awayTeam?.badge }
      },
      goals: { 
        home: m.homeTeamScore != null ? parseInt(m.homeTeamScore, 10) : null, 
        away: m.awayTeamScore != null ? parseInt(m.awayTeamScore, 10) : null 
      },
      score: {
        halftime: { 
          home: m.homeTeamHalftimeScore != null ? parseInt(m.homeTeamHalftimeScore, 10) : null, 
          away: m.awayTeamHalftimeScore != null ? parseInt(m.awayTeamHalftimeScore, 10) : null 
        },
        fulltime: { 
          home: m.homeTeamFtScore != null ? parseInt(m.homeTeamFtScore, 10) : null, 
          away: m.awayTeamFtScore != null ? parseInt(m.awayTeamFtScore, 10) : null 
        },
        extratime: { 
          home: m.homeTeamExtraScore != null ? parseInt(m.homeTeamExtraScore, 10) : null, 
          away: m.awayTeamExtraScore != null ? parseInt(m.awayTeamExtraScore, 10) : null 
        },
        penalty: { 
          home: m.homeTeamPenaltyScore != null ? parseInt(m.homeTeamPenaltyScore, 10) : null, 
          away: m.awayTeamPenaltyScore != null ? parseInt(m.awayTeamPenaltyScore, 10) : null 
        }
      }
    };
  }

  normalizeStandings(s) {
    const league = s.league || {};
    const team = s.team || {};
    
    return {
      league: {
        id: league.id,
        name: league.name,
        country: team.country || null,
        logo: league.logo,
        flag: null,
        season: league.season,
        standings: [{
          rank: parseInt(s.overallLeaguePosition, 10),
          team: { id: team.id, name: team.name, logo: team.badge },
          points: parseInt(s.overallLeaguePTS, 10),
          goalsDiff: parseInt(s.overallLeagueGF, 10) - parseInt(s.overallLeagueGA, 10),
          group: s.stageName || 'League',
          form: null,
          status: s.overallPromotion || '',
          description: s.overallPromotion || '',
          all: { 
            played: parseInt(s.overallLeaguePlayed, 10), 
            win: parseInt(s.overallLeagueW, 10), 
            draw: parseInt(s.overallLeagueD, 10), 
            lose: parseInt(s.overallLeagueL, 10), 
            goals: { for: parseInt(s.overallLeagueGF, 10), against: parseInt(s.overallLeagueGA, 10) } 
          },
          home: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
          away: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } }
        }]
      }
    };
  }

  normalizeTeam(t) {
    const team = t.team || t;
    return {
      team: {
        id: team.id,
        name: team.name,
        logo: team.badge || team.logo,
        venue: {
          name: team.venueName || null,
          address: team.venueAddress || null,
          city: team.venueCity || null,
          capacity: team.venueCapacity || null,
          surface: team.venueSurface || null,
          image: null
        }
      }
    };
  }
}

module.exports = new GoalApiAdapter();