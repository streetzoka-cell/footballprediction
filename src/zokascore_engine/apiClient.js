// src/zokascore_engine/apiClient.js

// In development, use your local cloudflare tunnel. 
// In production (Vercel), this will be your permanent api.zokascore.xyz URL.
const ENGINE_BASE_URL = "https://chorus-oct-rolled-encourage.trycloudflare.com/api/v1/data";
const API_BASE_URL = "https://chorus-oct-rolled-encourage.trycloudflare.com/api/v1";

/**
 * Core fetch utility with timeout and graceful 404 handling
 */
async function fetchJSON(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 15000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: { Accept: "application/json", ...options.headers },
      signal: controller.signal,
    });

    if (!res.ok) {
      // Gracefully handle 404s for missing JSON files (e.g., future dates)
      if (res.status === 404) return { data: [] };
      
      const error = new Error(`API ${res.status}: ${res.statusText}`);
      error.status = res.status;
      throw error;
    }

    return await res.json();
  } catch (err) {
    console.error(`[ZokaEngine] Fetch failed for ${url}:`, err.message);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const zokaApi = {
  // 0-Read Static Endpoints (Fast)
  getLive: () => fetchJSON(`${ENGINE_BASE_URL}/live.json`),
  getFixturesByDate: (dateStr) => fetchJSON(`${ENGINE_BASE_URL}/fixtures/${dateStr}.json`),
  getResultsByDate: (dateStr) => fetchJSON(`${ENGINE_BASE_URL}/results/${dateStr}.json`),
  getStandings: () => fetchJSON(`${ENGINE_BASE_URL}/standings.json`),
  getVideos: () => fetchJSON(`${ENGINE_BASE_URL}/videos.json`),

  // Dynamic REST Endpoints (Fallbacks for specific pages)
  getTeam: (teamId) => fetchJSON(`${API_BASE_URL}/teams/${teamId}`),
  getPlayer: (playerId) => fetchJSON(`${API_BASE_URL}/players/${playerId}`),
  getMatchDetails: (matchId) => fetchJSON(`${API_BASE_URL}/match/${matchId}`),
  getLineups: (matchId) => fetchJSON(`${API_BASE_URL}/match/${matchId}/lineups`),
  getStatistics: (matchId) => fetchJSON(`${API_BASE_URL}/match/${matchId}/statistics`),
};