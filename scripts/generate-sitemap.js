import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream } from "fs";

const hostname = "https://zokascore.xyz";

const pages = [
  // Home
  {
    url: "/",
    changefreq: "hourly",
    priority: 1.0,
  },

  // Football
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

  // Features
  {
    url: "/mastergames",
    changefreq: "daily",
    priority: 0.9,
  },
  {
    url: "/leaderboard",
    changefreq: "daily",
    priority: 0.85,
  },

  // Other Sports
  {
    url: "/basketball",
    changefreq: "hourly",
    priority: 0.85,
  },

  // Media
  {
    url: "/highlights",
    changefreq: "daily",
    priority: 0.8,
  },
  {
    url: "/livestream",
    changefreq: "daily",
    priority: 0.75,
  },

  // Company
  {
    url: "/about",
    changefreq: "monthly",
    priority: 0.6,
  },
  {
    url: "/contact",
    changefreq: "monthly",
    priority: 0.6,
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

  // System
  {
    url: "/status",
    changefreq: "daily",
    priority: 0.5,
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
    priority: 0.3,
  },
  {
    url: "/terms",
    changefreq: "yearly",
    priority: 0.3,
  },
  {
    url: "/cookies",
    changefreq: "yearly",
    priority: 0.2,
  },
  {
    url: "/disclaimer",
    changefreq: "yearly",
    priority: 0.2,
  },
];

const sitemap = new SitemapStream({ hostname });

const write = createWriteStream("./public/sitemap.xml");

sitemap.pipe(write);

pages.forEach((page) => sitemap.write(page));

sitemap.end();

streamToPromise(sitemap).then(() => {
  console.log("✅ sitemap.xml generated");
});