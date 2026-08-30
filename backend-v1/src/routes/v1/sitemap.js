// backend-v1/src/routes/v1/sitemap.js — v3 (FULL, drop-in)
// ─────────────────────────────────────────────────────────────────────────────
// Public surface (non-guessable, no "sitemap" in the name):
//   https://zokascore.xyz/zokascore-index.xml           → sitemapindex
//   https://zokascore.xyz/zokascore-index/static.xml    → static pages
//   https://zokascore.xyz/zokascore-index/matches-N.xml → match URLs (40k/chunk)
//   https://zokascore.xyz/zokascore-index/teams-N.xml   → team URLs
//   https://zokascore.xyz/zokascore-index/leagues-N.xml → league URLs
//   https://zokascore.xyz/zokascore-index/status.json   → debug counts
// Old public names (/sitemap.xml, /sitemaps/*) → 410 Gone.
// RENAME ONCE: set INDEX_NAME here AND in the Vercel proxy env.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const fs = require("fs").promises;
const path = require("path");

const router = express.Router();

/* ── CONFIG ─────────────────────────────────────────────────────────────── */
const HOST = "https://zokascore.xyz";
const INDEX_NAME = process.env.INDEX_NAME || "zokascore-index"; // ← rename here (+ Vercel)
const FIXTURES_DIR = path.join(process.cwd(), "public_data", "fixtures");
const RESULTS_DIR = path.join(process.cwd(), "public_data", "results");
const MAX_URLS_PER_SITEMAP = 40000;   // spec hard limit is 50,000 — stay under
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
const REBUILD_TIMEOUT = 30000;        // never let a hung fs read pin requests

/* ── CACHE — only mutated AFTER a successful rebuild, so failures
      automatically keep serving the last good data (stale-safe) ─────────── */
const cache = {
  static: null,
  matches: [],   // ★ arrays, never null — old code could 500 on .forEach
  teams: [],
  leagues: [],
  lastUpdated: 0,
  counts: { matches: 0, teams: 0, leagues: 0, records: 0 },
};
let rebuildPromise = null;

/* ── HELPERS ────────────────────────────────────────────────────────────── */
const createSlug = (v) =>
  String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const escapeXml = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const chunkArray = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// Relative logo paths are INVALID in <image:loc> — absolute URLs only
const absoluteUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

