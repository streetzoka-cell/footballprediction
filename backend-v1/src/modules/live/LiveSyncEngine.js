// backend-v1/src/modules/live/LiveSyncEngine.js

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const logger = require('../../utils/logger');
const teamMatcher = require('../../utils/teamMatcher');
const { writeFootballSnapshot } = require('../../services/SnapshotService');
const { getDateOffset, STATUS } = require('../../config/constants');

const PUBLIC_DATA_DIR = path.join(process.cwd(), 'public_data');
const FIXTURES_DIR = path.join(PUBLIC_DATA_DIR, 'fixtures');
const RESULTS_DIR = path.join(PUBLIC_DATA_DIR, 'results');

const THREE_AND_HALF_HOURS_MS = 3.5 * 60 * 60 * 1000;

let lastLiveCount = null;
let consecutiveEmptyLivePolls = 0;

function isFinishedStatus(status) {
  const normalized = String(status || '').toUpperCase();

  return (
    STATUS.FOOTBALL_FINISHED.includes(normalized) ||
    normalized === 'FINISHED'
  );
}

function isLiveStatus(status) {
  const normalized = String(status || '').toUpperCase();

  return (
    STATUS.FOOTBALL_LIVE.includes(normalized) ||
    normalized === 'LIVE' ||
    normalized === 'IN_PLAY'
  );
}

function getElapsedMs(fixture) {
  if (!fixture) return 0;

  if (fixture.timestamp) {
    return Date.now() - Number(fixture.timestamp) * 1000;
  }

  const dateValue = fixture.utcDate || fixture.date;

  if (dateValue) {
    const parsed = Date.parse(dateValue);

    if (!Number.isNaN(parsed)) {
      return Date.now() - parsed;
    }
  }

  return 0;
}

function isNearFinish(match) {
  if (!match) return false;

  if (isFinishedStatus(match.status)) return false;

  const minute =
    match.display?.minute ||
    match.minute ||
    0;

  const elapsedMinutes = match.timestamp
    ? (Date.now() - Number(match.timestamp) * 1000) / 60000
    : 0;

  return minute >= 80 || elapsedMinutes >= 80;
}

function isHighPriorityLive(match) {
  if (!match) return false;

  return (
    match.category === 'FEATURED' ||
    match.category === 'IMPORTANT' ||
    Number(match.matchScore || 0) >= 50 ||
    isNearFinish(match)
  );
}

async function readJsonPayload(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return {
        data: parsed,
        raw: parsed,
      };
    }

    if (parsed && Array.isArray(parsed.data)) {
      return {
        data: parsed.data,
        raw: parsed,
      };
    }

    return {
      data: [],
      raw: null,
    };
  } catch {
    return {
      data: [],
      raw: null,
    };
  }
}

function applyLiveToFixture(fixture, liveMatch) {
  const homeScore =
    liveMatch.homeScore ??
    liveMatch.display?.score?.home ??
    fixture.homeScore ??
    null;

  const awayScore =
    liveMatch.awayScore ??
    liveMatch.display?.score?.away ??
    fixture.awayScore ??
    null;

  const status =
    liveMatch.status ||
    liveMatch.display?.status ||
    fixture.status ||
    'LIVE';

  const minute =
    liveMatch.display?.minute ||
    liveMatch.minute ||
    fixture.minute ||
    0;

  fixture.homeScore = homeScore;
  fixture.awayScore = awayScore;
  fixture.status = status;
  fixture.minute = minute;
  fixture.isLive = !isFinishedStatus(status);

  if (fixture.display) {
    fixture.display.isLive = !isFinishedStatus(status);
    fixture.display.isFinished = isFinishedStatus(status);
    fixture.display.status = status;
    fixture.display.minute = minute;

    if (fixture.display.score) {
      fixture.display.score.home = homeScore;
      fixture.display.score.away = awayScore;

      fixture.display.score.display =
        homeScore !== null && awayScore !== null
          ? `${homeScore}-${awayScore}`
          : 'VS';
    }
  }

  return fixture;
}

function forceFinishFixture(fixture) {
  fixture.homeScore = fixture.homeScore ?? 0;
  fixture.awayScore = fixture.awayScore ?? 0;
  fixture.status = 'FT';
  fixture.isLive = false;
  fixture.isFinished = true;

  if (fixture.display) {
    fixture.display.isLive = false;
    fixture.display.isFinished = true;
    fixture.display.status = 'FT';
    fixture.display.minute = 90;

    if (fixture.display.score) {
      fixture.display.score.home = fixture.homeScore;
      fixture.display.score.away = fixture.awayScore;
      fixture.display.score.display = `${fixture.homeScore}-${fixture.awayScore}`;
    }
  }

  return fixture;
}

function resultKey(match) {
  if (match?.id) {
    return String(match.id);
  }

  const key = teamMatcher.makeMatchKey(
    match?.homeTeamName || match?.homeTeam || match?.homeName,
    match?.awayTeamName || match?.awayTeam || match?.awayName
  );

  if (key) return key;

  return JSON.stringify(match || {}).slice(0, 80);
}

