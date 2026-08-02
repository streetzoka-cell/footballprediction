// backend-v1/scripts/cleanStale.js
// One-shot OFFLINE cleaner. Rewrites live.json + past fixtures files.
// No network, no quota, no Firestore. Safe & idempotent.
// Run:  node scripts/cleanStale.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public_data');
const FIX = path.join(PUB, 'fixtures');
const RES = path.join(PUB, 'results');

const FT_FORCE_MS = 125 * 60 * 1000;   // 2h05m hard cap
const STUCK_MS    = 115 * 60 * 1000;   // 1h55m stuck-at-90
const LIVE_CAP_MS = 3.5 * 60 * 60 * 1000;
const NOW = Date.now();
const TODAY_UTC = new Date().toISOString().slice(0, 10);

const clean = (s) => String(s || '').toLowerCase().replace(/fc|afc|cf|sc|club|team|reserves|ii/g, '').replace(/[^a-z0-9]/g, '').trim();
const keyOf = (m) => String(m.id || `${clean(m.homeTeamName || m.homeTeam?.name)}-${clean(m.awayTeamName || m.awayTeam?.name)}`);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const arrOf = (parsed) => {
  if (!parsed) return { arr: [], wrapper: null };
  if (Array.isArray(parsed)) return { arr: parsed, wrapper: null };
  if (Array.isArray(parsed.data)) return { arr: parsed.data, wrapper: parsed };
  return { arr: [], wrapper: parsed };
};
const writeBack = (p, wrapper, arr) => {
  const out = wrapper ? { ...wrapper, data: arr, count: arr.length } : arr;
  fs.writeFileSync(p, JSON.stringify(out));
};

// Is this match genuinely still in play right now?
function isEffectivelyLive(m) {
  if (m.status === 'FT' || m.display?.isFinished === true) return false;
  const startMs = m.timestamp ? m.timestamp * 1000 : 0;
  if (!startMs) return true;
  const elapsed = NOW - startMs;
  if (elapsed > LIVE_CAP_MS) return false;
  const minute = m.display?.minute ?? m.minute ?? 0;
  if (minute >= 90 && elapsed > STUCK_MS) return false;
  return true;
}

function markFT(m) {
  m.status = 'FT';
  m.isLive = false;
  m.minute = 90;
  if (m.display) {
    m.display.isLive = false;
    m.display.isFinished = true;
    m.display.minute = 90;
    if (m.display.score) { m.display.score.home = m.homeScore; m.display.score.away = m.awayScore; }
  }
  return m;
}

function appendResults(date, toAdd) {
  if (!toAdd.length) return;
  const p = path.join(RES, `${date}.json`);
  const { arr, wrapper } = arrOf(readJson(p));
  const map = new Map();
  arr.forEach((m) => map.set(keyOf(m), m));
  toAdd.forEach((m) => map.set(keyOf(m), m));
  writeBack(p, wrapper || { date }, [...map.values()]);
}

// ── 1. Clean live.json (drop every stale/dead match) ────────────────
const livePath = path.join(PUB, 'live.json');
const liveParsed = readJson(livePath);
if (liveParsed) {
  const { arr, wrapper } = arrOf(liveParsed);
  const kept = arr.filter(isEffectivelyLive);
  writeBack(livePath, wrapper, kept);
  console.log(`[clean] live.json: ${arr.length} → ${kept.length} (dropped ${arr.length - kept.length} stale)`);
} else {
  console.log('[clean] live.json: not found (nothing to do)');
}

// ── 2. Clean every PAST fixtures file ───────────────────────────────
if (fs.existsSync(FIX)) {
  for (const file of fs.readdirSync(FIX).filter((f) => f.endsWith('.json'))) {
    const date = file.replace('.json', '');
    if (date >= TODAY_UTC) continue; // never touch today / future
    const p = path.join(FIX, file);
    const { arr, wrapper } = arrOf(readJson(p));
    if (!arr.length) continue;

    const keep = [];
    const toResults = [];
    let dropped = 0;

    for (const m of arr) {
      const elapsed = m.timestamp ? NOW - m.timestamp * 1000 : 1e12; // no timestamp on a past date = treat as over
      const minute = m.display?.minute ?? m.minute ?? 0;
      const atNinety = minute >= 90 || m.status === '90' || m.status === '2H' || m.display?.isFinished;
      const isOver = m.status === 'FT' || m.display?.isFinished === true || elapsed > FT_FORCE_MS || (atNinety && elapsed > STUCK_MS);

      if (!isOver) { keep.push(m); continue; }

      const hasScore = m.homeScore != null && m.awayScore != null;
      if (hasScore) {
        toResults.push(markFT({ ...m })); // move finished+scored → results
      } else {
        dropped++; // scoreless & over = noise, drop entirely
      }
    }

    writeBack(p, wrapper, keep);
    appendResults(date, toResults);
    console.log(`[clean] fixtures/${file}: kept ${keep.length}, → results ${toResults.length}, dropped ${dropped}`);
  }
}

console.log('[clean] Done. (Apply the code fix + pm2 restart so this stays clean.)');