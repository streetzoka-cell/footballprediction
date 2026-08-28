// backend-v1/src/scheduler/LivePriority.js  (same path as your current file)
const fs = require('fs');
const path = require('path');
const { isPriorityCompetition } = require('../config/leagues');
const { LIVE_POLLING, STATUS } = require('../config/constants');
const logger = require('../utils/logger');

const FIXTURES_DIR = path.join(process.cwd(), 'public_data', 'fixtures');

// Window of time after kickoff to consider a match "potentially live"
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours

const FINISHED_SET = new Set(STATUS.FOOTBALL_FINISHED);

/* Polling runs every 15–60s during live windows — parse today's file ONCE per version. */
let cache = { date: null, mtimeMs: 0, fixtures: [] };

function getTodaysFixtures() {
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(FIXTURES_DIR, `${today}.json`);

  try {
    const stat = fs.statSync(filePath);

    if (cache.date === today && cache.mtimeMs === stat.mtimeMs) {
      return cache.fixtures;
    }

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const matches = Array.isArray(parsed) ? parsed : parsed.data || [];

    cache = { date: today, mtimeMs: stat.mtimeMs, fixtures: matches };
    logger.info(`[LivePriority] Loaded ${matches.length} local fixtures for schedule intelligence.`);
    return matches;
  } catch (e) {
    return cache.date === today ? cache.fixtures : [];
  }
}

/**
 * Determines if ANY priority competition is currently expected to be live.
 * Local decision layer that prevents unnecessary API calls.
 */
function shouldPollLive() {
  const fixtures = getTodaysFixtures();
  const now = Date.now();

  for (const match of fixtures) {
    if (!isPriorityCompetition(match.leagueId)) continue;

    // Already confirmed finished → nothing to poll for this match
    if (FINISHED_SET.has(match.status)) continue;

    const kickoffTime = match.utcDate || match.date || match.kickoff;
    const timestamp = kickoffTime ? new Date(kickoffTime).getTime() : 0;

    if (timestamp > 0) {
      const elapsedMs = now - timestamp;
      // Started > 0 mins ago but < 2.5 hours ago → might be live
      if (elapsedMs > 0 && elapsedMs < LIVE_WINDOW_MS) {
        return true;
      }
    }
  }

  return false;
}

function getRecommendedInterval(priorityLiveCount, nearFinishCount) {
  if (priorityLiveCount === 0) return LIVE_POLLING.IDLE_INTERVAL_MS;
  if (nearFinishCount > 0) return LIVE_POLLING.NEAR_FINISH_INTERVAL_MS;

  if (priorityLiveCount >= 16) return LIVE_POLLING.MASSIVE_LIVE_INTERVAL_MS;
  if (priorityLiveCount >= 6) return LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;
  if (priorityLiveCount >= 1) return LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;

  return LIVE_POLLING.LOW_LIVE_INTERVAL_MS;
}

module.exports = {
  shouldPollLive,
  getRecommendedInterval,
  isPriorityCompetition,
};