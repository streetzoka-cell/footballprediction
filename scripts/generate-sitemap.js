import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from 'dotenv';

// Load environment variables from the root .env file
dotenv.config();

// Initialize with Backup DB credentials (where fixtures live)
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

if (!serviceAccount.projectId || !serviceAccount.privateKey) {
  console.warn("⚠️ Skipping sitemap generation: Missing Firebase credentials in environment.");
  process.exit(0); // ★ Exit successfully so CI/CD build doesn't fail
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
const hostname = "https://zokascore.xyz";
const createSlug = (str) => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'match';

async function generateSitemapFile(filename, routes) {
  if (routes.length === 0) return;
  const sitemap = new SitemapStream({ hostname });
  const write = createWriteStream(`./dist/${filename}`);
  sitemap.pipe(write);
  routes.forEach(r => sitemap.write(r));
  sitemap.end();
  await streamToPromise(sitemap);
  console.log(`✅ Generated ${filename} with ${routes.length} URLs.`);
}

async function generateSitemap() {
  try {
    console.log("Starting sitemap generation...");
    mkdirSync("./dist", { recursive: true });

    const staticPages = [
      { url: "/", changefreq: "hourly", priority: 1.0 },
      { url: "/fixtures", changefreq: "hourly", priority: 0.95 },
      { url: "/predictions", changefreq: "hourly", priority: 0.95 },
      { url: "/mastergames", changefreq: "daily", priority: 0.9 },
      { url: "/leaderboard", changefreq: "daily", priority: 0.85 },
      { url: "/basketball", changefreq: "hourly", priority: 0.85 },
      { url: "/highlights", changefreq: "hourly", priority: 0.9 }, 
      { url: "/livestream", changefreq: "daily", priority: 0.75 },
      { url: "/about", changefreq: "monthly", priority: 0.6 },
      { url: "/faq", changefreq: "monthly", priority: 0.55 },
      { url: "/help", changefreq: "monthly", priority: 0.55 },
      { url: "/privacy", changefreq: "yearly", priority: 0.3 },
      { url: "/terms", changefreq: "yearly", priority: 0.3 },
    ];

    const matchRoutes = [], newsRoutes = [], leagueRoutes = [], teamRoutes = [];
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
          matchRoutes.push({ url: `/match/${matchId}/${slug}`, changefreq: "hourly", priority: 0.9 });
          processedMatchIds.add(String(matchId));
        }

        const leagueId = match.leagueId || match.league?.id;
        const leagueName = match.leagueName || match.league?.name || "League";
        if (leagueId && !processedLeagueIds.has(String(leagueId))) {
          leagueRoutes.push({ url: `/league/${leagueId}/${createSlug(leagueName)}`, changefreq: "daily", priority: 0.8 });
          processedLeagueIds.add(String(leagueId));
        }

        const homeTeamId = match.homeTeamId || match.homeTeam?.id;
        const awayTeamId = match.awayTeamId || match.awayTeam?.id;

        if (homeTeamId && !processedTeamIds.has(String(homeTeamId))) {
          teamRoutes.push({ url: `/team/${homeTeamId}/${createSlug(homeName)}`, changefreq: "daily", priority: 0.8 });
          processedTeamIds.add(String(homeTeamId));
        }
        if (awayTeamId && !processedTeamIds.has(String(awayTeamId))) {
          teamRoutes.push({ url: `/team/${awayTeamId}/${createSlug(awayName)}`, changefreq: "daily", priority: 0.8 });
          processedTeamIds.add(String(awayTeamId));
        }
      });
    };

    extractData(todaySnap);
    extractData(tomorrowSnap);

    // Note: News posts still live in the Main DB (football-bec82). 
    // If you want news in the sitemap, you'd need a separate app initialization for the main DB here.
    // For now, we'll skip news to keep the script simple and fast.

    // Generate individual sitemap files
    await generateSitemapFile("sitemap-pages.xml", staticPages);
    await generateSitemapFile("sitemap-matches.xml", matchRoutes);
    await generateSitemapFile("sitemap-teams.xml", teamRoutes);
    await generateSitemapFile("sitemap-leagues.xml", leagueRoutes);

    // Generate Sitemap Index
    const indexStream = new SitemapStream({ hostname, lastmodDateOnly: true });
    const indexWrite = createWriteStream("./dist/sitemap.xml");
    indexStream.pipe(indexWrite);
    
    indexStream.write({ url: "sitemap-pages.xml" });
    indexStream.write({ url: "sitemap-matches.xml" });
    indexStream.write({ url: "sitemap-teams.xml" });
    indexStream.write({ url: "sitemap-leagues.xml" });
    indexStream.end();

    await streamToPromise(indexStream);
    console.log("✅ sitemap.xml index generated successfully in dist/");

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
  }
}

generateSitemap();