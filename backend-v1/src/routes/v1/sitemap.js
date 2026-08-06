const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const HOST = "https://zokascore.xyz";

// ★ Robust slug generator
const createSlug = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ★ XML Escaping to prevent broken sitemaps
const escapeXml = (unsafe) =>
  String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const getOffsetDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
};

// ★ High-Performance Local Snapshot Reader (No HTTP overhead)
const getFixturesData = async () => {
  const datesToFetch = [getOffsetDate(-1), getOffsetDate(0), getOffsetDate(1)];
  const publicDir = path.join(process.cwd(), "public_data", "fixtures");
  
  let allMatches = [];
  
  for (const dateStr of datesToFetch) {
    const filePath = path.join(publicDir, `${dateStr}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const matches = parsed.matches || parsed.data || [];
        allMatches = allMatches.concat(matches);
      }
    } catch (e) {
      console.error(`[Sitemap] Failed to read ${filePath}`, e.message);
    }
  }
  
  return allMatches;
};

// ==========================================
// 1. SITEMAP INDEX (The Master Map)
// ==========================================
router.get(["/", "/index.xml"], (req, res) => {
  const now = new Date().toISOString();
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${HOST}/zokascore-sitemap.xml/static.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${HOST}/zokascore-sitemap.xml/leagues.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${HOST}/zokascore-sitemap.xml/teams.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${HOST}/zokascore-sitemap.xml/matches.xml</loc>
    <lastmod>${now}</lastmod>
  </sitemap>
</sitemapindex>`;

  res.header("Content-Type", "application/xml");
  // Cache the index for 1 hour. Googlebot will check it regularly.
  res.header("Cache-Control", "public, s-maxage=3600, max-age=3600"); 
  res.send(xml);
});

// ==========================================
// 2. STATIC PAGES (Core Routes)
// ==========================================
router.get("/static.xml", (req, res) => {
  const staticPages = [
    { path: "/", priority: "1.0", changefreq: "hourly" },
    { path: "/fixtures", priority: "0.9", changefreq: "hourly" },
    { path: "/predictions", priority: "0.9", changefreq: "daily" },
    { path: "/leaderboard", priority: "0.8", changefreq: "hourly" },
    { path: "/mastergames", priority: "0.8", changefreq: "daily" },
    { path: "/highlights", priority: "0.8", changefreq: "hourly" },
    { path: "/livestream", priority: "0.7", changefreq: "daily" },
    { path: "/basketball", priority: "0.7", changefreq: "daily" },
    { path: "/about", priority: "0.5", changefreq: "monthly" },
    { path: "/faq", priority: "0.5", changefreq: "monthly" },
    { path: "/help-center", priority: "0.5", changefreq: "monthly" },
    { path: "/privacy", priority: "0.3", changefreq: "yearly" },
    { path: "/terms", priority: "0.3", changefreq: "yearly" }
  ];

  const urls = staticPages.map(page => 
    `<url><loc>${HOST}${page.path}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  res.header("Content-Type", "application/xml");
  // Static pages rarely change. Cache for 24 hours to save server resources.
  res.header("Cache-Control", "public, s-maxage=86400, max-age=86400"); 
  res.send(xml);
});

// ==========================================
// 3. LEAGUES (Dynamic Extraction)
// ==========================================
router.get("/leagues.xml", async (req, res) => {
  try {
    const allMatches = await getFixturesData();
    const seenLeagues = new Set();
    const urls = [];

    allMatches.forEach(match => {
      const leagueId = match.league?.id || match.leagueId;
      const leagueName = match.league?.name || match.leagueName;
      
      if (leagueId && !seenLeagues.has(String(leagueId))) {
        seenLeagues.add(String(leagueId));
        const leagueSlug = createSlug(leagueName);
        urls.push(`<url><loc>${HOST}/league/${leagueId}/${leagueSlug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`);
      }
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, s-maxage=3600, max-age=3600"); // 1 Hour
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Leagues generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

// ==========================================
// 4. TEAMS (Dynamic Extraction)
// ==========================================
router.get("/teams.xml", async (req, res) => {
  try {
    const allMatches = await getFixturesData();
    const seenTeams = new Set();
    const urls = [];

    allMatches.forEach(match => {
      const homeId = match.homeTeam?.id || match.homeTeamId;
      const homeName = match.homeTeam?.name || match.homeName;
      const awayId = match.awayTeam?.id || match.awayTeamId;
      const awayName = match.awayTeam?.name || match.awayName;

      if (homeId && !seenTeams.has(String(homeId))) {
        seenTeams.add(String(homeId));
        const homeSlug = createSlug(homeName);
        urls.push(`<url><loc>${HOST}/team/${homeId}/${homeSlug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
      }

      if (awayId && !seenTeams.has(String(awayId))) {
        seenTeams.add(String(awayId));
        const awaySlug = createSlug(awayName);
        urls.push(`<url><loc>${HOST}/team/${awayId}/${awaySlug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
      }
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, s-maxage=3600, max-age=3600"); // 1 Hour
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Teams generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

// ==========================================
// 5. MATCHES (High-Frequency Updates)
// ==========================================
router.get("/matches.xml", async (req, res) => {
  try {
    const allMatches = await getFixturesData();
    const urls = [];

    allMatches.forEach(match => {
      if (!match.id) return;
      
      const homeSlug = createSlug(match.homeName || match.homeTeam?.name || "home");
      const awaySlug = createSlug(match.awayName || match.awayTeam?.name || "away");
      const matchUrl = `${HOST}/match/${match.id}/${homeSlug}-vs-${awaySlug}`;
      
      urls.push(`<url><loc>${escapeXml(matchUrl)}</loc><lastmod>${new Date().toISOString()}</lastmod><changefreq>hourly</changefreq><priority>0.9</priority></url>`);
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.header("Content-Type", "application/xml");
    // Matches change constantly. Cache for only 5 minutes.
    res.header("Cache-Control", "public, s-maxage=300, max-age=300"); 
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Matches generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

module.exports = router;