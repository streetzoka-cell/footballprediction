import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync, readFileSync, existsSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let serviceAccount;
try {
  if (existsSync("./firebase-adminsdk.json")) {
    serviceAccount = JSON.parse(readFileSync("./firebase-adminsdk.json"));
  } else if (process.env.FIREBASE_ADMIN_SDK) {
    serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK);
  } else {
    throw new Error("Firebase Admin SDK credentials not found.");
  }
} catch (e) {
  console.error("❌ Error loading Firebase Admin SDK:", e.message);
  process.exit(1);
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

    const newsSnap = await db.collection("news_posts").orderBy("createdAt", "desc").limit(500).get();
    newsSnap.forEach(doc => {
      const postData = doc.data();
      newsRoutes.push({ url: `/highlights/${createSlug(postData.title || "news")}-${doc.id}`, changefreq: "daily", priority: 0.85 });
    });

    // Generate individual sitemap files
    await generateSitemapFile("sitemap-pages.xml", staticPages);
    await generateSitemapFile("sitemap-matches.xml", matchRoutes);
    await generateSitemapFile("sitemap-teams.xml", teamRoutes);
    await generateSitemapFile("sitemap-leagues.xml", leagueRoutes);
    await generateSitemapFile("sitemap-news.xml", newsRoutes);

    // Generate Sitemap Index
    const indexStream = new SitemapStream({ hostname, lastmodDateOnly: true });
    const indexWrite = createWriteStream("./dist/sitemap.xml");
    indexStream.pipe(indexWrite);
    
    indexStream.write({ url: "sitemap-pages.xml" });
    indexStream.write({ url: "sitemap-matches.xml" });
    indexStream.write({ url: "sitemap-teams.xml" });
    indexStream.write({ url: "sitemap-leagues.xml" });
    indexStream.write({ url: "sitemap-news.xml" });
    indexStream.end();

    await streamToPromise(indexStream);
    console.log("✅ sitemap.xml index generated successfully in dist/");

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
  }
}

generateSitemap();