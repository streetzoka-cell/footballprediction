
//footballprediction\backend-v1\src\cache\CacheKey.js

const CacheKey = {
  LIVE_MATCHES: 'matches:live',
  FIXTURES_BY_DATE: (date) => `matches:date:${date}`,
  STANDINGS_BY_LEAGUE: (leagueId) => `standings:league:${leagueId}`,
  TOP_SCORERS_BY_LEAGUE: (leagueId) => `scorers:league:${leagueId}`,
  TEAM_BY_ID: (id) => `team:${id}`,
  PLAYER_BY_ID: (id) => `player:${id}`,
  VIDEOS: 'videos:recent',
};

module.exports = CacheKey;
