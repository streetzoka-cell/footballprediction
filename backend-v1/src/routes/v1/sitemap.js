const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();

const HOST = "https://zokascore.xyz";

// ★ Robust slug generator
const createSlug = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ★ XML Escaping
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

// ★ High-Performance Local Snapshot Reader
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
// UNIFIED SITEMAP.XML (Fastest for Googlebot)
// ==========================================
router.get(["/", "/index.xml", "/sitemap.xml"], async (req, res) => {
  try {
    const now = new Date().toISOString();
    const urls = [];

    // 1. Static Pages
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

    staticPages.forEach(page => {
      urls.push(`<url><loc>${HOST}${page.path}</loc><lastmod>${now}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`);
    });

    // 2. Dynamic Matches, Leagues, and Teams
    const allMatches = await getFixturesData();
    const seenLeagues = new Set();
    const seenTeams = new Set();

    allMatches.forEach(match => {
      // Matches
      if (match.id) {
        const homeSlug = createSlug(match.homeName || match.homeTeam?.name || "home");
        const awaySlug = createSlug(match.awayName || match.awayTeam?.name || "away");
        const matchUrl = `${HOST}/match/${match.id}/${homeSlug}-vs-${awaySlug}`;
        urls.push(`<url><loc>${escapeXml(matchUrl)}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq><priority>0.9</priority></url>`);
      }

      // Leagues
      const leagueId = match.league?.id || match.leagueId;
      const leagueName = match.league?.name || match.leagueName;
      if (leagueId && !seenLeagues.has(String(leagueId))) {
        seenLeagues.add(String(leagueId));
        const leagueSlug = createSlug(leagueName);
        urls.push(`<url><loc>${HOST}/league/${leagueId}/${leagueSlug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`);
      }

      // Teams
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
    // Cache for 1 hour on Cloudflare/Vercel
    res.header("Cache-Control", "public, s-maxage=3600, max-age=3600"); 
    res.send(xml);
  } catch (err) {
    console.error("[Sitemap] Generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

module.exports = router;