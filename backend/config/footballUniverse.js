// backend/config/footballUniverse.js
const LEAGUE_TIERS = Object.freeze({
  TIER_1: { score: 100, limit: 'unlimited' }, // Champions League, EPL, World Cup
  TIER_2: { score: 75, limit: 'unlimited' },  // Eredivisie, MLS, Saudi Pro League
  TIER_3: { score: 50, limit: 'unlimited' },  // Lower European leagues, Top African/Asian
  TIER_4: { score: 15, limit: 'hidden' }      // Amateur, Youth, Deep Lower leagues
});

// Map API-Football league IDs to Tiers
const LEAGUE_UNIVERSE = Object.freeze({
  1: 'TIER_1',    // World Cup
  2: 'TIER_1',    // Champions League
  3: 'TIER_1',    // Europa League
  4: 'TIER_1',    // Euro Championship
  39: 'TIER_1',   // Premier League
  140: 'TIER_1',  // La Liga
  135: 'TIER_1',  // Serie A
  78: 'TIER_1',   // Bundesliga
  61: 'TIER_1',   // Ligue 1
  13: 'TIER_1',   // Copa Libertadores
  71: 'TIER_1',   // Brazil Serie A
  128: 'TIER_1',  // Argentina Primera División
  253: 'TIER_1',  // MLS
  262: 'TIER_1',  // Liga MX
  307: 'TIER_1',  // Saudi Pro League
  
  40: 'TIER_2',   // Championship
  136: 'TIER_2',  // Serie B
  79: 'TIER_2',   // 2. Bundesliga
  62: 'TIER_2',   // Ligue 2
  141: 'TIER_2',  // Segunda División
  94: 'TIER_2',   // Primeira Liga
  88: 'TIER_2',   // Eredivisie
  203: 'TIER_2',  // Süper Lig
  10: 'TIER_2',   // Club Friendlies (High tier friendlies)
  
  235: 'TIER_3',  // Premiership (Scotland)
  113: 'TIER_3',  // Allsvenskan
  103: 'TIER_3',  // Eliteserien
  218: 'TIER_3',  // Bundesliga (Austria)
  207: 'TIER_3',  // Super League (Switzerland)
});

module.exports = { LEAGUE_TIERS, LEAGUE_UNIVERSE };