'use strict';
/**
 * LIVE PREDICTION SYNC — serve-time reconciliation
 * Invariant: prediction.live_state == current fixture state, ALWAYS.
 * If the fixture has moved past the stored live prediction (snapshot refreshed
 * between Step 50 runs), recompute the gamma-poisson conditional layer from
 * the CURRENT score/minute using the stored prematch xG as prior.
 * Same math as Step 50's build_live_markets — pure function, no I/O.
 */
const LIVE_PRIOR_S = 3.0;
const LIVE_STATUSES = new Set(['1H','2H','HT','ET','BT','P','LIVE','IN_PLAY','PAUSED']);
const FINISHED_STATUSES = new Set(['FT','FIN','FINISHED','AET','AP','PEN','AWARDED','ABAN','SUSP']);

function num(v, d) { const f = parseFloat(v); return Number.isFinite(f) ? f : d; }

function poisson(k, lam) {
  lam = Math.min(Math.max(lam, 0.05), 3.0);
  let p = Math.exp(-lam);
  for (let i = 1; i <= k; i++) p *= lam / i;
  return p;
}

function phaseOf(f) {
  const st = String(f.status || (f.display && f.display.status) || 'NS').toUpperCase();
  if (f.isFinished || (f.display && f.display.isFinished) || FINISHED_STATUSES.has(st)) return 'final';
  if (f.isLive || (f.display && f.display.isLive) || LIVE_STATUSES.has(st)) return 'live';
  return 'prematch';
}

function deriveMinute(f, nowMs) {
  const st = String(f.status || (f.display && f.display.status) || '').toUpperCase();
  const m = num(f.minute ?? (f.display && f.display.minute), 0);
  const ko = num(f.timestamp, 0);
  const elapsed = ko > 0 ? Math.max(0, (nowMs / 1000 - ko) / 60) : 0;
  let T;
  if (st === '1H') T = Math.min(elapsed, 45);
  else if (st === 'HT') T = 45;
  else if (st === '2H') T = Math.min(Math.max(elapsed - 15, 45), 90);
  else if (st === 'ET' || st === 'BT' || st === 'P') T = 90;
  else T = m > 0 ? m : Math.min(elapsed, 90);
  if (m > 0) {
    if (st === '1H') T = Math.min(m, 45);
    else if (st === '2H') T = Math.min(Math.max(m, 45), 90);
  }
  return Math.max(0, T);
}

