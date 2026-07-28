// src/services/footballApi.js
import { handleApiError } from '../utils/errorHandler';
import { monitorApiCall } from '../utils/performanceMonitor';

function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 15000; // 15s for Vercel cold starts

  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(`/api/v1${path}`, {
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
  getHomeData: () => monitorApiCall('GET /matches?view=home', () => request(`/matches?view=home`)),
  getFixtures: (dateStr, sport = 'football') => monitorApiCall(`GET /matches?date=${dateStr}`, () => request(`/matches?date=${dateStr}&sport=${sport}`)),
  getLive: (sport = 'football') => monitorApiCall('GET /matches?status=live', () => request(`/matches?status=live&sport=${sport}`)),
  getFinished: (sport = 'football') => monitorApiCall('GET /matches?status=finished', () => request(`/matches?status=finished&sport=${sport}`)),
  getCompetitions: () => monitorApiCall('GET /competitions', () => request(`/competitions`)),
  getStandings: (code) => monitorApiCall(`GET /standings?code=${code}`, () => request(`/standings?code=${code}`)),
  getTeams: (code) => monitorApiCall(`GET /teams?code=${code}`, () => request(`/teams?code=${code}`)),
  
  getMatchDetails: (id) => monitorApiCall(`GET /matches/${id}`, () => request(`/matches/${id}`)),
  getHealth: () => request(`/health`),
};