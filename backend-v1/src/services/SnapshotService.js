// backend-v1/src/services/SnapshotService.js

const localSnapshotRepo = require('../repositories/LocalSnapshotRepository');
const { publishJSON } = require('./StaticFilePublisher');
const logger = require('../utils/logger');

// ─── SMART QUALITY FILTER ───

const EXCLUDED_KEYWORDS = [
  'youth',
  'u19',
  'u21',
  'u17',
  'u23',
  'women',
  'reserves',
  'reserve',
  'academy',
  'junior',
  ' b',
  ' ii',
];

// Big clubs for ranking important friendlies
const MAJOR_CLUBS = [
  'manchester united',
  'manchester city',
  'liverpool',
  'arsenal',
  'chelsea',
  'tottenham',
  'newcastle',
  'barcelona',
  'real madrid',
  'atletico madrid',
  'bayern munich',
  'borussia dortmund',
  'psg',
  'paris saint',
  'juventus',
  'inter',
  'ac milan',
  'napoli',
  'roma',
  'ajax',
  'benfica',
  'porto',
  'sporting',
  'galatasaray',
  'fenerbahce',
  'celtic',
  'rangers',
];

// Your important competitions
const MAJOR_LEAGUE_IDS = [
  'cmr77dwy000onrx06oqbv0dbl',
  'cmr77dvv600aprx06o7y7lnfu',
  'cmr77dwb200hvrx06199fst9o',
  'cmr77dvtc0093rx0667jirsnv',
  'cmr77dvww00bfrx061thkr8z4',
  'cmr77dw3900f5rx06j05wgzv4',
  'cmr77dw3900f9rx06laad8onf',
];


function isFriendly(m) {
  const league = (
    m.leagueName ||
    m.competition?.name ||
    ''
  ).toLowerCase();

  return (
    league.includes('friendly') ||
    league.includes('friendlies') ||
    league.includes('club friendly') ||
    league.includes('international friendly')
  );
}


function isMajorClub(name = '') {
  const normalized = name.toLowerCase();

  return MAJOR_CLUBS.some(club =>
    normalized.includes(club)
  );
}


function isLowQualityMatch(m) {
  const leagueName = (m.leagueName || '').toLowerCase();

  const homeTeam =
    (m.homeTeamName ||
    m.homeName ||
    '')
    .toLowerCase();

  const awayTeam =
    (m.awayTeamName ||
    m.awayName ||
    '')
    .toLowerCase();


  for (const keyword of EXCLUDED_KEYWORDS) {
    if (
      leagueName.includes(keyword) ||
      homeTeam.includes(keyword) ||
      awayTeam.includes(keyword)
    ) {
      return true;
    }
  }


  // Remove friendlies only when they have no big club
  if (isFriendly(m)) {

    const importantFriendly =
      isMajorClub(homeTeam) ||
      isMajorClub(awayTeam);

    if (!importantFriendly) {
      return true;
    }
  }


  return false;
}


function calculateMatchScore(m) {

  if (isLowQualityMatch(m)) {
    return -100;
  }


  let score = 0;


  // Live priority
  if (
    m.status === '1H' ||
    m.status === '2H' ||
    m.status === 'HT'
  ) {
    score += 100;
  }


  // Upcoming soon
  if (m.status === 'NS' && m.timestamp) {

    const hoursUntil =
      (m.timestamp - Date.now() / 1000) / 3600;

    if (hoursUntil > 0 && hoursUntil < 24) {
      score += 50;
    }
  }


  // Major leagues
  if (
    MAJOR_LEAGUE_IDS.includes(
      String(m.leagueId)
    )
  ) {
    score += 30;
  }


  // Important clubs
  const bigClub =
    isMajorClub(m.homeTeamName) ||
    isMajorClub(m.awayTeamName);


  if (bigClub) {
    score += 25;
  }


  // Big friendly boost
  if (isFriendly(m)) {

    const bothBig =
      isMajorClub(m.homeTeamName) &&
      isMajorClub(m.awayTeamName);

    if (bothBig) {
      score += 60;
    } else {
      score += 30;
    }
  }


  return score;
}


function categorizeMatch(score) {

  if (score < 0) {
    return 'EXCLUDED';
  }

  if (score >= 100) {
    return 'LIVE';
  }

  if (score >= 80) {
    return 'FEATURED';
  }

  if (score >= 50) {
    return 'IMPORTANT';
  }

  return 'NORMAL';
}



async function writeFootballSnapshot(dateStr, updates) {

  try {

    logger.info(
      `[SnapshotService] Preparing snapshot for ${dateStr}...`
    );


    let matchesToPublish = [];
    let liveToPublish = [];
    let finishedToPublish = [];


    if (updates.matches) {

      matchesToPublish =
        updates.matches
          .map(doc => {

            doc.matchScore =
              calculateMatchScore(doc);

            doc.category =
              categorizeMatch(
                doc.matchScore
              );

            return doc;

          })
          .filter(
            doc =>
              doc.category !== 'EXCLUDED'
          )
          .sort(
            (a,b) =>
              (b.matchScore || 0) -
              (a.matchScore || 0)
          )
          .slice(0,500);

    }



    if (updates.live) {

      liveToPublish =
        updates.live.filter(
          doc =>
            !isLowQualityMatch(doc)
        );

    }



    if (updates.finished) {

      finishedToPublish =
        updates.finished.filter(
          doc =>
            !isLowQualityMatch(doc)
        );

    }



    if (updates.matches) {

      logger.info(
        `[SnapshotService] Publishing matches JSON (${matchesToPublish.length} quality matches)...`
      );


      await publishJSON(
        `fixtures/${dateStr}.json`,
        {
          data: matchesToPublish,
          count: matchesToPublish.length,
          date: dateStr,
        }
      );

    }



    if (updates.live) {

      await publishJSON(
        'live.json',
        {
          data: liveToPublish,
          count: liveToPublish.length,
        }
      );

    }



    if (
      updates.finished &&
      updates.finished.length > 0
    ) {

      logger.info(
        `[SnapshotService] Publishing results JSON (${finishedToPublish.length} matches)...`
      );


      await publishJSON(
        `results/${dateStr}.json`,
        {
          data: finishedToPublish,
          count: finishedToPublish.length,
          date: dateStr,
        }
      );

    }



    logger.info(
      `[SnapshotService] ✓ Fully complete for ${dateStr}.`
    );


  } catch(err) {

    logger.error(
      `[SnapshotService] Failed to write snapshot for ${dateStr}: ${err.message}`
    );

  }
}



async function getSnapshotData(dateStr) {

  try {

    return await localSnapshotRepo.getFixtureSnapshot(dateStr);

  } catch(err) {

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