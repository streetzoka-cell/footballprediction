// backend-v1/src/services/PickGroupResolver.js
'use strict';

const path = require('path');
const logger = require('../utils/logger');
const { readJSONSafe } = require('../utils/atomicWriter');

const RESULTS_DIR = path.join(process.cwd(), 'public_data', 'results');

/* ── results/<date>.json → Map(matchId → { home, away }) ── */
async function loadResults(date) {
  const map = new Map();
  const payload = await readJSONSafe(path.join(RESULTS_DIR, `${date}.json`), null);
  const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);

  for (const m of list) {
    const h = Number(m.homeScore ?? m.goalsHome ?? m.display?.score?.home);
    const a = Number(m.awayScore ?? m.goalsAway ?? m.display?.score?.away);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;

    const id = String(m.id ?? m.matchId ?? '');
    if (id) map.set(id, { home: h, away: a });
    // provider-id aliases (unified fixtures carry ids maps)
    if (m.ids && typeof m.ids === 'object') {
      Object.values(m.ids).forEach((v) => { if (v != null) map.set(String(v), { home: h, away: a }); });
    }
  }
  return map;
}
/* ── detect the market from defensive field variants ── */
function detectMarket(pick) {
  const market = String(pick.market || pick.marketName || '').toUpperCase().replace(/_/g, ' ');
  const label = String(pick.pick || pick.label || pick.prediction || pick.selection || '').toUpperCase().replace(/_/g, ' ');
  const text = `${market} | ${label}`;
  const hasBTTS = /\bGG\b|\bNG\b|BTTS/.test(text);

  // 1X2 (guarded against O/U & BTTS tokens)
  if (!hasBTTS && !/\bOVER\b|\bUNDER\b/.test(text)) {
    if (/\bHOME\b/.test(text)) return { type: '1X2', side: 'HOME' };
    if (/\bAWAY\b/.test(text)) return { type: '1X2', side: 'AWAY' };
    if (/\bDRAW\b/.test(text)) return { type: '1X2', side: 'DRAW' };
  }

  // Over/Under — line from the label first ("UNDER 1.5"), then dedicated fields
  const ou = text.match(/\b(OVER|UNDER)\s*O?\s*(\d)(?:\s*[.\-_\s]\s*(\d))?/);
  if (ou) {
    const line = ou[3] != null ? Number(`${ou[2]}.${ou[3]}`) : Number(ou[2]);
    return { type: ou[1], line };
  }

  // ★ bare "OVER"/"UNDER" — hunt the line in dedicated fields or the raw market key
  if (/\b(OVER|UNDER)\b/.test(text)) {
    const side = text.match(/\b(OVER|UNDER)\b/)[1];
    const lineRaw =
      pick.line ?? pick.lineValue ?? pick.marketLine ?? pick.goalsLine ??
      String(pick.market || pick.marketName || '').match(/(\d)\s*[._\-]?\s*(\d)/)?.[0];
    const line = lineRaw != null ? parseFloat(String(lineRaw).replace(/[^0-9.]/g, '')) : null;
    if (Number.isFinite(line)) return { type: side, line };
    return { type: side, line: null }; // resolver will treat as PENDING (honest), not guess
  }

  // BTTS
  if (/\bGG\b|BTTS\s*YES|\bYES\b/.test(text)) return { type: 'BTTS', side: 'YES' };
  if (/\bNG\b|BTTS\s*NO|\bNO\b/.test(text)) return { type: 'BTTS', side: 'NO' };

  // Correct score
  const cs = text.match(/\b(\d{1,2})\s*[-:]\s*(\d{1,2})\b/);
  if (cs) return { type: 'CS', home: Number(cs[1]), away: Number(cs[2]) };

  return null;
}


/* ── one pick vs one final score ── */
function resolvePick(pick, score) {
  if (!score) {
    return { ...pick, result: 'PENDING', finalScore: null };
  }

   const m = detectMarket(pick);
  if (!m) {
    logger.warn?.(`[PickResolver] Unrecognized market for match ${pick.matchId}: "${pick.pick || pick.label}"`);
    return { ...pick, result: 'PENDING', finalScore: `${score.home}-${score.away}` };
  }
  if ((m.type === 'OVER' || m.type === 'UNDER') && m.line == null) {
    return { ...pick, result: 'PENDING', finalScore: `${score.home}-${score.away}` };
  }

  const { home, away } = score;
  const total = home + away;
  let won = false;

  switch (m.type) {
    case '1X2':
      won = m.side === 'HOME' ? home > away : m.side === 'AWAY' ? away > home : home === away;
      break;
    case 'OVER': won = total > m.line; break;
    case 'UNDER': won = total < m.line; break;
    case 'BTTS': won = m.side === 'YES' ? (home > 0 && away > 0) : (home === 0 || away === 0); break;
    case 'CS': won = home === m.home && away === m.away; break;
    default: break;
  }

  return { ...pick, result: won ? 'WON' : 'LOST', finalScore: `${home}-${away}` };
}

