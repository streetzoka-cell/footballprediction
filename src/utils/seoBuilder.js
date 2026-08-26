// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZOKASCORE — SEO Builder PRO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SITE = Object.freeze({
  name: "ZOKASCORE",
  alternateName: ["ZOKACORE", "Zoka Score", "ZokaScore Football"],
  url: "https://zokascore.xyz",
  description: "Live football scores, today's fixtures, results, Premier League table, La Liga, Champions League standings, H2H stats and free AI football predictions.",
  image: "https://zokascore.xyz/og-image.png",
  keywords: "live scores, football live scores, today's fixtures, fixtures today, premier league table, la liga, champions league, results, football predictions, live football, soccer scores, zokascore, zokacore, zoka score",
  locale: "en_GB",
  twitter: "@zokascore",
  themeColor: "#05070a",
  searchUrl: "https://zokascore.xyz/search?q={search_term_string}",
});

const titleCase = (text = "") =>
  decodeURIComponent(text).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const slugify = (str) =>
  String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function deduplicateSchemas(schemas) {
  const seen = new Set();
  return schemas.filter((s) => {
    if (!s) return false;
    const id = `${s["@type"]}-${s.url || s.name || ""}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

const BREADCRUMB_TITLES = Object.freeze({
  fixtures: "Today's Fixtures", predictions: "AI Predictions", mastergames: "Master Games",
  basketball: "Basketball", highlights: "Highlights", livestream: "Live Stream",
  leaderboard: "Leaderboard", profile: "Profile", login: "Login", about: "About Us",
  privacy: "Privacy Policy", terms: "Terms", faq: "FAQ", "help-center": "Help Center",
  search: "Search", careers: "Careers", contact: "Contact", partners: "Partners",
  advertise: "Advertise", team: "Our Team", studio: "Studio", results: "Results",
});

export function generateBreadcrumbs(path = "/") {
  if (path === "/") return [{ name: "Home", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Home", path: "/" }];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
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
      crumbs.push({ name: titleCase(parts[i + 2]).replace(" Vs ", " vs "), path: `/match/${parts[i + 1]}/${parts[i + 2]}` });
      i += 2;
    } else {
      crumbs.push({ name: BREADCRUMB_TITLES[part] || titleCase(part), path: `/${parts.slice(0, i + 1).join("/")}` });
    }
  }
  return crumbs;
}

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
      target: { "@type": "EntryPoint", urlTemplate: SITE.searchUrl },
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
    logo: { "@type": "ImageObject", url: "https://zokascore.xyz/icons/icon-512.png", width: 512, height: 512 },
    sameAs: [
      "https://twitter.com/zokascore",
      "https://www.facebook.com/61593201145808",
      "https://www.tiktok.com/@zokascore"
    ],
  };
}

export function breadcrumbSchema(crumbs) {
  if (!crumbs?.length) return null;
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

export function buildSEO({ title, description, image, keywords, type = "website", canonical, path = "/", robots = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1", structuredData, modifiedTime }) {
  const cleanPath = path.replace(/\/$/, "") || "/";
  const url = canonical || `${SITE.url}${cleanPath}`;
  const fullTitle = title? (title.includes(SITE.name)? title : `${title} | ${SITE.name}`) : `Football Live Scores, Fixtures, Results & AI Predictions | ${SITE.name}`;
  const finalDesc = description || SITE.description;
  const finalImg = image || SITE.image;
  const finalKw = keywords || SITE.keywords;
  const crumbs = generateBreadcrumbs(path);
  let schemas = [];
  const bc = breadcrumbSchema(crumbs);
  if (bc) schemas.push(bc);
  if (structuredData) schemas.push(...(Array.isArray(structuredData)? structuredData : [structuredData]));
  schemas = deduplicateSchemas(schemas.filter(Boolean));
  return { title: fullTitle, description: finalDesc, keywords: finalKw, image: finalImg, type, url, robots, structuredData: schemas, breadcrumbs: crumbs, modifiedTime };
}

export const seoGenerators = {
  matchPage({ homeName, awayName, leagueName, date, isLive, isFinished, homeScore, awayScore, path, homeLogo, awayLogo, leagueLogo, homeId, awayId, leagueId, venue }) {
    return buildSEO({
      title: `${homeName} vs ${awayName} Live Score, H2H & Prediction`,
      description: `${homeName} vs ${awayName} - live score, ${leagueName? leagueName + ' ' : ''}H2H, lineups and AI prediction. ${isLive? 'LIVE NOW!' : isFinished? `Final ${homeScore}-${awayScore}.` : 'Kickoff soon.'} On ZOKASCORE.`,
      keywords: `${homeName} vs ${awayName}, ${homeName} ${awayName} live, ${leagueName} live score, prediction`,
      path, modifiedTime: new Date().toISOString(),
      structuredData: {
        "@context": "https://schema.org", "@type": "SportsEvent",
        name: `${homeName} vs ${awayName}`, sport: "Soccer", startDate: date,
        eventStatus: isLive? "https://schema.org/EventInProgress" : isFinished? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
        competitor: [{ "@type": "SportsTeam", name: homeName, logo: homeLogo }, { "@type": "SportsTeam", name: awayName, logo: awayLogo }],
        location: { "@type": "Place", name: venue?.name || leagueName },
        superEvent: { "@type": "SportsLeague", name: leagueName, logo: leagueLogo },
      },
    });
  },
  leaguePage({ leagueName, path, leagueLogo }) {
    return buildSEO({
      title: `${leagueName} Table, Fixtures, Results & Live Scores 2026/2027`,
      description: `Live ${leagueName} standings, fixtures, results, top scorers and live scores. Updated hourly on ZOKASCORE.`,
      keywords: `${leagueName} table, ${leagueName} fixtures, ${leagueName} results, live scores`,
      path, structuredData: { "@context": "https://schema.org", "@type": "SportsLeague", name: leagueName, sport: "Soccer", logo: leagueLogo },
    });
  },
  teamPage({ teamName, path, teamLogo }) {
    return buildSEO({
      title: `${teamName} Live Scores, Fixtures, Results & Stats`,
      description: `${teamName} live scores, latest fixtures, results, standings and player stats on ZOKASCORE.`,
      keywords: `${teamName} live score, ${teamName} fixtures, ${teamName} results`,
      path, structuredData: { "@context": "https://schema.org", "@type": "SportsTeam", name: teamName, sport: "Soccer", logo: teamLogo },
    });
  },
};