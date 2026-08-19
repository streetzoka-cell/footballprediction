const fs = require('fs');
const path = require('path');
const { isPriorityCompetition } = require('../config/leagues');
const { LIVE_POLLING } = require('../config/constants');
const logger = require('../utils/logger');

const FIXTURES_DIR = path.join(process.cwd(), 'public_data', 'fixtures');

// Window of time before and after kickoff to consider a match "potentially live"
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000; // 2.5 hours

function getTodaysFixtures() {
  const today = new Date().toISOString().split('T')[0];
  const filePath = path.join(FIXTURES_DIR, `${today}.json`);
  
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      const matches = Array.isArray(parsed) ? parsed : (parsed.data || []);
      logger.info(`[LivePriority] Loaded ${matches.length} local fixtures for schedule intelligence.`);
      return matches;
    }
  } catch (e) {
    logger.warn(`[LivePriority] Could not read today's fixtures for intelligence.`);
  }
  
  return [];
}

/**
 * Determines if ANY Priority Competition is currently expected to be live.
 * This is the local decision layer that prevents unnecessary API calls.
 */
function shouldPollLive() {
  const fixtures = getTodaysFixtures();
  const now = Date.now();

  for (const match of fixtures) {
    if (isPriorityCompetition(match.leagueId)) {
      const kickoffTime = match.utcDate || match.date;
      const timestamp = kickoffTime ? new Date(kickoffTime).getTime() : 0;
      
      if (timestamp > 0) {
        const elapsedMs = now - timestamp;
        // If the match started > 0 mins ago but < 2.5 hours ago, it might be live
        if (elapsedMs > 0 && elapsedMs < LIVE_WINDOW_MS) {
          return true; // Found a priority match in its live window
        }
      }
    }
  }

  return false; // No priority match is expected to be live right now
}

/**
 * Calculates the smart polling interval based on priority live activity.
 */
function getRecommendedInterval(priorityLiveCount, nearFinishCount) {
  // If no priority matches are live, idle for 5 minutes
  if (priorityLiveCount === 0) {
    return LIVE_POLLING.IDLE_INTERVAL_MS;
  }

  // If a match is near finish (80+ min), poll aggressively
  if (nearFinishCount > 0) {
    return LIVE_POLLING.NEAR_FINISH_INTERVAL_MS; // 15 seconds
  }

  // Otherwise, scale based on volume
  if (priorityLiveCount >= 16) return LIVE_POLLING.MASSIVE_LIVE_INTERVAL_MS; // 20 sec
  if (priorityLiveCount >= 6) return LIVE_POLLING.HIGH_LIVE_INTERVAL_MS;    // 30 sec
  if (priorityLiveCount >= 1) return LIVE_POLLING.MEDIUM_LIVE_INTERVAL_MS;  // 45 sec
  
  return LIVE_POLLING.LOW_LIVE_INTERVAL_MS; // 60 sec
}

module.exports = {
  shouldPollLive,
  getRecommendedInterval,
  isPriorityCompetition,
};