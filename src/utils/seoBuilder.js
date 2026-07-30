// src/utils/seoBuilder.js

import {
  organizationSchema,
  websiteSchema,
} from "./schema";

export const SITE = {
  name: "ZOKASCORE",
  url: "https://zokascore.xyz",
  description:
    "Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.",
  image: "https://zokascore.xyz/og-image.png",
  keywords:
    "football predictions, live scores, fixtures, ZOKASCORE, soccer, premier league, la liga, champions league",
  locale: "en_GB",
  twitter: "@zokascore",
  themeColor: "#0a0f1a",
};

const titleCase = (text = "") =>
  decodeURIComponent(text)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function generateBreadcrumbs(path = "/") {
  const parts = path.split("/").filter(Boolean);

  const crumbs = [
    {
      name: "Home",
      path: "/",
    },
  ];

  if (!parts.length) return crumbs;

  switch (parts[0]) {
    case "fixtures":
      crumbs.push({
        name: "Fixtures",
        path: "/fixtures",
      });
      break;

    case "predictions":
      crumbs.push({
        name: "Predictions",
        path: "/predictions",
      });
      break;

    case "leaderboard":
      crumbs.push({
        name: "Leaderboard",
        path: "/leaderboard",
      });
      break;

    case "basketball":
      crumbs.push({
        name: "Basketball",
        path: "/basketball",
      });
      break;

    case "mastergames":
      crumbs.push({
        name: "Master Games",
        path: "/mastergames",
      });
      break;

    case "highlights":
      crumbs.push({
        name: "Highlights",
        path: "/highlights",
      });
      break;

    case "livestream":
      crumbs.push({
        name: "Live Stream",
        path: "/livestream",
      });
      break;

    case "about":
      crumbs.push({
        name: "About",
        path: "/about",
      });
      break;

    case "privacy":
      crumbs.push({
        name: "Privacy Policy",
        path: "/privacy",
      });
      break;

    case "terms":
      crumbs.push({
        name: "Terms",
        path: "/terms",
      });
      break;

    case "faq":
      crumbs.push({
        name: "FAQ",
        path: "/faq",
      });
      break;

    case "help-center":
      crumbs.push({
        name: "Help Center",
        path: "/help-center",
      });
      break;

    case "league":
      crumbs.push({
        name: "League",
        path: "/league",
      });

      if (parts[2]) {
        crumbs.push({
          name: titleCase(parts[2]),
          path,
        });
      }
      break;

    case "team":
      crumbs.push({
        name: "Team",
        path: "/team",
      });

      if (parts[2]) {
        crumbs.push({
          name: titleCase(parts[2]),
          path,
        });
      }
      break;

    case "match":
      crumbs.push({
        name: "Fixtures",
        path: "/fixtures",
      });

      crumbs.push({
        name: "Match Details",
        path,
      });
      break;

    default:
      crumbs.push({
        name: titleCase(parts[0]),
        path,
      });
  }

  return crumbs;
}

/**
 * Universal SEO Builder
 */
export function buildSEO({
  title,
  description,
  image,
  keywords,
  type = "website",
  canonical,
  path = "/",
  robots = "index,follow",
  structuredData,
}) {
  const fullTitle = title
    ? `${title} | ${SITE.name}`
    : SITE.name;

  const url = canonical || `${SITE.url}${path}`;

  const finalDescription =
    description || SITE.description;

  const finalImage =
    image || SITE.image;

  const finalKeywords =
    keywords || SITE.keywords;

  const schemas = [
    websiteSchema(),
    organizationSchema(),
  ];

  if (structuredData) {
    if (Array.isArray(structuredData))
      schemas.push(...structuredData);
    else schemas.push(structuredData);
  }

  return {
    title: fullTitle,
    description: finalDescription,
    keywords: finalKeywords,
    image: finalImage,
    type,
    url,
    robots,
    structuredData: schemas,

    // automatically generated
    breadcrumbs: generateBreadcrumbs(path),
  };
}

export const seoGenerators = {
  matchPage({
    homeName,
    awayName,
    leagueName,
    date,
    venue,
    isLive,
    isFinished,
    homeScore,
    awayScore,
    path,
  }) {
    const sportsSchema = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",

      name: `${homeName} vs ${awayName}`,

      sport: "Football",

      startDate: date,

      endDate: new Date(
        new Date(date).getTime() + 7200000
      ).toISOString(),

      eventStatus: isFinished
        ? "https://schema.org/EventCompleted"
        : "https://schema.org/EventScheduled",

      homeTeam: {
        "@type": "SportsTeam",
        name: homeName,
      },

      awayTeam: {
        "@type": "SportsTeam",
        name: awayName,
      },

      location: {
        "@type": "Place",
        name: venue?.name || leagueName,
      },

      ...(isFinished && {
        result: {
          "@type": "SportsResult",
          homeTeamScore: homeScore,
          awayTeamScore: awayScore,
        },
      }),
    };

    return buildSEO({
      title: `${homeName} vs ${awayName} Prediction, Live Score & H2H`,
      description: `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis.`,
      keywords: `${homeName}, ${awayName}, ${leagueName}, football prediction`,
      path,
      structuredData: sportsSchema,
    });
  },

  leaguePage({
    leagueName,
    path,
  }) {
    return buildSEO({
      title: `${leagueName} Table, Fixtures & Standings`,
      description: `Live ${leagueName} standings, fixtures, results and statistics.`,
      keywords: `${leagueName}, standings, fixtures, table`,
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${leagueName} Standings`,
        url: `${SITE.url}${path}`,
      },
    });
  },

  teamPage({
    teamName,
    path,
  }) {
    return buildSEO({
      title: `${teamName} Fixtures & Results`,
      description: `Latest fixtures, form, results and statistics for ${teamName}.`,
      keywords: `${teamName}, fixtures, live score, results`,
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "SportsTeam",
        name: teamName,
        sport: "Football",
        url: `${SITE.url}${path}`,
      },
    });
  },
};