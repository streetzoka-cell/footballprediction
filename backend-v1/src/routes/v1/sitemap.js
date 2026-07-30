const express = require("express");

const router = express.Router();

const HOST = "https://zokascore.xyz";

const createSlug = (str) =>
  String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

router.get("/", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const api = await fetch(
      `${req.protocol}://${req.get("host")}/api/v1/data/fixtures/${today}.json`
    );

    let matches = [];

    if (api.ok) {
      const json = await api.json();
      matches = json.data || [];
    }

    const urls = [];

    const pages = [
      "/",
      "/fixtures",
      "/predictions",
      "/leaderboard",
      "/basketball",
      "/mastergames",
      "/highlights",
      "/livestream",
      "/about",
      "/faq",
      "/help-center",
      "/privacy",
      "/terms"
    ];

    pages.forEach((page) => {
      urls.push(`
<url>
<loc>${HOST}${page}</loc>
<changefreq>daily</changefreq>
<priority>0.8</priority>
</url>`);
    });

    const leagues = [
      { id: "39", name: "Premier League" },
      { id: "140", name: "La Liga" },
      { id: "135", name: "Serie A" },
      { id: "78", name: "Bundesliga" },
      { id: "61", name: "Ligue 1" },
      { id: "2", name: "Champions League" },
      { id: "3", name: "Europa League" },
      { id: "88", name: "Eredivisie" },
      { id: "94", name: "Primeira Liga" },
      { id: "71", name: "Brasileirão" }
    ];

    leagues.forEach((league) => {
      urls.push(`
<url>
<loc>${HOST}/league/${league.id}/${createSlug(league.name)}</loc>
<changefreq>daily</changefreq>
<priority>0.8</priority>
</url>`);
    });

    matches.forEach((match) => {
      if (!match.id) return;

      urls.push(`
<url>
<loc>${HOST}/match/${match.id}/${createSlug(match.homeName)}-vs-${createSlug(match.awayName)}</loc>
<lastmod>${new Date().toISOString()}</lastmod>
<changefreq>hourly</changefreq>
<priority>0.9</priority>
</url>`);
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

res.header("Content-Type", "application/xml");

res.header(
  "Cache-Control",
  "public, s-maxage=300, max-age=300"
);

res.send(xml);


  } catch (err) {
    console.error(err);
    res.status(500).send("Sitemap generation failed.");
  }
});

module.exports = router;