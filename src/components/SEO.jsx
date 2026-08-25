import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { SITE, generateBreadcrumbs, breadcrumbSchema, websiteSchema, organizationSchema } from "../utils/seoBuilder";

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
  breadcrumbs: propBreadcrumbs,
  includeBreadcrumbs = true,
  prevPath,
  nextPath,
  children,
}) {
  const location = useLocation();

  // ★ Sanitize canonical — strip trailing slash to avoid duplicate-URL penalty
  const cleanPath = location.pathname.replace(/\/$/, "") || "/";
  const url = canonical || `${SITE.url}${cleanPath}`;

  // ★ Title — always append brand unless already present
  const pageTitle = title
    ? title.includes(SITE.name)
      ? title
      : `${title} | ${SITE.name}`
    : `${SITE.name} — Football Predictions, Live Scores & Fixtures`;

  // ★ Breadcrumbs
  const crumbs = propBreadcrumbs || generateBreadcrumbs(location.pathname);

  // ★ Build structured-data stack
  const schemas = [];
  if (structuredData) {
    if (Array.isArray(structuredData)) schemas.push(...structuredData);
    else schemas.push(structuredData);
  }

  // BreadcrumbList — only if not already provided
  const hasBreadcrumbs = schemas.some((s) => s["@type"] === "BreadcrumbList");
  if (includeBreadcrumbs && !hasBreadcrumbs) {
    const bcSchema = breadcrumbSchema(crumbs);
    if (bcSchema) schemas.push(bcSchema);
  }

  // ★ WebSite + Organization schemas — homepage ONLY (prevents duplication)
  const isHome = cleanPath === "/";
  if (isHome) {
    schemas.push(websiteSchema(), organizationSchema());
  }

  return (
    <Helmet prioritizeSeoTags>
      {/* ── Core meta ─────────────────────────────────────── */}
      <html lang="en" />
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" key="viewport" />
      <meta name="theme-color" content={SITE.themeColor} key="theme-color" />

      {/* ── Title & indexing ─────────────────────────────── */}
      <title>{pageTitle}</title>
      <meta name="description" content={description} key="meta-desc" />
      <meta name="keywords" content={keywords} key="meta-kw" />
      <meta name="author" content={author} key="meta-author" />
      <meta name="robots" content={robots} key="meta-robots" />
      <meta name="googlebot" content="index,follow,max-snippet:-1,max-image-preview:large" key="meta-gbot" />

      {/* ── Canonical & pagination ──────────────────────── */}
      <link rel="canonical" href={url} key="canonical" />
      {prevPath && <link rel="prev" href={`${SITE.url}${prevPath}`} key="prev" />}
      {nextPath && <link rel="next" href={`${SITE.url}${nextPath}`} key="next" />}

      {/* ── Hreflang (self-referencing + x-default) ─────── */}
      <link rel="alternate" hrefLang="en" href={url} key="hreflang-en" />
      <link rel="alternate" hrefLang="x-default" href={url} key="hreflang-default" />

      {/* ── Open Graph ──────────────────────────────────── */}
      <meta property="og:type" content={type} key="og-type" />
      <meta property="og:site_name" content={SITE.name} key="og-site" />
      <meta property="og:locale" content={locale} key="og-locale" />
      <meta property="og:title" content={pageTitle} key="og-title" />
      <meta property="og:description" content={description} key="og-desc" />
      <meta property="og:url" content={url} key="og-url" />
      <meta property="og:image" content={image} key="og-image" />
      <meta property="og:image:secure_url" content={image} key="og-sec-image" />
      <meta property="og:image:width" content="1200" key="og-w" />
      <meta property="og:image:height" content="630" key="og-h" />

      {/* ── Twitter Card ────────────────────────────────── */}
      <meta name="twitter:card" content="summary_large_image" key="tw-card" />
      <meta name="twitter:site" content={SITE.twitter} key="tw-site" />
      <meta name="twitter:creator" content={SITE.twitter} key="tw-creator" />
      <meta name="twitter:title" content={pageTitle} key="tw-title" />
      <meta name="twitter:description" content={description} key="tw-desc" />
      <meta name="twitter:image" content={image} key="tw-image" />

      {/* ── Article timestamps ──────────────────────────── */}
      {publishedTime && <meta property="article:published_time" content={publishedTime} key="pub-time" />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} key="mod-time" />}

      {/* ── Structured Data (JSON-LD) ───────────────────── */}
      {schemas.map((data, i) => (
        <script
          key={`schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}

      {children}
    </Helmet>
  );
}
