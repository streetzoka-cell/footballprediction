import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync } from "fs";
import dotenv from 'dotenv';

dotenv.config();

const hostname = "https://zokascore.xyz";

async function generateSitemap() {
  try {
    console.log("Starting sitemap generation...");
    mkdirSync("./dist", { recursive: true });

    const routes = [
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

    // Add League Links
    MAJOR_LEAGUES.forEach(l => {
      routes.push({ url: `/league/${l.id}/${createSlug(l.name)}`, changefreq: "daily", priority: 0.8, lastmod: new Date().toISOString() });
    });

    // ★ NEW: Fetch today's matches from backend to add to sitemap
    try {
      console.log("Fetching matches for sitemap...");
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`https://api.zokascore.xyz/api/v1/data/fixtures/${today}.json`);
      
      if (res.ok) {
        const data = await res.json();
        const matches = data.data || [];
        
        matches.forEach(m => {
          if (m.id && m.homeName && m.awayName) {
            const slug = `${createSlug(m.homeName)}-vs-${createSlug(m.awayName)}`;
            routes.push({ 
              url: `/match/${m.id}/${slug}`, 
              changefreq: "hourly", 
              priority: 0.9, 
              lastmod: new Date().toISOString() 
            });
          }
        });
        console.log(`✅ Added ${matches.length} match URLs.`);
      } else {
        console.warn("Could not fetch matches, proceeding with static sitemap.");
      }
    } catch (e) {
      console.warn("Error fetching matches for sitemap:", e.message);
    }

    // Filter out undefined/null/duplicate URLs
    const urlSet = new Set();
    const validRoutes = routes.filter(r => {
      if (!r.url || r.url.includes('undefined') || r.url.includes('null')) return false;
      if (urlSet.has(r.url)) return false;
      urlSet.add(r.url);
      return true;
    });

    if (validRoutes.length === 0) {
      console.log("No valid routes to generate sitemap.");
      return;
    }

    // ★ Generate single sitemap.xml file
    const sitemap = new SitemapStream({ hostname });
    const write = createWriteStream(`./dist/sitemap.xml`);
    sitemap.pipe(write);
    
    validRoutes.forEach(r => sitemap.write(r));
    sitemap.end();
    
    await streamToPromise(sitemap);
    console.log(`✅ sitemap.xml generated successfully in dist/ with ${validRoutes.length} URLs.`);

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
  }
}

generateSitemap();