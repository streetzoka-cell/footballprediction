// backend-v1/src/scheduler/jobs/liveJob.js
const liveService = require('../../services/LiveMatchService');
const QuotaManager = require('../../services/QuotaManager');
const fixtureService = require('../../services/FixtureService');
const { submitUrl } = require('../../services/IndexNowService');
const logger = require('../../utils/logger');

const createSlug = (str) =>
  String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let prevLiveIds = new Set();

async function execute() {
  try {
    if (!QuotaManager.canPollLive()) return 10 * 60 * 1000; // Wait 10 mins if quota depleted
    
    const result = await liveService.syncLiveMatches();
    if (result.skipped) return 10 * 60 * 1000;

    const liveMatches = result.liveMatches || [];
    const currentLiveIds = new Set(liveMatches.map(m => String(m.id)));

    // Ping IndexNow for matches that JUST went live
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

    // FT Reconciliation: If a match drops off the live feed, fetch final results
    if (prevLiveIds.size > 0) {
      const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
      if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
        await fixtureService.refreshFinishedMatches();
        QuotaManager.recordFTCall();
      }
    }

    prevLiveIds = currentLiveIds;

    // ★ YOUR EXACT LOGIC: 5 mins for 10+ matches, 10 mins for below 10
    let intervalMs = 10 * 60 * 1000; // 10 minutes default
    if (liveMatches.length >= 10) {
      intervalMs = 5 * 60 * 1000; // 5 minutes if 10+ live
    }

    logger.info(`[LiveJob] ${liveMatches.length} live matches. Next poll in ${intervalMs / 60000} mins.`);
    return intervalMs;
    
  } catch (err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return 10 * 60 * 1000; // Fallback to 10 mins on error
  }
}

module.exports = { execute };