const buildUrlset = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>`;

// ★ Broad shape support: [...], {matches}, {response:{matches}}, {data:{matches}}, {data:[...]}
const pickRecords = (p) =>
  Array.isArray(p) ? p :
  Array.isArray(p?.matches) ? p.matches :
  Array.isArray(p?.response?.matches) ? p.response.matches :
  Array.isArray(p?.data?.matches) ? p.data.matches :
  Array.isArray(p?.data) ? p.data : [];

async function readJsonFiles(dir) {
  try { await fs.access(dir); } catch { return []; } // missing dir ≠ crash
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      out.push(...pickRecords(JSON.parse(await fs.readFile(path.join(dir, f), "utf8"))));
    } catch (e) {
      console.error(`[Sitemap] Failed to read ${f}:`, e.message);
    }
  }
  return out;
}

/* ── RECORD SHAPE ───────────────────────────────────────────────────────── */
const getHomeName = (m) => m.homeName || m.homeTeam?.name || null;
const getAwayName = (m) => m.awayName || m.awayTeam?.name || null;
const isValidMatch = (m) => m && m.id && getHomeName(m) && getAwayName(m);

// ★ FUTURE-DATED lastmod fix: fixture kickoff is days ahead → Google ignores
// future lastmod (and distrusts feeds that emit them). Clamp everything to now.
const getLastModified = (m) => {
  for (const v of [m.updatedAt, m.lastUpdated, m.modifiedAt, m.createdAt, m.date]) {
    if (!v) continue;
    const t = new Date(v).getTime();
    if (!Number.isNaN(t)) return new Date(Math.min(t, Date.now())).toISOString();
  }
  return null;
};

/* ── URL BUILDERS ───────────────────────────────────────────────────────── */
const matchXml = (m) => {
  const slug = `${createSlug(getHomeName(m))}-vs-${createSlug(getAwayName(m))}`;
  const lastmod = getLastModified(m);
  return `<url>\n  <loc>${escapeXml(`${HOST}/match/${encodeURIComponent(String(m.id))}/${slug}`)}</loc>\n` +
    `${lastmod ? `  <lastmod>${lastmod}</lastmod>\n` : ""}  <changefreq>daily</changefreq>\n  <priority>0.9</priority>\n</url>`;
};

const teamXml = (id, name, logo) => {
  const img = logo
    ? `\n  <image:image>\n    <image:loc>${escapeXml(logo)}</image:loc>\n    <image:title>${escapeXml(name)} Logo</image:title>\n  </image:image>`
    : "";
  return `<url>\n  <loc>${escapeXml(`${HOST}/team/${encodeURIComponent(String(id))}/${createSlug(name)}`)}</loc>\n  <changefreq>daily</changefreq>\n  <priority>0.7</priority>${img}\n</url>`;
};

const leagueXml = (id, name, logo) => {
  const img = logo
    ? `\n  <image:image>\n    <image:loc>${escapeXml(logo)}</image:loc>\n    <image:title>${escapeXml(name)} Logo</image:title>\n  </image:image>`
    : "";
  return `<url>\n  <loc>${escapeXml(`${HOST}/league/${encodeURIComponent(String(id))}/${createSlug(name)}`)}</loc>\n  <changefreq>daily</changefreq>\n  <priority>0.8</priority>${img}\n</url>`;
};

/* ── STATIC PAGES ───────────────────────────────────────────────────────── */
// /search + /studio INTENTIONALLY ABSENT (noindexed → "noindex" errors in GSC).
const STATIC_PAGES = [
  { path: "/", priority: "1.0", changefreq: "hourly" },
  { path: "/fixtures", priority: "0.9", changefreq: "hourly" },
  { path: "/results", priority: "0.9", changefreq: "daily" },
  { path: "/predictions", priority: "0.9", changefreq: "daily" },
  { path: "/predictions/v21", priority: "0.8", changefreq: "daily" },
  { path: "/mastergames", priority: "0.8", changefreq: "daily" },
  { path: "/leaderboard", priority: "0.8", changefreq: "hourly" },
  { path: "/highlights", priority: "0.8", changefreq: "daily" },
  { path: "/livestream", priority: "0.8", changefreq: "daily" },
  { path: "/basketball", priority: "0.7", changefreq: "daily" },
  { path: "/football-knowledge", priority: "0.6", changefreq: "weekly" },
  { path: "/developers", priority: "0.5", changefreq: "weekly" },
  { path: "/changelog", priority: "0.4", changefreq: "weekly" },
  { path: "/status", priority: "0.4", changefreq: "daily" },
  { path: "/about", priority: "0.5", changefreq: "monthly" },
  { path: "/faq", priority: "0.5", changefreq: "monthly" },
  { path: "/help-center", priority: "0.5", changefreq: "monthly" },
  { path: "/contact", priority: "0.5", changefreq: "monthly" },
  { path: "/careers", priority: "0.5", changefreq: "monthly" },
  { path: "/partners", priority: "0.5", changefreq: "monthly" },
  { path: "/advertise", priority: "0.5", changefreq: "monthly" },
  { path: "/team", priority: "0.5", changefreq: "monthly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
];

/* ── REBUILD (single-flight + timeout-guarded) ──────────────────────────── */
async function doRebuild() {
  const started = Date.now();
  const [fixtures, results] = await Promise.all([
    readJsonFiles(FIXTURES_DIR),
    readJsonFiles(RESULTS_DIR),
  ]);
  const all = [...fixtures, ...results];

  const seenM = new Set(), seenT = new Set(), seenL = new Set();
  const matchUrls = [], teamUrls = [], leagueUrls = [];

  const pushLeague = (id, name, logo) => {
    const k = String(id);
    if (id && name && !seenL.has(k)) { seenL.add(k); leagueUrls.push(leagueXml(k, name, logo)); }
  };
  const pushTeam = (id, name, logo) => {
    const k = String(id);
    if (id && name && !seenT.has(k)) { seenT.add(k); teamUrls.push(teamXml(k, name, logo)); }
  };

  for (const m of all) {
    if (isValidMatch(m)) {
      const k = String(m.id);
      if (!seenM.has(k)) { seenM.add(k); matchUrls.push(matchXml(m)); }
    }
    pushLeague(m.league?.id || m.leagueId, m.league?.name || m.leagueName, absoluteUrl(m.league?.emblem || m.leagueLogo));
    pushTeam(m.homeTeam?.id || m.homeTeamId, m.homeTeam?.name || m.homeName, absoluteUrl(m.homeTeam?.logo || m.homeLogo));
    pushTeam(m.awayTeam?.id || m.awayTeamId, m.awayTeam?.name || m.awayName, absoluteUrl(m.awayTeam?.logo || m.awayLogo));
  }

  Object.assign(cache, {
    static: buildUrlset(STATIC_PAGES.map((p) =>
      `<url>\n  <loc>${escapeXml(`${HOST}${p.path}`)}</loc>\n  <changefreq>${p.changefreq}</changefreq>\n  <priority>${p.priority}</priority>\n</url>`)),
    matches: chunkArray(matchUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset),
    teams: chunkArray(teamUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset),
    leagues: chunkArray(leagueUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset),
    lastUpdated: Date.now(),
    counts: { matches: matchUrls.length, teams: teamUrls.length, leagues: leagueUrls.length, records: all.length },
  });

  console.log(`[Sitemap] rebuilt in ${Date.now() - started}ms — matches:${cache.counts.matches} teams:${cache.counts.teams} leagues:${cache.counts.leagues} records:${cache.counts.records}`);
}

const isFresh = () => cache.static && Date.now() - cache.lastUpdated < CACHE_TTL;

function ensureCache() {
  if (isFresh()) return Promise.resolve();
  if (!rebuildPromise) {
    rebuildPromise = Promise.race([
      doRebuild(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("rebuild timeout")), REBUILD_TIMEOUT)),
    ])
      .catch((e) => console.error("[Sitemap] rebuild failed (serving stale):", e.message))
      .finally(() => { rebuildPromise = null; });
  }
  return rebuildPromise;
}

// Fire-and-forget warm-up → the first crawler hit never sees "warming up"
ensureCache();

/* ── SERVING ────────────────────────────────────────────────────────────── */
function serveXml(req, res, xml) {
  const etag = `"${INDEX_NAME}-${cache.lastUpdated}"`;
  res.set({
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    ETag: etag,
    "Last-Modified": new Date(cache.lastUpdated).toUTCString(),
  });
  if (req.headers["if-none-match"] === etag) return res.status(304).end(); // cheap revalidation for Google
  return res.status(200).send(xml);
}

// ★ Children locs use the PUBLIC frontend path — NOT /sitemaps/* (that 410s now)
const sitemapEntry = (file, lastmod) =>
  `\n  <sitemap>\n    <loc>${escapeXml(`${HOST}/${INDEX_NAME}/${file}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`;

/* ── ROUTES — order matters: specific BEFORE the :file catch-all,
      otherwise /:file swallows /status.json and returns 404 ─────────────── */

// 1) Legacy public names → 410 Gone (matters if this router is mounted at
//    domain root; harmless otherwise — the Vercel edge 410s these anyway).
router.get(["/sitemap.xml", "/zokascore-sitemap.xml", "/sitemaps/:legacy"], (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.status(410).type("text/plain").send("Gone — index moved.");
});

// 2) Debug endpoint — the "why is my index empty" answer machine
router.get("/status.json", async (_req, res) => {
  try { await ensureCache(); } catch {}
  const dirStat = async (dir) => {
    try {
      const jsonFiles = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).length;
      return { exists: true, jsonFiles };
    } catch { return { exists: false, jsonFiles: 0 }; }
  };
  res.set("Cache-Control", "no-store").json({
    ok: !!cache.static,
    indexName: INDEX_NAME,
    publicIndexUrl: `${HOST}/${INDEX_NAME}.xml`,
    mountHint: `/api/v1/${INDEX_NAME}`,
    lastUpdated: cache.lastUpdated,
    ageMinutes: cache.lastUpdated ? Math.round((Date.now() - cache.lastUpdated) / 60000) : null,
    counts: cache.counts,
    chunks: { matches: cache.matches.length, teams: cache.teams.length, leagues: cache.leagues.length },
    dirs: {
      fixtures: { path: FIXTURES_DIR, ...(await dirStat(FIXTURES_DIR)) },
      results: { path: RESULTS_DIR, ...(await dirStat(RESULTS_DIR)) },
    },
  });
});

// 3) Index → <sitemapindex> pointing at HOST/{INDEX_NAME}/... (public paths)
router.get("/", async (req, res) => {
  try { await ensureCache(); } catch {}
  if (!cache.static) {
    res.setHeader("Retry-After", "60");
    return res.status(503).type("text/plain").send("Warming up — retry shortly.");
  }
  const lastmod = new Date(cache.lastUpdated).toISOString();
  const entries = [sitemapEntry("static.xml", lastmod)];
  cache.matches.forEach((_, i) => entries.push(sitemapEntry(`matches-${i + 1}.xml`, lastmod)));
  cache.teams.forEach((_, i) => entries.push(sitemapEntry(`teams-${i + 1}.xml`, lastmod)));
  cache.leagues.forEach((_, i) => entries.push(sitemapEntry(`leagues-${i + 1}.xml`, lastmod)));
  serveXml(req, res, `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("")}\n</sitemapindex>`);
});

// 4) Children: static.xml, matches-N.xml, teams-N.xml, leagues-N.xml
router.get("/:file", async (req, res) => {
  try { await ensureCache(); } catch {}
  const file = String(req.params.file || "");
  let xml = file === "static.xml" ? cache.static : null;
  if (!xml) {
    const m = file.match(/^(matches|teams|leagues)-(\d+)\.xml$/);
    if (m) {
      const i = parseInt(m[2], 10) - 1;
      const chunks = cache[m[1]];
      if (chunks && i >= 0 && i < chunks.length) xml = chunks[i];
    }
  }
  if (!xml) return res.status(404).type("text/plain").send("Not found");
  serveXml(req, res, xml);
});

module.exports = router;

/* ── server.js — MOUNT (path MUST match INDEX_UPSTREAM on Vercel) ─────────
   const INDEX_NAME = process.env.INDEX_NAME || "zokascore-index";
   app.use(`/api/v1/${INDEX_NAME}`, require("./routes/v1/sitemap"));

   Vercel env:
     INDEX_NAME     = zokascore-index
     INDEX_UPSTREAM = https://api.zokascore.xyz/api/v1/zokascore-index
─────────────────────────────────────────────────────────────────────────────*/