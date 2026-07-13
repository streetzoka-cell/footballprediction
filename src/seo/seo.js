// src/seo/seo.js

const SITE_URL = "https://zokascore.xyz";

export const SEO = {
  siteName: "ZOKASCORE",
  siteUrl: SITE_URL,
  author: "Kimutai Gibson",
  creator: "Kimutai Gibson",
  email: "support@zokascore.xyz",

  title: "ZOKASCORE | Live Football Scores, Fixtures & Predictions",

  description:
    "ZOKASCORE delivers live football scores, today's fixtures, expert predictions, standings, basketball coverage, match statistics, highlights and real-time sports updates.",

  keywords: [
    "football",
    "live scores",
    "football predictions",
    "soccer",
    "fixtures",
    "football results",
    "premier league",
    "laliga",
    "serie a",
    "bundesliga",
    "champions league",
    "europa league",
    "basketball",
    "sports",
    "football standings",
    "football app",
    "today matches",
    "football statistics",
    "kenya football",
    "ZOKASCORE",
  ],

  image: `${SITE_URL}/og-image.jpg`,

  twitter: "@zokascore",

  themeColor: "#07141f",

  locale: "en_US",

  robots: "index,follow,max-image-preview:large",

  copyright: `© ${new Date().getFullYear()} ZOKASCORE. All rights reserved.`,

  organization: {
    name: "ZOKASCORE",
    founder: "Kimutai Gibson",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
  },
};

export default SEO;