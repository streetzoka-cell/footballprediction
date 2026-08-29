import { handleApiError } from '../utils/errorHandler';
import { monitorApiCall } from '../utils/performanceMonitor';
import { getAuthHeaders } from './backendAuth';

const TUNNEL_URL = 'https://api.zokascore.xyz';
const STATIC_BASE = `${TUNNEL_URL}/api/v1/data`;
const API_BASE = `${TUNNEL_URL}/api/v1`;

const todayStr = () => new Date().toISOString().split('T')[0];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Single fetch with timeout + graceful 404.
 * 404s resolve (never throw) but carry `notFound: true` so callers can
 * distinguish "empty because none" from "empty because missing" —
 * and react-query retry logic can stop on it.
 */
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
      if (res.status === 404) return { data: [], success: true, notFound: true, empty: true };
      const e = new Error(`API ${res.status}: ${res.statusText}`);
      e.status = res.status;
      e.notFound = res.status === 404;
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
        if (res.status === 404) {
          clearTimeout(timer);
          return { data: null, success: true, notFound: true };
        }
        const e = new Error(`API ${res.status}: ${res.statusText}`);
        e.status = res.status;
        if (res.status === 401 || res.status === 403) { clearTimeout(timer); throw e; }
        lastErr = e;
        if (attempt === 0) { await sleep(500); continue; }
        clearTimeout(timer);
        throw e;
      }
      const json = await res.json();
      clearTimeout(timer);
      return json;
    } catch (err) {
      if (err.name === 'AbortError') {
        clearTimeout(timer);
        const e = new Error('Request timeout'); e.type = 'timeout'; throw e;
      }
      if (err.status === 401 || err.status === 403) {
        const p = handleApiError(err); err.type = p.type; err.friendlyMessage = p.message; throw err;
      }
      lastErr = err;
      if (attempt === 0) { await sleep(500); continue; }
      const p = handleApiError(err); err.type = p.type; err.friendlyMessage = p.message; throw err;
    }
  }
  clearTimeout(timer);
  throw lastErr || new Error('Unknown error');
}

/* ── shared static-file client-side helpers ── */

const isLiveStatus = (m) =>
  ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'].includes(m?.status);

const isUpcomingMatch = (m) =>
  !isLiveStatus(m) &&
  !m?.display?.isFinished &&
  !['FT', 'AET', 'PEN', 'FINISHED', 'PST', 'CANC', 'ABD', 'SUSP'].includes(m?.status) &&
  (m?.display?.isUpcoming || m?.status === 'NS' || m?.status == null);

/**
 * TOP 12 helper: prefers the explicit `mustHave` flag the backend tags on
 * every fixture; falls back to a hardcoded ID list for old snapshots.
 */
const TOP_LEAGUE_IDS = new Set([
  '2', '39', '140', '78', '135', '61',
  '3', '848', '88', '94', '71', '128',
]);

const isTopLeague = (m) =>
  m?.mustHave === true ||
  (m?.mustHave === undefined && TOP_LEAGUE_IDS.has(String(m?.leagueId)));

