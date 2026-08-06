import { handleApiError } from '../utils/errorHandler';
import { monitorApiCall } from '../utils/performanceMonitor';
import { getAuthHeaders } from './backendAuth';

const TUNNEL_URL = "https://api.zokascore.xyz";

const STATIC_BASE = `${TUNNEL_URL}/api/v1/data`;
const API_BASE = `${TUNNEL_URL}/api/v1`;

async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 15000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      signal: controller.signal,
      body: options.body || null,
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { data: [], success: true };
      }

      const error = new Error(`API ${res.status}: ${res.statusText}`);
      error.status = res.status;
      throw error;
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      const error = new Error('Request timeout');
      error.type = 'timeout';
      error.friendlyMessage = 'Request timed out. Please check your connection.';
      throw error;
    }

    const parsed = handleApiError(err);
    err.type = parsed.type;
    err.friendlyMessage = parsed.message;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function authFetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 20000;
  const timer = setTimeout(() => controller.abort(), timeout);

  let lastError = null;
  const maxRetries = 1;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const authHeaders = await getAuthHeaders();

      const res = await fetch(url, {
        method: options.method || "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeaders,
          ...options.headers,
        },
        signal: controller.signal,
        body: options.body || null,
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { data: null, success: true };
        }

        const error = new Error(`API ${res.status}: ${res.statusText}`);
        error.status = res.status;

        // Don't retry on auth errors
        if (res.status === 401 || res.status === 403) {
          throw error;
        }

        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw error;
      }

      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        const error = new Error('Request timeout');
        error.type = 'timeout';
        error.friendlyMessage = 'Request timed out. Please check your connection.';
        throw error;
      }

      if (err.status === 401 || err.status === 403) {
        const parsed = handleApiError(err);
        err.type = parsed.type;
        err.friendlyMessage = parsed.message;
        throw err;
      }

      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }

      const parsed = handleApiError(err);
      err.type = parsed.type;
      err.friendlyMessage = parsed.message;
      throw err;
    }
  }

  throw lastError || new Error('Unknown error');
}

