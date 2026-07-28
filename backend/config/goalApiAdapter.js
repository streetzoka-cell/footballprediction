const axios = require('axios');
const env = require('./env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const circuitBreaker = require('../utils/circuitBreaker');

// ─── safe helpers ───
const num = (v, def = null) => {
  if (v == null || v === '') return def;
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
};

// ─── axios ───
const api = axios.create({
  baseURL: 'https://api.goal-api.com/v1',
  timeout: 15000,
  headers: { 'Authorization': `Bearer ${env.GOAL_API_KEY}` },
});

// ─── budget tracker ───
// NOTE: budget is process-local (in-memory). If you run more than one instance
// of this backend, each will track its own remaining count independently and
// the [x/800] number in logs reflects only THIS process's view, not a shared
// truth. If that matters for you, move this to Firestore too (same pattern as
// circuitBreaker.js) — flagging so it doesn't silently mislead you later.
let remaining = null;
let lastResetDate = new Date().toISOString().split('T')[0];

function resetIfNewDay() {
  const today = new Date().toISOString().split('T')[0];
  if (lastResetDate !== today) {
    remaining = null;
    lastResetDate = today;
    logger.info(`[GoalAPI] New day (${today}) — local budget counter reset`);
  }
}
function isBudgetAvailable(req = 1) {
  resetIfNewDay();
  return remaining === null || remaining >= req;
}
function getRemaining() { resetIfNewDay(); return remaining; }
function updateFromHeaders(headers) {
  const v = headers?.['x-ratelimit-requests-remaining'] || headers?.['x-ratelimit-remaining'];
  if (v != null) {
    const p = parseInt(v, 10);
    if (!isNaN(p)) remaining = p;
  }
}

api.interceptors.request.use((cfg) => {
  resetIfNewDay();
  if (remaining !== null && remaining <= 0) {
    const err = new Error(`GoalAPI budget exhausted (0). Blocked: ${cfg.url}`);
    err.code = 'BUDGET_EXHAUSTED';
    return Promise.reject(err);
  }
  return cfg;
});

api.interceptors.response.use(
  (res) => {
    updateFromHeaders(res.headers);
    if (res.data?.errors && typeof res.data.errors === 'object') {
      const msg = Object.values(res.data.errors).join(' ').toLowerCase();
      if (msg.includes('limit') || msg.includes('quota') || msg.includes('rate')) {
        logger.warn(`[GoalAPI] Body-level rate limit — forcing budget to 0`);
        remaining = 0;
      }
    }
    return res;
  },
  (err) => {
    if (err.response?.status === 429) {
      remaining = 0;
      logger.warn('[GoalAPI] 429 hit — forcing budget to 0');
    }
    return Promise.reject(err);
  }
);

// Helper: wraps a circuit-breaker-gated endpoint call so every method follows
// the same pattern instead of hand-duplicating try/catch six times.
async function withCircuitBreaker(name, fn) {
  if (await circuitBreaker.isDisabled(name)) {
    throw new Error(`${name} endpoint disabled by circuit breaker`);
  }
  try {
    return await fn();
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) {
      await circuitBreaker.trip(name, `${err.response.status}`);
      throw new Error(`${name} endpoint disabled by circuit breaker`);
    }
    throw err;
  }
}

