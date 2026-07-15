// src/utils/schema.js
import { SITE } from "./seo";

/* ===========================
   ORGANIZATION
=========================== */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SportsOrganization",
    name: SITE.name,
    url: SITE.url,
    logo: `${SITE.url}/logo.png`,
    image: SITE.image,
    founder: { "@type": "Person", name: "Kimutai Gibson" },
    description: SITE.description,
    sameAs: [
      "https://facebook.com/zokascore",
      "https://x.com/zokascore",
      "https://instagram.com/zokascore",
    ],
  };
}

/* ===========================
   WEBSITE
=========================== */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE.url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/* ===========================
   WEBPAGE
=========================== */
export function webpageSchema({ title, description, path }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title || SITE.name,
    description: description || SITE.description,
    url: `${SITE.url}${path || "/"}`,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
  };
}

/* ===========================
   COLLECTION PAGE
=========================== */
export function collectionSchema({ title, description, path }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title || SITE.name,
    description: description || SITE.description,
    url: `${SITE.url}${path || "/"}`,
  };
}

/* ===========================
   FAQ
=========================== */
export function faqSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/* ===========================
   BREADCRUMBS
=========================== */
export function breadcrumbSchema(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${SITE.url}${item.path}`,
    })),
  };
}