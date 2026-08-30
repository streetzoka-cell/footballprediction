// api/zokascore-index.js — serves the index at a NON-standard, non-guessable path.
// Never 5xx's a crawler: upstream failure degrades to a valid static fallback.

const HOST = "https://zokascore.xyz";
// Where the backend router is mounted (verify with curl):
const UPSTREAM = process.env.INDEX_UPSTREAM || "https://api.zokascore.xyz/api/v1/zokascore-index";

const XML_HEADERS = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, s-maxage=3600, max-age=1800, stale-while-revalidate=86400",
};

const STATIC_PATHS = [
  "/", "/fixtures", "/results", "/predictions", "/predictions/v21",
  "/mastergames", "/basketball", "/highlights", "/livestream", "/leaderboard",
  "/football-knowledge", "/developers", "/changelog", "/status",
  "/about", "/faq", "/help-center", "/contact", "/careers", "/partners",
  "/advertise", "/team", "/privacy", "/terms",
];

const fallbackStatic = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  STATIC_PATHS.map((p) => `  <url><loc>${HOST}${p}</loc></url>`).join("\n") + `\n</urlset>`;

const fallbackIndex = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  `  <sitemap><loc>${HOST}/zokascore-index/static.xml</loc></sitemap>\n</sitemapindex>`;

export default async function handler(req, res) {
  const target = String(req.query.target || "index");

  // ★ Old public names are dead on purpose — 410 tells Google to drop them.
  if (target === "gone") {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.status(410).send("Gone");
  }

  const upstreamUrl = target === "index" ? UPSTREAM : `${UPSTREAM}/${target}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    const body = await upstream.text();
    if (!upstream.ok || (!body.includes("<urlset") && !body.includes("<sitemapindex"))) {
      throw new Error(`upstream ${upstream.status}`);
    }
    Object.entries(XML_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("X-Index-Source", "upstream");
    return res.status(200).send(body);
  } catch {
    Object.entries(XML_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("X-Index-Source", "fallback");
    return res.status(200).send(target === "index" ? fallbackIndex() : fallbackStatic());
  }
}