// src/seo/routes.js

export default [

  {
    path: "/",
    title: "Home",
    priority: 1.0,
    changefreq: "hourly",
  },

  {
    path: "/fixtures",
    title: "Today's Fixtures",
    priority: 0.95,
    changefreq: "hourly",
  },

  {
    path: "/predictions",
    title: "Predictions",
    priority: 0.95,
    changefreq: "hourly",
  },

  {
    path: "/mastergames",
    title: "Master Games",
    priority: 0.90,
    changefreq: "daily",
  },

  {
    path: "/basketball",
    title: "Basketball",
    priority: 0.85,
    changefreq: "hourly",
  },

  {
    path: "/highlights",
    title: "Highlights",
    priority: 0.85,
    changefreq: "daily",
  },

  {
    path: "/livestream",
    title: "Live Stream",
    priority: 0.70,
    changefreq: "daily",
  },

  {
    path: "/leaderboard",
    title: "Leaderboard",
    priority: 0.75,
    changefreq: "daily",
  },

  {
    path: "/about",
    title: "About",
    priority: 0.70,
    changefreq: "monthly",
  },

  {
    path: "/contact",
    title: "Contact",
    priority: 0.70,
    changefreq: "monthly",
  },

  {
    path: "/privacy",
    title: "Privacy Policy",
    priority: 0.50,
    changefreq: "yearly",
  },

  {
    path: "/terms",
    title: "Terms",
    priority: 0.50,
    changefreq: "yearly",
  },

  {
    path: "/cookies",
    title: "Cookies",
    priority: 0.40,
    changefreq: "yearly",
  },

  {
    path: "/disclaimer",
    title: "Disclaimer",
    priority: 0.40,
    changefreq: "yearly",
  },

  {
    path: "/faq",
    title: "FAQ",
    priority: 0.60,
    changefreq: "monthly",
  },

  {
    path: "/help",
    title: "Help Center",
    priority: 0.60,
    changefreq: "monthly",
  },

  {
    path: "/status",
    title: "System Status",
    priority: 0.60,
    changefreq: "daily",
  },

  {
    path: "/changelog",
    title: "Changelog",
    priority: 0.50,
    changefreq: "weekly",
  }

];