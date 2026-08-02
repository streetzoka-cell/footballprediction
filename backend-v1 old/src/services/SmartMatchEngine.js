// footballprediction/backend-v1/src/services/SmartMatchEngine.js

const MAJOR_LEAGUES = {
  'cmr77dwy000onrx06oqbv0dbl': 95, // Paraguay
  'cmr77dvv600aprx06o7y7lnfu': 95, // Colombia
  'cmr77dvtc0093rx0667jirsnv': 95, // Argentina
  'cmr77dvww00bfrx061thkr8z4': 95, // Brazil
  'cmr77dw3900f5rx06j05wgzv4': 100, // UCL
};

// --- TIME ENGINE ---
function processTime(kickoffTime, now) {
  if (!kickoffTime) return { kickoffUtc: null, kickoffLocal: 'TBD', weekday: null, relative: null, isToday: false, isTomorrow: false };
  
  const kickoffDate = new Date(kickoffTime);
  const nowDate = new Date(now);
  
  const isToday = kickoffDate.toDateString() === nowDate.toDateString();
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(nowDate.getDate() + 1);
  const isTomorrow = kickoffDate.toDateString() === tomorrowDate.toDateString();
  
  let relative = null;
  const diffMs = kickoffTime - now;
  if (diffMs < 0) {
    relative = `${Math.abs(Math.floor(diffMs / 60000))} min ago`;
  } else if (diffMs < 3600000) {
    relative = `Starts in ${Math.floor(diffMs / 60000)} min`;
  } else if (diffMs < 86400000) {
    relative = `Starts in ${Math.floor(diffMs / 3600000)} hours`;
  }

  return {
    kickoffUtc: kickoffDate.toISOString(),
    kickoffLocal: kickoffDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
    weekday: kickoffDate.toLocaleDateString('en-GB', { weekday: 'long' }),
    relative,
    isToday,
    isTomorrow
  };
}