export const footballApi = {
  // ─── Public Static Endpoints ───
  getHomeData: async () =>
    monitorApiCall('GET /data/home', async () => {
      const today = new Date().toISOString().split('T')[0];
      const [liveRes, fixturesRes] = await Promise.all([
        fetchJSON(`${STATIC_BASE}/live.json`),
        fetchJSON(`${STATIC_BASE}/fixtures/${today}.json`),
      ]);

      const live = liveRes?.data || [];
      const matches = fixturesRes?.data || [];
      const liveIds = new Set(live.map((m) => m.id));
      const upcoming = matches.filter((m) => !liveIds.has(m.id) && m.display?.isUpcoming);
      const featured = upcoming
        .filter((m) => m.category === 'FEATURED' || m.category === 'IMPORTANT' || m.importance >= 5)
        .slice(0, 10);

      return { live, featured, upcoming };
    }),

  getFixtures: (dateStr, sport = 'football') =>
    monitorApiCall(`GET /data/fixtures/${dateStr}.json`, () =>
      fetchJSON(`${STATIC_BASE}/fixtures/${dateStr}.json`)
    ),

  getLive: (sport = 'football') =>
    monitorApiCall('GET /data/live.json', () =>
      fetchJSON(`${STATIC_BASE}/live.json`)
    ),

  getFinished: (sport = 'football', dateStr) =>
    monitorApiCall(`GET /data/results/${dateStr}.json`, () =>
      fetchJSON(`${STATIC_BASE}/results/${dateStr}.json`)
    ),

  getGlobalStats: () =>
    monitorApiCall('GET /data/stats/global.json', () =>
      fetchJSON(`${STATIC_BASE}/stats/global.json`)
    ),

  getStandings: (leagueId) =>
    monitorApiCall(`GET /standings?league=${leagueId}`, () =>
      fetchJSON(`${API_BASE}/standings?league=${leagueId}`)
    ),

  getTeams: (leagueId) =>
    monitorApiCall(`GET /teams?league=${leagueId}`, () =>
      fetchJSON(`${API_BASE}/teams?league=${leagueId}`)
    ),

  getTeam: (id) =>
    monitorApiCall(`GET /teams/${id}`, () =>
      fetchJSON(`${API_BASE}/teams/${id}`)
    ),

  getPlayer: (id) =>
    monitorApiCall(`GET /players/${id}`, () =>
      fetchJSON(`${API_BASE}/players/${id}`)
    ),

  getMatchDetails: (id) =>
    monitorApiCall(`GET /match/${id}`, () =>
      fetchJSON(`${API_BASE}/match/${id}`)
    ),

  getLineups: (id) =>
    monitorApiCall(`GET /match/${id}/lineups`, () =>
      fetchJSON(`${API_BASE}/match/${id}/lineups`)
    ),

  getStatistics: (id) =>
    monitorApiCall(`GET /match/${id}/statistics`, () =>
      fetchJSON(`${API_BASE}/match/${id}/statistics`)
    ),

  getPredictions: (id) =>
    monitorApiCall(`GET /match/${id}/predictions`, () =>
      fetchJSON(`${API_BASE}/match/${id}/predictions`)
    ),

  getOdds: (id) =>
    monitorApiCall(`GET /match/${id}/odds`, () =>
      fetchJSON(`${API_BASE}/match/${id}/odds`)
    ),

  getH2H: (team1Id, team2Id) =>
    monitorApiCall(`GET /match/h2h?team1=${team1Id}&team2=${team2Id}`, () =>
      fetchJSON(`${API_BASE}/match/h2h?team1=${team1Id}&team2=${team2Id}`)
    ),

  getVideos: () =>
    monitorApiCall('GET /data/videos.json', () =>
      fetchJSON(`${STATIC_BASE}/videos.json`)
    ),

  getHealth: () => fetchJSON(`${API_BASE}/health`),

  // ─── Content Endpoints ───
  getFeatured: (date) =>
    monitorApiCall(`GET /featured?date=${date}`, () =>
      fetchJSON(`${API_BASE}/featured?date=${date}`)
    ),

  getZokaPicks: (date) =>
    monitorApiCall(`GET /zoka-picks?date=${date}`, () =>
      fetchJSON(`${API_BASE}/zoka-picks?date=${date}`)
    ),

  // ─── Admin Featured ───
  adminFeaturedAdd: (date, match) =>
    monitorApiCall('POST /featured/admin/add', () =>
      authFetchJSON(`${API_BASE}/featured/admin/add`, {
        method: 'POST',
        body: JSON.stringify({ date, match }),
      })
    ),

  adminFeaturedRemove: (date, matchId) =>
    monitorApiCall('POST /featured/admin/remove', () =>
      authFetchJSON(`${API_BASE}/featured/admin/remove`, {
        method: 'POST',
        body: JSON.stringify({ date, matchId }),
      })
    ),

  adminFeaturedReplace: (date, matches) =>
    monitorApiCall('POST /featured/admin/replace', () =>
      authFetchJSON(`${API_BASE}/featured/admin/replace`, {
        method: 'POST',
        body: JSON.stringify({ date, matches }),
      })
    ),

  // ─── Admin Zoka Picks ───
  adminZokaSaveDraft: (date, payload) =>
    monitorApiCall('POST /zoka-picks/admin/save-draft', () =>
      authFetchJSON(`${API_BASE}/zoka-picks/admin/save-draft`, {
        method: 'POST',
        body: JSON.stringify({ date, ...payload }),
      })
    ),

  adminZokaPublish: (date, payload) =>
    monitorApiCall('POST /zoka-picks/admin/publish', () =>
      authFetchJSON(`${API_BASE}/zoka-picks/admin/publish`, {
        method: 'POST',
        body: JSON.stringify({ date, ...payload }),
      })
    ),

  adminZokaUnpublish: (date) =>
    monitorApiCall('POST /zoka-picks/admin/unpublish', () =>
      authFetchJSON(`${API_BASE}/zoka-picks/admin/unpublish`, {
        method: 'POST',
        body: JSON.stringify({ date }),
      })
    ),

  // NEW: Get Zoka Picks history from backend (no Firestore reads!)
  adminZokaGetHistory: (days = 7) =>
    monitorApiCall(`GET /zoka-picks/history?days=${days}`, () =>
      authFetchJSON(`${API_BASE}/zoka-picks/history?days=${days}`)
    ),

  // ─── Admin Leaderboard ───
  adminLeaderboardRebuild: (period, dateStr) =>
    monitorApiCall(`POST /admin/leaderboards/rebuild/${period}`, () =>
      authFetchJSON(`${API_BASE}/admin/leaderboards/rebuild/${period}`, {
        method: 'POST',
        body: JSON.stringify({ dateStr }),
      })
    ),

  // ─── User Predictions ───
  getUserPredictions: (date) =>
    monitorApiCall(`GET /predictions/user?date=${date}`, () =>
      authFetchJSON(`${API_BASE}/predictions/user?date=${date}`)
    ),

  saveUserPrediction: (payload) =>
    monitorApiCall('POST /predictions/user', () =>
      authFetchJSON(`${API_BASE}/predictions/user`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    ),

  // ─── Leaderboards ───
  getDailyLeaderboard: (date) =>
    monitorApiCall(`GET /leaderboard/daily/${date}`, () =>
      fetchJSON(`${API_BASE}/leaderboard/daily/${date}`)
    ),

  getLeaderboardSummary: (period) =>
    monitorApiCall(`GET /leaderboard/summary/${period}`, () =>
      fetchJSON(`${API_BASE}/leaderboard/summary/${period}`)
    ),

  // ─── Admin Resolve ───
  adminResolveMatch: (payload) =>
    monitorApiCall('POST /admin/leaderboards/resolve', () =>
      authFetchJSON(`${API_BASE}/admin/leaderboards/resolve`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    ),
};