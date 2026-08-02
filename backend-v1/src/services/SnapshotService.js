// backend-v1/src/services/SnapshotService.js

const localSnapshotRepo = require('../repositories/LocalSnapshotRepository');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

// ─── SMART QUALITY FILTER ───

const EXCLUDED_KEYWORDS = [
  'friendly',
  'friendlies',
  'youth',
  'u19',
  'u21',
  'u17',
  'u23',
  'women',
  ' w$',
  'reserves',
  ' b$',
  ' ii$',
  'academy',
  'junior',
];

const MAJOR_LEAGUE_IDS = [
  'cmr77dwy000onrx06oqbv0dbl', // Division Profesional (Paraguay)
  'cmr77dvv600aprx06o7y7lnfu', // Primera A (Colombia)
  'cmr77dwb200hvrx06199fst9o', // Liga Pro (Ecuador)
  'cmr77dvtc0093rx0667jirsnv', // Liga Profesional Argentina
  'cmr77dvww00bfrx061thkr8z4', // Serie A (Brazil)
  'cmr77dw3900f5rx06j05wgzv4', // UEFA Champions League
  'cmr77dw3900f9rx06laad8onf', // UEFA Conference League
];

function isLowQualityMatch(m) {
  const leagueName = (m.leagueName || '').toLowerCase();
  const homeTeam = (m.homeTeamName || '').toLowerCase();

  for (const keyword of EXCLUDED_KEYWORDS) {
    if (leagueName.includes(keyword) || homeTeam.includes(keyword)) {
      return true;
    }
  }

  return false;
}

function calculateMatchScore(m) {
  if (isLowQualityMatch(m)) return -100;

  let score = 0;

  if (m.status === '1H' || m.status === '2H' || m.status === 'HT') {
    score += 100;
  }

  if (m.status === 'NS' && m.timestamp) {
    const hoursUntil = (m.timestamp - Date.now() / 1000) / 3600;

    if (hoursUntil > 0 && hoursUntil < 24) {
      score += 50;
    }
  }

  if (MAJOR_LEAGUE_IDS.includes(m.leagueId)) {
    score += 30;
  }

  return score;
}

function categorizeMatch(score) {
  if (score < 0) return 'EXCLUDED';
  if (score >= 100) return 'LIVE';
  if (score >= 50) return 'FEATURED';
  if (score >= 30) return 'IMPORTANT';
  return 'NORMAL';
}

async function writeFootballSnapshot(dateStr, updates) {
  try {
    logger.info(`[SnapshotService] Preparing snapshot for ${dateStr}...`);

    let matchesToPublish = [];
    let liveToPublish = [];
    let finishedToPublish = [];

    if (updates.matches) {
      matchesToPublish = updates.matches
        .map((doc) => {
          doc.matchScore = calculateMatchScore(doc);
          doc.category = categorizeMatch(doc.matchScore);
          return doc;
        })
        .filter((doc) => doc.category !== 'EXCLUDED')
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, 500);
    }

    if (updates.live) {
      liveToPublish = updates.live.filter((doc) => !isLowQualityMatch(doc));
    }

    if (updates.finished) {
      finishedToPublish = updates.finished.filter((doc) => !isLowQualityMatch(doc));
    }

    // Firestore snapshot saving remains disabled for now.
    // Local JSON is the source of truth for frontend reads.

    if (updates.matches) {
      logger.info(
        `[SnapshotService] Publishing matches JSON (${matchesToPublish.length} quality matches)...`
      );

      await publishJSON(`fixtures/${dateStr}.json`, {
        data: matchesToPublish,
        count: matchesToPublish.length,
        date: dateStr,
      });
    }

    if (updates.live) {
      await publishJSON('live.json', {
        data: liveToPublish,
        count: liveToPublish.length,
      });
    }

    if (updates.finished && updates.finished.length > 0) {
      logger.info(
        `[SnapshotService] Publishing results JSON (${finishedToPublish.length} matches)...`
      );

      await publishJSON(`results/${dateStr}.json`, {
        data: finishedToPublish,
        count: finishedToPublish.length,
        date: dateStr,
      });
    } else if (updates.finished) {
      logger.info(
        '[SnapshotService] Skipping results publish (0 finished matches). Preserving existing data.'
      );
    }

    logger.info(`[SnapshotService] ✓ Fully complete for ${dateStr}.`);
  } catch (err) {
    logger.error(
      `[SnapshotService] Failed to write snapshot for ${dateStr}: ${err.message}`
    );
  }
}

async function getSnapshotData(dateStr) {
  try {
    return await localSnapshotRepo.getFixtureSnapshot(dateStr);
  } catch (err) {
    logger.warn(
      `[SnapshotService] Local snapshot read failed for ${dateStr}: ${err.message}`
    );

    return {
      date: dateStr,
      matches: [],
      live: [],
      finished: [],
      all: [],
      count: 0,
      lastUpdated: null,
    };
  }
}

module.exports = {
  writeFootballSnapshot,
  getSnapshotData,
  calculateMatchScore,
  categorizeMatch,
};