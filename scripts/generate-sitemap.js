import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import dotenv from 'dotenv';

dotenv.config();

const hostname = "https://zokascore.xyz";
const urlSet = new Set();

async function generateSitemapFile(filename, routes) {
  if (routes.length === 0) return;
  
  const validRoutes = routes.filter(r => {
    if (!r.url || r.url.includes('undefined') || r.url.includes('null')) return false;
    if (urlSet.has(r.url)) return false;
    urlSet.add(r.url);
    return true;
  });

  if (validRoutes.length === 0) return;

  const sitemap = new SitemapStream({ hostname });
  const write = createWriteStream(`./dist/${filename}`);
  sitemap.pipe(write);
  validRoutes.forEach(r => sitemap.write(r));
  sitemap.end();
  await streamToPromise(sitemap);
  console.log(`✅ Generated ${filename} with ${validRoutes.length} URLs.`);
}

async function generateSitemap() {
  try {
    console.log("Starting sitemap generation...");
    mkdirSync("./dist", { recursive: true });

    const staticPages = [
      { url: "/", changefreq: "hourly", priority: 1.0, lastmod: new Date().toISOString() },
      { url: "/fixtures", changefreq: "hourly", priority: 0.95, lastmod: new Date().toISOString() },
      { url: "/predictions", changefreq: "hourly", priority: 0.95, lastmod: new Date().toISOString() },
      { url: "/mastergames", changefreq: "daily", priority: 0.9, lastmod: new Date().toISOString() },
      { url: "/leaderboard", changefreq: "daily", priority: 0.85, lastmod: new Date().toISOString() },
      { url: "/basketball", changefreq: "hourly", priority: 0.85, lastmod: new Date().toISOString() },
      { url: "/highlights", changefreq: "hourly", priority: 0.9, lastmod: new Date().toISOString() }, 
      { url: "/livestream", changefreq: "daily", priority: 0.75, lastmod: new Date().toISOString() },
      { url: "/about", changefreq: "monthly", priority: 0.6, lastmod: new Date().toISOString() },
      { url: "/faq", changefreq: "monthly", priority: 0.55, lastmod: new Date().toISOString() },
      { url: "/help-center", changefreq: "monthly", priority: 0.55, lastmod: new Date().toISOString() },
      { url: "/privacy", changefreq: "yearly", priority: 0.3, lastmod: new Date().toISOString() },
      { url: "/terms", changefreq: "yearly", priority: 0.3, lastmod: new Date().toISOString() },
    ];

    // Hardcode Major Leagues for SEO since match data is no longer in Firestore
    const MAJOR_LEAGUES = [
      { id: '39', name: 'Premier League' },
      { id: '140', name: 'La Liga' },
      { id: '135', name: 'Serie A' },
      { id: '78', name: 'Bundesliga' },
      { id: '61', name: 'Ligue 1' },
      { id: '2', name: 'Champions League' },
      { id: '3', name: 'Europa League' },
      { id: '88', name: 'Eredivisie' },
      { id: '94', name: 'Primeira Liga' },
      { id: '71', name: 'Brasileirão' },
    ];

    const createSlug = (str) => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'league';
    const leagueRoutes = MAJOR_LEAGUES.map(l => ({ url: `/league/${l.id}/${createSlug(l.name)}`, changefreq: "daily", priority: 0.8, lastmod: new Date().toISOString() }));

    await generateSitemapFile("sitemap-pages.xml", staticPages);
    await generateSitemapFile("sitemap-leagues.xml", leagueRoutes);

    // Generate Sitemap Index
    const indexStream = new SitemapStream({ hostname, lastmodDateOnly: true });
    const indexWrite = createWriteStream("./dist/sitemap.xml");
    indexStream.pipe(indexWrite);
    
    if (existsSync("./dist/sitemap-pages.xml")) indexStream.write({ url: "sitemap-pages.xml" });
    if (existsSync("./dist/sitemap-leagues.xml")) indexStream.write({ url: "sitemap-leagues.xml" });
    indexStream.end();

    await streamToPromise(indexStream);
    console.log("✅ sitemap.xml index generated successfully in dist/");

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
  }
}

generateSitemap();