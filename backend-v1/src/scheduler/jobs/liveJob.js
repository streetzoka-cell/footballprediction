const liveService = require('../../services/LiveMatchService');
const QuotaManager = require('../../services/QuotaManager');
const logger = require('../../utils/logger');
const fixtureService = require('../../services/FixtureService');
const { submitUrl } = require('../../services/IndexNowService');

const createSlug = (str) =>
  String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let prevLiveIds = new Set();

async function execute() {
  try {
    if (!QuotaManager.canPollLive()) return 30 * 60 * 1000;
    const result = await liveService.syncLiveMatches();
    if (result.skipped) return 15 * 60 * 1000;

    QuotaManager.recordLiveCall();
    const liveMatches = result.liveMatches || [];
    const currentLiveIds = new Set(liveMatches.map(m => String(m.id)));

    // ★ PING INDEXNOW: Detect matches that JUST went live
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

    if (prevLiveIds.size > 0) {
      const finishedIds = [...prevLiveIds].filter(id => !currentLiveIds.has(id));
      if (finishedIds.length > 0 && QuotaManager.canFetchFT()) {
        await fixtureService.refreshFinishedMatches();
        QuotaManager.recordFTCall();
      }
    }

    prevLiveIds = currentLiveIds;

    let intervalMs = 30 * 60 * 1000;
    const c = liveMatches.length;
    if (c > 0 && c <= 5) intervalMs = 15 * 60 * 1000;
    else if (c <= 15) intervalMs = 10 * 60 * 1000;
    else if (c <= 30) intervalMs = 8 * 60 * 1000;
    else if (c > 30) intervalMs = 5 * 60 * 1000;

    return intervalMs;
  } catch(err) {
    logger.error(`[LiveJob] Error: ${err.message}`);
    return 30 * 60 * 1000;
  }
}

module.exports = { execute };