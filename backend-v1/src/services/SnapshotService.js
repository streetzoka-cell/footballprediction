const snapshotRepo = require('../repositories/SnapshotRepository');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

// ─── SMART QUALITY FILTER ───
const EXCLUDED_KEYWORDS = [
  'friendly', 'friendlies', 'youth', 'u19', 'u21', 'u17', 'u23', 
  'women', ' w$', 'reserves', ' b$', ' ii$', 'academy', 'junior'
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
    if (leagueName.includes(keyword) || homeTeam.includes(keyword)) return true;
  }
  return false;
}

function calculateMatchScore(m) {
  if (isLowQualityMatch(m)) return -100;
  let score = 0;
  if (m.status === '1H' || m.status === '2H' || m.status === 'HT') score += 100;
  if (m.status === 'NS' && m.timestamp) {
    const hoursUntil = (m.timestamp - (Date.now() / 1000)) / 3600;
    if (hoursUntil > 0 && hoursUntil < 24) score += 50;
  }
  if (MAJOR_LEAGUE_IDS.includes(m.leagueId)) score += 30;
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
    
    // 1. Filter and Score the matches before saving/publishing
    let matchesToPublish = [];
    let liveToPublish = [];
    let finishedToPublish = [];

    if (updates.matches) {
      matchesToPublish = updates.matches.map(doc => {
        doc.matchScore = calculateMatchScore(doc);
        doc.category = categorizeMatch(doc.matchScore);
        return doc;
      })
      .filter(doc => doc.category !== 'EXCLUDED')
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, 500);
    }

    if (updates.live) {
      liveToPublish = updates.live.filter(doc => !isLowQualityMatch(doc));
    }

    if (updates.finished) {
      finishedToPublish = updates.finished.filter(doc => !isLowQualityMatch(doc));
    }

    // 2. Save to Firestore
    // ⚠️ FIRESTORE DISABLED DUE TO NODE v22 gRPC HANG ⚠️
    // const db = require('../config/firebase').getDb();
    // const ref = db.collection('fixture_snapshots').doc('football_' + dateStr);
    // const dbPayload = { date: dateStr, lastUpdated: new Date().toISOString() };
    // if (updates.matches) dbPayload.matches = matchesToPublish;
    // if (updates.live) dbPayload.live = liveToPublish;
    // if (updates.finished) dbPayload.finished = finishedToPublish;
    // logger.info(`[SnapshotService] Saving to Firestore...`);
    // await ref.set(dbPayload, { merge: true });
    // logger.info(`[SnapshotService] Firestore save complete.`);

    // 3. Publish local JSON files (For 0-read frontend)
    if (updates.matches) {
      logger.info(`[SnapshotService] Publishing matches JSON (${matchesToPublish.length} quality matches)...`);
      await publishJSON(`fixtures/${dateStr}.json`, { data: matchesToPublish, count: matchesToPublish.length, date: dateStr });
    }
    if (updates.live) {
      await publishJSON('live.json', { data: liveToPublish, count: liveToPublish.length });
    }
    if (updates.finished) {
      await publishJSON(`results/${dateStr}.json`, { data: finishedToPublish, count: finishedToPublish.length, date: dateStr });
    }
    
    logger.info(`[SnapshotService] ✓ Fully complete for ${dateStr}.`);

  } catch (err) {
    logger.error(`[SnapshotService] Failed to write snapshot for ${dateStr}: ${err.message}`);
  }
}

async function getSnapshotData(dateStr) {
  return snapshotRepo.getSnapshot(dateStr);
}

module.exports = { writeFootballSnapshot, getSnapshotData, calculateMatchScore, categorizeMatch };