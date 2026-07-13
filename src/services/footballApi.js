var BASE_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_FOOTBALL_API_URL) || "http://localhost:3001/api";

function request(path, options) {
  options = options || {};
  var controller = new AbortController();
  var timeout = options.timeout || 10000;
  var timer = setTimeout(function() { controller.abort(); }, timeout);
  return fetch(BASE_URL + path, {
    method: options.method || "GET",
    headers: Object.assign({ "Accept": "application/json" }, options.headers || {}),
    signal: controller.signal,
    body: options.body || null,
  })
  .then(function(res) {
    clearTimeout(timer);
    if (!res.ok) throw new Error("API " + res.status + ": " + res.statusText);
    return res.json();
  })
  .catch(function(err) {
    clearTimeout(timer);
    throw err;
  });
}

export var footballApi = {
  getFixtures: function() { return request("/fixtures"); },
  getLive: function() { return request("/live"); },
  getToday: function() { return request("/today"); },
  getFinished: function() { return request("/finished"); },
  getCompetitions: function() { return request("/competitions"); },
  getStandings: function(code) { return request("/standings/" + code); },
  getTeams: function(code) { return request("/teams/" + code); },
  getHealth: function() { return request("/health"); },
};
