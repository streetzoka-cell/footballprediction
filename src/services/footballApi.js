import { handleApiError } from '../utils/errorHandler';
import { monitorApiCall } from '../utils/performanceMonitor';
import { getAuthHeaders } from './backendAuth';

const TUNNEL_URL = 'https://api.zokascore.xyz';
const STATIC_BASE = `${TUNNEL_URL}/api/v1/data`;
const API_BASE = `${TUNNEL_URL}/api/v1`;

// Single fetch with timeout + 404 graceful fallback
async function fetchJSON(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 15000);
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { Accept: 'application/json', ...options.headers },
      signal: ctrl.signal,
      body: options.body || null,
    });
    if (!res.ok) {
      if (res.status === 404) return { data: [], success: true };
      const e = new Error(`API ${res.status}: ${res.statusText}`);
      e.status = res.status;
      throw e;
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('Request timeout');
      e.type = 'timeout';
      e.friendlyMessage = 'Check your connection.';
      throw e;
    }
    const parsed = handleApiError(err);
    err.type = parsed.type;
    err.friendlyMessage = parsed.message;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Auth fetch with 1 retry + auth headers
async function authFetchJSON(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeout || 20000);
  let lastErr = null;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...authHeaders, ...options.headers },
        signal: ctrl.signal,
        body: options.body || null,
      });
      if (!res.ok) {
        if (res.status === 404) return { data: null, success: true };
        const e = new Error(`API ${res.status}: ${res.statusText}`);
        e.status = res.status;
        if (res.status === 401 || res.status === 403) throw e;
        lastErr = e;
        if (attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
        throw e;
      }
      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        const e = new Error('Request timeout'); e.type = 'timeout'; throw e;
      }
      if (err.status === 401 || err.status === 403) {
        const p = handleApiError(err); err.type = p.type; err.friendlyMessage = p.message; throw err;
      }
      lastErr = err;
      if (attempt === 0) { await new Promise(r => setTimeout(r, 500)); continue; }
      const p = handleApiError(err); err.type = p.type; err.friendlyMessage = p.message; throw err;
    } finally {
      if (attempt === 1) clearTimeout(timer);
    }
  }
  clearTimeout(timer);
  throw lastErr || new Error('Unknown error');
}

