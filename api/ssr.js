// api/ssr.js — SSR meta injection for entity pages. v2:
// ★ shape-flexible parsing (API nesting won't silently break it)
// ★ ?__ssr_debug=1 → JSON diagnostics instead of HTML
// ★ 4s fetch timeout, Accept header, error capture
import fs from "fs";
import path from "path";

const API_BASE = process.env.SSR_API_BASE || "https://api.zokascore.xyz/api/v1";
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
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status, json: null, ms: Date.now() - t0 };
    const json = await res.json().catch(() => null);
    return { ok: true, status: res.status, json, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, json: null, error: e?.message || "fetch failed", ms: Date.now() - t0 };
  }
}

// ★ Try every response layout we've seen: json.data, json.match, json.data.match,
//   json.response, or bare json — with every team-name spelling.
function extractMatch(json) {
  for (const c of [json?.data, json?.match, json?.data?.match, json?.response, json]) {
    if (!c || typeof c !== "object") continue;
    const home = c.homeTeam?.name || c.home?.name || c.homeName || c.teams?.home?.name || null;
    const away = c.awayTeam?.name || c.away?.name || c.awayName || c.teams?.away?.name || null;
    if (home && away) {
      return {
        home, away,
        league: c.league?.name || c.competition?.name || c.leagueName || "",
        image: c.homeTeam?.logo || c.teams?.home?.logo || null,
      };
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

// Shape description for the debug endpoint — shows what the API actually sent
function describeShape(json) {
  if (json == null) return "null";
  if (Array.isArray(json)) return `array(${json.length})`;
  const top = Object.keys(json).slice(0, 12).join(",");
  const dataKeys = json.data && typeof json.data === "object" && !Array.isArray(json.data)
    ? ` | data: ${Object.keys(json.data).slice(0, 12).join(",")}` : "";
  return `{${top}}${dataKeys}`;
}

async function buildMeta(pathname) {
  const mMatch = pathname.match(/^\/match\/([^/]+)/);
  if (mMatch) {
    const r = await fetchJson(`${API_BASE}/match/${mMatch[1]}`);
    const m = extractMatch(r.json);
    return m
      ? { meta: {
          title: `${m.home} vs ${m.away} Live Score, Prediction & H2H | ZOKASCORE`,
          description: `${m.home} vs ${m.away}${m.league ? ` (${m.league})` : ""} live score, lineups, head-to-head and AI prediction on ZOKASCORE.`,
          url: `${SITE_URL}${pathname}`,
          image: m.image || undefined,
        }, diag: { endpoint: `/match/${mMatch[1]}`, status: r.status, ms: r.ms, error: r.error, extracted: m } }
      : { meta: null, diag: { endpoint: `/match/${mMatch[1]}`, status: r.status, ms: r.ms, error: r.error, shape: describeShape(r.json) } };
  }

  const tMatch = pathname.match(/^\/team\/([^/]+)/);
  if (tMatch) {
    const r = await fetchJson(`${API_BASE}/teams/${tMatch[1]}`);
    const t = extractTeam(r.json);
    return t
      ? { meta: {
          title: `${t.name} Live Scores, Fixtures, Results & Stats | ZOKASCORE`,
          description: `${t.name} fixtures, results, standings and player stats. Live scores and schedule on ZOKASCORE.`,
          url: `${SITE_URL}${pathname}`,
          image: t.image || undefined,
        }, diag: { endpoint: `/teams/${tMatch[1]}`, status: r.status, ms: r.ms, error: r.error, extracted: t } }
      : { meta: null, diag: { endpoint: `/teams/${tMatch[1]}`, status: r.status, ms: r.ms, error: r.error, shape: describeShape(r.json) } };
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
      }, diag: { endpoint: `/standings?league=${lMatch[2]}`, status: r.status, ms: r.ms, error: r.error, extracted: l || describeShape(r.json) } };
  }

  const hMatch = pathname.match(/^\/highlights\/(.+)/);
  if (hMatch) {
    const pretty = decodeURIComponent(hMatch[1]).replace(/-\d+$/, "").split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return { meta: {
        title: `${pretty} — Highlights, Goals & Recap | ZOKASCORE`,
        description: `Watch ${pretty} highlights: every goal, key moment and the full match recap on ZOKASCORE.`,
        url: `${SITE_URL}${pathname}`,
      }, diag: { endpoint: null, note: "highlight slug (no API call)" } };
  }

  return { meta: null, diag: { note: "no entity pattern matched — plain SPA route" } };
}

export default async function handler(req, res) {
  const baseHtml = getBaseHtml();
  const pathname = req.url.split("?")[0].replace(/\/$/, "") || "/";

  try {
    const { meta, diag } = await buildMeta(pathname);

    // ★ DEBUG: /match/<id>/x?__ssr_debug=1 → JSON report instead of HTML
    if (req.query.__ssr_debug) {
      return res.status(200).json({
        pathname, apiBase: API_BASE, injected: !!meta, meta, diag,
        hint: "status:0 = fetch failed/timeout · shape shows what the API returned · extracted:null = shape mismatch",
      });
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(meta ? injectMeta(baseHtml, meta) : baseHtml);
  } catch {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(baseHtml);
  }
}