class GoalApiAdapter {
  async getFixtures(dateStr) {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const all = [];
      let page = 1;
      let safety = 0;
      while (safety < 20) {
        const res = await api.get(`/fixtures/date/${dateStr}`, { params: { page, limit: 100 } });
        const data = res.data?.data || res.data?.response || res.data;
        const arr = Array.isArray(data) ? data : (data?.matches || []);
        if (!arr.length) break;
        all.push(...arr);
        safety++;
        const pg = res.data?.pagination || res.data?.meta?.pagination;
        const hasMore = pg?.hasMore === true || pg?.next_page != null || (pg?.current_page != null && pg?.total_pages != null && pg.current_page < pg.total_pages);
        if (!hasMore) break;
        page++;
      }
      logger.info(`[GoalAPI] Fetched ${all.length} fixtures for ${dateStr} [${getRemaining() ?? '?'} remaining]`);
      return all.map(this.normalizeMatch);
    }, 'GoalAPI.getFixtures');
  }

  async getLive() {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const res = await api.get('/fixtures/live');
      const data = res.data?.data || res.data?.response || res.data;
      const arr = Array.isArray(data) ? data : (data?.matches || []);
      logger.info(`[GoalAPI] Fetched ${arr.length} live matches [${getRemaining() ?? '?'} remaining]`);
      return arr.map(this.normalizeMatch);
    }, 'GoalAPI.getLive');
  }

  async getStandings(leagueId, season) {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      // API doc: GET /leagues/:id/standings
      const res = await api.get(`/leagues/${leagueId}/standings`, { params: season ? { season } : undefined });
      const data = res.data?.data || res.data?.response || res.data;
      logger.info(`[GoalAPI] Fetched standings for league ${leagueId} [${getRemaining() ?? '?'} remaining]`);
      return this.normalizeStandingsResponse(data, leagueId, season);
    }, 'GoalAPI.getStandings');
  }

  async getTeams(leagueId) {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const res = await api.get(`/leagues/${leagueId}/teams`);
      const data = res.data?.data || res.data?.response || res.data;
      logger.info(`[GoalAPI] Fetched teams for league ${leagueId} [${getRemaining() ?? '?'} remaining]`);
      return this.normalizeTeamsResponse(data, leagueId);
    }, 'GoalAPI.getTeams');
  }

  // ─────────── CIRCUIT-BREAKER-GATED ENDPOINTS ───────────
  // NOTE per the API docs you shared: the correct path is
  // /leagues/:id/top-scorers (hyphenated), not /topscorers or /scorers.
  // That mismatch is very likely why you were seeing 404s here — worth
  // trying against the real endpoint before assuming your plan lacks access.
  async getTopScorers(leagueId, season) {
    return withCircuitBreaker('topScorers', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      const res = await api.get(`/leagues/${leagueId}/top-scorers`, { params: season ? { season } : undefined });
      const data = res.data?.data || res.data?.response || res.data;
      logger.info(`[GoalAPI] Fetched top scorers for league ${leagueId} [${getRemaining() ?? '?'} remaining]`);
      return this.normalizeTopScorersResponse(data, leagueId, season);
    }, 'GoalAPI.getTopScorers'));
  }

  async getPredictions(fixtureId) {
    return withCircuitBreaker('predictions', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      const res = await api.get(`/fixtures/${fixtureId}/predictions`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizePredictions(data, fixtureId);
    }, 'GoalAPI.getPredictions'));
  }

  async getOdds(fixtureId) {
    return withCircuitBreaker('odds', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      const res = await api.get(`/fixtures/${fixtureId}/odds`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizeOdds(data, fixtureId);
    }, 'GoalAPI.getOdds'));
  }

  async getLineups(fixtureId) {
    return withCircuitBreaker('lineups', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      const res = await api.get(`/fixtures/${fixtureId}/lineups`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizeLineups(data, fixtureId);
    }, 'GoalAPI.getLineups'));
  }

  async getStatistics(fixtureId) {
    return withCircuitBreaker('statistics', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      const res = await api.get(`/fixtures/${fixtureId}/statistics`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizeStatistics(data, fixtureId);
    }, 'GoalAPI.getStatistics'));
  }

  async getH2H(team1Id, team2Id) {
    return withCircuitBreaker('h2h', async () => withRetry(async () => {
      if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
      // API doc: GET /h2h/:team1Id/:team2Id (not /teams/:id/matches)
      const res = await api.get(`/h2h/${team1Id}/${team2Id}`);
      const data = res.data?.data || res.data?.response || res.data;
      const arr = Array.isArray(data) ? data : (data?.matches || []);
      return arr.map(this.normalizeMatch);
    }, 'GoalAPI.getH2H'));
  }

  async getVideos() {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const res = await api.get('/videos/recent');
      const data = res.data?.data || res.data?.response || res.data;
      const arr = Array.isArray(data) ? data : (data?.videos || []);
      return arr.map(this.normalizeVideo);
    }, 'GoalAPI.getVideos');
  }

  async getTeam(teamId) {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const res = await api.get(`/teams/${teamId}`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizeTeam(data, teamId);
    }, 'GoalAPI.getTeam');
  }

  async getPlayer(playerId) {
    if (!isBudgetAvailable(1)) throw new Error('GoalAPI budget exhausted');
    return withRetry(async () => {
      const res = await api.get(`/players/${playerId}`);
      const data = res.data?.data || res.data?.response || res.data;
      return this.normalizePlayer(data, playerId);
    }, 'GoalAPI.getPlayer');
  }

  // ─────────── NORMALIZERS (unchanged from your working version) ───────────
  normalizeMatch(m) {
    const rawDate = m.matchDate ? (m.matchTime ? `${m.matchDate}T${m.matchTime}Z` : `${m.matchDate}T00:00:00Z`) : null;
    let date = null, timestamp = null;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        date = d.toISOString();
        timestamp = Math.floor(d.getTime() / 1000);
      }
    }
    const statusMap = { SCHEDULED: 'NS', TIMED: 'NS', IN_PLAY: '1H', PAUSED: 'HT', FINISHED: 'FT', SUSPENDED: 'SUSP', POSTPONED: 'PST', CANCELLED: 'CANC', AWARDED: 'AWD', WALKOVER: 'WO' };
    const rawStatus = (m.matchStatus || m.status || 'SCHEDULED').toUpperCase();
    const status = statusMap[rawStatus] || rawStatus || 'NS';
    const homeLogo = m.teamHomeBadge || m.homeTeamBadge || m.homeTeam?.badge || m.homeTeam?.logo || m.homeTeam?.crest || null;
    const awayLogo = m.teamAwayBadge || m.awayTeamBadge || m.awayTeam?.badge || m.awayTeam?.logo || m.awayTeam?.crest || null;
    const leagueLogo = m.leagueLogo || m.league?.logo || m.league?.badge || m.league?.emblem || null;

    return {
      id: String(m.id ?? m.apiId ?? m.matchId ?? ''),
      sport: 'football', date, timestamp, status, statusLong: m.matchStatus || status,
      elapsed: m.matchLive === '1' || status === '1H' || status === '2H' ? num(m.matchMinute, null) : null,
      minute: num(m.matchMinute, null),
      homeTeamId: String(m.homeTeamId ?? m.homeTeam?.id ?? ''), homeTeamName: m.homeTeamName || m.homeTeam?.name || 'TBD', homeTeamLogo: homeLogo, homeTeamCrest: homeLogo,
      awayTeamId: String(m.awayTeamId ?? m.awayTeam?.id ?? ''), awayTeamName: m.awayTeamName || m.awayTeam?.name || 'TBD', awayTeamLogo: awayLogo, awayTeamCrest: awayLogo,
      homeScore: num(m.homeTeamScore, null), awayScore: num(m.awayTeamScore, null), goalsHome: num(m.homeTeamScore, null), goalsAway: num(m.awayTeamScore, null),
      leagueId: String(m.leagueId ?? m.league?.id ?? ''), leagueName: m.leagueName || m.league?.name || 'Other',
      leagueCountry: m.countryName || m.country?.name || m.league?.country || null, leagueLogo, leagueEmblem: leagueLogo,
      leagueFlag: m.countryLogo || m.country?.flag || m.league?.flag || null,
      season: num(m.leagueYear ?? m.season ?? m.league?.season, new Date().getFullYear()),
      round: m.stageName || m.matchRound || m.league?.round || null,
      score: {
        halftime: { home: num(m.homeTeamHalftimeScore, null), away: num(m.awayTeamHalftimeScore, null) },
        fulltime: { home: num(m.homeTeamFtScore ?? m.homeTeamScore, null), away: num(m.awayTeamFtScore ?? m.awayTeamScore, null) },
        extratime: { home: num(m.homeTeamExtraScore, null), away: num(m.awayTeamExtraScore, null) },
        penalty: { home: num(m.homeTeamPenaltyScore, null), away: num(m.awayTeamPenaltyScore, null) },
      },
      venue: m.venueName || m.venue?.name || null, venueCity: m.venueCity || m.venue?.city || null, matchScore: 0, category: 'NORMAL',
    };
  }

  normalizeStandingsResponse(data, leagueId, season) {
    const rows = Array.isArray(data) ? data : (data?.standings || [data]);
    const leagueMeta = {
      id: String(leagueId), name: rows[0]?.leagueName || data?.league?.name || 'Unknown',
      country: rows[0]?.countryName || data?.league?.country || null, logo: rows[0]?.leagueLogo || data?.league?.logo || null,
      flag: rows[0]?.countryLogo || data?.league?.flag || null, season: season || num(rows[0]?.leagueYear, new Date().getFullYear()),
    };
    const standings = rows.map((row) => {
      const team = row.team || {};
      return {
        rank: num(row.overallLeaguePosition ?? row.rank ?? row.position, null),
        team: { id: String(team.id ?? row.teamId ?? ''), name: team.name || row.teamName || 'TBD', logo: team.badge || team.logo || team.crest || row.teamBadge || null },
        points: num(row.overallLeaguePTS ?? row.points, 0),
        goalsDiff: (num(row.overallLeagueGF, 0) - num(row.overallLeagueGA, 0)) || num(row.goalDifference, 0),
        group: row.stageName || row.group || 'League', form: row.form || null,
        status: row.overallPromotion || row.status || '', description: row.overallPromotion || row.description || '',
        all: { played: num(row.overallLeaguePlayed ?? row.playedGames, 0), win: num(row.overallLeagueW ?? row.won, 0), draw: num(row.overallLeagueD ?? row.draw, 0), lose: num(row.overallLeagueL ?? row.lost, 0), goals: { for: num(row.overallLeagueGF ?? row.goalsFor, 0), against: num(row.overallLeagueGA ?? row.goalsAgainst, 0) } },
        home: { played: num(row.homeLeaguePlayed, 0), win: num(row.homeLeagueW, 0), draw: num(row.homeLeagueD, 0), lose: num(row.homeLeagueL, 0), goals: { for: num(row.homeLeagueGF, 0), against: num(row.homeLeagueGA, 0) } },
        away: { played: num(row.awayLeaguePlayed, 0), win: num(row.awayLeagueW, 0), draw: num(row.awayLeagueD, 0), lose: num(row.awayLeagueL, 0), goals: { for: num(row.awayLeagueGF, 0), against: num(row.awayLeagueGA, 0) } },
      };
    });
    return { league: { ...leagueMeta, standings } };
  }

  normalizeTeamsResponse(data, leagueId) {
    const arr = Array.isArray(data) ? data : (data?.teams || [data]);
    return arr.map((t) => {
      const team = t.team || t;
      return {
        id: String(team.id ?? t.id ?? ''), name: team.name || t.name || 'TBD', logo: team.badge || team.logo || team.crest || t.badge || t.logo || null,
        country: team.country || t.country || null, founded: num(team.founded ?? t.founded, null),
        venue: { name: team.venueName || t.venueName || team.venue?.name || null, address: team.venueAddress || t.venueAddress || null, city: team.venueCity || t.venueCity || team.venue?.city || null, capacity: num(team.venueCapacity ?? t.venueCapacity, null), surface: team.venueSurface || t.venueSurface || null, image: team.venueImage || t.venueImage || null },
        leagueId: String(leagueId),
      };
    });
  }

  normalizeTopScorersResponse(data, leagueId, season) {
    const arr = Array.isArray(data) ? data : (data?.scorers || [data]);
    return arr.map((s) => {
      const player = s.player || s;
      const team = s.team || {};
      return {
        id: String(player.id ?? s.playerId ?? ''), name: player.name || s.playerName || 'TBD', photo: player.photo || s.playerPhoto || null,
        team: { id: String(team.id ?? s.teamId ?? ''), name: team.name || s.teamName || null, logo: team.badge || team.logo || s.teamBadge || null },
        leagueId: String(leagueId), season: season || num(s.seasonYear, new Date().getFullYear()),
        goals: num(s.goals ?? s.overallGoals, 0), assists: num(s.assists, 0), penalties: num(s.penalties, 0), appearances: num(s.appearances ?? s.matches, 0), rating: s.rating || null,
      };
    });
  }

  normalizePredictions(data, fixtureId) {
    const pred = data?.predictions || data?.prediction || data;
    return {
      id: String(fixtureId), winner: pred?.winner || null,
      winProbability: pred?.winProbability || pred?.probability || { home: null, draw: null, away: null },
      underOver: pred?.underOver || null, goals: pred?.goals || { home: null, away: null },
      advice: pred?.advice || pred?.prediction || null, xG: pred?.xG || { home: null, away: null }, comparison: pred?.comparison || null,
    };
  }

  normalizeOdds(data, fixtureId) {
    const arr = Array.isArray(data) ? data : (data?.odds ? data.odds : [data]);
    return {
      id: String(fixtureId),
      bookmakers: arr.map(b => ({
        id: b?.bookmaker?.id || b?.id || null, name: b?.bookmaker?.name || b?.name || null,
        // API doc: pre-match odds nest asianHandicap / overUnder as objects
        // keyed by line ("ah-1_1", "o+2.5"). Preserve those alongside the
        // flat `bets` array your frontend already expects.
        asianHandicap: b?.asianHandicap || null,
        overUnder: b?.overUnder || null,
        bets: (b?.bets || []).map(bet => ({ id: bet?.id || null, name: bet?.name || null, values: (bet?.values || []).map(v => ({ value: v?.value || null, odd: v?.odd || null })) }))
      }))
    };
  }

  normalizeLineups(data, fixtureId) {
    const lineups = Array.isArray(data) ? data : (data?.lineups ? data.lineups : [data]);
    return {
      id: String(fixtureId),
      home: lineups[0] ? {
        team: { id: String(lineups[0].team?.id || ''), name: lineups[0].team?.name || '', logo: lineups[0].team?.logo || null },
        formation: lineups[0].formation || null,
        startXI: (lineups[0].startXI || lineups[0].startxi || []).map(p => ({ id: String(p.player?.id || ''), name: p.player?.name || '', pos: p.pos || null, number: p.player?.number || null })),
        substitutes: (lineups[0].substitutes || []).map(p => ({ id: String(p.player?.id || ''), name: p.player?.name || '', pos: p.pos || null, number: p.player?.number || null })),
        coach: lineups[0].coach?.name || null,
      } : null,
      away: lineups[1] ? {
        team: { id: String(lineups[1].team?.id || ''), name: lineups[1].team?.name || '', logo: lineups[1].team?.logo || null },
        formation: lineups[1].formation || null,
        startXI: (lineups[1].startXI || lineups[1].startxi || []).map(p => ({ id: String(p.player?.id || ''), name: p.player?.name || '', pos: p.pos || null, number: p.player?.number || null })),
        substitutes: (lineups[1].substitutes || []).map(p => ({ id: String(p.player?.id || ''), name: p.player?.name || '', pos: p.pos || null, number: p.player?.number || null })),
        coach: lineups[1].coach?.name || null,
      } : null,
    };
  }

  normalizeStatistics(data, fixtureId) {
    const stats = Array.isArray(data) ? data : (data?.statistics ? data.statistics : [data]);
    return { id: String(fixtureId), home: stats[0] || null, away: stats[1] || null };
  }

  normalizeVideo(v) {
    return {
      id: String(v.id || v.videoId || ''), title: v.title || v.name || null, thumbnail: v.thumbnail || v.image || null,
      url: v.url || v.videoUrl || null, date: v.date || v.publishedAt || null,
      matchId: v.matchId ? String(v.matchId) : null, leagueId: v.leagueId ? String(v.leagueId) : null,
    };
  }

  normalizeTeam(data, teamId) {
    const t = data?.team || data;
    return {
      id: String(teamId ?? t.id ?? ''), name: t.name || 'TBD', logo: t.badge || t.logo || t.crest || null, country: t.country || null,
      founded: num(t.founded, null), venue: { name: t.venueName || t.venue?.name || null, address: t.venueAddress || null, city: t.venueCity || t.venue?.city || null, capacity: num(t.venueCapacity, null), surface: t.venueSurface || null, image: t.venueImage || null },
    };
  }

  normalizePlayer(data, playerId) {
    const p = data?.player || data;
    return {
      id: String(playerId ?? p.id ?? ''), name: p.name || (p.firstname ? `${p.firstname} ${p.lastname}` : 'TBD'), photo: p.photo || p.image || null,
      age: num(p.age, null), nationality: p.nationality || null, height: p.height || null, weight: p.weight || null, position: p.position || null,
      team: { id: String(p.team?.id || ''), name: p.team?.name || null, logo: p.team?.badge || p.team?.logo || null },
    };
  }
}

const instance = new GoalApiAdapter();
instance.isBudgetAvailable = isBudgetAvailable;
instance.getRemaining = getRemaining;
module.exports = instance;