const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initializeFirebase } = require('./config/firebase');
const { isBasketballConfigured } = require('./config/basketballApi');
const providerManager = require('./providers/providerManager');

// Repositories
const FixturesRepository = require('./repositories/fixturesRepository');
const TeamRepository = require('./repositories/teamRepository');
const StandingRepository = require('./repositories/standingRepository');
const LeagueRepository = require('./repositories/leagueRepository');
const BasketballFixturesRepository = require('./repositories/basketballFixturesRepository');

// Processors
const FinishedFixturesProcessor = require('./services/finishedFixtures');
const TeamsProcessor = require('./services/teams');
const BasketballFinishedFixturesProcessor = require('./services/basketballFinishedFixtures');

// Services
const DailyFixturesService = require('./services/dailyFixtures');
const LiveFixturesService = require('./services/liveFixtures');
const StandingsService = require('./services/standings');
const LeaguesService = require('./services/leagues');
const BasketballDailyFixturesService = require('./services/basketballDailyFixtures');
const BasketballLiveFixturesService = require('./services/basketballLiveFixtures');
// ★ FIX: Corrected the path for TeamsService
const TeamsService = require('./services/teamsService');

async function run() {
  const job = process.argv[2] || 'live';
  
  console.log(`[CloudSync] Starting job: ${job}`);

  initializeFirebase();

  const fixturesRepo = new FixturesRepository();
  const teamRepo = new TeamRepository();
  const standingRepo = new StandingRepository();
  const leagueRepo = new LeagueRepository();
  const basketballFixturesRepo = new BasketballFixturesRepository();

  const ftProcessor = new FinishedFixturesProcessor(fixturesRepo);
  const teamsProcessor = new TeamsProcessor(teamRepo);
  const basketballFtProcessor = new BasketballFinishedFixturesProcessor(basketballFixturesRepo);

  const services = {
    footballDailyFixtures: new DailyFixturesService(fixturesRepo, teamsProcessor, providerManager),
    footballLiveFixtures: new LiveFixturesService(fixturesRepo, ftProcessor, providerManager),
    footballStandings: new StandingsService(standingRepo),
    footballLeagues: new LeaguesService(leagueRepo),
    // ★ NEW: Add Teams Service
    footballTeams: new TeamsService(teamRepo),
  };

  if (isBasketballConfigured()) {
    services.basketballDailyFixtures = new BasketballDailyFixturesService(basketballFixturesRepo);
    services.basketballLiveFixtures = new BasketballLiveFixturesService(basketballFixturesRepo, basketballFtProcessor);
  }

  try {
    if (job === 'live') {
      console.log('[CloudSync] Running Live Fixtures Sync...');
      await services.footballLiveFixtures.run();
      if (isBasketballConfigured()) await services.basketballLiveFixtures.run();
    } else if (job === 'daily') {
      console.log('[CloudSync] Running Daily Fixtures Sync...');
      await services.footballDailyFixtures.run();
      if (isBasketballConfigured()) await services.basketballDailyFixtures.run();
    } else if (job === 'standings') {
      console.log('[CloudSync] Running Standings & Leagues Sync...');
      await services.footballStandings.run();
      await services.footballLeagues.run();
    } else if (job === 'teams') {
      // ★ NEW: Handle teams job
      console.log('[CloudSync] Running Teams Sync...');
      await services.footballTeams.run();
    } else {
      console.error(`[CloudSync] Unknown job: ${job}`);
      process.exit(1);
    }
    console.log(`[CloudSync] Job "${job}" completed successfully.`);
  } catch (err) {
    console.error(`[CloudSync] Job "${job}" failed:`, err.message);
    process.exit(1);
  }

  process.exit(0);
}

run();