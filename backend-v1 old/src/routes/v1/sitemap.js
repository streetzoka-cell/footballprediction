// footballprediction/backend-v1/src/routes/v1/sitemap.js

const express = require("express");
const router = express.Router();

const HOST = "https://zokascore.xyz";

// â˜… NEW: Robust slug generator
const createSlug = (str) =>
  String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// â˜… FIX: Removed the quotes around >/g
const escapeXml = (unsafe) =>
  String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Helper to get date string offset by days
const getOffsetDate = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split("T")[0];
};

router.get("/", async (req, res) => {
  try {
    const datesToFetch = [getOffsetDate(-1), getOffsetDate(0), getOffsetDate(1)];
    
    // Fetch matches for yesterday, today, and tomorrow in parallel
    const fetchPromises = datesToFetch.map(dateStr =>
      fetch(`${req.protocol}://${req.get("host")}/api/v1/data/fixtures/${dateStr}.json`)
        .then(r => r.ok ? r.json() : Promise.resolve({ data: [] }))
        .catch(() => ({ data: [] }))
    );

    const results = await Promise.all(fetchPromises);
    
    // Combine all matches
    const allMatches = results.flatMap(r => r.data || []);

    const urls = [];
    const seenLeagues = new Set();
    const seenTeams = new Set();

    // 1. Static Core Pages
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
      urls.push(`<url><loc>${HOST}${page.path}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`);
    });

    // 2. Dynamic Leagues & Teams Extraction
    allMatches.forEach(match => {
      if (match.league?.id && !seenLeagues.has(match.league.id)) {
        seenLeagues.add(match.league.id);
        const leagueSlug = createSlug(match.league.name);
        urls.push(`<url><loc>${HOST}/league/${match.league.id}/${leagueSlug}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`);
      }

      if (match.homeTeam?.id && !seenTeams.has(match.homeTeam.id)) {
        seenTeams.add(match.homeTeam.id);
        const homeSlug = createSlug(match.homeTeam.name);
        urls.push(`<url><loc>${HOST}/team/${match.homeTeam.id}/${homeSlug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
      }

      if (match.awayTeam?.id && !seenTeams.has(match.awayTeam.id)) {
        seenTeams.add(match.awayTeam.id);
        const awaySlug = createSlug(match.awayTeam.name);
        urls.push(`<url><loc>${HOST}/team/${match.awayTeam.id}/${awaySlug}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`);
      }
    });

    // 3. Dynamic Match URLs
    allMatches.forEach(match => {
      if (!match.id) return;
      
      const homeSlug = createSlug(match.homeName || match.homeTeam?.name || "home");
      const awaySlug = createSlug(match.awayName || match.awayTeam?.name || "away");
      const matchUrl = `${HOST}/match/${match.id}/${homeSlug}-vs-${awaySlug}`;
      
      urls.push(`<url><loc>${escapeXml(matchUrl)}</loc><lastmod>${new Date().toISOString()}</lastmod><changefreq>hourly</changefreq><priority>0.9</priority></url>`);
    });

    // 4. Assemble Final XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
 ${urls.join("\n")}
</urlset>`;

    // 5. Set Headers (Cache for 5 minutes on CDN/Browser)
    res.header("Content-Type", "application/xml");
    res.header("Cache-Control", "public, s-maxage=300, max-age=300");

    res.send(xml);

  } catch (err) {
    console.error("Sitemap generation failed:", err);
    res.status(500).send("Sitemap generation failed.");
  }
});

module.exports = router;
