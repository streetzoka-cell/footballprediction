// src/components/SEO.jsx

import { Helmet } from "react-helmet-async";
import { SITE } from "../utils/seo";

export default function SEO({
  title,
  description = SITE.description,
  path = "/",
  image = SITE.image,
  robots = "index,follow",
  keywords = SITE.keywords,
  type = "website",
  canonical,
  children,
}) {
  const pageTitle = title
    ? `${title} | ${SITE.name}`
    : SITE.name;

  const url = canonical || `${SITE.url}${path}`;

  return (
    <Helmet prioritizeSeoTags>

      <title>{pageTitle}</title>

      <meta
        name="description"
        content={description}
      />

      <meta
        name="keywords"
        content={keywords}
      />

      <meta
        name="robots"
        content={robots}
      />

      <link
        rel="canonical"
        href={url}
      />

      {/* Open Graph */}

      <meta
        property="og:type"
        content={type}
      />

      <meta
        property="og:site_name"
        content={SITE.name}
      />

      <meta
        property="og:title"
        content={pageTitle}
      />

      <meta
        property="og:description"
        content={description}
      />

      <meta
        property="og:url"
        content={url}
      />

      <meta
        property="og:image"
        content={image}
      />

      {/* Twitter */}

      <meta
        name="twitter:card"
        content="summary_large_image"
      />

      <meta
        name="twitter:title"
        content={pageTitle}
      />

      <meta
        name="twitter:description"
        content={description}
      />

      <meta
        name="twitter:image"
        content={image}
      />

      <meta
        name="theme-color"
        content={SITE.themeColor}
      />

      {children}

    </Helmet>
  );
}