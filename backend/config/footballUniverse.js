// backend/config/footballUniverse.js
//
// ★ FIX: The previous version keyed LEAGUE_UNIVERSE by classic API-Football
// numeric IDs (39, 140, 135...). Your fixtures now come from Goal API, whose
// league IDs look like "cmr77dvkr005nrx06lp7rvp49". Those numeric keys never
// matched anything, so every match silently fell through to the TIER_3
// default — FEATURED/IMPORTANT/HIDDEN categorization was running on
// constants, not real data.
//
// Fix: build the map directly from your own LEAGUES config in constants.js,
// which already carries a `tier` field per league and uses the correct
// Goal API IDs. One source of truth — no separate ID list to keep in sync.
const { LEAGUES } = require('./constants');

const LEAGUE_TIERS = Object.freeze({
  TIER_1: { score: 100, limit: 'unlimited' }, // World Cup, Champions League, EPL, La Liga...
  TIER_2: { score: 75, limit: 'unlimited' },  // Championship, Serie B, 2. Bundesliga...
  TIER_3: { score: 50, limit: 'unlimited' },  // Everything else tracked but not top/second tier
  TIER_4: { score: 15, limit: 'hidden' },     // Reserved for amateur/youth if you add them later
});

const LEAGUE_UNIVERSE = Object.freeze(
  Object.fromEntries(
    LEAGUES.map((l) => [l.id, `TIER_${l.tier || 3}`])
  )
);

module.exports = { LEAGUE_TIERS, LEAGUE_UNIVERSE };