// backend-v1/src/utils/teamMatcher.js

/**
 * Central team matching utility.
 *
 * This replaces duplicated normalizeName/getCleanName logic across:
 * - UnifiedFixtureService
 * - LiveMatchService
 * - LiveSyncService
 */

function normalizeName(rawObj) {
  try {
    if (!rawObj) return '';

    let str = '';

    if (typeof rawObj === 'string') {
      str = rawObj;
    } else if (Array.isArray(rawObj)) {
      str = rawObj[0]?.name || rawObj[0] || '';
    } else if (typeof rawObj === 'object') {
      str =
        rawObj.name ||
        rawObj.shortName ||
        rawObj.teamName ||
        rawObj.homeName ||
        rawObj.awayName ||
        '';
    } else {
      str = String(rawObj);
    }

    if (typeof str !== 'string') {
      if (str && typeof str === 'object') {
        str = str.name || '';
      } else {
        str = String(str || '');
      }
    }

    if (!str) return '';

    return str
      .toLowerCase()
      .replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  } catch {
    return '';
  }
}

function makeMatchKey(home, away) {
  const homeKey = normalizeName(home);
  const awayKey = normalizeName(away);

  if (!homeKey || !awayKey) return '';

  return `${homeKey}-${awayKey}`;
}

function getProviderId(match, providerName) {
  if (!match) return null;

  if (match.ids && match.ids[providerName]) {
    return String(match.ids[providerName]);
  }

  if (match.source === providerName && match.id) {
    return String(match.id);
  }

  return null;
}

function getHomeName(match) {
  return (
    match?.homeTeamName ||
    match?.homeTeam?.name ||
    match?.homeName ||
    match?.homeTeam ||
    ''
  );
}

function getAwayName(match) {
  return (
    match?.awayTeamName ||
    match?.awayTeam?.name ||
    match?.awayName ||
    match?.awayTeam ||
    ''
  );
}

function buildLiveMaps(liveMatches) {
  const byApiFootballId = new Map();
  const byIsportsId = new Map();
  const byName = new Map();

  for (const match of liveMatches || []) {
    const apiFootballId = getProviderId(match, 'api-football');
    if (apiFootballId) {
      byApiFootballId.set(apiFootballId, match);
    }

    const isportsId = getProviderId(match, 'isports');
    if (isportsId) {
      byIsportsId.set(isportsId, match);
    }

    const key = makeMatchKey(getHomeName(match), getAwayName(match));
    if (key) {
      byName.set(key, match);
    }
  }

  return {
    byApiFootballId,
    byIsportsId,
    byName,
  };
}

function findLiveMatch(fixture, liveMaps) {
  if (!fixture || !liveMaps) return null;

  const fixtureApiFootballId = getProviderId(fixture, 'api-football');
  if (fixtureApiFootballId && liveMaps.byApiFootballId.has(fixtureApiFootballId)) {
    return liveMaps.byApiFootballId.get(fixtureApiFootballId);
  }

  const fixtureIsportsId = getProviderId(fixture, 'isports');
  if (fixtureIsportsId && liveMaps.byIsportsId.has(fixtureIsportsId)) {
    return liveMaps.byIsportsId.get(fixtureIsportsId);
  }

  // Fallback: direct ID matching
  if (fixture.id) {
    const directId = String(fixture.id);

    if (liveMaps.byApiFootballId.has(directId)) {
      return liveMaps.byApiFootballId.get(directId);
    }

    if (liveMaps.byIsportsId.has(directId)) {
      return liveMaps.byIsportsId.get(directId);
    }
  }

  // Fallback: normalized team names
  const key = makeMatchKey(getHomeName(fixture), getAwayName(fixture));
  if (key && liveMaps.byName.has(key)) {
    return liveMaps.byName.get(key);
  }

  return null;
}

module.exports = {
  normalizeName,
  makeMatchKey,
  getProviderId,
  getHomeName,
  getAwayName,
  buildLiveMaps,
  findLiveMatch,
};