// COMPAT SHIM — src/utils/schema.js
// ─────────────────────────────────────────────────────────────
// This file used to carry its own SITE + schemas = 3 divergent copies
// (the "schema conflict"). Now ./seoBuilder.js is the ONLY definition;
// this shim just keeps old `from "./schema"` imports alive.
// ★ FIX: removed require() — illegal in Vite ESM, crashed at runtime.
// ★ FIX: hardcoded URLs replaced with SITE.

import { SITE, websiteSchema, organizationSchema, breadcrumbSchema } from './seoBuilder';

export { SITE, websiteSchema, organizationSchema, breadcrumbSchema };

export function webpageSchema({ title, description, path } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: `${SITE.url}${path || "/"}`,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
  };
}

export function collectionSchema({ title, description, path } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${SITE.url}${path || "/"}`,
  };
}

export function faqSchema(items = []) {
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