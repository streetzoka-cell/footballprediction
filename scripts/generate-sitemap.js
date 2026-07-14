import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream, mkdirSync } from "fs";

const hostname = "https://zokascore.xyz";

const pages = [
  { url: "/", changefreq: "hourly", priority: 1.0 },
  { url: "/fixtures", changefreq: "hourly", priority: 0.95 },
  { url: "/predictions", changefreq: "hourly", priority: 0.95 },
  { url: "/mastergames", changefreq: "daily", priority: 0.9 },
  { url: "/leaderboard", changefreq: "daily", priority: 0.85 },
  { url: "/basketball", changefreq: "hourly", priority: 0.85 },
  { url: "/highlights", changefreq: "daily", priority: 0.8 },
  { url: "/livestream", changefreq: "daily", priority: 0.75 },
  { url: "/about", changefreq: "monthly", priority: 0.6 },
  { url: "/faq", changefreq: "monthly", priority: 0.55 },
  { url: "/help", changefreq: "monthly", priority: 0.55 },
  { url: "/privacy", changefreq: "yearly", priority: 0.3 },
  { url: "/terms", changefreq: "yearly", priority: 0.3 },
];

mkdirSync("./dist", { recursive: true });

const sitemap = new SitemapStream({ hostname });

const write = createWriteStream("./dist/sitemap.xml");

sitemap.pipe(write);

pages.forEach((page) => sitemap.write(page));

sitemap.end();

streamToPromise(sitemap).then(() => {
  console.log("✅ sitemap.xml generated in dist/");
});