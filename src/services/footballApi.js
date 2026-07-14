const BASE_URL =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_FOOTBALL_API_URL) ||
  "http://localhost:3001/api";

function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 10000;

  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(BASE_URL + path, {
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
        throw new Error(`API ${res.status}: ${res.statusText}`);
      }
      return res.json();
    })
    .catch((err) => {
      clearTimeout(timer);
      throw err;
    });
}

export const footballApi = {
  getFixtures: () => request("/fixtures"),
  getLive: () => request("/live"),
  getToday: () => request("/today"),
  getFinished: () => request("/finished"),
  getCompetitions: () => request("/competitions"),
  getStandings: (code) => request(`/standings/${code}`),
  getTeams: (code) => request(`/teams/${code}`),
  getHealth: () => request("/health"),
};