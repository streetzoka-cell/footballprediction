const liveService = require('../../services/LiveMatchService');
const QuotaManager = require('../../services/QuotaManager');
const LivePriorityService = require('../../services/LivePriorityService');
const fixtureService = require('../../services/FixtureService');
const { submitUrl } = require('../../services/IndexNowService');
const { LIVE_POLLING } = require('../../config/constants');
const logger = require('../../utils/logger');

const createSlug = (str) =>
  String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let prevLiveIds = new Set();

async function execute() {
  try {
    // 1. Check global quota first
    if (!QuotaManager.canPollLive()) {
      return LIVE_POLLING.IDLE_INTERVAL_MS; // Wait 5 mins if quota depleted
    }

    // 2. ★ NEW: Check local schedule intelligence before making any API call
    if (!LivePriorityService.shouldPollLive()) {
      logger.info('[LiveJob] No priority competitions expected live. Skipping API poll.');
      return LIVE_POLLING.IDLE_INTERVAL_MS; // Wait 5 mins, save API quota
    }

    // 3. Make the live API call (ProviderManager will get all global live data)
    const result = await liveService.syncLiveMatches();
    
    if (result.skipped) {
      return LIVE_POLLING.IDLE_INTERVAL_MS;
    }

    // ★ FIX: LiveMatchService already recorded the call. Do NOT double-count here.
    const liveMatches = result.liveMatches || [];
    
    // 4. Extract Priority matches to drive the interval calculation
    const priorityLiveMatches = liveMatches.filter(m => LivePriorityService.isPriorityCompetition(m.leagueId));
    const nearFinishCount = priorityLiveMatches.filter(m => m.display?.minute >= 80).length;

    // 5. Calculate smart interval based on priority activity
    const intervalMs = LivePriorityService.getRecommendedInterval(
      priorityLiveMatches.length,
      nearFinishCount
    );

    // 6. Ping IndexNow for matches that JUST went live
    const currentLiveIds = new Set(liveMatches.map(m => String(m.id)));
    if (prevLiveIds.size > 0 || liveMatches.length > 0) {
      const startedMatches = liveMatches.filter(m => !prevLiveIds.has(String(m.id)));
      for (const match of startedMatches) {
        try {
          const homeSlug = createSlug(match.homeName || match.homeTeam?.name);
          const awaySlug = createSlug(match.awayName || match.awayTeam?.name);
          const leagueSlug = createSlug(match.leagueName || match.league?.name);
          
          submitUrl(`/match/${match.id}/${homeSlug}-vs-${awaySlug}`);
          if (match.homeTeam?.id) submitUrl(`/team/${match.homeTeam.id}/${homeSlug}`);
          if (match.awayTeam?.id) submitUrl(`/team/${match.awayTeam.id}/${awaySlug}`);
          if (match.league?.id) submitUrl(`/league/${match.league.id}/${leagueSlug}`);
        } catch (e) { /* Fail silently */ }
      }
    }

    // 7. FT Reconciliation Logic
    if (prevLiveIds.size > 0) {
      const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
      
      if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
        // Trigger FT collection for matches that dropped off the live feed
        await fixtureService.refreshFinishedMatches();
        QuotaManager.recordFTCall();
      }
    }

    prevLiveIds = currentLiveIds;

    return intervalMs;
    
  } catch (err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return LIVE_POLLING.IDLE_INTERVAL_MS; // Fallback to idle on error
  }
}

module.exports = { execute };