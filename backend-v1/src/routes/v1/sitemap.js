
// backend-v1/src/routes/v1/sitemap.js

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const HOST = "https://zokascore.xyz";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "public_data",
  "fixtures"
);

const RESULTS_DIR = path.join(
  process.cwd(),
  "public_data",
  "results"
);

// Keep comfortably below Google's 50,000 URL limit.
const MAX_URLS_PER_SITEMAP = 40000;

// Sitemap content is rebuilt at most every 6 hours.
const CACHE_TTL = 6 * 60 * 60 * 1000;

let sitemapCache = {
  static: null,

  // Arrays of XML strings.
  matches: null,
  teams: null,
  leagues: null,

  lastUpdated: 0
};

/* ============================================================
   HELPERS
============================================================ */

const createSlug = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const chunkArray = (array, size) => {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
};

const buildUrlset = (urls) => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
};

/* ============================================================
   JSON DATA
============================================================ */

const readJsonFiles = (directory) => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".json"));

  const data = [];

  for (const file of files) {
    try {
      const filePath = path.join(directory, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);

      const records =
        Array.isArray(parsed?.matches)
          ? parsed.matches
          : Array.isArray(parsed?.data)
            ? parsed.data
            : [];

      data.push(...records);
    } catch (error) {
      console.error(
        `[Sitemap] Failed to read ${file}:`,
        error.message
      );
    }
  }

  return data;
};

/* ============================================================
   MATCH VALIDATION
============================================================ */

const getHomeName = (match) =>
  match.homeName || match.homeTeam?.name || null;

const getAwayName = (match) =>
  match.awayName || match.awayTeam?.name || null;

const isValidMatch = (match) => {
  if (!match || !match.id) {
    return false;
  }

  const homeName = getHomeName(match);
  const awayName = getAwayName(match);

  return Boolean(homeName && awayName);
};

/* ============================================================
   LAST MODIFIED
============================================================ */

