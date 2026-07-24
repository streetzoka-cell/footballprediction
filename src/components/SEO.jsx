import { Helmet } from "react-helmet-async";
import { SITE } from "../utils/seo";

export default function SEO({
  title,
  description = SITE.description,
  path = "/",
  image = SITE.image,
  robots = "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1",
  keywords = SITE.keywords,
  type = "website",
  canonical,
  locale = SITE.locale,
  publishedTime,
  modifiedTime,
  author = SITE.author,
  structuredData,
  children,
}) {
  const pageTitle = title
    ? title.includes(SITE.name)
      ? title
      : `${title} | ${SITE.name}`
    : SITE.name;

  const url = canonical || `${SITE.url}${path}`;

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
      <meta
        name="googlebot"
        content="index,follow,max-snippet:-1,max-image-preview:large"
      />

      <meta name="theme-color" content={SITE.themeColor} />

      <link rel="canonical" href={url} />

      {/* Language */}
      <link rel="alternate" hrefLang="en-KE" href={url} />
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
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={SITE.twitter} />
      <meta name="twitter:creator" content={SITE.twitter} />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Article */}
      {publishedTime && (
        <meta
          property="article:published_time"
          content={publishedTime}
        />
      )}

      {modifiedTime && (
        <meta
          property="article:modified_time"
          content={modifiedTime}
        />
      )}

      {/* JSON-LD (Supports single object or array of objects) */}
      {structuredData && (
        (Array.isArray(structuredData) ? structuredData : [structuredData]).map((data, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
          />
        ))
      )}

      {children}
    </Helmet>
  );
}