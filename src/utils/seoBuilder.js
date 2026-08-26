// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZOKASCORE — SEO Builder PRO - COMPLETE - Sofascore Style
// Keeps all original features + adds Google Display Fix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SITE = Object.freeze({
  name: "ZOKASCORE",
  alternateName: ["ZOKACORE", "Zoka Score", "ZokaScore Football", "zoka"],
  url: "https://zokascore.xyz",
  description: "Live football scores, today's fixtures, results, Premier League table, La Liga, Champions League standings, H2H stats and free AI football predictions from leagues worldwide.",
  image: "https://zokascore.xyz/og-image.png",
  keywords: "live scores, football live scores, today's fixtures, fixtures today, premier league table, la liga, champions league, results, football predictions, live football, soccer scores, h2h, standings, zokascore, zokacore, zoka score, free football tips, soccer stats",
  locale: "en_GB",
  twitter: "@zokascore",
  themeColor: "#05070a",
  searchUrl: "https://zokascore.xyz/search?q={search_term_string}",
});

// ─── Helpers ─────────────────────────────────────────────────────
const titleCase = (text = "") =>
  decodeURIComponent(text).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const slugify = (str) =>
  String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function deduplicateSchemas(schemas) {
  const seen = new Set();
  return schemas.filter((s) => {
    if (!s) return false;
    const id = `${s["@type"]}-${s.url || s.name || s["@id"] || JSON.stringify(s).slice(0,200)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ─── Breadcrumb Map ─────────────────────────────────────────────
const BREADCRUMB_TITLES = Object.freeze({
  fixtures: "Today's Fixtures",
  results: "Results",
  predictions: "AI Predictions",
  mastergames: "Master Games",
  basketball: "Basketball",
  highlights: "Highlights",
  livestream: "Live Stream",
  leaderboard: "Leaderboard",
  profile: "Profile",
  login: "Login",
  about: "About Us",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  faq: "FAQ",
  "help-center": "Help Center",
  search: "Search",
  careers: "Careers",
  contact: "Contact",
  partners: "Partners",
  advertise: "Advertise",
  team: "Our Team",
  studio: "Studio",
  admin: "Admin",
  changelog: "Changelog",
  status: "System Status",
  "football-knowledge": "Football Knowledge",
});

export function generateBreadcrumbs(path = "/") {
  if (path === "/") return [{ name: "Home", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Home", path: "/" }];
  let cumulative = "";

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    cumulative += `/${part}`;

    if ((part === "league" || part === "competition") && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Leagues", path: "/fixtures" });
      crumbs.push({ name: titleCase(parts[i + 2]), path: `/${part}/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    } else if (part === "team" && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Teams", path: "/fixtures" });
      crumbs.push({ name: titleCase(parts[i + 2]), path: `/team/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    } else if (part === "match" && parts[i + 1] && parts[i + 2]) {
      crumbs.push({ name: "Fixtures", path: "/fixtures" });
      crumbs.push({ name: "Match Details", path: `/match/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    } else if (part === "highlights" && parts[i + 1]) {
      crumbs.push({ name: "Highlights", path: "/highlights" });
    } else {
      crumbs.push({ name: BREADCRUMB_TITLES[part] || titleCase(part), path: cumulative });
    }
  }
  return crumbs;
}

// ─── Base Schema Generators ─────────────────────────────────────
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}#website`,
    url: SITE.url,
    name: SITE.name,
    alternateName: SITE.alternateName,
    description: SITE.description,
    inLanguage: "en-GB",
    publisher: { "@id": `${SITE.url}#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: SITE.searchUrl,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE.url}#organization`,
    name: SITE.name,
    url: SITE.url,
    logo: {
      "@type": "ImageObject",
      url: SITE.image,
      width: 512,
      height: 512,
    },
    sameAs: [
      "https://twitter.com/zokascore",
      "https://www.facebook.com/61593201145808",
      "https://www.tiktok.com/@zokascore",
    ],
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

export function howToSchema({ title, description, image, steps }) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: title,
    description,
    image: image || SITE.image,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

// ─── Universal SEO Builder ──────────────────────────────────────
export function buildSEO({
  title,
  description,
  image,
  keywords,
  type = "website",
  canonical,
  path = "/",
  robots = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1",
  structuredData,
  modifiedTime,
  prevPath,
  nextPath,
}) {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const url = canonical || `${SITE.url}${cleanPath}`;
  const fullTitle = title ? (title.includes(SITE.name) ? title : `${title} | ${SITE.name}`) : `Football Live Scores, Fixtures, Results & AI Predictions | ${SITE.name}`;
  const finalDesc = description || SITE.description;
  const finalImg = image || SITE.image;
  const finalKw = keywords || SITE.keywords;
  const crumbs = generateBreadcrumbs(path);

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

// ─── Specialized SEO Generators ────────────────────────────────
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
    homeLogo,
    awayLogo,
    leagueLogo,
    referee,
    homeId,
    awayId,
    leagueId,
  }) {
    return buildSEO({
      title: `${homeName} vs ${awayName} Live Score, H2H & Prediction`,
      description: `${homeName} vs ${awayName} — live score, prediction, head-to-head stats, lineups and match analysis. ${isLive ? 'LIVE NOW!' : isFinished ? `Final ${homeScore}-${awayScore}.` : 'Kickoff ' + (date ? new Date(date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'TBD')}`,
      keywords: `${homeName} vs ${awayName}, ${homeName} prediction, ${awayName} prediction, ${leagueName}, football prediction, live score, H2H`,
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
          {
            "@type": "SportsTeam",
            name: homeName,
            logo: homeLogo,
            url: `${SITE.url}/team/${homeId || "unknown"}/${slugify(homeName)}`,
          },
          {
            "@type": "SportsTeam",
            name: awayName,
            logo: awayLogo,
            url: `${SITE.url}/team/${awayId || "unknown"}/${slugify(awayName)}`,
          },
        ],
        image: [homeLogo, awayLogo, leagueLogo].filter(Boolean),
        location: {
          "@type": "Place",
          name: venue?.name || leagueName,
          address: venue?.city,
        },
        superEvent: {
          "@type": "SportsLeague",
          name: leagueName,
          logo: leagueLogo,
          url: `${SITE.url}/league/${leagueId || "unknown"}/${slugify(leagueName)}`,
        },
        ...(isFinished && {
          result: {
            "@type": "SportsResult",
            homeTeamScore: homeScore,
            awayTeamScore: awayScore,
          },
        }),
        dateModified: new Date().toISOString(),
      },
    });
  },

  leaguePage({ leagueName, path, leagueLogo }) {
    return buildSEO({
      title: `${leagueName} Table, Fixtures, Results & Live Scores 2026/2027`,
      description: `Live ${leagueName} standings, fixtures, results, top scorers and statistics. Updated hourly on ZOKASCORE.`,
      keywords: `${leagueName}, ${leagueName} standings, ${leagueName} fixtures, ${leagueName} table, results, live scores`,
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
      title: `${teamName} Live Scores, Fixtures, Results & Stats`,
      description: `Latest fixtures, form, results, standings and statistics for ${teamName}. Full schedule, live scores and match history on ZOKASCORE.`,
      keywords: `${teamName}, ${teamName} fixtures, ${teamName} results, live score, stats`,
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
      description: "Find answers to the most common questions about ZOKASCORE — predictions, scoring, leaderboards and more.",
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
      title: `${username} — Prediction Stats & History`,
      description: `View ${username}'s prediction history, accuracy, streaks and achievements on ZOKASCORE.`,
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