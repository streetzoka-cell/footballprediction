// COMPAT SHIM — src/utils/schema.js
// Old file duplicated SITE + schemas from seoBuilder.js = 3 copies of SITE = schema conflict
// This shim keeps old imports working, but points to single source

export { SITE, websiteSchema, organizationSchema, breadcrumbSchema } from './seoBuilder';

// Legacy wrappers that existed in old schema.js — mapped to new seoBuilder equivalents
export function webpageSchema({ title, description, path }) {
  const { buildSEO } = require('./seoBuilder');
  // fallback simple WebPage schema
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `https://zokascore.xyz${path || "/"}`,
    isPartOf: { "@type": "WebSite", name: "ZOKASCORE", url: "https://zokascore.xyz" },
  };
}

export function collectionSchema({ title, description, path }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `https://zokascore.xyz${path || "/"}`,
  };
}

export function faqSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question || item.q,
      acceptedAnswer: { "@type": "Answer", text: item.answer || item.a },
    })),
  };
}
