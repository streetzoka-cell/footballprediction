// backend-v1/src/services/PredictionGroupsFallbackBuilder.js
'use strict';

const logger = require('../utils/logger');
const MLPredictionEngine = require('./MLPredictionEngine');
const localSnapshotRepo = require('../repositories/LocalSnapshotRepository');

const BATCH_SIZE = 10;

/* Safety-net thresholds — calibrated to Step 49 honest accuracies.
   NOT a second source of truth; the pipeline's pick_groups always wins. */
const THRESHOLDS = {
  HOME_WIN: 0.55, AWAY_WIN: 0.55, DRAW: 0.32,
  GG: 0.60, NG: 0.60,
  OVER_0_5: 0.92, UNDER_0_5: 0.92,
  OVER_1_5: 0.72, UNDER_1_5: 0.72,
  OVER_2_5: 0.57, UNDER_2_5: 0.57,
  OVER_3_5: 0.66, UNDER_3_5: 0.66,
  CORRECT_SCORE: 0.12,
};

const FAMILY_TITLES = {
  HOME_WIN: '🔒 HOME WINS (1X2)', AWAY_WIN: '🔒 AWAY WINS (1X2)', DRAW: '🤝 DRAWS (1X2)',
  GG: '⚽ GG — BTTS YES', NG: '🚫 NG — BTTS NO',
  OVER_0_5: '📈 OVER 0.5', UNDER_0_5: '📉 UNDER 0.5',
  OVER_1_5: '📈 OVER 1.5', UNDER_1_5: '📉 UNDER 1.5',
  OVER_2_5: '📈 OVER 2.5', UNDER_2_5: '📉 UNDER 2.5',
  OVER_3_5: '📈 OVER 3.5', UNDER_3_5: '📉 UNDER 3.5',
  CORRECT_SCORE: '🎯 CORRECT SCORE',
};

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const ouLine = (key) => { const m = String(key).match(/(\d)_(\d)/); return m ? `${m[1]}_${m[2]}` : null; };
const chunk = (arr, size) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };

function extractPicks(pred) {
  const m = pred.markets || {};
  const picks = [];

  const p1 = m['1x2'] || m['1X2'];
  if (p1?.probabilities) {
    const pr = p1.probabilities;
    const cands = [
      ['HOME_WIN', num(pr.HOME_WIN)],
      ['DRAW', num(pr.DRAW)],
      ['AWAY_WIN', num(pr.AWAY_WIN)],
    ].filter(([, v]) => v != null);
    if (cands.length) {
      const [pick, conf] = cands.sort((a, b) => b[1] - a[1])[0];
      picks.push({ family: pick, market: '1X2', pick: pick.replace('_', ' '), conf });
    }
  }

  for (const key of Object.keys(m)) {
    if (!/^ou_\d_\d$/.test(key) && !/^over_under_\d_\d$/.test(key)) continue;
    const line = ouLine(key);
    const over = num(m[key]?.probabilities?.OVER);
    if (line == null || over == null) continue;
    const pick = over >= 0.5 ? 'OVER' : 'UNDER';
    const conf = pick === 'OVER' ? over : 1 - over;
    picks.push({ family: `${pick}_${line}`, market: `O/U ${line.replace('_', '.')}`, pick: `${pick} ${line.replace('_', '.')}`, conf });
  }

  const btts = m.btts || m.BTTS;
  if (btts?.probabilities) {
    const y = num(btts.probabilities.YES);
    const n = num(btts.probabilities.NO);
    if (y != null && n != null) {
      const yes = y >= n;
      picks.push({ family: yes ? 'GG' : 'NG', market: 'BTTS', pick: yes ? 'GG (BTTS YES)' : 'NG (BTTS NO)', conf: Math.max(y, n) });
    }
  }

  const cs = m.correct_score || m.cs || m.CS;
  if (cs) {
    const pick = cs.pick || cs.score || null;
    const conf = num(cs.probability ?? cs.prob ?? cs.confidence);
    if (pick && conf != null) {
      picks.push({ family: 'CORRECT_SCORE', market: 'Correct Score', pick: `CS ${pick}`, conf });
    }
  }

  return picks;
}

async function buildGroups(date) {
  const preds = MLPredictionEngine.getPredictionsForDate(date);
  if (!Array.isArray(preds) || preds.length === 0) {
    return { date, generatedAt: new Date().toISOString(), sourceCount: 0, considered: 0, groups: {}, count: 0 };
  }

  const snap = await localSnapshotRepo.getFixtureSnapshot(date);
  const fxMap = new Map();
  (snap.all || []).forEach((fx) => {
    fxMap.set(String(fx.id), fx);
    Object.values(fx.ids || {}).forEach((v) => fxMap.set(String(v), fx));
  });

  const buckets = new Map();
  let considered = 0;

  for (const p of preds) {
    const fx = fxMap.get(String(p.matchId));
    const base = {
      matchId: String(p.matchId),
      home: fx?.homeTeamName || fx?.homeName || p.homeTeam?.name || 'Home',
      away: fx?.awayTeamName || fx?.awayName || p.awayTeam?.name || 'Away',
      league: fx?.leagueName || p.league || '',
      kickoff: fx?.utcDate || fx?.date || p.date || null,
      mustHave: !!fx?.mustHave,
    };

    const picks = extractPicks(p);
    if (!picks.length) continue;
    considered++;

    for (const pk of picks) {
      if (pk.conf < (THRESHOLDS[pk.family] ?? 1)) continue;
      if (!buckets.has(pk.family)) buckets.set(pk.family, []);
      buckets.get(pk.family).push({ ...base, market: pk.market, pick: pk.pick, confidence: Math.round(pk.conf * 1000) / 10, quality: 'STANDARD' });
    }
  }

  const groups = {};
  for (const [family, list] of buckets.entries()) {
    list.sort((a, b) => b.confidence - a.confidence || (b.mustHave ? 1 : 0) - (a.mustHave ? 1 : 0));
    const batches = chunk(list, BATCH_SIZE);
    groups[family] = {
      title: FAMILY_TITLES[family] || family,
      tiers: batches.map((matches, i) => ({
        tier: i + 1,
        quality_summary: 'STANDARD (fallback)',
        picks: matches,
      })),
    };
  }

  return {
    date,
    generatedAt: new Date().toISOString(),
    sourceCount: preds.length,
    considered,
    groups,
    count: Object.keys(groups).length,
  };
}

module.exports = { buildGroups, BATCH_SIZE };