function buildLive(xgH, xgA, H0, A0, minute, teamState) {
  const T = Math.min(Math.max(minute, 0), 90);
  const R = Math.max(0, 90 - T);
  const t90 = T / 90, S = LIVE_PRIOR_S;
  const thH = (xgH * S + H0) / (S + t90), thA = (xgA * S + A0) / (S + t90);
  const lamH = thH * (R / 90), lamA = thA * (R / 90);
  const N = 8;
  const finals = new Map(); let pH = 0, pD = 0, pA = 0; const overR = new Array(2 * N).fill(0);
  for (let hp = 0; hp < N; hp++) {
    const php = poisson(hp, lamH);
    for (let ap = 0; ap < N; ap++) {
      const p = php * poisson(ap, lamA);
      const Hf = H0 + hp, Af = A0 + ap;
      finals.set(`${Hf}-${Af}`, (finals.get(`${Hf}-${Af}`) || 0) + p);
      if (Hf > Af) pH += p; else if (Hf === Af) pD += p; else pA += p;
      overR[hp + ap] += p;
    }
  }
  let gs = pH + pD + pA;
  if (gs <= 0) { [pH, pD, pA] = H0 > A0 ? [1,0,0] : (H0 === A0 ? [0,1,0] : [0,0,1]); gs = 1; }
  const r3 = x => Math.round(x * 100) / 100;
  const cs = [...finals.entries()].map(([k, v]) => [k, r3(v / gs * 100)])
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v]);
  const csObj = {}; cs.forEach(([k, v]) => { csObj[k] = v; });
  const topCs = cs.length ? cs[0][0] : `${H0}-${A0}`;
  const tot0 = H0 + A0, ssum = overR.reduce((a, b) => a + b, 0) || 1;
  const ou = line => {
    const need = Math.floor(line) + 1, needRem = Math.max(0, need - tot0);
    let o = 0; for (let r = needRem; r < overR.length; r++) o += overR[r];
    return o / ssum;
  };
  let bttsYes;
  if (H0 > 0 && A0 > 0) bttsYes = 1;
  else if (H0 > 0) bttsYes = 1 - Math.exp(-lamA);
  else if (A0 > 0) bttsYes = 1 - Math.exp(-lamH);
  else bttsYes = (1 - Math.exp(-lamH)) * (1 - Math.exp(-lamA));
  const pick13 = pH > pA && pH > pD ? 'HOME_WIN' : (pA > pD ? 'AWAY_WIN' : 'DRAW');
  const p13 = { HOME_WIN: r3(pH / gs * 100), DRAW: r3(pD / gs * 100), AWAY_WIN: r3(pA / gs * 100) };
  const mk = (pm, pick) => ({ probabilities: pm, pick, pick_probability: pm[pick] });
  const markets = {
    mode: 'live', engine: 'live_poisson_gamma',
    live_state: { minute: Math.round(T), remaining_min: Math.round(R * 10) / 10,
                  score: `${H0}-${A0}`, rates_remaining: { home: r3(lamH), away: r3(lamA) } },
    '1x2': { ...mk(p13, pick13), engine: 'live_poisson_gamma' },
    btts: mk({ YES: r3(bttsYes * 100), NO: r3((1 - bttsYes) * 100) }, bttsYes >= 0.5 ? 'YES' : 'NO'),
  };
  [[0.5,'ou_0_5'],[1.5,'ou_1_5'],[2.5,'ou_2_5'],[3.5,'ou_3_5']].forEach(([line, key]) => {
    const o = ou(line);
    markets[key] = mk({ OVER: r3(o * 100), UNDER: r3((1 - o) * 100) }, o >= 0.5 ? 'OVER' : 'UNDER');
  });
  markets.xG = { home: r3(xgH), away: r3(xgA), total: r3(xgH + xgA),
                 remaining_home: r3(lamH), remaining_away: r3(lamA) };
  markets.team_state = teamState;
  markets.correct_scores = csObj;
  return { markets, topCs, topProb: csObj[topCs] || 0 };
}

/**
 * sync(predictionLike, fixture, nowMs) -> { markets, top_correct_score, top_cs_prob } | null
 * null = prediction must NOT be served (finished/postponed match).
 */
function sync(pred, fixture, nowMs = Date.now()) {
  const m = pred && (pred.markets || pred.prediction || pred.mlPredictions);
  if (!m || typeof m !== 'object') return null;
  const phase = phaseOf(fixture);
  if (phase === 'final') return null;                      // finished: never serve
  if (phase === 'prematch') {
    // snapshot reverted to NS (postponed/erroneous) — drop live pred
    return m.mode === 'live' ? null : pred;
  }
  // LIVE:
  const H0 = Math.max(0, parseInt(num(fixture.homeScore, 0), 10) || 0);
  const A0 = Math.max(0, parseInt(num(fixture.awayScore, 0), 10) || 0);
  const minute = deriveMinute(fixture, nowMs);
  const ls = m.live_state || {};
  const staleScore = ls.score !== `${H0}-${A0}`;
  const staleMinute = Math.abs(num(ls.minute, -99) - minute) > 2;
  if (m.mode === 'live' && !staleScore && !staleMinute) return pred;   // fresh enough
  const xg = m.xG || {};
  const xgH = num(xg.home, 1.2), xgA = num(xg.away, 1.0);
  if (m.mode === 'prematch') {
    // prematch pred on a now-live match: recompute conditional from stored prior
    const out = buildLive(xgH, xgA, H0, A0, minute, m.team_state || 'estimated');
    return { markets: out.markets, top_correct_score: out.topCs, top_cs_prob: out.topProb };
  }
  if (!staleScore && !staleMinute) return pred;
  const out = buildLive(xgH, xgA, H0, A0, minute, m.team_state || 'estimated');
  return { markets: out.markets, top_correct_score: out.topCs, top_cs_prob: out.topProb };
}

module.exports = { sync, buildLive, deriveMinute, phaseOf };