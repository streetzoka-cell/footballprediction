// backend-v1/src/routes/v1/sitemap.js
const express = require("express");
const fs = require("fs").promises; 
const path = require("path");

const router = express.Router();
const HOST = "https://zokascore.xyz";
const FIXTURES_DIR = path.join(process.cwd(), "public_data", "fixtures");
const RESULTS_DIR = path.join(process.cwd(), "public_data", "results");
const MAX_URLS_PER_SITEMAP = 40000;
const CACHE_TTL = 6 * 60 * 60 * 1000;

let sitemapCache = { static: null, matches: null, teams: null, leagues: null, lastUpdated: 0 };
let isRebuilding = false; 

const createSlug = (value) =>
  String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const escapeXml = (value) =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
};

const buildUrlset = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>`;

const readJsonFiles = async (directory) => {
  try {
    await fs.access(directory);
  } catch (e) {
    return []; 
  }
  
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".json"));
  const data = [];
  
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(directory, file), "utf8");
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed?.matches) ? parsed.matches : Array.isArray(parsed?.data) ? parsed.data : [];
      data.push(...records);
    } catch (error) { 
      console.error(`[Sitemap] Failed to read ${file}:`, error.message); 
    }
  }
  return data;
};

const getHomeName = (m) => m.homeName || m.homeTeam?.name || null;
const getAwayName = (m) => m.awayName || m.awayTeam?.name || null;
const isValidMatch = (m) => m && m.id && getHomeName(m) && getAwayName(m);

const getLastModified = (match) => {
  for (const val of [match.updatedAt, match.lastUpdated, match.modifiedAt, match.createdAt, match.date]) {
    if (!val) continue;
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
};

const buildMatchUrl = (match) => {
  const id = String(match.id);
  const slug = `${createSlug(getHomeName(match))}-vs-${createSlug(getAwayName(match))}`;
  const url = `${HOST}/match/${encodeURIComponent(id)}/${slug}`;
  const lastmod = getLastModified(match);
  return `<url>\n  <loc>${escapeXml(url)}</loc>\n  ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}\n  <changefreq>daily</changefreq>\n  <priority>0.9</priority>\n</url>`;
};

const buildTeamUrl = (id, name, logo) => {
  const url = `${HOST}/team/${encodeURIComponent(String(id))}/${createSlug(name)}`;
  let imageXml = '';
  if (logo) imageXml = `\n  <image:image>\n    <image:loc>${escapeXml(logo)}</image:loc>\n    <image:title>${escapeXml(name)} Logo</image:title>\n  </image:image>`;
  return `<url>\n  <loc>${escapeXml(url)}</loc>\n  <changefreq>daily</changefreq>\n  <priority>0.7</priority>${imageXml}\n</url>`;
};

const buildLeagueUrl = (id, name, logo) => {
  const url = `${HOST}/league/${encodeURIComponent(String(id))}/${createSlug(name)}`;
  let imageXml = '';
  if (logo) imageXml = `\n  <image:image>\n    <image:loc>${escapeXml(logo)}</image:loc>\n    <image:title>${escapeXml(name)} Logo</image:title>\n  </image:image>`;
  return `<url>\n  <loc>${escapeXml(url)}</loc>\n  <changefreq>daily</changefreq>\n  <priority>0.8</priority>${imageXml}\n</url>`;
};

const rebuildSitemapCache = async () => {
  if (isRebuilding) return;
  isRebuilding = true;
  
  console.log("[Sitemap] Rebuilding sitemap cache...");
  
  try {
    const [fixturesData, resultsData] = await Promise.all([
      readJsonFiles(FIXTURES_DIR),
      readJsonFiles(RESULTS_DIR)
    ]);

    const allMatches = [...fixturesData, ...resultsData];
    const seenMatches = new Set(), seenTeams = new Set(), seenLeagues = new Set();
    const matchUrls = [], teamUrls = [], leagueUrls = [];

    for (const match of allMatches) {
      if (isValidMatch(match)) {
        const matchId = String(match.id);
        if (!seenMatches.has(matchId)) { seenMatches.add(matchId); matchUrls.push(buildMatchUrl(match)); }
      }

      const leagueId = match.league?.id || match.leagueId;
      const leagueName = match.league?.name || match.leagueName;
      const leagueLogo = match.league?.emblem || match.leagueLogo;
      if (leagueId && leagueName && !seenLeagues.has(String(leagueId))) {
        seenLeagues.add(String(leagueId));
        leagueUrls.push(buildLeagueUrl(leagueId, leagueName, leagueLogo));
      }

      const homeId = match.homeTeam?.id || match.homeTeamId;
      const homeName = match.homeTeam?.name || match.homeName;
      const homeLogo = match.homeTeam?.logo || match.homeLogo;
      if (homeId && homeName && !seenTeams.has(String(homeId))) {
        seenTeams.add(String(homeId));
        teamUrls.push(buildTeamUrl(homeId, homeName, homeLogo));
      }

      const awayId = match.awayTeam?.id || match.awayTeamId;
      const awayName = match.awayTeam?.name || match.awayName;
      const awayLogo = match.awayTeam?.logo || match.awayLogo;
      if (awayId && awayName && !seenTeams.has(String(awayId))) {
        seenTeams.add(String(awayId));
        teamUrls.push(buildTeamUrl(awayId, awayName, awayLogo));
      }
    }

    // ★ FIX: Added all static routes from AppRoutes.jsx
    const staticPages = [
      { path: "/", priority: "1.0", changefreq: "hourly" }, 
      { path: "/fixtures", priority: "0.9", changefreq: "hourly" },
      { path: "/results", priority: "0.9", changefreq: "daily" },
      { path: "/predictions", priority: "0.9", changefreq: "daily" }, 
      { path: "/leaderboard", priority: "0.8", changefreq: "hourly" },
      { path: "/mastergames", priority: "0.8", changefreq: "daily" },
      { path: "/highlights", priority: "0.8", changefreq: "daily" }, 
      { path: "/livestream", priority: "0.8", changefreq: "daily" },
      { path: "/basketball", priority: "0.7", changefreq: "daily" },
      { path: "/studio", priority: "0.6", changefreq: "weekly" },
      { path: "/search", priority: "0.6", changefreq: "weekly" },
      { path: "/football-knowledge", priority: "0.6", changefreq: "weekly" },
      { path: "/about", priority: "0.5", changefreq: "monthly" },
      { path: "/faq", priority: "0.5", changefreq: "monthly" },
      { path: "/help-center", priority: "0.5", changefreq: "monthly" },
      { path: "/contact", priority: "0.5", changefreq: "monthly" },
      { path: "/careers", priority: "0.5", changefreq: "monthly" },
      { path: "/partners", priority: "0.5", changefreq: "monthly" },
      { path: "/advertise", priority: "0.5", changefreq: "monthly" },
      { path: "/team", priority: "0.5", changefreq: "monthly" },
      { path: "/privacy", priority: "0.3", changefreq: "yearly" },
      { path: "/terms", priority: "0.3", changefreq: "yearly" }
    ];

    sitemapCache.static = buildUrlset(staticPages.map(p => `<url>\n  <loc>${escapeXml(`${HOST}${p.path}`)}</loc>\n  <changefreq>${p.changefreq}</changefreq>\n  <priority>${p.priority}</priority>\n</url>`));
    sitemapCache.matches = chunkArray(matchUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset);
    sitemapCache.teams = chunkArray(teamUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset);
    sitemapCache.leagues = chunkArray(leagueUrls, MAX_URLS_PER_SITEMAP).map(buildUrlset);
    sitemapCache.lastUpdated = Date.now();
    console.log("[Sitemap] Sitemap cache rebuilt successfully.");
  } catch (error) {
    console.error("[Sitemap] Failed to rebuild cache:", error);
  } finally {
    isRebuilding = false;
  }
};

const ensureSitemapCache = async () => {
  if (Date.now() - sitemapCache.lastUpdated > CACHE_TTL || !sitemapCache.static) {
    await rebuildSitemapCache();
  }
};

router.get(["/", "/sitemap.xml"], async (req, res) => {
  try {
    await ensureSitemapCache(); 
    const lastmod = new Date(sitemapCache.lastUpdated).toISOString();
    const entries = [`\n  <sitemap>\n    <loc>${escapeXml(`${HOST}/sitemaps/static.xml`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`];
    sitemapCache.matches.forEach((_, i) => entries.push(`\n  <sitemap>\n    <loc>${escapeXml(`${HOST}/sitemaps/matches-${i + 1}.xml`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`));
    sitemapCache.teams.forEach((_, i) => entries.push(`\n  <sitemap>\n    <loc>${escapeXml(`${HOST}/sitemaps/teams-${i + 1}.xml`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`));
    sitemapCache.leagues.forEach((_, i) => entries.push(`\n  <sitemap>\n    <loc>${escapeXml(`${HOST}/sitemaps/leagues-${i + 1}.xml`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`));
    res.status(200).type("application/xml").set("Cache-Control", "public, s-maxage=3600, max-age=3600").send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("")}\n</sitemapindex>`);
  } catch (error) { 
    console.error("[Sitemap] Index route error:", error);
    res.status(500).send("Sitemap generation failed."); 
  }
});

router.get("/sitemaps/:type", async (req, res) => {
  try {
    await ensureSitemapCache(); 
    const type = req.params.type;
    let xml = type === "static.xml" ? sitemapCache.static : null;
    if (!xml) {
      const match = type.match(/^(matches|teams|leagues)-(\d+)\.xml$/);
      if (match) {
        const index = parseInt(match[2], 10) - 1;
        const chunks = sitemapCache[match[1]];
        if (chunks && index >= 0 && index < chunks.length) xml = chunks[index];
      }
    }
    if (!xml) return res.status(404).type("text/plain").send("Not found");
    res.status(200).type("application/xml").set("Cache-Control", "public, s-maxage=3600, max-age=3600").send(xml);
  } catch (error) { 
    console.error("[Sitemap] Sub-sitemap route error:", error);
    res.status(500).send("Sitemap generation failed."); 
  }
});

module.exports = router;