export const footballApi = {
  // Home — live + today fixtures
  getHomeData: () => monitorApiCall('GET /data/home', async () => {
    const today = new Date().toISOString().split('T')[0];
    const [liveRes, fixturesRes] = await Promise.all([
      fetchJSON(`${STATIC_BASE}/live.json`),
      fetchJSON(`${STATIC_BASE}/fixtures/${today}.json`)
    ]);
    const live = liveRes?.data || [];
    const matches = fixturesRes?.data || [];
    const liveIds = new Set(live.map(m => m.id));
    const upcoming = matches.filter(m => !liveIds.has(m.id) && m.display?.isUpcoming);
    const featured = upcoming.filter(m => m.category === 'FEATURED' || m.importance >= 5).slice(0, 10);
    return { live, featured, upcoming };
  }),

  getFixtures: (dateStr) => monitorApiCall(`GET /fixtures/${dateStr}`, () => fetchJSON(`${STATIC_BASE}/fixtures/${dateStr}.json`)),
  getLive: () => monitorApiCall('GET /live.json', () => fetchJSON(`${STATIC_BASE}/live.json`)),
  getFinished: (sport, dateStr) => monitorApiCall(`GET /results/${dateStr}`, () => fetchJSON(`${STATIC_BASE}/results/${dateStr}.json`)),
  getGlobalStats: () => monitorApiCall('GET /stats/global.json', () => fetchJSON(`${STATIC_BASE}/stats/global.json`)),
  getVideos: () => monitorApiCall('GET /videos.json', () => fetchJSON(`${STATIC_BASE}/videos.json`)),

  getStandings: (leagueId) => monitorApiCall(`GET /standings?league=${leagueId}`, () => fetchJSON(`${API_BASE}/standings?league=${encodeURIComponent(leagueId)}`)),
  getTeams: (leagueId) => monitorApiCall(`GET /teams?league=${leagueId}`, () => fetchJSON(`${API_BASE}/teams?league=${encodeURIComponent(leagueId)}`)),
  getTeam: (id) => monitorApiCall(`GET /teams/${id}`, () => fetchJSON(`${API_BASE}/teams/${encodeURIComponent(id)}`)),
  getLeagueFixtures: (leagueId) => monitorApiCall(`GET /leagues/${leagueId}/fixtures`, () => fetchJSON(`${API_BASE}/leagues/${encodeURIComponent(leagueId)}/fixtures`)),
  getPlayer: (id) => monitorApiCall(`GET /players/${id}`, () => fetchJSON(`${API_BASE}/players/${encodeURIComponent(id)}`)),

  getMatchDetails: (id) => monitorApiCall(`GET /match/${id}`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}`)),
  getLineups: (id) => monitorApiCall(`GET /match/${id}/lineups`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/lineups`)),
  getStatistics: (id) => monitorApiCall(`GET /match/${id}/statistics`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/statistics`)),
  getPredictions: (id) => monitorApiCall(`GET /match/${id}/predictions`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/predictions`)),
  getOdds: (id) => monitorApiCall(`GET /match/${id}/odds`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/odds`)),
  getH2H: (team1Id, team2Id) => monitorApiCall('GET /h2h', () => fetchJSON(`${API_BASE}/match/h2h?team1=${encodeURIComponent(team1Id)}&team2=${encodeURIComponent(team2Id)}`)),
  getMatchIntelligence: (homeTeam, awayTeam) => monitorApiCall('GET /match-intelligence', () => fetchJSON(`${API_BASE}/match-intelligence?home=${encodeURIComponent(homeTeam)}&away=${encodeURIComponent(awayTeam)}`)),

  getHealth: () => fetchJSON(`${API_BASE}/health`),

  getResults: (params = {}) => monitorApiCall('GET /results', () => {
    const q = new URLSearchParams(params).toString();
    return fetchJSON(`${API_BASE}/results${q ? `?${q}` : ''}`);
  }),

  // ML Predictions
  getDailyPredictions: (dateStr) => monitorApiCall(`GET /predictions?date=${dateStr}`, () => fetchJSON(`${API_BASE}/predictions?date=${encodeURIComponent(dateStr)}`)),
  getFeatured: (date) => monitorApiCall(`GET /featured?date=${date}`, () => fetchJSON(`${API_BASE}/featured?date=${encodeURIComponent(date)}`)),
  getZokaPicks: (date) => monitorApiCall(`GET /zoka-picks?date=${date}`, () => fetchJSON(`${API_BASE}/zoka-picks?date=${encodeURIComponent(date)}`)),

  // Admin
  adminTriggerFeatureGen: () => monitorApiCall('POST /admin/ai-lab/generate-features', () => authFetchJSON(`${API_BASE}/admin/ai-lab/generate-features`, { method: 'POST' })),
  adminFeaturedAdd: (date, match) => monitorApiCall('POST /featured/admin/add', () => authFetchJSON(`${API_BASE}/featured/admin/add`, { method: 'POST', body: JSON.stringify({ date, match }) })),
  adminFeaturedRemove: (date, matchId) => monitorApiCall('POST /featured/admin/remove', () => authFetchJSON(`${API_BASE}/featured/admin/remove`, { method: 'POST', body: JSON.stringify({ date, matchId }) })),
  adminFeaturedReplace: (date, matches) => monitorApiCall('POST /featured/admin/replace', () => authFetchJSON(`${API_BASE}/featured/admin/replace`, { method: 'POST', body: JSON.stringify({ date, matches }) })),
  adminZokaSaveDraft: (date, payload) => monitorApiCall('POST /zoka-picks/admin/save-draft', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/save-draft`, { method: 'POST', body: JSON.stringify({ date, ...payload }) })),
  adminZokaPublish: (date, payload) => monitorApiCall('POST /zoka-picks/admin/publish', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/publish`, { method: 'POST', body: JSON.stringify({ date, ...payload }) })),
  adminZokaUnpublish: (date) => monitorApiCall('POST /zoka-picks/admin/unpublish', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/unpublish`, { method: 'POST', body: JSON.stringify({ date }) })),
  adminZokaGetHistory: (days = 7) => monitorApiCall(`GET /zoka-picks/history`, () => authFetchJSON(`${API_BASE}/zoka-picks/history?days=${encodeURIComponent(days)}`)),
  adminLeaderboardRebuild: (period, dateStr) => monitorApiCall(`POST /admin/leaderboards/rebuild/${period}`, () => authFetchJSON(`${API_BASE}/admin/leaderboards/rebuild/${encodeURIComponent(period)}`, { method: 'POST', body: JSON.stringify({ dateStr }) })),
  adminResolveMatch: (payload) => monitorApiCall('POST /admin/leaderboards/resolve', () => authFetchJSON(`${API_BASE}/admin/leaderboards/resolve`, { method: 'POST', body: JSON.stringify(payload) })),
  adminBackfillResults: () => monitorApiCall('POST /admin/leaderboards/rebuild/backfill-results', () => authFetchJSON(`${API_BASE}/leaderboards/rebuild/backfill-results`, { method: 'POST' })),

  // User predictions
  getUserPredictions: (date) => monitorApiCall(`GET /predictions/user?date=${date}`, () => authFetchJSON(`${API_BASE}/predictions/user?date=${encodeURIComponent(date)}`)),
  saveUserPrediction: (payload) => monitorApiCall('POST /predictions/user', () => authFetchJSON(`${API_BASE}/predictions/user`, { method: 'POST', body: JSON.stringify(payload) })),
  getDailyLeaderboard: (date) => monitorApiCall(`GET /leaderboard/daily/${date}`, () => fetchJSON(`${API_BASE}/leaderboard/daily/${encodeURIComponent(date)}`)),
  getLeaderboardSummary: (period) => monitorApiCall(`GET /leaderboard/summary/${period}`, () => fetchJSON(`${API_BASE}/leaderboard/summary/${encodeURIComponent(period)}`)),
};
