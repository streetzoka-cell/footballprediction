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

async function generateSitemap() {
  try {
    console.log("Starting sitemap generation...");

    const pages = [
      { url: "/", changefreq: "hourly", priority: 1.0 },
      { url: "/fixtures", changefreq: "hourly", priority: 0.95 },
      { url: "/predictions", changefreq: "hourly", priority: 0.95 },
      { url: "/mastergames", changefreq: "daily", priority: 0.9 },
      { url: "/leaderboard", changefreq: "daily", priority: 0.85 },
      { url: "/basketball", changefreq: "hourly", priority: 0.85 },
      { url: "/highlights", changefreq: "hourly", priority: 0.9 }, // Increased priority for News Hub
      { url: "/livestream", changefreq: "daily", priority: 0.75 },
      { url: "/about", changefreq: "monthly", priority: 0.6 },
      { url: "/faq", changefreq: "monthly", priority: 0.55 },
      { url: "/help", changefreq: "monthly", priority: 0.55 },
      { url: "/privacy", changefreq: "yearly", priority: 0.3 },
      { url: "/terms", changefreq: "yearly", priority: 0.3 },
    ];

    const dynamicRoutes = [];

    // ★ 1. Fetch Dynamic Matches from Firestore
    const today = new Date().toISOString().split("T")[0];
    const todaySnap = await db.collection("fixture_snapshots").doc(today).get();
    
    let matchCount = 0;
    if (todaySnap.exists) {
      const data = todaySnap.data();
      const allMatches = [
        ...(data.today || []), 
        ...(data.tomorrow || []), 
        ...(data.live || [])
      ];

      allMatches.forEach((match) => {
        const homeName = match.homeTeam?.name || match.homeTeamName || "Home";
        const awayName = match.awayTeam?.name || match.awayTeamName || "Away";
        const matchId = match.id || match.matchId;
        
        if (matchId) {
          const slug = `${createSlug(homeName)}-vs-${createSlug(awayName)}`;
          dynamicRoutes.push({
            url: `/match/${matchId}/${slug}`,
            changefreq: "hourly",
            priority: 0.9
          });
          matchCount++;
        }
      });
    }
    console.log(`Found ${matchCount} matches to add to sitemap.`);

    // ★ 2. Fetch Dynamic News Posts from Firestore
    const newsSnap = await db.collection("news_posts").orderBy("createdAt", "desc").limit(500).get();
    let newsCount = 0;
    
    newsSnap.forEach(doc => {
      dynamicRoutes.push({
        url: `/highlights/${doc.id}`,
        changefreq: "daily",
        priority: 0.85 // High priority for SEO
      });
      newsCount++;
    });
    console.log(`Found ${newsCount} news posts to add to sitemap.`);

    // ★ 3. Generate Sitemap XML
    mkdirSync("./dist", { recursive: true });
    const sitemap = new SitemapStream({ hostname });
    const write = createWriteStream("./dist/sitemap.xml");
    sitemap.pipe(write);

    [...pages, ...dynamicRoutes].forEach((page) => sitemap.write(page));
    sitemap.end();

    await streamToPromise(sitemap);
    console.log("✅ sitemap.xml generated successfully in dist/");

  } catch (error) {
    console.error("❌ Error generating sitemap:", error);
  }
}

generateSitemap();