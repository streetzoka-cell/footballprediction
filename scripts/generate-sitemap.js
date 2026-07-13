import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream } from "fs";

const hostname = "https://zokascore.xyz";

const pages = [

  // Main pages
  {
    url: "/",
    changefreq: "hourly",
    priority: 1.0,
  },


  // Football SEO pages
  {
    url: "/fixtures",
    changefreq: "hourly",
    priority: 0.95,
  },

  {
    url: "/predictions",
    changefreq: "hourly",
    priority: 0.95,
  },

  {
    url: "/live-scores",
    changefreq: "hourly",
    priority: 0.95,
  },

  {
    url: "/football-results",
    changefreq: "hourly",
    priority: 0.90,
  },


  // Competition features
  {
    url: "/mastergames",
    changefreq: "daily",
    priority: 0.90,
  },

  {
    url: "/leaderboard",
    changefreq: "daily",
    priority: 0.85,
  },


  // Other sports
  {
    url: "/basketball",
    changefreq: "hourly",
    priority: 0.85,
  },


  // Media
  {
    url: "/highlights",
    changefreq: "daily",
    priority: 0.80,
  },

  {
    url: "/livestream",
    changefreq: "daily",
    priority: 0.75,
  },


  // Brand pages
  {
    url: "/about",
    changefreq: "monthly",
    priority: 0.60,
  },

  {
    url: "/contact",
    changefreq: "monthly",
    priority: 0.60,
  },


  // Support
  {
    url: "/faq",
    changefreq: "monthly",
    priority: 0.55,
  },

  {
    url: "/help",
    changefreq: "monthly",
    priority: 0.55,
  },


  // System pages
  {
    url: "/status",
    changefreq: "daily",
    priority: 0.50,
  },

  {
    url: "/changelog",
    changefreq: "weekly",
    priority: 0.45,
  },


  // Legal
  {
    url: "/privacy",
    changefreq: "yearly",
    priority: 0.30,
  },

  {
    url: "/terms",
    changefreq: "yearly",
    priority: 0.30,
  },

  {
    url: "/cookies",
    changefreq: "yearly",
    priority: 0.20,
  },

  {
    url: "/disclaimer",
    changefreq: "yearly",
    priority: 0.20,
  },

];


const sitemap = new SitemapStream({
  hostname,
});


const write = createWriteStream("./public/sitemap.xml");


sitemap.pipe(write);


pages.forEach((page) => {
  sitemap.write(page);
});


sitemap.end();


streamToPromise(sitemap)
.then(() => {
  console.log("✅ sitemap.xml generated");
});