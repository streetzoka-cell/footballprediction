// backend-v1/src/services/UnifiedFixtureService.js
const ProviderManager = require('../providers/ProviderManager');
const apiFootballNormaliser = require('../normalisers/apiFootballNormaliser');
const isportsNormaliser = require('../normalisers/isportsNormaliser');
const { normalizeName } = require('../utils/teamMatcher');
const { isMustHaveLeague } = require('../config/leagues');
const logger = require('../utils/logger');

function normalizeApiFootballPayload(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 0 && raw[0]?.fixture) {
    return raw.map((m) => apiFootballNormaliser.normalizeMatch(m)).filter(Boolean);
  }
  return raw.filter(Boolean);
}

function normalizeIsportsPayload(raw) {
  if (!Array.isArray(raw)) return [];
  if (raw.length > 0 && raw[0]?.matchId) {
    return isportsNormaliser.matches(raw).filter(Boolean);
  }
  return raw.filter(Boolean);
}

function teamLabel(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.name || '';
}

function matchKey(m) {
  const home = normalizeName(teamLabel(m.homeTeamName ?? m.homeTeam));
  const away = normalizeName(teamLabel(m.awayTeamName ?? m.awayTeam));
  if (!home || !away) return null;
  return `${home}-${away}`;
}

async function buildUnifiedFixtures(date) {
  const providers = ProviderManager.providers;

  const [apiFootRes, isportsRes] = await Promise.allSettled([
    providers['api-football']?.getFixtures(date),
    providers['isports']?.getFixtures(date),
  ]);

  const apiFootRaw = apiFootRes.status === 'fulfilled' ? apiFootRes.value : [];
  const isportsRaw = isportsRes.status === 'fulfilled' ? isportsRes.value : [];

  const apiFootMatches = normalizeApiFootballPayload(apiFootRaw);
  const isportsMatches = normalizeIsportsPayload(isportsRaw);

  logger.info(
    `[Unifier] Fetched for ${date} -> API-Football: ${apiFootMatches.length}, iSports: ${isportsMatches.length}`
  );

  const unifiedMap = new Map();

  // API-Football base — ★ spread m.ids so we never wipe normalizer-provided ids
  apiFootMatches.forEach((m) => {
    const key = matchKey(m);
    if (!key) return;

    unifiedMap.set(key, {
      ...m,
      ids: { ...(m.ids || {}), 'api-football': String(m.id) },
      source: 'api-football',
    });
  });

  // Merge iSports
  let commonCount = 0;

  isportsMatches.forEach((m) => {
    const key = matchKey(m);
    if (!key) return;

    const existing = unifiedMap.get(key);

    if (existing) {
      commonCount += 1;
      existing.ids = { ...(existing.ids || {}), isports: String(m.id) };
      existing.homeHalfScore = m.homeHalfScore ?? existing.homeHalfScore;
      existing.awayHalfScore = m.awayHalfScore ?? existing.awayHalfScore;
      existing.timestamp = existing.timestamp ?? m.timestamp;
    } else {
      unifiedMap.set(key, {
        ...m,
        ids: { ...(m.ids || {}), isports: String(m.id) },
        source: 'isports',
      });
    }
  });

  logger.info(`[Unifier] Linked ${commonCount} common matches. Total unified: ${unifiedMap.size}`);

  // ★ Tag must-have at the source — every downstream consumer gets the flag
  return Array.from(unifiedMap.values()).map((m) => ({
    ...m,
    mustHave: isMustHaveLeague(m.leagueId),
  }));
}

module.exports = { buildUnifiedFixtures };