const tierPicks = (t) => t.picks || t.matches || t.items || [];

/* ── resolve one tier: stamped picks + W/L/P summary + resolved share text ── */
function resolveTier(tier, resultMap) {
  const picks = tierPicks(tier);
  let won = 0, lost = 0, pending = 0;

  const resolvedPicks = picks.map((p) => {
    const score = resultMap.get(String(p.matchId));
    const r = resolvePick(p, score);
    if (r.result === 'WON') won++;
    else if (r.result === 'LOST') lost++;
    else pending++;
    return r;
  });

  const settled = won + lost;
  const summary = {
    won, lost, pending, settled,
    accuracy: settled > 0 ? Math.round((won / settled) * 100) : null,
    complete: pending === 0 && picks.length > 0,
  };

  return {
    ...tier,
    picks: resolvedPicks,
    results: summary,
    share_text_resolved: composeResolvedShareText(tier, resolvedPicks, summary),
  };
}

/*
 * Resolved share text — SAME structure as the original (title, numbered
 * picks, footer), plus per-pick ✅/❌/⏳ markers and FT scores.
 * The original share_text stays untouched on the tier.
 */
function composeResolvedShareText(tier, resolvedPicks, summary) {
  const orig = String(tier.share_text || tier.shareText || '');
  const origLines = orig.split('\n').filter((l) => l.trim());
  const title = origLines[0] || `${tier.title || 'ZOKASCORE GROUP'}`;

  const settled = summary.settled;
  const head =
    `${title} · ✅ ${summary.won}W ❌ ${summary.lost}L` +
    `${summary.pending ? ` ⏳ ${summary.pending}` : ''}` +
    `${settled > 0 ? ` (${summary.accuracy}%)` : ''}`;

  const body = resolvedPicks.map((p, i) => {
    const mark = p.result === 'WON' ? '✅' : p.result === 'LOST' ? '❌' : '⏳';
    const teams = p.teams || (p.home && p.away ? `${p.home} v ${p.away}` : p.match || '');
    const prob = p.probability ?? p.prob ?? p.confidence;

    const bits = [`${i + 1}. ${mark} ${p.pick || p.label || p.prediction || ''}`];
    if (teams) bits.push(`— ${teams}`);
    if (prob != null) bits.push(`(${prob}%)`);
    if (p.league) bits.push(`· ${p.league}`);
    if (p.finalScore && p.result !== 'PENDING') bits.push(`→ FT ${p.finalScore}`);
    return bits.join(' ');
  });

  const origFooter = origLines.find((l) => l.includes('📅'));
  const footer = [origFooter, '✅ RESULTED · zokascore.xyz'].filter(Boolean).join(' · ');

  return [head, '', ...body, '', footer].join('\n');
}

/* ── whole family map: { FAMILY: { tiers: [...] } } ── */
function resolveGroups(groups, resultMap) {
  if (!groups || typeof groups !== 'object') return groups;
  const out = {};
  let totals = { won: 0, lost: 0, pending: 0, settled: 0 };

  for (const [family, fam] of Object.entries(groups)) {
    if (Array.isArray(fam)) {
      // flat array of tiers
      out[family] = fam.map((t) => resolveTier(t, resultMap));
    } else if (fam && typeof fam === 'object') {
      if (Array.isArray(fam.tiers)) {
        out[family] = { ...fam, tiers: fam.tiers.map((t) => resolveTier(t, resultMap)) };
      } else if (tierPicks(fam).length > 0) {
        // single-tier family (fam IS a tier)
        out[family] = resolveTier({ ...fam, tiers: undefined }, resultMap);
        delete out[family].tiers;
      } else {
        out[family] = fam;
      }
    } else {
      out[family] = fam;
    }

    // accumulate
    const tiers = Array.isArray(out[family]) ? out[family] : (out[family]?.tiers || [out[family]]);
    for (const t of tiers) {
      if (t?.results) {
        totals.won += t.results.won; totals.lost += t.results.lost;
        totals.pending += t.results.pending; totals.settled += t.results.settled;
      }
    }
  }

  return out;
}

function overallSummary(groups) {
  let won = 0, lost = 0, pending = 0;
  const visit = (t) => { if (t?.results) { won += t.results.won; lost += t.results.lost; pending += t.results.pending; } };
  for (const fam of Object.values(groups || {})) {
    if (Array.isArray(fam)) fam.forEach(visit);
    else (fam?.tiers || [fam]).forEach(visit);
  }
  const settled = won + lost;
  return {
    won, lost, pending, settled,
    accuracy: settled > 0 ? Math.round((won / settled) * 100) : null,
  };
}

module.exports = { loadResults, resolvePick, resolveTier, resolveGroups, overallSummary };