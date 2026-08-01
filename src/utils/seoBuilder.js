// src/utils/seoBuilder.js
// Unified SEO Builder — combines seoBuilder + Breadcrumbs logic

export const SITE = Object.freeze({
  name: "ZOKASCORE",
  url: "https://zokascore.xyz",
  description:
    "Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.",
  image: "https://zokascore.xyz/og-image.png",
  keywords:
    "football predictions, live scores, fixtures, ZOKASCORE, soccer, premier league, la liga, champions league",
  locale: "en_GB",
  twitter: "@zokascore",
  themeColor: "#05070a",
  searchUrl: "https://zokascore.xyz/search?q={search_term_string}",
});

// ─── Helpers ───────────────────────────────────────────

const titleCase = (text = "") =>
  decodeURIComponent(text)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

function deduplicateSchemas(schemas) {
  const seen = new Set();
  return schemas.filter((s) => {
    if (!s) return false;
    const id = `${s["@type"]}-${s.url || s.name || s["@id"] || JSON.stringify(s)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ─── Breadcrumb Map ────────────────────────────────────

const BREADCRUMB_TITLES = Object.freeze({
  fixtures: "Fixtures",
  predictions: "Predictions",
  mastergames: "Master Games",
  basketball: "Basketball",
  highlights: "Highlights",
  livestream: "Live Stream",
  leaderboard: "Leaderboard",
  profile: "Profile",
  login: "Login",
  about: "About",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  faq: "FAQ",
  "help-center": "Help Center",
  search: "Search",
  careers: "Careers",
  contact: "Contact",
  partners: "Partners",
  advertise: "Advertise",
  team: "Team",
  studio: "Studio",
  admin: "Admin",
});

/**
 * Generate breadcrumbs from a path string.
 * Used by both SEO.jsx and Breadcrumbs.jsx — single source of truth.
 */
export function generateBreadcrumbs(path = "/") {
  if (path === "/") return [{ name: "Home", path: "/" }];

  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Home", path: "/" }];
  let cumulative = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    cumulative += `/${part}`;

    // Dynamic route: /league/:id/:slug
    if (part === "league" && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Leagues", path: "/fixtures" });
      // ★ FIX: Include ID in the path
      crumbs.push({ name: titleCase(parts[i + 2]), path: `/league/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    }
    // Dynamic route: /team/:id/:slug
    else if (part === "team" && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Teams", path: "/fixtures" });
      // ★ FIX: Include ID in the path
      crumbs.push({ name: titleCase(parts[i + 2]), path: `/team/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    }
    // Dynamic route: /match/:id/:slug
    else if (part === "match" && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Fixtures", path: "/fixtures" });
      // ★ FIX: Include ID in the path
      crumbs.push({ name: "Match Details", path: `/match/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    }
    // Dynamic route: /highlights/:slug
    else if (part === "highlights" && parts[i + 1]) {
      crumbs.push({ name: "Highlights", path: "/highlights" });
      if (parts[i + 1] !== "author") {
        // Skip adding slug as breadcrumb for cleanliness
      }
    }
    // Static route
    else {
      crumbs.push({
        name: BREADCRUMB_TITLES[part] || titleCase(part),
        path: cumulative,
      });
    }
  }

  return crumbs;
}

// ─── Base Schema Generators ────────────────────────────

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    potentialAction: {
      "@type": "SearchAction",
      target: SITE.searchUrl,
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    url: SITE.url,
    logo: SITE.image,
    sameAs: ["https://twitter.com/zokascore", "https://facebook.com/zokascore"],
  };
}

export function breadcrumbSchema(crumbs) {
  if (!crumbs || crumbs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE.url}${c.path}`,
    })),
  };
}

// ─── Universal SEO Builder ─────────────────────────────

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
  modifiedTime,
  prevPath,
  nextPath,
}) {
  const fullTitle = title ? `${title} | ${SITE.name}` : SITE.name;
  const url = canonical || `${SITE.url}${path}`;
  const finalDesc = description || SITE.description;
  const finalImg = image || SITE.image;
  const finalKw = keywords || SITE.keywords;
  const crumbs = generateBreadcrumbs(path);

  // Original behavior: add breadcrumbs internally
  let schemas = [];
  
  const bcSchema = breadcrumbSchema(crumbs);
  if (bcSchema) schemas.push(bcSchema);

  if (structuredData) {
    if (Array.isArray(structuredData)) schemas.push(...structuredData);
    else schemas.push(structuredData);
  }

  schemas = deduplicateSchemas(schemas.filter(Boolean));

  return {
    title: fullTitle,
    description: finalDesc,
    keywords: finalKw,
    image: finalImg,
    type,
    url,
    robots,
    structuredData: schemas,
    breadcrumbs: crumbs,
    modifiedTime,
    prevPath,
    nextPath,
  };
}

// ─── Specialized SEO Generators ────────────────────────

export const seoGenerators = {
  matchPage({
    homeName, awayName, leagueName, date, venue, isLive, isFinished, 
    homeScore, awayScore, path, homeLogo, awayLogo, leagueLogo, referee,
  }) {
    return buildSEO({
      title: `${homeName} vs ${awayName} Prediction, Live Score & H2H`,
      description: `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis.`,
      keywords: `${homeName}, ${awayName}, ${leagueName}, football prediction`,
      path,
      modifiedTime: new Date().toISOString(),
      structuredData: {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: `${homeName} vs ${awayName}`,
        sport: "Football",
        startDate: date,
        eventStatus: isLive
          ? "https://schema.org/EventInProgress"
          : isFinished
          ? "https://schema.org/EventCompleted"
          : "https://schema.org/EventScheduled",
        competitor: [
          { "@type": "SportsTeam", name: homeName, logo: homeLogo },
          { "@type": "SportsTeam", name: awayName, logo: awayLogo }
        ],
        image: [homeLogo, awayLogo, leagueLogo].filter(Boolean),
        location: { 
          "@type": "Place", 
          name: venue?.name || leagueName,
          address: venue?.city 
        },
        superEvent: { 
          "@type": "SportsLeague", 
          name: leagueName, 
          logo: leagueLogo 
        },
        ...(isFinished && {
          result: { "@type": "SportsResult", homeTeamScore: homeScore, awayTeamScore: awayScore },
        }),
        dateModified: new Date().toISOString(),
      },
    });
  },

  leaguePage({ leagueName, path, leagueLogo }) {
    return buildSEO({
      title: `${leagueName} Table, Fixtures & Standings`,
      description: `Live ${leagueName} standings, fixtures, results and statistics.`,
      keywords: `${leagueName}, standings, fixtures, table`,
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "SportsLeague",
        name: leagueName,
        sport: "Football",
        logo: leagueLogo,
        url: `${SITE.url}${path}`,
      },
    });
  },

  teamPage({ teamName, path, teamLogo, country, venue }) {
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
        logo: teamLogo,
        url: `${SITE.url}${path}`,
        ...(country && { address: country }),
        ...(venue && { location: { "@type": "Place", name: venue } }),
      },
    });
  },

  faqPage({ faqs, path }) {
    return buildSEO({
      title: "Frequently Asked Questions",
      description: "Find answers to the most common questions about ZOKASCORE.",
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    });
  },

  profilePage({ username, path, avatar, bio, uid }) {
    return buildSEO({
      title: `${username} Profile`,
      description: `View ${username}'s prediction history, stats, and achievements on ZOKASCORE.`,
      path,
      robots: "noindex,follow",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name: username,
          image: avatar,
          description: bio,
          identifier: uid,
        },
      },
    });
  },
};