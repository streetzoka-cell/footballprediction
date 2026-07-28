import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from 'dotenv';

dotenv.config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!serviceAccount.projectId || !serviceAccount.privateKey) {
  console.warn("⚠️ Skipping sitemap generation: Missing Firebase credentials in environment.");
  process.exit(0);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const hostname = "https://zokascore.xyz";

const createSlug = (str) => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'match';

// ★ NEW: Validation Set to prevent duplicate URLs
const urlSet = new Set();

async function generateSitemapFile(filename, routes) {
  if (routes.length === 0) return;
  
  // Filter out invalid URLs and duplicates
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

    const matchRoutes = [], leagueRoutes = [], teamRoutes = [];
    const processedMatchIds = new Set(), processedTeamIds = new Set(), processedLeagueIds = new Set();

    const today = new Date().toISOString().split("T")[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
    
    const [todaySnap, tomorrowSnap] = await Promise.all([
      db.collection("fixture_snapshots").doc(today).get(),
      db.collection("fixture_snapshots").doc(tomorrow).get()
    ]);

    const extractData = (snap) => {
      if (!snap.exists) return;
      const data = snap.data();
      const allMatches = [...(data.matches || []), ...(data.live || []), ...(data.finished || [])];

      allMatches.forEach((match) => {
        const homeName = match.homeTeam?.name || match.homeTeamName || "Home";
        const awayName = match.awayTeam?.name || match.awayTeamName || "Away";
        const matchId = match.id || match.matchId;
        
        if (matchId && !processedMatchIds.has(String(matchId))) {
          const slug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;
          matchRoutes.push({ url: `/match/${matchId}/${slug}`, changefreq: "hourly", priority: 0.9, lastmod: new Date().toISOString() });
          processedMatchIds.add(String(matchId));
        }

        const leagueId = match.leagueId || match.league?.id;
        const leagueName = match.leagueName || match.league?.name || "League";
        if (leagueId && !processedLeagueIds.has(String(leagueId))) {
          leagueRoutes.push({ url: `/league/${leagueId}/${createSlug(leagueName)}`, changefreq: "daily", priority: 0.8, lastmod: new Date().toISOString() });
          processedLeagueIds.add(String(leagueId));
        }

        const homeTeamId = match.homeTeamId || match.homeTeam?.id;
        const awayTeamId = match.awayTeamId || match.awayTeam?.id;

        if (homeTeamId && !processedTeamIds.has(String(homeTeamId))) {
          teamRoutes.push({ url: `/team/${homeTeamId}/${createSlug(homeName)}`, changefreq: "daily", priority: 0.8, lastmod: new Date().toISOString() });
          processedTeamIds.add(String(homeTeamId));
        }
        if (awayTeamId && !processedTeamIds.has(String(awayTeamId))) {
          teamRoutes.push({ url: `/team/${awayTeamId}/${createSlug(awayName)}`, changefreq: "daily", priority: 0.8, lastmod: new Date().toISOString() });
          processedTeamIds.add(String(awayTeamId));
        }
      });
    };

    extractData(todaySnap);
    extractData(tomorrowSnap);

    // Generate individual sitemaps with validation
    await generateSitemapFile("sitemap-pages.xml", staticPages);
    await generateSitemapFile("sitemap-matches.xml", matchRoutes);
    await generateSitemapFile("sitemap-teams.xml", teamRoutes);
    await generateSitemapFile("sitemap-leagues.xml", leagueRoutes);

    // Generate Sitemap Index
    const indexStream = new SitemapStream({ hostname, lastmodDateOnly: true });
    const indexWrite = createWriteStream("./dist/sitemap.xml");
    indexStream.pipe(indexWrite);
    
    if (existsSync("./dist/sitemap-pages.xml")) indexStream.write({ url: "sitemap-pages.xml" });
    if (existsSync("./dist/sitemap-matches.xml")) indexStream.write({ url: "sitemap-matches.xml" });
    if (existsSync("./dist/sitemap-teams.xml")) indexStream.write({ url: "sitemap-teams.xml" });
    if (existsSync("./dist/sitemap-leagues.xml")) indexStream.write({ url: "sitemap-leagues.xml" });
    indexStream.end();

    await streamToPromise(indexStream);
    console.log("✅ sitemap.xml index generated successfully in dist/");

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
    // Do not exit with 1 to allow build to pass even if firebase fails, 
    // but the error is now clearly logged.
  }
}

generateSitemap();