function mergeResults(existingResults, newlyFinished) {
  const map = new Map();

  for (const match of existingResults || []) {
    map.set(resultKey(match), match);
  }

  for (const match of newlyFinished || []) {
    const key = resultKey(match);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, match);
      continue;
    }

    // Prefer a finished match with real scores
    if (!isFinishedStatus(existing.status) && isFinishedStatus(match.status)) {
      map.set(key, match);
      continue;
    }

    if (
      existing.homeScore == null &&
      existing.awayScore == null &&
      match.homeScore != null &&
      match.awayScore != null
    ) {
      map.set(key, match);
    }
  }

  return Array.from(map.values());
}

function decidePublishLive(liveMatches) {
  if (liveMatches.length > 0) {
    consecutiveEmptyLivePolls = 0;
    lastLiveCount = liveMatches.length;
    return true;
  }

  if (lastLiveCount === null || lastLiveCount === 0) {
    lastLiveCount = 0;
    return true;
  }

  consecutiveEmptyLivePolls += 1;

  // Require two consecutive empty polls before clearing live.json.
  // This protects against one empty provider response.
  if (consecutiveEmptyLivePolls >= 2) {
    lastLiveCount = 0;
    return true;
  }

  return false;
}

/**
 * Central live synchronization engine.
 *
 * Responsibilities:
 * - merge live matches into today's fixtures
 * - move finished matches into results
 * - publish live.json safely
 * - avoid overwriting good data with empty data
 */
async function syncLiveToDate(dateStr, liveMatches, options = {}) {
  const normalizedDate = String(dateStr || getDateOffset(0)).trim();
  const safeLiveMatches = Array.isArray(liveMatches) ? liveMatches : [];

  const fixturesPath = path.join(FIXTURES_DIR, `${normalizedDate}.json`);
  const resultsPath = path.join(RESULTS_DIR, `${normalizedDate}.json`);

  const fixturesPayload = await readJsonPayload(fixturesPath);
  const resultsPayload = await readJsonPayload(resultsPath);

  const existingFixtures = fixturesPayload.data || [];
  const existingResults = resultsPayload.data || [];

  const liveMaps = teamMatcher.buildLiveMaps(safeLiveMatches);

  const stillFixtures = [];
  const newlyFinished = [];

  let updatedCount = 0;
  let fixturesChanged = false;

  for (const fixture of existingFixtures) {
    const liveMatch = teamMatcher.findLiveMatch(fixture, liveMaps);

    const elapsedMs = getElapsedMs(fixture);
    const isExpired = elapsedMs > THREE_AND_HALF_HOURS_MS;

    if (liveMatch) {
      updatedCount += 1;
      fixturesChanged = true;

      applyLiveToFixture(fixture, liveMatch);

      const finished =
        isFinishedStatus(fixture.status) ||
        fixture.display?.isFinished === true ||
        isExpired;

      if (finished) {
        if (fixture.homeScore != null && fixture.awayScore != null) {
          forceFinishFixture(fixture);
          newlyFinished.push(fixture);
        } else {
          stillFixtures.push(fixture);
        }
      } else {
        stillFixtures.push(fixture);
      }

      continue;
    }

    const alreadyFinished =
      isFinishedStatus(fixture.status) ||
      fixture.display?.isFinished === true;

    const wasLive =
      fixture.isLive === true ||
      isLiveStatus(fixture.status);

    if (alreadyFinished || wasLive || isExpired) {
      if (fixture.homeScore != null && fixture.awayScore != null) {
        forceFinishFixture(fixture);
        newlyFinished.push(fixture);
        fixturesChanged = true;
      } else {
        stillFixtures.push(fixture);
      }
    } else {
      stillFixtures.push(fixture);
    }
  }

  const liveToPublish = safeLiveMatches;
  const publishLive = decidePublishLive(liveToPublish);

  let mergedResults = existingResults;

  if (newlyFinished.length > 0) {
    mergedResults = mergeResults(existingResults, newlyFinished);
  }

  const updates = {};

  let shouldPublishFixtures = false;

  if (fixturesChanged) {
    if (stillFixtures.length > 0) {
      shouldPublishFixtures = true;
    } else if (existingFixtures.length > 0 && newlyFinished.length > 0) {
      // All remaining fixtures moved to results.
      shouldPublishFixtures = true;
    } else {
      // Protect against accidental empty overwrite.
      shouldPublishFixtures = false;
    }
  }

  if (shouldPublishFixtures) {
    updates.matches = stillFixtures;
  }

  if (publishLive) {
    updates.live = liveToPublish;
  }

  if (newlyFinished.length > 0) {
    updates.finished = mergedResults;
  }

  if (Object.keys(updates).length > 0) {
    await writeFootballSnapshot(normalizedDate, updates);
  }

  const nearFinishCount = safeLiveMatches.filter(isNearFinish).length;
  const highPriorityLiveCount = safeLiveMatches.filter(isHighPriorityLive).length;

  logger.info(
    `[LiveSyncEngine] date=${normalizedDate} live=${safeLiveMatches.length} ` +
    `updated=${updatedCount} finished=${newlyFinished.length} ` +
    `nearFinish=${nearFinishCount} highPriority=${highPriorityLiveCount} ` +
    `source=${options.source || 'unknown'}`
  );

  return {
    count: safeLiveMatches.length,
    skipped: false,
    liveMatches: safeLiveMatches,
    updatedCount,
    finishedCount: newlyFinished.length,
    nearFinishCount,
    highPriorityLiveCount,
    published: Object.keys(updates),
  };
}

module.exports = {
  syncLiveToDate,
  isNearFinish,
  isHighPriorityLive,
};