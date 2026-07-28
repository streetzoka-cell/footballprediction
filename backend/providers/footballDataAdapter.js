const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');
const { FREE_LEAGUES_MAP } = require('../config/freeLeagues');
const https = require('https'); // ★ ADDED to bypass SSL cert error

let lastRequestTimes = [];
async function rateLimit() {
  const now = Date.now();
  lastRequestTimes = lastRequestTimes.filter(t => now - t < 60000);
  if (lastRequestTimes.length >= 9) {
    const wait = 60000 - (now - lastRequestTimes[0]) + 1000;
    logger.warn(`[FootballData] Rate limit reached. Waiting ${Math.round(wait/1000)}s...`);
    await new Promise(r => setTimeout(r, wait));
  }
  lastRequestTimes.push(Date.now());
}

const api = axios.create({
  baseURL: env.footballData?.baseUrl || 'https://api.football-data.org/v4',
  timeout: 15000,
  headers: { 'X-Auth-Token': env.footballData?.apiKey },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }), // ★ BYPASSES SSL CERT ERROR
});

class FootballDataAdapter {
  async fetchFixtures(dateStr) {
    await rateLimit();
    try {
      const res = await api.get(`/matches?dateFrom=${dateStr}&dateTo=${dateStr}`);
      return (res.data.matches || []).map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[FootballData] Fetch fixtures failed: ${err.message}`);
      throw err;
    }
  }

  async fetchFixturesRange(fromDate, toDate) {
    await rateLimit();
    try {
      const res = await api.get(`/matches?dateFrom=${fromDate}&dateTo=${toDate}`);
      return (res.data.matches || []).map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[FootballData] Fetch range failed: ${err.message}`);
      throw err;
    }
  }

  async fetchLive() {
    await rateLimit();
    try {
      const res = await api.get('/matches?status=LIVE,IN_PLAY,PAUSED');
      return (res.data.matches || []).map(this.normalizeMatch);
    } catch (err) {
      logger.error(`[FootballData] Fetch live failed: ${err.message}`);
      throw err;
    }
  }

  async fetchStandings(leagueId) {
    await rateLimit();
    const code = FREE_LEAGUES_MAP[leagueId];
    if (!code) throw new Error('League not covered by free tier');
    try {
      const res = await api.get(`/competitions/${code}/standings`);
      return this.normalizeStandings(res.data, leagueId);
    } catch (err) {
      logger.error(`[FootballData] Fetch standings failed: ${err.message}`);
      throw err;
    }
  }

  async fetchTeams(leagueId) {
    await rateLimit();
    const code = FREE_LEAGUES_MAP[leagueId];
    if (!code) throw new Error('League not covered by free tier');
    try {
      const res = await api.get(`/competitions/${code}/teams`);
      return this.normalizeTeams(res.data);
    } catch (err) {
      logger.error(`[FootballData] Fetch teams failed: ${err.message}`);
      throw err;
    }
  }

  normalizeMatch(m) {
    const score = m.score || {};
    return {
      fixture: {
        id: m.id,
        date: m.utcDate,
        timestamp: new Date(m.utcDate).getTime() / 1000,
        status: { short: m.status || 'NS', long: m.status || 'Not Started', elapsed: null }
      },
      league: {
        id: m.competition?.id, name: m.competition?.name, country: m.area?.name,
        logo: m.competition?.emblem, flag: m.area?.flag, 
        season: m.season?.id || new Date().getFullYear(),
        round: m.matchday ? `Matchday ${m.matchday}` : null
      },
      teams: {
        home: { id: m.homeTeam?.id, name: m.homeTeam?.name, logo: m.homeTeam?.crest },
        away: { id: m.awayTeam?.id, name: m.awayTeam?.name, logo: m.awayTeam?.crest }
      },
      goals: { home: score.fullTime?.home ?? null, away: score.fullTime?.away ?? null },
      score: {
        halftime: { home: score.halfTime?.home ?? null, away: score.halfTime?.away ?? null },
        fulltime: { home: score.fullTime?.home ?? null, away: score.fullTime?.away ?? null },
        extratime: { home: score.extraTime?.home ?? null, away: score.extraTime?.away ?? null },
        penalty: { home: score.penalties?.home ?? null, away: score.penalties?.away ?? null }
      }
    };
  }

  normalizeStandings(data, leagueId) {
    const competition = data.competition || {};
    const seasonData = data.season || {};
    const seasonYear = seasonData.startDate ? new Date(seasonData.startDate).getFullYear() : null;
    
    const leagueObj = {
      id: leagueId, name: competition.name, country: data.area?.name,
      logo: competition.emblem, flag: data.area?.flag, season: seasonYear, standings: []
    };

    const groups = data.standings || [];
    groups.forEach(group => {
      const table = group.table || [];
      const mappedTable = table.map(row => ({
        rank: row.position,
        team: { id: row.team?.id, name: row.team?.name, logo: row.team?.crest },
        points: row.points, goalsDiff: row.goalDifference, group: group.group || 'League',
        form: row.form || '', status: '', description: '',
        all: { played: row.playedGames, win: row.won, draw: row.draw, lose: row.lost, goals: { for: row.goalsFor, against: row.goalsAgainst } },
        home: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } },
        away: { played: 0, win: 0, draw: 0, lose: 0, goals: { for: 0, against: 0 } }
      }));
      leagueObj.standings.push(mappedTable);
    });

    return { response: [ { league: leagueObj } ] };
  }

  normalizeTeams(data) {
    const teams = (data.teams || []).map(t => ({
      team: { 
        id: t.id, 
        name: t.name, 
        logo: t.crest,
        venue: { 
          name: t.venue || null, 
          address: t.address || null, 
          city: null, 
          capacity: null, 
          surface: null, 
          image: null 
        }
      }
    }));
    return { response: teams };
  }
}

module.exports = new FootballDataAdapter();