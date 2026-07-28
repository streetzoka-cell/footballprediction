// src/services/footballApi.js
import { handleApiError } from '../utils/errorHandler';
import { monitorApiCall } from '../utils/performanceMonitor';

function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 15000; // 15s for Vercel cold starts

  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(`/api${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...options.headers,
    },
    signal: controller.signal,
    body: options.body || null,
  })
    .then((res) => {
      clearTimeout(timer);
      if (!res.ok) {
        const error = new Error(`API ${res.status}: ${res.statusText}`);
        error.status = res.status;
        throw error;
      }
      return res.json();
    })
    .catch((err) => {
      clearTimeout(timer);
      const parsed = handleApiError(err);
      err.type = parsed.type;
      err.friendlyMessage = parsed.message;
      throw err;
    });
}

export const footballApi = {
  // Home view (aggregated live, featured, upcoming)
  getHomeData: () => monitorApiCall('GET /v1/matches?view=home', () => request(`/v1/matches?view=home`)),
  
  // Fixtures by date
  getFixtures: (dateStr, sport = 'football') => monitorApiCall(`GET /fixtures?date=${dateStr}`, () => request(`/fixtures?date=${dateStr}`)),
  
  // Live matches (aggregated)
  getLive: (sport = 'football') => monitorApiCall('GET /fixtures/live', () => request(`/fixtures/live`)),
  
  // Finished results by date
  getFinished: (sport = 'football', dateStr) => monitorApiCall(`GET /results?date=${dateStr}`, () => request(`/results?date=${dateStr}`)),
  
  // Standings
  getStandings: (leagueId) => monitorApiCall(`GET /standings?league=${leagueId}`, () => request(`/standings?league=${leagueId}`)),
  
  // Top Scorers
  getTopScorers: (leagueId) => monitorApiCall(`GET /top-scorers?league=${leagueId}`, () => request(`/top-scorers?league=${leagueId}`)),
  
  // Match Details
  getMatchDetails: (id) => monitorApiCall(`GET /fixtures/${id}`, () => request(`/fixtures/${id}`)),
  getLineups: (id) => monitorApiCall(`GET /fixtures/${id}/lineups`, () => request(`/fixtures/${id}/lineups`)),
  getStatistics: (id) => monitorApiCall(`GET /fixtures/${id}/statistics`, () => request(`/fixtures/${id}/statistics`)),
  getPredictions: (id) => monitorApiCall(`GET /fixtures/${id}/predictions`, () => request(`/fixtures/${id}/predictions`)),
  getOdds: (id) => monitorApiCall(`GET /fixtures/${id}/odds`, () => request(`/fixtures/${id}/odds`)),
  getH2H: (team1Id, team2Id) => monitorApiCall(`GET /h2h?team1=${team1Id}&team2=${team2Id}`, () => request(`/h2h?team1=${team1Id}&team2=${team2Id}`)),
  
  // Teams & Players
  getTeams: (leagueId) => monitorApiCall(`GET /teams?league=${leagueId}`, () => request(`/teams?league=${leagueId}`)),
  getTeam: (id) => monitorApiCall(`GET /teams/${id}`, () => request(`/teams/${id}`)),
  getPlayer: (id) => monitorApiCall(`GET /players/${id}`, () => request(`/players/${id}`)),
  
  // Videos
  getVideos: () => monitorApiCall('GET /videos', () => request(`/videos`)),
  
  // Health
  getHealth: () => request(`/health`),
};