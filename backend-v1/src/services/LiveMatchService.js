// backend-v1/src/services/LiveMatchService.js

const ProviderManager = require('../providers/ProviderManager');
const QuotaManager = require('./QuotaManager');
const LiveSyncEngine = require('../modules/live/LiveSyncEngine');
const apiFootballNormaliser = require('../normalisers/apiFootballNormaliser');
const isportsNormaliser = require('../normalisers/isportsNormaliser');
const { getDateOffset } = require('../config/constants');
const logger = require('../utils/logger');

// ── Live-feed sanity thresholds ────────────────────────────────────────
// No football match is genuinely in play longer than this
// (90' + 15' HT + extra time + penalties ≈ 2.5h; 3.5h is a safe ceiling).
const MAX_LIVE_DURATION_MS = 3.5 * 60 * 60 * 1000;
// If a match reads 90' and has been going this long, it is over.
const STUCK_AT_90_MS = 115 * 60 * 1000;

function normalizeLivePayload(rawLiveMatches) {
  if (!Array.isArray(rawLiveMatches) || rawLiveMatches.length === 0) {
    return [];
  }

  // iSports raw payload
  if (rawLiveMatches[0]?.matchId) {
    return isportsNormaliser
      .matches(rawLiveMatches)
      .filter(Boolean)
      .map((m) => ({
        ...m,
        source: 'isports',
        ids: { ...(m.ids || {}), isports: String(m.id) },
      }));
  }

  // API-Football raw payload
  if (rawLiveMatches[0]?.fixture) {
    return rawLiveMatches
      .map((m) => apiFootballNormaliser.normalizeMatch(m))
      .filter(Boolean)
      .map((m) => ({
        ...m,
        source: 'api-football',
        ids: { ...(m.ids || {}), 'api-football': String(m.id) },
      }));
  }

  // Already normalized payload
  const activeProvider =
    typeof ProviderManager.getActiveProviderName === 'function'
      ? ProviderManager.getActiveProviderName()
      : 'api-football';

  return rawLiveMatches.filter(Boolean).map((m) => {
    const source = m.source || activeProvider;
    const ids = { ...(m.ids || {}) };

    if (source === 'isports' && !ids.isports) ids.isports = String(m.id);
    if (source === 'api-football' && !ids['api-football']) ids['api-football'] = String(m.id);

    return { ...m, source, ids };
  });
}

/**
 * A match is only "effectively live" if it can still be in play.
 * Providers (especially iSports) keep finished matches flagged as live
 * for hours — this guards against that stale data before it hits live.json.
 */
function isEffectivelyLive(match, nowMs) {
  // Explicitly finished
  if (match.status === 'FT' || match.display?.isFinished === true) return false;

  const startMs = match.timestamp ? match.timestamp * 1000 : 0;
  if (!startMs) return true; // no kickoff time → cannot judge, keep it

  const elapsedMs = nowMs - startMs;

  // Hard ceiling: nothing is still live after 3.5 hours
  if (elapsedMs > MAX_LIVE_DURATION_MS) return false;

  // Stuck at full time: minute >= 90 and well past normal duration
  const minute = match.display?.minute ?? match.minute ?? 0;
  if (minute >= 90 && elapsedMs > STUCK_AT_90_MS) return false;

  return true;
}

async function syncLiveMatches() {
  if (!QuotaManager.canPollLive()) {
    return {
      count: 0,
      skipped: true,
      liveMatches: [],
      nearFinishCount: 0,
      highPriorityLiveCount: 0,
    };
  }

  const rawLiveMatches = await ProviderManager.getLiveFixtures();

  let normalized = [];
  try {
    normalized = normalizeLivePayload(rawLiveMatches);
  } catch (err) {
    logger.warn(`[LiveMatchService] Normalisation failed: ${err.message}`);
    normalized = [];
  }

  // ★ Drop stale/finished matches so live.json only contains real live games
  const nowMs = Date.now();
  const liveMatches = normalized.filter((m) => isEffectivelyLive(m, nowMs));
  const staleDropped = normalized.length - liveMatches.length;

  if (staleDropped > 0) {
    logger.info(
      `[LiveMatchService] Dropped ${staleDropped} stale/finished match(es) from live feed. ` +
      `Genuinely live: ${liveMatches.length}`
    );
  }

  const today = getDateOffset(0);

  const result = await LiveSyncEngine.syncLiveToDate(today, liveMatches, {
    source: liveMatches[0]?.source || normalized[0]?.source || 'unknown',
  });

  if (!result.skipped) {
    QuotaManager.recordLiveCall();
  }

  return result;
}

module.exports = {
  syncLiveMatches,
  isEffectivelyLive, // exported so LiveSyncEngine / jobs can reuse the same rule
};