// backend-v1/src/services/SnapshotService.js
const localSnapshotRepo = require('../repositories/LocalSnapshotRepository');
const {
  isMustHaveLeague,
  getLeaguePriority,
} = require('../config/leagues');
const logger = require('../utils/logger');

const MAX_MATCHES = 500; // cap applies ONLY to non-must-have matches

// ─── SMART QUALITY FILTER ───

const EXCLUDED_KEYWORDS = [
  'youth', 'u19', 'u21', 'u17', 'u23', 'women',
  'reserves', 'reserve', 'academy', 'junior', ' b', ' ii',
];

const MAJOR_CLUBS = [
  'manchester united', 'manchester city', 'liverpool', 'arsenal', 'chelsea',
  'tottenham', 'newcastle', 'barcelona', 'real madrid', 'atletico madrid',
  'bayern munich', 'borussia dortmund', 'psg', 'paris saint', 'juventus',
  'inter', 'ac milan', 'napoli', 'roma', 'ajax', 'benfica', 'porto',
  'sporting', 'galatasaray', 'fenerbahce', 'celtic', 'rangers',
];

function isFriendly(m) {
  const league = (m.leagueName || m.competition?.name || '').toLowerCase();
  return (
    league.includes('friendly') ||
    league.includes('friendlies') ||
    league.includes('club friendly') ||
    league.includes('international friendly')
  );
}

function isMajorClub(name = '') {
  const normalized = String(name).toLowerCase();
  return MAJOR_CLUBS.some((club) => normalized.includes(club));
}

function isLowQualityMatch(m) {
  // ★ WHITELIST: the TOP 12 are NEVER filtered — this is the "must have" guarantee
  if (isMustHaveLeague(m.leagueId)) return false;

  const leagueName = (m.leagueName || '').toLowerCase();
  const homeTeam = (m.homeTeamName || m.homeName || '').toLowerCase();
  const awayTeam = (m.awayTeamName || m.awayName || '').toLowerCase();

  for (const keyword of EXCLUDED_KEYWORDS) {
    if (leagueName.includes(keyword) || homeTeam.includes(keyword) || awayTeam.includes(keyword)) {
      return true;
    }
  }

  // Remove friendlies only when they have no big club
  if (isFriendly(m)) {
    const importantFriendly = isMajorClub(homeTeam) || isMajorClub(awayTeam);
    if (!importantFriendly) return true;
  }

  return false;
}

function calculateMatchScore(m) {
  const mustHave = isMustHaveLeague(m.leagueId);

  if (!mustHave && isLowQualityMatch(m)) return -100;

  let score = 0;

  // League weight — real numeric priorities, replaces the dead CUID list
  // must-have floor: 60 → always categorize at least IMPORTANT
  score += mustHave ? 60 : Math.round(getLeaguePriority(m.leagueId) / 3);

  // Live priority
  if (m.status === '1H' || m.status === '2H' || m.status === 'HT') score += 100;

  // Upcoming soon
  if (m.status === 'NS' && m.timestamp) {
    const hoursUntil = (m.timestamp - Date.now() / 1000) / 3600;
    if (hoursUntil > 0 && hoursUntil < 24) score += 50;
  }

  // Important clubs
  if (isMajorClub(m.homeTeamName) || isMajorClub(m.awayTeamName)) score += 25;

  // Big friendly boost
  if (isFriendly(m)) {
    const bothBig = isMajorClub(m.homeTeamName) && isMajorClub(m.awayTeamName);
    score += bothBig ? 60 : 30;
  }

  return score;
}

function categorizeMatch(score) {
  if (score < 0) return 'EXCLUDED';
  if (score >= 100) return 'LIVE';
  if (score >= 80) return 'FEATURED';
  if (score >= 50) return 'IMPORTANT';
  return 'NORMAL';
}

async function writeFootballSnapshot(dateStr, updates) {
  try {
    logger.info(`[SnapshotService] Preparing snapshot for ${dateStr}...`);

    let matchesToPublish = [];
    let liveToPublish = [];
    let finishedToPublish = [];

    if (updates.matches) {
      const tagged = updates.matches.map((doc) => {
        doc.matchScore = calculateMatchScore(doc);
        doc.category = categorizeMatch(doc.matchScore);
        doc.mustHave = isMustHaveLeague(doc.leagueId); // ★ frontend contract flag
        return doc;
      });

      // ★ MUST-HAVE GUARANTEE: top 12 leagues are ALWAYS published.
      // The 500 cap only trims the rest of the world.
      const mustHave = tagged.filter((d) => d.mustHave);

      const rest = tagged
        .filter((d) => !d.mustHave && d.category !== 'EXCLUDED')
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, Math.max(0, MAX_MATCHES - mustHave.length));

      matchesToPublish = [...mustHave, ...rest].sort(
        (a, b) => (b.matchScore || 0) - (a.matchScore || 0)
      );

      logger.info(
        `[SnapshotService] must-have kept: ${mustHave.length} | total published: ${matchesToPublish.length}`
      );
    }

    if (updates.live) {
      // isLowQualityMatch whitelists must-have → top-12 live matches always pass
      liveToPublish = updates.live.filter((doc) => !isLowQualityMatch(doc));
    }

    if (updates.finished) {
      finishedToPublish = updates.finished.filter((doc) => !isLowQualityMatch(doc));
    }

    if (updates.matches) {
      logger.info(`[SnapshotService] Publishing matches JSON (${matchesToPublish.length})...`);
      await publishFixtureJSON(`fixtures/${dateStr}.json`, {
        data: matchesToPublish,
        count: matchesToPublish.length,
        date: dateStr,
      });
    }

    if (updates.live) {
      await publishFixtureJSON('live.json', {
        data: liveToPublish,
        count: liveToPublish.length,
      });
    }

    if (updates.finished && updates.finished.length > 0) {
      logger.info(`[SnapshotService] Publishing results JSON (${finishedToPublish.length})...`);
      await publishFixtureJSON(`results/${dateStr}.json`, {
        data: finishedToPublish,
        count: finishedToPublish.length,
        date: dateStr,
      });
    }

    logger.info(`[SnapshotService] ✓ Fully complete for ${dateStr}.`);
  } catch (err) {
    logger.error(`[SnapshotService] Failed to write snapshot for ${dateStr}: ${err.message}`);
  }
}

/* lazy require to avoid circular imports */
async function publishFixtureJSON(filePath, payload) {
  const { publishJSON } = require('./StaticFilePublisher');
  return publishJSON(filePath, payload);
}

async function getSnapshotData(dateStr) {
  try {
    return await localSnapshotRepo.getFixtureSnapshot(dateStr);
  } catch (err) {
    logger.warn(`[SnapshotService] Local snapshot read failed for ${dateStr}: ${err.message}`);
    return {
      date: dateStr, matches: [], live: [], finished: [], all: [], count: 0, lastUpdated: null,
    };
  }
}

/* ★ Dedicated endpoint source: only the TOP 12 leagues, any date */
async function getTopLeagueFixtures(dateStr) {
  const snap = await getSnapshotData(dateStr);
  const top = snap.all.filter((m) => isMustHaveLeague(m.leagueId));
  return {
    date: dateStr,
    data: top,
    count: top.length,
    lastUpdated: snap.lastUpdated,
  };
}

module.exports = {
  writeFootballSnapshot,
  getSnapshotData,
  getTopLeagueFixtures,
  calculateMatchScore,
  categorizeMatch,
};