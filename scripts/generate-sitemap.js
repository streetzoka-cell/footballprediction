import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const hostname = "https://zokascore.xyz";

async function generateSitemap() {
  try {
    console.log("Starting sitemap generation...");

    // Create public folder if it doesn't exist
    mkdirSync("./public", { recursive: true });

    const now = new Date().toISOString();

    const routes = [
      { url: "/", changefreq: "hourly", priority: 1.0, lastmod: now },
      { url: "/fixtures", changefreq: "hourly", priority: 0.95, lastmod: now },
      { url: "/predictions", changefreq: "hourly", priority: 0.95, lastmod: now },
      { url: "/mastergames", changefreq: "daily", priority: 0.9, lastmod: now },
      { url: "/leaderboard", changefreq: "daily", priority: 0.85, lastmod: now },
      { url: "/basketball", changefreq: "hourly", priority: 0.85, lastmod: now },
      { url: "/highlights", changefreq: "hourly", priority: 0.9, lastmod: now },
      { url: "/livestream", changefreq: "daily", priority: 0.75, lastmod: now },
      { url: "/about", changefreq: "monthly", priority: 0.6, lastmod: now },
      { url: "/faq", changefreq: "monthly", priority: 0.55, lastmod: now },
      { url: "/help-center", changefreq: "monthly", priority: 0.55, lastmod: now },
      { url: "/privacy", changefreq: "yearly", priority: 0.3, lastmod: now },
      { url: "/terms", changefreq: "yearly", priority: 0.3, lastmod: now },
    ];

    const MAJOR_LEAGUES = [
      { id: "39", name: "Premier League" },
      { id: "140", name: "La Liga" },
      { id: "135", name: "Serie A" },
      { id: "78", name: "Bundesliga" },
      { id: "61", name: "Ligue 1" },
      { id: "2", name: "Champions League" },
      { id: "3", name: "Europa League" },
      { id: "88", name: "Eredivisie" },
      { id: "94", name: "Primeira Liga" },
      { id: "71", name: "Brasileirão" },
    ];

    const createSlug = (str) =>
      String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "league";

    MAJOR_LEAGUES.forEach((l) => {
      routes.push({
        url: `/league/${l.id}/${createSlug(l.name)}`,
        changefreq: "daily",
        priority: 0.8,
        lastmod: now,
      });
    });

    try {
      console.log("Fetching matches for sitemap...");

      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(
        `https://api.zokascore.xyz/api/v1/data/fixtures/${today}.json`
      );

      if (res.ok) {
        const data = await res.json();
        const matches = data.data || [];

        matches.forEach((m) => {
          if (m.id && m.homeName && m.awayName) {
            routes.push({
              url: `/match/${m.id}/${createSlug(m.homeName)}-vs-${createSlug(
                m.awayName
              )}`,
              changefreq: "hourly",
              priority: 0.9,
              lastmod: now,
            });
          }
        });

        console.log(`✅ Added ${matches.length} match URLs.`);
      }
    } catch (err) {
      console.warn("Error fetching matches:", err.message);
    }

    const seen = new Set();

    const validRoutes = routes.filter((r) => {
      if (!r.url) return false;
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    const sitemap = new SitemapStream({ hostname });

    const write = createWriteStream("./public/main-sitemap.xml");

    sitemap.pipe(write);

    validRoutes.forEach((route) => sitemap.write(route));

    sitemap.end();

    await streamToPromise(sitemap);

  console.log(
  `✅ Generated public/main-sitemap.xml with ${validRoutes.length} URLs.`
);

  } catch (err) {
    console.error(err);
  }
}

generateSitemap();