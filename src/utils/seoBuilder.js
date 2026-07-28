// src/utils/seoBuilder.js
import { organizationSchema, websiteSchema, breadcrumbSchema, webpageSchema, faqSchema, collectionSchema } from './schema';

export const SITE = {
  name: "ZOKASCORE",
  url: "https://zokascore.xyz",
  description: "Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.",
  image: "https://zokascore.xyz/og-image.png",
  keywords: "football predictions, live scores, fixtures, ZOKASCORE, soccer, premier league, la liga, champions league",
  locale: "en_GB",
  twitter: "@zokascore",
  themeColor: "#0a0f1a",
};

/**
 * Generates a standardized SEO object for the SEO component.
 */
export function buildSEO({ title, description, image, keywords, type = "website", canonical, path, robots = "index,follow", structuredData }) {
  const fullTitle = title ? `${title} | ${SITE.name}` : SITE.name;
  const url = canonical || `${SITE.url}${path || "/"}`;
  const finalImage = image || SITE.image;
  const finalKeywords = keywords || SITE.keywords;
  const finalDescription = description || SITE.description;

  // Always include WebSite and Organization schema alongside any specific page schema
  const defaultSchemas = [websiteSchema(), organizationSchema()];
  if (structuredData) {
    if (Array.isArray(structuredData)) {
      defaultSchemas.push(...structuredData);
    } else {
      defaultSchemas.push(structuredData);
    }
  }

  return {
    title: fullTitle,
    description: finalDescription,
    keywords: finalKeywords,
    image: finalImage,
    type,
    url,
    robots,
    structuredData: defaultSchemas,
  };
}

/**
 * Pre-built SEO generators for specific page types.
 */
export const seoGenerators = {
  matchPage: ({ homeName, awayName, leagueName, date, venue, isLive, isFinished, homeScore, awayScore, path }) => {
    const title = `${homeName} vs ${awayName} Prediction, Live Score, H2H & AI Analysis`;
    const description = `${homeName} vs ${awayName} live score, AI match prediction, xG timeline, head-to-head statistics, league standings, kickoff time and match analysis on ZOKASCORE.`;
    
    const sportsSchema = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      "name": `${homeName} vs ${awayName}`,
      "sport": "Football",
      "startDate": date,
      "endDate": new Date(new Date(date).getTime() + 7200000).toISOString(),
      "eventStatus": isLive ? "https://schema.org/EventScheduled" : isFinished ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
      "homeTeam": { "@type": "SportsTeam", "name": homeName },
      "awayTeam": { "@type": "SportsTeam", "name": awayName },
      "location": { "@type": "Place", "name": venue?.name || leagueName },
      ...(isFinished && { 
        "result": { 
          "@type": "SportsResult", 
          "homeTeamScore": homeScore, 
          "awayTeamScore": awayScore 
        } 
      })
    };

    const breadcrumbs = breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Fixtures", path: "/fixtures" },
      { name: leagueName, path: `/league/${path.split('/')[2]}/${leagueName.toLowerCase().replace(/\s+/g, '-')}` },
      { name: `${homeName} vs ${awayName}` }
    ]);

    return buildSEO({
      title,
      description,
      keywords: `${homeName} vs ${awayName}, ${homeName} live score, ${awayName} live score, ${leagueName} predictions`,
      path,
      structuredData: [sportsSchema, breadcrumbs]
    });
  },

  leaguePage: ({ leagueName, path }) => {
    const title = `${leagueName} Table, Standings & Fixtures`;
    const description = `Live ${leagueName} standings, table, fixtures, and scores on ZOKASCORE.`;
    
    const collectionSchema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": title,
      "description": description,
      "url": `${SITE.url}${path}`
    };

    return buildSEO({
      title,
      description,
      keywords: `${leagueName} standings, ${leagueName} table, ${leagueName} fixtures`,
      path,
      structuredData: [collectionSchema]
    });
  },

  teamPage: ({ teamName, path }) => {
    const title = `${teamName} Fixtures, Live Scores & Form`;
    const description = `Latest ${teamName} matches, live scores, fixtures, and predictions on ZOKASCORE.`;
    
    const teamSchema = {
      "@context": "https://schema.org",
      "@type": "SportsTeam",
      "name": teamName,
      "sport": "Soccer",
      "url": `${SITE.url}${path}`
    };

    return buildSEO({
      title,
      description,
      keywords: `${teamName} fixtures, ${teamName} live score, ${teamName} results`,
      path,
      structuredData: [teamSchema]
    });
  }
};