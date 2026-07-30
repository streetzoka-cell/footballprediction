// src/components/SEO.jsx
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { SITE } from "../utils/seoBuilder";

export default function SEO({
  title,
  description = SITE.description,
  image = SITE.image,
  robots = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1",
  keywords = SITE.keywords,
  type = "website",
  canonical,
  locale = SITE.locale,
  publishedTime,
  modifiedTime,
  author = "Kimutai Gibson",
  structuredData,
  breadcrumbs,
  prevPath,
  nextPath,
  twitterLabel1,
  twitterData1,
  children,
}) {
  const location = useLocation();

  const pageTitle = title
    ? title.includes(SITE.name)
      ? title
      : `${title} | ${SITE.name}`
    : SITE.name;

  const url = canonical || `${SITE.url}${location.pathname}`;

  // Combine all structured data
  const schemas = [];
  if (structuredData) {
    if (Array.isArray(structuredData)) schemas.push(...structuredData);
    else schemas.push(structuredData);
  }
  
  if (breadcrumbs && breadcrumbs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: `${SITE.url}${item.path}`,
      })),
    });
  }

  return (
    <Helmet prioritizeSeoTags>
      {/* Primary */}
      <html lang="en-KE" />
      <title>{pageTitle}</title>
      <meta charSet="utf-8" />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={robots} />
      <meta name="googlebot" content="index,follow,max-snippet:-1,max-image-preview:large" />

      {/* ★ NEW: Theme & PWA Meta */}
      <meta name="theme-color" content={SITE.themeColor} />
      <meta name="color-scheme" content="dark light" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      <link rel="canonical" href={url} />

      {/* ★ NEW: Prev / Next Pagination */}
      {prevPath && <link rel="prev" href={`${SITE.url}${prevPath}`} />}
      {nextPath && <link rel="next" href={`${SITE.url}${nextPath}`} />}

      {/* Language Alternates */}
      <link rel="alternate" hrefLang="en-KE" href={url} />
      <link rel="alternate" hrefLang="en" href={url} />
      <link rel="alternate" hrefLang="sw" href={url} />
      <link rel="alternate" hrefLang="fr" href={url} />
      <link rel="alternate" hrefLang="es" href={url} />
      <link rel="alternate" hrefLang="x-default" href={url} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={SITE.name} />
      <meta property="og:locale" content={locale} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:secure_url" content={image} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={pageTitle} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE.twitter} />
      <meta name="twitter:creator" content={SITE.twitter} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={pageTitle} />
      
      {/* ★ NEW: Twitter Labels */}
      {twitterLabel1 && <meta name="twitter:label1" content={twitterLabel1} />}
      {twitterData1 && <meta name="twitter:data1" content={twitterData1} />}

      {/* Article Meta */}
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}

      {/* Structured Data (JSON-LD) */}
      {schemas.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}

      {children}
    </Helmet>
  );
}