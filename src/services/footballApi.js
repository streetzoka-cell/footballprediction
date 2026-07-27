function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || 15000; // ★ FIX: Increased to 15s for Vercel cold starts

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
  // NEW: Fetch categorized home data (Live, Featured, Upcoming)
  getHomeData: () => request(`/matches?view=home`),
  
  getFixtures: (dateStr, sport = 'football') => request(`/matches?date=${dateStr}&sport=${sport}`),
  getLive: (sport = 'football') => request(`/matches?status=live&sport=${sport}`),
  getFinished: (sport = 'football') => request(`/matches?status=finished&sport=${sport}`),
  getCompetitions: () => request(`/competitions`),
  getStandings: (code) => request(`/standings?code=${code}`),
  getTeams: (code) => request(`/teams?code=${code}`),
  getHealth: () => request(`/health`),
};