export const footballApi = {
  // ── Home: static-first (instant) + must-have guarantee ──
  getHomeData: () => monitorApiCall('GET /data/home', async () => {
    const today = todayStr();
    const [liveRes, fixturesRes] = await Promise.all([
      fetchJSON(`${STATIC_BASE}/live.json`),
      fetchJSON(`${STATIC_BASE}/fixtures/${today}.json`),
    ]);
    const live = (liveRes?.data || []).filter(isLiveStatus);
    const matches = fixturesRes?.data || [];
    const liveIds = new Set(live.map((m) => String(m.id)));

    const upcoming = matches
      .filter((m) => !liveIds.has(String(m.id)) && isUpcomingMatch(m))
      .sort((a, b) =>
        (b.mustHave ? 1 : 0) - (a.mustHave ? 1 : 0) ||
        (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 200); // keep state light — full list comes from useFixtures

    const featured = matches
      .filter((m) => m.category === 'FEATURED' || isTopLeague(m))
      .sort((a, b) =>
        (b.mustHave ? 1 : 0) - (a.mustHave ? 1 : 0) ||
        (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 10);

    const top = matches.filter(isTopLeague);

    return { live, featured, upcoming, top };
  }),

  // ── Top 12 (dynamic endpoint primary, static fallback) ──
  getTopMatches: (days = 1, date) => monitorApiCall('GET /matches/top', async () => {
    try {
      const res = await fetchJSON(`${API_BASE}/matches/top?days=${days}${date ? `&date=${date}` : ''}`);
      if (res?.data?.length) return res;
    } catch { /* fall through to static */ }
    const fixtures = await fetchJSON(`${STATIC_BASE}/fixtures/${date || todayStr()}.json`);
    const data = (fixtures?.data || []).filter(isTopLeague);
    return { success: true, data, count: data.length }; // ★ count was 0
  }),

  // ── Fixtures / live / results / stats (static, CDN-able) ──
  getFixtures: (dateStr) => monitorApiCall(`GET /fixtures/${dateStr}`, () => fetchJSON(`${STATIC_BASE}/fixtures/${dateStr}.json`)),
  getLive: () => monitorApiCall('GET /live.json', () => fetchJSON(`${STATIC_BASE}/live.json`)),
  getFinished: (sport, dateStr) => monitorApiCall(`GET /results/${dateStr}`, () => fetchJSON(`${STATIC_BASE}/results/${dateStr}.json`)),
  getGlobalStats: () => monitorApiCall('GET /stats/global.json', () => fetchJSON(`${STATIC_BASE}/stats/global.json`)),
  getVideos: () => monitorApiCall('GET /videos.json', () => fetchJSON(`${STATIC_BASE}/videos.json`)),

  // ── Standings / teams (dynamic) ──
  getStandings: (leagueId) => monitorApiCall(`GET /standings?league=${leagueId}`, () => fetchJSON(`${API_BASE}/standings?league=${encodeURIComponent(leagueId)}`)),
  getTopStandings: () => monitorApiCall('GET /standings/overview', () => fetchJSON(`${API_BASE}/standings/overview`)),
  getTeams: (leagueId) => monitorApiCall(`GET /teams?league=${leagueId}`, () => fetchJSON(`${API_BASE}/teams?league=${encodeURIComponent(leagueId)}`)),
  getTeam: (id) => monitorApiCall(`GET /teams/${id}`, () => fetchJSON(`${API_BASE}/teams/${encodeURIComponent(id)}`)),
  getTeamFixtures: (teamId) => monitorApiCall(`GET /teams/${teamId}/fixtures`, () => fetchJSON(`${API_BASE}/teams/${encodeURIComponent(teamId)}/fixtures`)),

  // ★ Backend has NO /leagues/:id/fixtures route — implemented from the
  //   static snapshot instead of guaranteeing a 404.
  getLeagueFixtures: (leagueId, date) => monitorApiCall(`GET /fixtures/${date || 'today'}[league=${leagueId}]`, async () => {
    const fixtures = await fetchJSON(`${STATIC_BASE}/fixtures/${date || todayStr()}.json`);
    const data = (fixtures?.data || []).filter((m) => String(m.leagueId) === String(leagueId));
    return { success: true, data, count: data.length, date: date || todayStr() };
  }),

  // ⚠ Backend has NO /players mount — kept for compatibility, returns
  //   graceful empty. Don't build features on this until the route exists.
  getPlayer: (id) => monitorApiCall(`GET /players/${id}`, () => fetchJSON(`${API_BASE}/players/${encodeURIComponent(id)}`)),

  // ── Match detail / per-match data ──

  // ★ Canonical match object (intelligence + live-synced markets).
  //   Used by MatchDetails.jsx; optional date hint speeds local lookup.
  getMatch: (id, date) => monitorApiCall(`GET /match/${id}`, () =>
    fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}`)),

  // Legacy alias — some pages still import getMatchDetails
  getMatchDetails: (id, date) => footballApi.getMatch(id, date),

  // ⚠ Verify these subroutes exist under routes/v1/match.js; if the router
  //   only implements /:id, these 404 gracefully via fetchJSON.
  getLineups: (id) => monitorApiCall(`GET /match/${id}/lineups`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/lineups`)),
  getStatistics: (id) => monitorApiCall(`GET /match/${id}/statistics`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/statistics`)),
  getPredictions: (id) => monitorApiCall(`GET /match/${id}/predictions`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/predictions`)),
  getOdds: (id) => monitorApiCall(`GET /match/${id}/odds`, () => fetchJSON(`${API_BASE}/match/${encodeURIComponent(id)}/odds`)),

  // H2H — fixed backend route
  getH2H: (teamA, teamB) => monitorApiCall('GET /intelligence/h2h', () =>
    fetchJSON(`${API_BASE}/intelligence/h2h/${encodeURIComponent(teamA)}/${encodeURIComponent(teamB)}`)),

  /**
   * ★ Intelligence — ID-first with NUMERIC COERCION.
   * Fixes the production 404: `?home=3339&away=3328` (IDs passed
   * positionally by old call sites are auto-routed to the *Id params).
   * Works with all call patterns:
   *   getMatchIntelligence('Man City', 'Liverpool')     // names
   *   getMatchIntelligence(3339, 3328)                  // positional IDs
   *   getMatchIntelligence(null, null, 3339, 3328)      // explicit IDs
   */
  getMatchIntelligence: (home, away, homeId, awayId) => monitorApiCall('GET /match-intelligence', () => {
    const isId = (v) => v != null && /^\d+$/.test(String(v));
    const params = new URLSearchParams();

    const resolvedHomeId = homeId ?? (isId(home) ? home : null);
    const resolvedAwayId = awayId ?? (isId(away) ? away : null);
    const resolvedHomeName = resolvedHomeId != null ? null : home;
    const resolvedAwayName = resolvedAwayId != null ? null : away;

    if (resolvedHomeId != null) params.set('homeId', resolvedHomeId);
    if (resolvedAwayId != null) params.set('awayId', resolvedAwayId);
    if (resolvedHomeName) params.set('home', resolvedHomeName);
    if (resolvedAwayName) params.set('away', resolvedAwayName);

    return fetchJSON(`${API_BASE}/match-intelligence?${params.toString()}`);
  }),

  // Team intelligence — deep team file by ZK id / provider id / name
  getTeamIntelligence: (team) => monitorApiCall(`GET /intelligence/team`, () =>
    fetchJSON(`${API_BASE}/intelligence/team/${encodeURIComponent(team)}`)),

  getHealth: () => fetchJSON(`${API_BASE}/health`),

  getResults: (params = {}) => monitorApiCall('GET /results', () => {
    const q = new URLSearchParams(params).toString();
    return fetchJSON(`${API_BASE}/results${q ? `?${q}` : ''}`);
  }),

  // ── ML Predictions ──
  getDailyPredictions: (dateStr) => monitorApiCall(`GET /predictions?date=${dateStr}`, () => fetchJSON(`${API_BASE}/predictions?date=${encodeURIComponent(dateStr)}`)),
  getFeatured: (date) => monitorApiCall(`GET /featured?date=${date}`, () => fetchJSON(`${API_BASE}/featured?date=${encodeURIComponent(date)}`)),
  getZokaPicks: (date) => monitorApiCall(`GET /zoka-picks?date=${date}`, () => fetchJSON(`${API_BASE}/zoka-picks?date=${encodeURIComponent(date)}`)),

  // ── Admin ──
  adminTriggerFeatureGen: () => monitorApiCall('POST /admin/ai-lab/generate-features', () => authFetchJSON(`${API_BASE}/admin/ai-lab/generate-features`, { method: 'POST' })),
  adminFeaturedAdd: (date, match) => monitorApiCall('POST /featured/admin/add', () => authFetchJSON(`${API_BASE}/featured/admin/add`, { method: 'POST', body: JSON.stringify({ date, match }) })),
  adminFeaturedRemove: (date, matchId) => monitorApiCall('POST /featured/admin/remove', () => authFetchJSON(`${API_BASE}/featured/admin/remove`, { method: 'POST', body: JSON.stringify({ date, matchId }) })),
  adminFeaturedReplace: (date, matches) => monitorApiCall('POST /featured/admin/replace', () => authFetchJSON(`${API_BASE}/featured/admin/replace`, { method: 'POST', body: JSON.stringify({ date, matches }) })),
  adminZokaSaveDraft: (date, payload) => monitorApiCall('POST /zoka-picks/admin/save-draft', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/save-draft`, { method: 'POST', body: JSON.stringify({ date, ...payload }) })),
  adminZokaPublish: (date, payload) => monitorApiCall('POST /zoka-picks/admin/publish', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/publish`, { method: 'POST', body: JSON.stringify({ date, ...payload }) })),
  adminZokaUnpublish: (date) => monitorApiCall('POST /zoka-picks/admin/unpublish', () => authFetchJSON(`${API_BASE}/zoka-picks/admin/unpublish`, { method: 'POST', body: JSON.stringify({ date }) })),
  adminZokaGetHistory: (days = 7) => monitorApiCall('GET /zoka-picks/history', () => authFetchJSON(`${API_BASE}/zoka-picks/history?days=${encodeURIComponent(days)}`)),
  adminLeaderboardRebuild: (period, dateStr) => monitorApiCall(`POST /admin/leaderboards/rebuild/${period}`, () => authFetchJSON(`${API_BASE}/admin/leaderboards/rebuild/${encodeURIComponent(period)}`, { method: 'POST', body: JSON.stringify({ dateStr }) })),
  adminResolveMatch: (payload) => monitorApiCall('POST /admin/leaderboards/resolve', () => authFetchJSON(`${API_BASE}/admin/leaderboards/resolve`, { method: 'POST', body: JSON.stringify(payload) })),

   // ── Pick Groups (admin studio) ──
  getAdminPickGroups: (date) => monitorApiCall(`GET /admin/prediction-groups/${date}`, () =>
    authFetchJSON(`${API_BASE}/admin/prediction-groups/${encodeURIComponent(date)}`)),
  publishAdminPickGroups: (date, families) => monitorApiCall(`POST /admin/prediction-groups/${date}/publish`, () =>
    authFetchJSON(`${API_BASE}/admin/prediction-groups/${encodeURIComponent(date)}/publish`,
      { method: 'POST', body: JSON.stringify({ families }) })),
  // curated public surface (app)
  getPublishedPickGroups: (date) => monitorApiCall(`GET /predictions/groups/${date}`, () =>
    fetchJSON(`${API_BASE}/predictions/groups/${encodeURIComponent(date)}`)),
  
    // ── Pick Groups: history / engagement ──
  getGroupHistory: (days = 10) => monitorApiCall(`GET /predictions/groups/history`, () =>
    fetchJSON(`${API_BASE}/predictions/groups/history?days=${days}`)),
  getGroupFeedback: (date) => monitorApiCall(`GET /predictions/groups/${date}/feedback`, () =>
    fetchJSON(`${API_BASE}/predictions/groups/${date}/feedback`)),
  postGroupComment: (date, payload) => monitorApiCall(`POST /predictions/groups/${date}/comments`, () =>
    authFetchJSON(`${API_BASE}/predictions/groups/${date}/comments`, { method: 'POST', body: JSON.stringify(payload) })),
  rateGroup: (date, payload) => monitorApiCall(`POST /predictions/groups/${date}/rate`, () =>
    authFetchJSON(`${API_BASE}/predictions/groups/${date}/rate`, { method: 'POST', body: JSON.stringify(payload) })),
  

  // ★ PATH FIX: was /leaderboards/rebuild/backfill-results → 404.
  //   Backend mounts it at /api/v1/admin/leaderboards/backfill-results.
  adminBackfillResults: () => monitorApiCall('POST /admin/leaderboards/backfill-results', () =>
    authFetchJSON(`${API_BASE}/admin/leaderboards/backfill-results`, { method: 'POST' })),

  // ── User predictions ──
  getUserPredictions: (date) => monitorApiCall(`GET /predictions/user?date=${date}`, () => authFetchJSON(`${API_BASE}/predictions/user?date=${encodeURIComponent(date)}`)),
  saveUserPrediction: (payload) => monitorApiCall('POST /predictions/user', () => authFetchJSON(`${API_BASE}/predictions/user`, { method: 'POST', body: JSON.stringify(payload) })),
  getDailyLeaderboard: (date) => monitorApiCall(`GET /leaderboard/daily/${date}`, () => fetchJSON(`${API_BASE}/leaderboard/daily/${encodeURIComponent(date)}`)),
  getLeaderboardSummary: (period) => monitorApiCall(`GET /leaderboard/summary/${period}`, () => fetchJSON(`${API_BASE}/leaderboard/summary/${encodeURIComponent(period)}`)),
};