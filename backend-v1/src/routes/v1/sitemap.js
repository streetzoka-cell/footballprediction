// backend-v1/src/routes/v1/sitemap.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const HOST = "https://zokascore.xyz";
const FIXTURES_DIR = path.join(process.cwd(), "public_data", "fixtures");
const RESULTS_DIR = path.join(process.cwd(), "public_data", "results");

// Cache control to automate daily updates without CPU load
let sitemapCache = {
  index: null,
  static: null,
  matches: null,
  teams: null,
  leagues: null,
  lastUpdated: 0
};
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours cache

const createSlug = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeXml = (unsafe) =>
  String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Helper: Read all JSON files in a directory
const readJsonFiles = (dir) => {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
  let data = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const parsed = JSON.parse(raw);
      const matches = parsed.matches || parsed.data || [];
      data = data.concat(matches);
    } catch (e) {
      console.error(`[Sitemap] Failed to read ${file}`, e.message);
    }
  }
  return data;
};

// Helper: Validate match before adding to sitemap
const isValidMatch = (match) => {
  if (!match.id) return false;
  const homeName = match.homeName || match.homeTeam?.name;
  const awayName = match.awayName || match.awayTeam?.name;
  if (!homeName || !awayName) return false; // Skip broken fixtures
  return true;
};

// ─── Sitemap Generators ───────────────────────────────

const generateStaticSitemap = () => {
  const now = new Date().toISOString();
  const pages = [
    { path: "/", priority: "1.0", changefreq: "hourly" },
    { path: "/fixtures", priority: "0.9", changefreq: "hourly" },
    { path: "/predictions", priority: "0.9", changefreq: "daily" },
    { path: "/leaderboard", priority: "0.8", changefreq: "hourly" },
    { path: "/highlights", priority: "0.8", changefreq: "daily" },
    { path: "/about", priority: "0.5", changefreq: "monthly" },
    { path: "/faq", priority: "0.5", changefreq: "monthly" }
  ];

  const urls = pages.map(p => 
    `<url><loc>${HOST}${p.path}</loc><lastmod>${now}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
};

const generateMatchesSitemap = () => {
  // Read ALL fixtures and results to prevent pages from disappearing
  const allMatches = [...readJsonFiles(FIXTURES_DIR), ...readJsonFiles(RESULTS_DIR)];
  const seenMatches = new Set();
  let urls = "";

  allMatches.forEach(match => {
    if (!isValidMatch(match) || seenMatches.has(String(match.id))) return;
    seenMatches.add(String(match.id));

    const homeSlug = createSlug(match.homeName || match.homeTeam?.name);
    const awaySlug = createSlug(match.awayName || match.awayTeam?.name);
    const matchUrl = `${HOST}/match/${match.id}/${homeSlug}-vs-${awaySlug}`;
    
    // Use actual match date as lastmod, fallback to file update time
    const lastmod = match.updatedAt || match.dateStr || new Date().toISOString();
    
    urls += `<url><loc>${escapeXml(matchUrl)}</loc><lastmod>${new Date(lastmod).toISOString()}</lastmod><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}</urlset>`;
};

const generateTeamsAndLeaguesSitemap = () => {
  const allMatches = [...readJsonFiles(FIXTURES_DIR), ...readJsonFiles(RESULTS_DIR)];
  const seenLeagues = new Set();
  const seenTeams = new Set();
  let teamUrls = "";
  let leagueUrls = "";

  allMatches.forEach(match => {
    const leagueId = match.league?.id || match.leagueId;
    const leagueName = match.league?.name || match.leagueName;
    if (leagueId && !seenLeagues.has(String(leagueId))) {
      seenLeagues.add(String(leagueId));
      leagueUrls += `<url><loc>${HOST}/league/${leagueId}/${createSlug(leagueName)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    }

    const homeId = match.homeTeam?.id || match.homeTeamId;
    const homeName = match.homeTeam?.name || match.homeName;
    if (homeId && !seenTeams.has(String(homeId))) {
      seenTeams.add(String(homeId));
      teamUrls += `<url><loc>${HOST}/team/${homeId}/${createSlug(homeName)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n`;
    }

    const awayId = match.awayTeam?.id || match.awayTeamId;
    const awayName = match.awayTeam?.name || match.awayName;
    if (awayId && !seenTeams.has(String(awayId))) {
      seenTeams.add(String(awayId));
      teamUrls += `<url><loc>${HOST}/team/${awayId}/${createSlug(awayName)}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n`;
    }
  });

  return {
    teams: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${teamUrls}</urlset>`,
    leagues: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${leagueUrls}</urlset>`
  };
};

// ─── Routes ───────────────────────────────────────────

router.get(["/", "/sitemap.xml"], async (req, res) => {
  try {
    // Rebuild cache if empty or older than 6 hours
    if (Date.now() - sitemapCache.lastUpdated > CACHE_TTL || !sitemapCache.index) {
      console.log("[Sitemap] Rebuilding sitemap cache...");
      const teamAndLeagueMaps = generateTeamsAndLeaguesSitemap();
      
      sitemapCache.static = generateStaticSitemap();
      sitemapCache.matches = generateMatchesSitemap();
      sitemapCache.teams = teamAndLeagueMaps.teams;
      sitemapCache.leagues = teamAndLeagueMaps.leagues;
      sitemapCache.lastUpdated = Date.now();
    }

    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${HOST}/sitemaps/static.xml</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>
  <sitemap><loc>${HOST}/sitemaps/matches.xml</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>
  <sitemap><loc>${HOST}/sitemaps/teams.xml</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>
  <sitemap><loc>${HOST}/sitemaps/leagues.xml</loc><lastmod>${new Date().toISOString()}</lastmod></sitemap>
</sitemapindex>`;

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, s-maxage=3600, max-age=3600");
    res.send(indexXml);
  } catch (err) {
    console.error("[Sitemap] Index generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

router.get("/sitemaps/:type", (req, res) => {
  try {
    const type = req.params.type;
    if (Date.now() - sitemapCache.lastUpdated > CACHE_TTL || !sitemapCache.matches) {
      // Force rebuild via main route
      return res.redirect(302, "/sitemap.xml");
    }

    let xml = null;
    if (type === "static.xml") xml = sitemapCache.static;
    if (type === "matches.xml") xml = sitemapCache.matches;
    if (type === "teams.xml") xml = sitemapCache.teams;
    if (type === "leagues.xml") xml = sitemapCache.leagues;

    if (!xml) return res.status(404).send("Not found");

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, s-maxage=3600, max-age=3600");
    res.send(xml);
  } catch (err) {
    res.status(500).send("Sitemap generation failed.");
  }
});

module.exports = router;