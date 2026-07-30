// src/utils/seoBuilder.js

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
  themeColor: "#05070a",
  searchUrl: "https://zokascore.xyz/search?q={search_term_string}"
};

const titleCase = (text = "") =>
  decodeURIComponent(text)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

// ★ NEW: Deduplicate JSON-LD schemas to prevent redundant output
function deduplicateSchemas(schemas) {
  const seen = new Set();
  return schemas.filter(schema => {
    if (!schema) return false;
    const id = `${schema["@type"]}-${schema.url || schema.name || schema["@id"] || JSON.stringify(schema)}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// ★ NEW: Smarter Cumulative Breadcrumbs
function generateBreadcrumbs(path = "/") {
  const parts = path.split("/").filter(Boolean);
  const crumbs = [{ name: "Home", path: "/" }];
  let cumulativePath = "";

  const partMap = {
    "fixtures": "Fixtures",
    "predictions": "Predictions",
    "leaderboard": "Leaderboard",
    "basketball": "Basketball",
    "mastergames": "Master Games",
    "highlights": "Highlights",
    "livestream": "Live Stream",
    "about": "About",
    "privacy": "Privacy Policy",
    "terms": "Terms",
    "faq": "FAQ",
    "help-center": "Help Center",
    "search": "Search",
    "profile": "Profile",
    "login": "Login"
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    cumulativePath += `/${part}`;
    
    if (part === "league" && parts[i+1] && parts[i+2]) {
       crumbs.push({ name: "League", path: "/league" });
       const leaguePath = `/league/${parts[i+1]}/${parts[i+2]}`;
       crumbs.push({ name: titleCase(parts[i+2]), path: leaguePath });
       i += 2;
    } else if (part === "team" && parts[i+1] && parts[i+2]) {
       crumbs.push({ name: "Team", path: "/team" });
       const teamPath = `/team/${parts[i+1]}/${parts[i+2]}`;
       crumbs.push({ name: titleCase(parts[i+2]), path: teamPath });
       i += 2;
    } else if (part === "match" && parts[i+1] && parts[i+2]) {
       crumbs.push({ name: "Fixtures", path: "/fixtures" });
       const matchPath = `/match/${parts[i+1]}/${parts[i+2]}`;
       crumbs.push({ name: "Match Details", path: matchPath });
       i += 2;
    } else {
       crumbs.push({ name: partMap[part] || titleCase(part), path: cumulativePath });
    }
  }
  return crumbs;
}

// Base Schemas
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": SITE.url,
    "name": SITE.name,
    "description": SITE.description,
    "potentialAction": {
      "@type": "SearchAction",
      "target": SITE.searchUrl,
      "query-input": "required name=search_term_string"
    }
  };
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": SITE.name,
    "url": SITE.url,
    "logo": SITE.image,
    "sameAs": ["https://twitter.com/zokascore", "https://facebook.com/zokascore"]
  };
}

export function sportsOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    "name": SITE.name,
    "sport": "Football",
    "url": SITE.url
  };
}

function imageObjectSchema(url) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "url": url,
    "width": 1200,
    "height": 630
  };
}

function webPageSchema(path, title, description, image, modifiedTime) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "url": `${SITE.url}${path}`,
    "description": description,
    "image": imageObjectSchema(image),
    "isPartOf": { "@type": "WebSite", "url": SITE.url, "name": SITE.name },
    ...(modifiedTime && { "dateModified": modifiedTime })
  };
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
  modifiedTime,
  prevPath,
  nextPath
}) {
  const fullTitle = title ? `${title} | ${SITE.name}` : SITE.name;
  const url = canonical || `${SITE.url}${path}`;
  const finalDescription = description || SITE.description;
  const finalImage = image || SITE.image;
  const finalKeywords = keywords || SITE.keywords;

  let schemas = [
    websiteSchema(),
    organizationSchema(),
    sportsOrganizationSchema(),
    webPageSchema(path, fullTitle, finalDescription, finalImage, modifiedTime)
  ];

  if (structuredData) {
    if (Array.isArray(structuredData)) schemas.push(...structuredData);
    else schemas.push(structuredData);
  }

  // Deduplicate before returning
  schemas = deduplicateSchemas(schemas);

  return {
    title: fullTitle,
    description: finalDescription,
    keywords: finalKeywords,
    image: finalImage,
    type,
    url,
    robots,
    structuredData: schemas,
    breadcrumbs: generateBreadcrumbs(path),
    modifiedTime,
    prevPath,
    nextPath
  };
}

// ★ NEW: Specialized SEO Generators
export const seoGenerators = {
  matchPage({ homeName, awayName, leagueName, date, venue, isLive, isFinished, homeScore, awayScore, path, homeLogo, awayLogo, leagueLogo, season, round, referee, attendance, broadcast }) {
    const sportsSchema = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      "name": `${homeName} vs ${awayName}`,
      "sport": "Football",
      "startDate": date,
      "endDate": new Date(new Date(date).getTime() + 7200000).toISOString(),
      "eventStatus": isLive ? "https://schema.org/EventInProgress" : isFinished ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
      "homeTeam": { "@type": "SportsTeam", "name": homeName, "logo": homeLogo },
      "awayTeam": { "@type": "SportsTeam", "name": awayName, "logo": awayLogo },
      "location": { "@type": "Place", "name": venue?.name || leagueName },
      "competitor": [
        { "@type": "SportsTeam", "name": homeName, "logo": homeLogo },
        { "@type": "SportsTeam", "name": awayName, "logo": awayLogo }
      ],
      "about": { "@type": "SportsLeague", "name": leagueName, "logo": leagueLogo },
      ...(isFinished && { "result": { "@type": "SportsResult", "homeTeamScore": homeScore, "awayTeamScore": awayScore } }),
      ...(season && { "season": { "@type": "SportsSeason", "name": season } }),
      ...(round && { "superEvent": { "@type": "SportsEvent", "name": round } }),
      ...(referee && { "referee": { "@type": "Person", "name": referee } }),
      ...(attendance && { "attendance": attendance }),
      ...(broadcast && { "broadcastOfEvent": { "@type": "BroadcastEvent", "isLiveBroadcast": isLive, "name": broadcast } }),
      "dateModified": new Date().toISOString()
    };

    return buildSEO({
      title: `${homeName} vs ${awayName} Prediction, Live Score & H2H`,
      description: `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis.`,
      keywords: `${homeName}, ${awayName}, ${leagueName}, football prediction`,
      path,
      modifiedTime: new Date().toISOString(),
      structuredData: sportsSchema
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
        "name": leagueName,
        "sport": "Football",
        "logo": leagueLogo,
        "url": `${SITE.url}${path}`
      }
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
        "name": teamName,
        "sport": "Football",
        "logo": teamLogo,
        "url": `${SITE.url}${path}`,
        ...(country && { "address": country }),
        ...(venue && { "location": { "@type": "Place", "name": venue } })
      }
    });
  },

  newsArticlePage({ title, description, image, path, publishedTime, authorName, body, leagueName }) {
    return buildSEO({
      title,
      description,
      image,
      path,
      type: "article",
      publishedTime,
      modifiedTime: new Date().toISOString(),
      structuredData: {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": title,
        "image": [image],
        "datePublished": publishedTime,
        "dateModified": new Date().toISOString(),
        "author": [{ "@type": "Person", "name": authorName || "Admin" }],
        "publisher": { "@type": "Organization", "name": SITE.name, "logo": { "@type": "ImageObject", "url": SITE.image } },
        "description": description,
        "articleBody": body,
        "articleSection": leagueName || "Football"
      }
    });
  },

  faqPage({ faqs, path }) {
    return buildSEO({
      title: "Frequently Asked Questions",
      description: "Find answers to the most common questions about ZOKASCORE.",
      path,
      robots: "index,follow",
      structuredData: {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(f => ({
          "@type": "Question",
          "name": f.q,
          "acceptedAnswer": { "@type": "Answer", "text": f.a }
        }))
      }
    });
  },

  videoPage({ title, description, image, path, uploadDate, duration, contentUrl }) {
    return buildSEO({
      title,
      description,
      image,
      path,
      structuredData: {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": title,
        "description": description,
        "thumbnailUrl": [image],
        "uploadDate": uploadDate,
        "duration": duration,
        "contentUrl": contentUrl
      }
    });
  },

  profilePage({ username, path, avatar, bio, uid }) {
    return buildSEO({
      title: `${username} Profile`,
      description: `View ${username}'s prediction history, stats, and achievements on ZOKASCORE.`,
      path,
      robots: "noindex,follow", // Usually profiles are noindex
      structuredData: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "mainEntity": {
          "@type": "Person",
          "name": username,
          "image": avatar,
          "description": bio,
          "identifier": uid
        }
      }
    });
  }
};