// --- MAIN ENGINE PROCESSOR ---
function processMatch(data) {
  if (!data) return data;

  const now = Date.now();
  const kickoffTime = data.timestamp ? data.timestamp * 1000 : (data.date ? new Date(data.date).getTime() : 0);
  const elapsedMins = kickoffTime > 0 ? Math.floor((now - kickoffTime) / 60000) : 0;
  const apiMinute = data.minute || data.elapsed;

  let phase = 'UPCOMING';
  let displayStatus = '';
  let displayMinute = null;
  let isLive = false, isFinished = false, isUpcoming = false, isHalfTime = false;
  let statusColor = '#64748b';
  let statusIcon = 'clock';
  let badges = [];

  const rawStatus = (data.status || 'NS').toUpperCase();
  const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'IN_PLAY', 'PAUSED'];
  const FIN_STATUSES = ['FT', 'AET', 'PEN', 'FINISHED', 'AWD', 'WO'];

  if (rawStatus === 'PST') {
    phase = 'POSTPONED'; displayStatus = 'PST'; badges.push('POSTPONED'); statusColor = '#fbbf24';
  } else if (rawStatus === 'CANC') {
    phase = 'CANCELLED'; displayStatus = 'CANC'; badges.push('CANCELLED'); statusColor = '#ef4444';
  } else if (FIN_STATUSES.includes(rawStatus)) {
    phase = 'FINISHED'; isFinished = true; displayStatus = 'FT'; statusColor = 'var(--accent)'; statusIcon = 'check'; badges.push('FT');
  } else if (LIVE_STATUSES.includes(rawStatus)) {
    isLive = true; statusColor = '#ef4444'; statusIcon = 'live'; badges.push('LIVE');
    
    if (rawStatus === 'HT' || rawStatus === 'PAUSED') {
      phase = 'HALF_TIME'; isHalfTime = true; displayStatus = 'HT'; displayMinute = 45;
    } else if (rawStatus === 'ET' || rawStatus === 'BT') {
      phase = 'EXTRA_TIME'; displayMinute = apiMinute || Math.min(elapsedMins, 120); displayStatus = `${displayMinute}' (ET)`; badges.push('ET');
    } else if (rawStatus === 'P' || rawStatus === 'PEN') {
      phase = 'PENALTIES'; displayStatus = 'PEN'; badges.push('PEN');
    } else {
      phase = elapsedMins >= 45 && elapsedMins < 60 ? 'HALF_TIME' : (elapsedMins < 45 ? 'FIRST_HALF' : 'SECOND_HALF');
      let calcMin = apiMinute;
      if (calcMin == null) {
        calcMin = Math.max(0, Math.min(elapsedMins, 90));
        if (phase === 'HALF_TIME') { isHalfTime = true; displayStatus = 'HT'; displayMinute = 45; }
        else {
          displayMinute = calcMin;
          displayStatus = `${calcMin}'`;
          if (calcMin > 90) displayStatus = `90+${calcMin - 90}'`;
          if (calcMin > 45 && calcMin <= 48) displayStatus = `45+${calcMin - 45}'`;
        }
      } else {
        displayMinute = calcMin;
        displayStatus = `${calcMin}'`;
        if (calcMin > 90) displayStatus = `90+${calcMin - 90}'`;
        if (calcMin > 45 && calcMin <= 48) displayStatus = `45+${calcMin - 45}'`;
      }
    }
  } else {
    if (kickoffTime > 0 && now > kickoffTime && elapsedMins <= 105) {
      isLive = true; phase = 'FIRST_HALF'; statusColor = '#ef4444'; statusIcon = 'live'; badges.push('LIVE');
      let calcMin = Math.max(0, Math.min(elapsedMins, 90));
      if (elapsedMins >= 45 && elapsedMins < 60) { phase = 'HALF_TIME'; isHalfTime = true; displayStatus = 'HT'; displayMinute = 45; }
      else { displayMinute = calcMin; displayStatus = `${calcMin}'`; if (calcMin > 90) displayStatus = `90+${calcMin - 90}'`; }
    } else if (kickoffTime > 0 && now > kickoffTime && elapsedMins > 105) {
      phase = 'FINISHED'; isFinished = true; displayStatus = 'FT'; statusColor = 'var(--accent)'; badges.push('FT');
    } else {
      phase = 'UPCOMING'; isUpcoming = true;
      displayStatus = new Date(kickoffTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  }

  // --- SCORE ENGINE ---
  const homeScore = data.homeScore ?? data.goalsHome ?? data.score?.fulltime?.home ?? null;
  const awayScore = data.awayScore ?? data.goalsAway ?? data.score?.fulltime?.away ?? null;
  let scoreDisplay = 'VS';
  let winner = null;
  let isDraw = false;
  let goalDifference = 0;

  if (homeScore != null && awayScore != null) {
    scoreDisplay = `${homeScore} - ${awayScore}`;
    if (homeScore > awayScore) winner = 'HOME';
    else if (awayScore > homeScore) winner = 'AWAY';
    else isDraw = true;
    goalDifference = Math.abs(homeScore - awayScore);
  }

  // --- MATCH IMPORTANCE ENGINE ---
  let importance = MAJOR_LEAGUES[data.leagueId] || 40; 
  if (isLive) importance += 50;
  if (isUpcoming && kickoffTime > 0 && (kickoffTime - now) < 3600000) importance += 20;
  if (badges.includes('FEATURED')) importance += 15;

  // --- DATA COMPLETENESS ENGINE ---
  const dataQuality = {
    score: homeScore != null ? 'complete' : 'missing',
    minute: apiMinute != null ? 'provider' : (isLive ? 'estimated' : 'n/a'),
    events: data.events ? 'available' : 'missing',
    lineups: data.lineups ? 'available' : 'missing',
    statistics: data.statistics ? 'available' : 'missing',
    lastUpdated: new Date().toISOString()
  };

  return {
    ...data,
    kickoffUtc: data.date,
    kickoffTimestamp: data.timestamp,
    status: rawStatus,
    importance,
    time: processTime(kickoffTime, now), // â˜… TIME ENGINE OUTPUT
    display: {
      status: displayStatus,
      minute: displayMinute,
      phase,
      score: { home: homeScore, away: awayScore, display: scoreDisplay, winner, isDraw, goalDifference },
      badges,
      statusColor,
      statusIcon,
      isLive,
      isFinished,
      isUpcoming,
      isHalfTime
    },
    dataQuality // â˜… DATA COMPLETENESS OUTPUT
  };
}

module.exports = { processMatch };
