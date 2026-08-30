// api/ssr.js v3 — meta source order:
//   1) zokascore-index meta endpoint (has EVERY sitemap id, O(1), fast)
//   2) canonical match/teams API (fallback — 404s for pure fixture ids)
// Debug: ?__ssr_debug=1 → JSON report of every attempt.
import fs from "fs";
import path from "path";

const API_BASE = process.env.SSR_API_BASE || "https://api.zokascore.xyz/api/v1";
const INDEX_API = process.env.INDEX_META_API || "https://api.zokascore.xyz/api/v1/zokascore-index";
const SITE_URL = "https://zokascore.xyz";
const FETCH_TIMEOUT_MS = 4000;

const escapeHtml = (str = "") =>
  String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function getBaseHtml() {
  try {
    const p1 = path.join(process.cwd(), "dist", "index.html");
    const p2 = path.join(process.cwd(), "public", "index.html");
    const p3 = path.join(process.cwd(), "..", "dist", "index.html");
    for (const p of [p1, p2, p3]) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    return fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  } catch {
    return "<!DOCTYPE html><html><head><title>ZOKASCORE</title></head><body><div id='root'></div></body></html>";
  }
}

function injectMeta(html, { title, description, url, image }) {
  let out = html;
  if (title) {
    const t = escapeHtml(title);
    out = out.replace(/<title>.*?<\/title>/, `<title>${t}</title>`);
    out = out.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
    out = out.replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${t}"`);
  }
  if (description) {
    const d = escapeHtml(description);
    out = out.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
    out = out.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
    out = out.replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${d}"`);
  }
  if (url) {
    const u = escapeHtml(url);
    out = out.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${u}"`);
    out = out.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${u}"`);
  }
  if (image) {
    out = out.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escapeHtml(image)}"`);
    out = out.replace(/<meta property="og:image:secure_url" content="[^"]*"/, `<meta property="og:image:secure_url" content="${escapeHtml(image)}"`);
    out = out.replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escapeHtml(image)}"`);
  }
  return out;
}

async function fetchJson(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!res.ok) return { ok: false, status: res.status, json: null, ms: Date.now() - t0 };
    const json = await res.json().catch(() => null);
    return { ok: true, status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: e?.message || "fetch failed", ms: Date.now() - t0 };
  }
}

// Canonical-API shape (data/match/response/bare + every team-name spelling)
function extractMatch(json) {
  for (const c of [json?.data, json?.match, json?.data?.match, json?.response, json]) {
    if (!c || typeof c !== "object") continue;
    const home = c.homeTeam?.name || c.home?.name || c.homeName || c.teams?.home?.name || null;
    const away = c.awayTeam?.name || c.away?.name || c.awayName || c.teams?.away?.name || null;
    if (home && away) {
      return { home, away, league: c.league?.name || c.competition?.name || c.leagueName || "", image: c.homeTeam?.logo || c.teams?.home?.logo || null };
    }
  }
  return null;
}
function extractTeam(json) {
  for (const c of [json?.data, json?.team, json?.response, json]) {
    if (c && typeof c === "object" && c.name) return { name: c.name, image: c.logo || c.crest || null };
  }
  return null;
}
function extractLeague(json) {
  for (const c of [json?.data, json?.response, json]) {
    const name = c?.league?.name || c?.competition?.name || (typeof c?.name === "string" ? c.name : null);
    if (name) return { name };
  }
  return null;
}

async function buildMeta(pathname) {
  const mMatch = pathname.match(/^\/match\/([^/]+)/);
  if (mMatch) {
    const id = mMatch[1];
    const tries = [];

    // 1) Index meta — every sitemap id, in-memory on the backend
    let r = await fetchJson(`${INDEX_API}/meta/match/${id}`);
    let d = r.json?.data;
    tries.push({ src: "index-meta", status: r.status, ms: r.ms, hit: !!(d?.home && d?.away) });

    // 2) Canonical API fallback
    if (!(d?.home && d?.away)) {
      r = await fetchJson(`${API_BASE}/match/${id}`);
      const m = extractMatch(r.json);
      tries.push({ src: "match-api", status: r.status, ms: r.ms, hit: !!m });
      if (m) d = { home: m.home, away: m.away, league: m.league, logo: m.image };
    }

    if (d?.home && d?.away) {
      return { meta: {
          title: `${d.home} vs ${d.away} Live Score, Prediction & H2H | ZOKASCORE`,
          description: `${d.home} vs ${d.away}${d.league ? ` (${d.league})` : ""} live score, lineups, head-to-head and AI prediction on ZOKASCORE.`,
          url: `${SITE_URL}${pathname}`,
          image: d.logo || undefined,
        }, diag: { tries } };
    }
    return { meta: null, diag: { tries } };
  }

  const tMatch = pathname.match(/^\/team\/([^/]+)/);
  if (tMatch) {
    const id = tMatch[1];
    const tries = [];

    let r = await fetchJson(`${INDEX_API}/meta/team/${id}`);
    let d = r.json?.data;
    tries.push({ src: "index-meta", status: r.status, ms: r.ms, hit: !!d?.name });

    if (!d?.name) {
      r = await fetchJson(`${API_BASE}/teams/${id}`);
      const t = extractTeam(r.json);
      tries.push({ src: "teams-api", status: r.status, ms: r.ms, hit: !!t });
      if (t) d = { name: t.name, logo: t.image };
    }

    if (d?.name) {
      return { meta: {
          title: `${d.name} Live Scores, Fixtures, Results & Stats | ZOKASCORE`,
          description: `${d.name} fixtures, results, standings and player stats. Live scores and schedule on ZOKASCORE.`,
          url: `${SITE_URL}${pathname}`,
          image: d.logo || undefined,
        }, diag: { tries } };
    }
    return { meta: null, diag: { tries } };
  }

  const lMatch = pathname.match(/^\/(league|competition)\/([^/]+)/);
  if (lMatch) {
    const r = await fetchJson(`${API_BASE}/standings?league=${lMatch[2]}`);
    const l = extractLeague(r.json);
    const name = l?.name || "Football League";
    return { meta: {
        title: `${name} Table, Live Scores, Fixtures & Results 2026/2027 | ZOKASCORE`,
        description: `Live ${name} standings, fixtures, results and top scorers. Updated hourly on ZOKASCORE.`,
        url: `${SITE_URL}${pathname}`,
      }, diag: { endpoint: `/standings?league=${lMatch[2]}`, status: r.status, ms: r.ms } };
  }

  const hMatch = pathname.match(/^\/highlights\/(.+)/);
  if (hMatch) {
    const pretty = decodeURIComponent(hMatch[1]).replace(/-\d+$/, "").split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { meta: {
        title: `${pretty} — Highlights, Goals & Recap | ZOKASCORE`,
        description: `Watch ${pretty} highlights: every goal, key moment and the full match recap on ZOKASCORE.`,
        url: `${SITE_URL}${pathname}`,
      }, diag: { note: "highlight slug (no API call)" } };
  }

  return { meta: null, diag: { note: "no entity pattern matched — plain SPA route" } };
}

export default async function handler(req, res) {
  const baseHtml = getBaseHtml();
  const pathname = req.url.split("?")[0].replace(/\/$/, "") || "/";

  try {
    const { meta, diag } = await buildMeta(pathname);

    if (req.query.__ssr_debug) {
      return res.status(200).json({ pathname, apiBase: API_BASE, indexApi: INDEX_API, injected: !!meta, meta, diag });
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(meta ? injectMeta(baseHtml, meta) : baseHtml);
  } catch {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(baseHtml);
  }
}