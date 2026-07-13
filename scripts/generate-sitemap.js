import { SitemapStream, streamToPromise } from "sitemap";
import { createWriteStream } from "fs";

const hostname = "https://www.zokascore.xyz";

const pages = [
  {
    url: "/",
    changefreq: "hourly",
    priority: 1.0,
  },

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
    url: "/mastergames",
    changefreq: "daily",
    priority: 0.90,
  },

  {
    url: "/basketball",
    changefreq: "hourly",
    priority: 0.90,
  },

  {
    url: "/highlights",
    changefreq: "daily",
    priority: 0.80,
  },

  {
    url: "/livestream",
    changefreq: "daily",
    priority: 0.70,
  },

  {
    url: "/leaderboard",
    changefreq: "daily",
    priority: 0.75,
  },

  {
    url: "/about",
    changefreq: "monthly",
    priority: 0.70,
  },

  {
    url: "/contact",
    changefreq: "monthly",
    priority: 0.70,
  },

  {
    url: "/faq",
    changefreq: "monthly",
    priority: 0.65,
  },

  {
    url: "/help",
    changefreq: "monthly",
    priority: 0.65,
  },

  {
    url: "/privacy",
    changefreq: "yearly",
    priority: 0.50,
  },

  {
    url: "/terms",
    changefreq: "yearly",
    priority: 0.50,
  },

  {
    url: "/cookies",
    changefreq: "yearly",
    priority: 0.40,
  },

  {
    url: "/disclaimer",
    changefreq: "yearly",
    priority: 0.40,
  },

  {
    url: "/status",
    changefreq: "daily",
    priority: 0.60,
  },

  {
    url: "/changelog",
    changefreq: "weekly",
    priority: 0.55,
  },
];

const sitemap = new SitemapStream({
  hostname,
});

const write = createWriteStream("./public/sitemap.xml");

sitemap.pipe(write);

pages.forEach((page) => sitemap.write(page));

sitemap.end();

streamToPromise(sitemap).then(() => {
  console.log("✅ sitemap.xml generated");
});