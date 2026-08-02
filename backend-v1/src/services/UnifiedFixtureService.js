// backend-v1/src/services/UnifiedFixtureService.js

const ProviderManager = require('../providers/ProviderManager');
const apiFootballNormaliser = require('../normalisers/apiFootballNormaliser');
const isportsNormaliser = require('../normalisers/isportsNormaliser');
const { normalizeName } = require('../utils/teamMatcher');
const logger = require('../utils/logger');

function normalizeApiFootballPayload(raw) {
  if (!Array.isArray(raw)) return [];

  // Raw API-Football response
  if (raw.length > 0 && raw[0]?.fixture) {
    return raw
      .map((m) => apiFootballNormaliser.normalizeMatch(m))
      .filter(Boolean);
  }

  // Already normalized
  return raw.filter(Boolean);
}

function normalizeIsportsPayload(raw) {
  if (!Array.isArray(raw)) return [];

  // Raw iSports response
  if (raw.length > 0 && raw[0]?.matchId) {
    return isportsNormaliser.matches(raw).filter(Boolean);
  }

  // Already normalized
  return raw.filter(Boolean);
}

async function buildUnifiedFixtures(date) {
  const providers = ProviderManager.providers;

  const [apiFootRes, isportsRes] = await Promise.allSettled([
    providers['api-football']?.getFixtures(date),
    providers['isports']?.getFixtures(date),
  ]);

  const apiFootRaw = apiFootRes.status === 'fulfilled' ? apiFootRes.value : [];
  const isportsRaw = isportsRes.status === 'fulfilled' ? isportsRes.value : [];

  const apiFootMatches = normalizeApiFootballPayload(apiFootRaw).map((m) => ({
    ...m,
    source: 'api-football',
    ids: {
      ...(m.ids || {}),
      'api-football': String(m.id),
    },
  }));

  const isportsMatches = normalizeIsportsPayload(isportsRaw).map((m) => ({
    ...m,
    source: 'isports',
    ids: {
      ...(m.ids || {}),
      isports: String(m.id),
    },
  }));

  logger.info(
    `[Unifier] Fetched for ${date} -> API-Football: ${apiFootMatches.length}, iSports: ${isportsMatches.length}`
  );

  const unifiedMap = new Map();

  // API-Football base
  apiFootMatches.forEach((m) => {
    const key = `${normalizeName(m.homeTeamName || m.homeTeam)}-${normalizeName(
      m.awayTeamName || m.awayTeam
    )}`;

    if (key !== '-') {
      unifiedMap.set(key, {
        ...m,
        ids: {
          'api-football': String(m.id),
        },
        source: 'api-football',
      });
    }
  });

  // Merge iSports
  let commonCount = 0;

  isportsMatches.forEach((m) => {
    const key = `${normalizeName(m.homeTeamName || m.homeTeam)}-${normalizeName(
      m.awayTeamName || m.awayTeam
    )}`;

    if (key === '-') return;

    const existing = unifiedMap.get(key);

    if (existing) {
      commonCount += 1;

      existing.ids.isports = String(m.id);
      existing.homeHalfScore = m.homeHalfScore;
      existing.awayHalfScore = m.awayHalfScore;
    } else {
      unifiedMap.set(key, {
        ...m,
        ids: {
          isports: String(m.id),
        },
        source: 'isports',
      });
    }
  });

  logger.info(
    `[Unifier] Linked ${commonCount} common matches. Total unified: ${unifiedMap.size}`
  );

  return Array.from(unifiedMap.values());
}

module.exports = {
  buildUnifiedFixtures,
};