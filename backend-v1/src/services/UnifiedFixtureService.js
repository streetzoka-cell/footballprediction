// backend-v1/src/services/UnifiedFixtureService.js
// V5: canonical identity layer
//   · robust matchKey: accent-fold, suffix-tolerant (prefix containment ≥6),
//     date-level, swap-safe
//   · canonicalMatchId stamped on EVERY unified fixture
//   · [Unifier] LINKED trace log — one line per merged provider pair
//     (the trace: api-football id <-> isports id for the same real match)
const ProviderManager = require('../providers/ProviderManager');
const apiFootballNormaliser = require('../normalisers/apiFootballNormaliser');
const isportsNormaliser = require('../normalisers/isportsNormaliser');
const { isMustHaveLeague } = require('../config/leagues');
const logger = require('../utils/logger');

function foldName(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')      // Atlético -> Atletico
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function teamSame(a, b) {
  a = foldName(a);
  b = foldName(b);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // 'tottenham' ⊂ 'tottenhamhotspur' · 'yorkunited' ⊂ 'yorkunitedfc'
  return shorter.length >= 6 && longer.startsWith(shorter);
}

function teamLabel(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.name || '';
}

function matchKey(m, date) {
  const home = teamLabel(m.homeTeamName ?? m.homeTeam);
  const away = teamLabel(m.awayTeamName ?? m.awayTeam);
  if (!home || !away) return null;
  const ko = String(m.utcDate || m.date || date || '').slice(0, 10);
  const fh = foldName(home), fa = foldName(away);
  const pair = teamSame(home, away)
    ? [fh, fa].sort().join('-')           // swap-safe
    : `${fh}|${fa}`;
  return `${pair}|${ko}`;
}

function canonicalMatchId(m, date) {
  const key = matchKey(m, date);
  return key ? `cm_${key}` : null;
}

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

  // API-Football base
  apiFootMatches.forEach((m) => {
    const key = matchKey(m, date);
    if (!key) return;
    unifiedMap.set(key, {
      ...m,
      ids: { ...(m.ids || {}), 'api-football': String(m.id) },
      canonicalMatchId: `cm_${key}`,
      source: 'api-football',
    });
  });

  // Merge iSports — LINKED trace on every merge
  let commonCount = 0;

  isportsMatches.forEach((m) => {
    const key = matchKey(m, date);
    if (!key) return;

    const existing = unifiedMap.get(key);

    if (existing) {
      commonCount += 1;
      logger.info(
        `[Unifier] LINKED "${teamLabel(existing.homeTeamName ?? existing.homeTeam)} v ` +
        `${teamLabel(existing.awayTeamName ?? existing.awayTeam)}" ` +
        `api-football=${existing.ids['api-football']} <-> isports=${m.id}`
      );
      existing.ids = { ...(existing.ids || {}), isports: String(m.id) };
      existing.homeHalfScore = m.homeHalfScore ?? existing.homeHalfScore;
      existing.awayHalfScore = m.awayHalfScore ?? existing.awayHalfScore;
      existing.timestamp = existing.timestamp ?? m.timestamp;
      existing.canonicalMatchId = `cm_${key}`;
    } else {
      unifiedMap.set(key, {
        ...m,
        ids: { ...(m.ids || {}), isports: String(m.id) },
        canonicalMatchId: `cm_${key}`,
        source: 'isports',
      });
    }
  });

  logger.info(
    `[Unifier] Linked ${commonCount} common matches. Total unified: ${unifiedMap.size}`
  );

  return Array.from(unifiedMap.values()).map((m) => ({
    ...m,
    matchId: m.matchId ?? m.id,
    canonicalMatchId: m.canonicalMatchId,
    mustHave: isMustHaveLeague(m.leagueId),
  }));
}

module.exports = {
  buildUnifiedFixtures,
  matchKey,
  canonicalMatchId,
  teamSame,
  foldName,
};