const getLastModified = (match) => {
  const candidates = [
    match.updatedAt,
    match.lastUpdated,
    match.modifiedAt,
    match.createdAt,
    match.date
  ];

  for (const value of candidates) {
    if (!value) {
      continue;
    }

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Important:
  // Do NOT invent a modification date.
  return null;
};

/* ============================================================
   URL XML
============================================================ */

const buildMatchUrl = (match) => {
  const id = String(match.id);

  const homeName = getHomeName(match);
  const awayName = getAwayName(match);

  const slug =
    `${createSlug(homeName)}-vs-${createSlug(awayName)}`;

  const url =
    `${HOST}/match/${encodeURIComponent(id)}/${slug}`;

  const lastmod = getLastModified(match);

  return `<url>
  <loc>${escapeXml(url)}</loc>
  ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}
  <changefreq>daily</changefreq>
  <priority>0.9</priority>
</url>`;
};

const buildTeamUrl = (id, name) => {
  const url =
    `${HOST}/team/${encodeURIComponent(String(id))}/${createSlug(name)}`;

  return `<url>
  <loc>${escapeXml(url)}</loc>
  <changefreq>daily</changefreq>
  <priority>0.7</priority>
</url>`;
};

const buildLeagueUrl = (id, name) => {
  const url =
    `${HOST}/league/${encodeURIComponent(String(id))}/${createSlug(name)}`;

  return `<url>
  <loc>${escapeXml(url)}</loc>
  <changefreq>daily</changefreq>
  <priority>0.8</priority>
</url>`;
};

/* ============================================================
   CACHE REBUILD
============================================================ */

const rebuildSitemapCache = () => {
  console.log("[Sitemap] Rebuilding sitemap cache...");

  const fixtures = readJsonFiles(FIXTURES_DIR);
  const results = readJsonFiles(RESULTS_DIR);

  const allMatches = [
    ...fixtures,
    ...results
  ];

  const seenMatches = new Set();
  const seenTeams = new Set();
  const seenLeagues = new Set();

  const matchUrls = [];
  const teamUrls = [];
  const leagueUrls = [];

  /* ----------------------------------------------------------
     SINGLE PASS
  ---------------------------------------------------------- */

  for (const match of allMatches) {

    /* MATCHES */

    if (isValidMatch(match)) {
      const matchId = String(match.id);

      if (!seenMatches.has(matchId)) {
        seenMatches.add(matchId);

        matchUrls.push(
          buildMatchUrl(match)
        );
      }
    }

    /* LEAGUE */

    const leagueId =
      match.league?.id ||
      match.leagueId;

    const leagueName =
      match.league?.name ||
      match.leagueName;

    if (
      leagueId &&
      leagueName &&
      !seenLeagues.has(String(leagueId))
    ) {
      seenLeagues.add(String(leagueId));

      leagueUrls.push(
        buildLeagueUrl(
          leagueId,
          leagueName
        )
      );
    }

    /* HOME TEAM */

    const homeId =
      match.homeTeam?.id ||
      match.homeTeamId;

    const homeName =
      match.homeTeam?.name ||
      match.homeName;

    if (
      homeId &&
      homeName &&
      !seenTeams.has(String(homeId))
    ) {
      seenTeams.add(String(homeId));

      teamUrls.push(
        buildTeamUrl(
          homeId,
          homeName
        )
      );
    }

    /* AWAY TEAM */

    const awayId =
      match.awayTeam?.id ||
      match.awayTeamId;

    const awayName =
      match.awayTeam?.name ||
      match.awayName;

    if (
      awayId &&
      awayName &&
      !seenTeams.has(String(awayId))
    ) {
      seenTeams.add(String(awayId));

      teamUrls.push(
        buildTeamUrl(
          awayId,
          awayName
        )
      );
    }
  }

  /* ----------------------------------------------------------
     STATIC PAGES
  ---------------------------------------------------------- */

  const staticPages = [
    {
      path: "/",
      priority: "1.0",
      changefreq: "hourly"
    },
    {
      path: "/fixtures",
      priority: "0.9",
      changefreq: "hourly"
    },
    {
      path: "/predictions",
      priority: "0.9",
      changefreq: "daily"
    },
    {
      path: "/leaderboard",
      priority: "0.8",
      changefreq: "hourly"
    },
    {
      path: "/highlights",
      priority: "0.8",
      changefreq: "daily"
    },
    {
      path: "/about",
      priority: "0.5",
      changefreq: "monthly"
    },
    {
      path: "/faq",
      priority: "0.5",
      changefreq: "monthly"
    }
  ];

  const staticUrls = staticPages.map(
    (page) => `<url>
  <loc>${escapeXml(`${HOST}${page.path}`)}</loc>
  <changefreq>${page.changefreq}</changefreq>
  <priority>${page.priority}</priority>
</url>`
  );

  sitemapCache.static =
    buildUrlset(staticUrls);

  /* ----------------------------------------------------------
     CHUNK SITEMAPS
  ---------------------------------------------------------- */

  sitemapCache.matches =
    chunkArray(
      matchUrls,
      MAX_URLS_PER_SITEMAP
    ).map(buildUrlset);

  sitemapCache.teams =
    chunkArray(
      teamUrls,
      MAX_URLS_PER_SITEMAP
    ).map(buildUrlset);

  sitemapCache.leagues =
    chunkArray(
      leagueUrls,
      MAX_URLS_PER_SITEMAP
    ).map(buildUrlset);

  /*
   * If there are genuinely zero URLs in a category,
   * keep an empty array. This is different from null,
   * which means the cache hasn't been generated yet.
   */
  sitemapCache.lastUpdated = Date.now();

  console.log(
    `[Sitemap] Generated ${matchUrls.length} matches, ` +
    `${teamUrls.length} teams, ` +
    `${leagueUrls.length} leagues`
  );

  console.log(
    `[Sitemap] Chunks: ` +
    `${sitemapCache.matches.length} match, ` +
    `${sitemapCache.teams.length} team, ` +
    `${sitemapCache.leagues.length} league`
  );
};

/* ============================================================
   CACHE VALIDATION
============================================================ */

const ensureSitemapCache = () => {
  const expired =
    Date.now() - sitemapCache.lastUpdated >
    CACHE_TTL;

  const uninitialized =
    sitemapCache.static === null ||
    sitemapCache.matches === null ||
    sitemapCache.teams === null ||
    sitemapCache.leagues === null;

  if (expired || uninitialized) {
    rebuildSitemapCache();
  }
};

/* ============================================================
   SITEMAP INDEX
============================================================ */

router.get(
  ["/", "/sitemap.xml"],
  (req, res) => {
    try {
      ensureSitemapCache();

      const lastmod =
        new Date(
          sitemapCache.lastUpdated
        ).toISOString();

      const entries = [];

      /* STATIC */

      entries.push(`
  <sitemap>
    <loc>${escapeXml(
      `${HOST}/sitemaps/static.xml`
    )}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);

      /* MATCHES */

      sitemapCache.matches.forEach((_, index) => {
        entries.push(`
  <sitemap>
    <loc>${escapeXml(
      `${HOST}/sitemaps/matches-${index + 1}.xml`
    )}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
      });

      /* TEAMS */

      sitemapCache.teams.forEach((_, index) => {
        entries.push(`
  <sitemap>
    <loc>${escapeXml(
      `${HOST}/sitemaps/teams-${index + 1}.xml`
    )}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
      });

      /* LEAGUES */

      sitemapCache.leagues.forEach((_, index) => {
        entries.push(`
  <sitemap>
    <loc>${escapeXml(
      `${HOST}/sitemaps/leagues-${index + 1}.xml`
    )}</loc>
    <lastmod>${lastmod}</lastmod>
  </sitemap>`);
      });

      const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("")}
</sitemapindex>`;

      res
        .status(200)
        .type("application/xml")
        .set(
          "Cache-Control",
          "public, s-maxage=3600, max-age=3600"
        )
        .send(indexXml);

    } catch (error) {
      console.error(
        "[Sitemap] Index generation failed:",
        error
      );

      res
        .status(500)
        .send("Sitemap generation failed.");
    }
  }
);

/* ============================================================
   INDIVIDUAL SITEMAPS
============================================================ */

router.get(
  "/sitemaps/:type",
  (req, res) => {
    try {
      ensureSitemapCache();

      const type = req.params.type;

      let xml = null;

      /* STATIC */

      if (type === "static.xml") {
        xml = sitemapCache.static;
      }

      /* DYNAMIC CHUNKS */

      else {
        const match =
          type.match(
            /^(matches|teams|leagues)-(\d+)\.xml$/
          );

        if (match) {
          const category = match[1];

          const index =
            parseInt(match[2], 10) - 1;

          const chunks =
            sitemapCache[category];

          if (
            chunks &&
            index >= 0 &&
            index < chunks.length
          ) {
            xml = chunks[index];
          }
        }
      }

      if (!xml) {
        return res
          .status(404)
          .type("text/plain")
          .send("Not found");
      }

      res
        .status(200)
        .type("application/xml")
        .set(
          "Cache-Control",
          "public, s-maxage=3600, max-age=3600"
        )
        .send(xml);

    } catch (error) {
      console.error(
        "[Sitemap] Generation failed:",
        error
      );

      res
        .status(500)
        .send("Sitemap generation failed.");
    }
  }
);

module.exports = router;

