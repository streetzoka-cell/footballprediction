// backend-v1/src/routes/v1/match.js
'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { getDb } = require('../../config/firebase');
const { STATUS, getDateOffset } = require('../../config/constants');
const snapshotService = require('../../services/SnapshotService');
const MatchIntelligenceService = require('../../services/MatchIntelligenceService');
const liveSync = require('../../services/livePredictionSync');

const PREDICTIONS_DIR = path.join(process.cwd(), 'public_data', 'predictions');
const FINISHED = new Set(STATUS.FOOTBALL_FINISHED);

/* ── Step 50 markets file: mtime-validated cache ── */
const marketsCache = new Map();

function loadMarketsForDate(dateStr) {
  const fp = path.join(PREDICTIONS_DIR, `${dateStr}.json`);
  try {
    const stat = fs.statSync(fp);
    const cached = marketsCache.get(dateStr);
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.map;

    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    const map = new Map();
    (data.predictions || data.data || []).forEach((p) => map.set(String(p.matchId), p.markets || null));

    marketsCache.set(dateStr, { mtimeMs: stat.mtimeMs, map });
    return map;
  } catch {
    return null;
  }
}

/* ── Firestore doc cache: 30s TTL ── */
const firestoreCache = new Map();
const FS_TTL_MS = 30 * 1000;

async function getDocCached(collection, id) {
  const key = `${collection}:${id}`;
  const hit = firestoreCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const db = getDb();
  const doc = await db.collection(collection).doc(String(id)).get();
  const data = doc.exists ? { id: doc.id, ...doc.data() } : null;

  firestoreCache.set(key, { expires: Date.now() + FS_TTL_MS, data });
  return data;
}

/* ── Local-first lookup across snapshot files ── */
async function findLocalMatch(matchId, dateHint) {
  const dates = dateHint
    ? [dateHint]
    : [getDateOffset(0), getDateOffset(-1), getDateOffset(1)];

  for (const date of dates) {
    const snap = await snapshotService.getSnapshotData(date);
    const hit = (snap.all || []).find(
      (m) =>
        String(m.id) === String(matchId) ||
        (m.ids && Object.values(m.ids).some((v) => String(v) === String(matchId)))
    );
    if (hit) return { ...hit, _localDate: date };
  }
  return null;
}

function extractKickoff(m) {
  if (m.utcDate || m.date || m.kickoff) return m.utcDate || m.date || m.kickoff;
  if (m.timestamp) {
    const ms = typeof m.timestamp === 'number' && m.timestamp < 1e12 ? m.timestamp * 1000 : m.timestamp;
    return new Date(ms).toISOString();
  }
  return null;
}

/* ★ THE TBD FIX: both storage shapes.
   Snapshot fixtures: homeTeamName/awayTeamName (+ homeLogo/homeTeamLogo)
   Firestore docs:   homeTeam:{name,crest} or homeName
   The old code only read homeTeam?.name || homeName → 'TBD' for snapshots. */
function extractTeams(m) {
  const homeId = m.homeTeam?.id ?? m.homeTeamId ?? null;
  const awayId = m.awayTeam?.id ?? m.awayTeamId ?? null;
  const homeName = m.homeTeam?.name ?? m.homeTeamName ?? m.homeName ?? null;
  const awayName = m.awayTeam?.name ?? m.awayTeamName ?? m.awayName ?? null;
  const homeLogo = m.homeTeam?.crest ?? m.homeTeam?.logo ?? m.homeLogo ?? m.homeTeamLogo ?? null;
  const awayLogo = m.awayTeam?.crest ?? m.awayTeam?.logo ?? m.awayLogo ?? m.awayTeamLogo ?? null;
  return { homeId, awayId, homeName, awayName, homeLogo, awayLogo };
}

// GET /api/v1/match/:id — Canonical Match Object + live-synced ML markets
router.get('/:id', async (req, res) => {
  try {
    const matchId = String(req.params.id);
    const dateHint = req.query.date || null;

    // 1. Base match: local snapshots first, Firestore fallback
    let baseMatch = await findLocalMatch(matchId, dateHint);

    if (!baseMatch) {
      baseMatch = await getDocCached('active_predictions', matchId);
      if (!baseMatch) baseMatch = await getDocCached('finished_matches', matchId);
    }

    if (!baseMatch) {
      return res.status(404).json({ success: false, error: 'Match not found', matchId });
    }

    // 2. Deep intelligence — both id AND name sent; the service's
    //    two-stage resolver uses whichever resolves
    const t = extractTeams(baseMatch);

    let intelligence = null;
    try {
      intelligence = await MatchIntelligenceService.getMatchIntelligence({
        homeId: t.homeId, awayId: t.awayId,
        home: t.homeName, away: t.awayName,
      });
    } catch (e) {
      console.error('[Match API] Intel fetch failed:', e.message);
    }

    // 3. ML markets from Step 50 daily file
    const kickoff = extractKickoff(baseMatch);
    const dateStr = kickoff ? String(kickoff).slice(0, 10) : getDateOffset(0);
    const marketsMap = loadMarketsForDate(dateStr);
    let markets = marketsMap ? (marketsMap.get(matchId) || null) : null;

    // 4. Serve-time reconciliation — prediction.live_state == fixture state, ALWAYS
    if (markets) {
      const synced = liveSync.sync({ markets }, baseMatch);
      markets = synced ? synced.markets : null;
    }

    const isFinished = FINISHED.has(baseMatch.status);
    if (isFinished) markets = null; // never serve predictions for finished matches

    const canonicalMatch = {
      identity: {
        id: matchId,
        source: baseMatch.source || 'zokascore',
        lastUpdated: baseMatch.updatedAt || new Date().toISOString(),
      },
      competition: {
        id: String(baseMatch.league?.id ?? baseMatch.leagueId ?? ''),
        name: baseMatch.league?.name ?? baseMatch.leagueName ?? 'Unknown',
        mustHave: baseMatch.mustHave ?? false,
      },
      status: baseMatch.status || 'NS',
      kickoff,
      teams: {
        home: { id: String(t.homeId || ''), name: t.homeName || 'TBD', logo: t.homeLogo },
        away: { id: String(t.awayId || ''), name: t.awayName || 'TBD', logo: t.awayLogo },
      },
      score: { home: baseMatch.homeScore ?? null, away: baseMatch.awayScore ?? null },
      odds: baseMatch.odds || null,
      mustHave: baseMatch.mustHave ?? false,
      pickGroups: baseMatch.pick_groups || null,
      intelligence: intelligence ? {
        elo: {
          home: intelligence.home?.elo ?? null,
          away: intelligence.away?.elo ?? null,
        },
        form: {
          home: intelligence.home?.form || [],
          away: intelligence.away?.form || [],
        },
        h2h: intelligence.h2h || null,
        goalPatterns: {
          home: intelligence.home?.goalPatterns || {},
          away: intelligence.away?.goalPatterns || {},
        },
      } : null,
      markets,
      mlPredictions: markets,   // frontend aliases
      mlPrediction: markets,
      zokaPrediction: intelligence?.zokaPick || null,
    };

    res.json({ success: true, data: canonicalMatch });
  } catch (err) {
    console.error('[Match Route] Error fetching canonical match:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;