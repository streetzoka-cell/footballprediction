// backend-v1/src/services/UnifiedFixtureService.js
const ProviderManager = require('../providers/ProviderManager');
const { apiFootball, isports } = require('../normalisers');
const logger = require('../utils/logger');

function getCleanName(rawObj) {
  try {
    if (!rawObj) return '';
    let str = typeof rawObj === 'string' ? rawObj : (rawObj?.name || rawObj?.shortName || '');
    if (typeof str !== 'string') str = String(str || '');
    return str.toLowerCase().replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '').replace(/[^a-z0-9]/g, '').trim();
  } catch(e) { return ''; }
}

async function buildUnifiedFixtures(date) {
  const providers = ProviderManager.providers;
  
  // Fetch from all available providers in parallel
  const [apiFootRes, isportsRes] = await Promise.allSettled([
    providers['api-football']?.getFixtures(date),
    providers['isports']?.getFixtures(date)
  ]);

  // ★ Bulletproof extraction
  const apiFootRaw = apiFootRes.status === 'fulfilled' ? apiFootRes.value : [];
  const isportsRaw = isportsRes.status === 'fulfilled' ? isportsRes.value : [];

  let apiFootMatches = [];
  let isportsMatches = [];

  try { apiFootMatches = apiFootball.matches(apiFootRaw); } catch(e) {}
  try { isportsMatches = isports.matches(isportsRaw); } catch(e) {}

  logger.info(`[Unifier] Fetched for ${date} -> API-Football: ${apiFootMatches.length}, iSports: ${isportsMatches.length}`);

  const unifiedMap = new Map();

  // 1. Add API-Football matches as the base
  apiFootMatches.forEach(m => {
    const key = `${getCleanName(m.homeTeamName)}-${getCleanName(m.awayTeamName)}`;
    if (key !== '-') {
      unifiedMap.set(key, {
        ...m,
        ids: { 'api-football': String(m.id) },
        source: 'api-football'
      });
    }
  });

  // 2. Merge iSports matches
  let commonCount = 0;
  isportsMatches.forEach(m => {
    const key = `${getCleanName(m.homeTeamName)}-${getCleanName(m.awayTeamName)}`;
    if (key === '-') return;
    
    const existing = unifiedMap.get(key);

    if (existing) {
      commonCount++;
      existing.ids.isports = String(m.id);
      existing.homeHalfScore = m.homeHalfScore;
      existing.awayHalfScore = m.awayHalfScore;
    } else {
      unifiedMap.set(key, {
        ...m,
        ids: { isports: String(m.id) },
        source: 'isports'
      });
    }
  });

  logger.info(`[Unifier] ✓ Linked ${commonCount} common matches. Total unified: ${unifiedMap.size}`);
  
  return Array.from(unifiedMap.values());
}

module.exports = { buildUnifiedFixtures };