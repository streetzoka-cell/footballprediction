// api/ssr.js
const API_BASE = "https://api.zokascore.xyz/api/v1";

const BOT_UA_PATTERN =
  /bot|crawl|spider|facebookexternalhit|twitterbot|whatsapp|telegrambot|slackbot|linkedinbot|discordbot|pinterest|redditbot|embedly|quora link preview|showyoubot|outbrain|vkshare|w3c_validator|nuzzel|skypeuripreview|applebot/i;

const escapeHtml = (str = "") =>
  String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

async function readBaseHtml(req) {
  try {
    // ★ FIX: Fetch the static HTML over HTTP. Vercel serverless cannot read /dist from disk.
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const res = await fetch(`${protocol}://${host}/index.html`);
    
    if (!res.ok) throw new Error('Failed to fetch index.html');
    return await res.text();
  } catch (e) {
    // Build artifact missing — fall back to a minimal shell rather than crashing.
    return "<!DOCTYPE html><html><head><title>ZOKASCORE</title></head><body><div id=\"root\"></div></body></html>";
  }
}

function injectMeta(html, { title, description, url, image }) {
  let out = html;

  if (title) {
    const safeTitle = escapeHtml(title);
    out = /<title>.*?<\/title>/.test(out)
      ? out.replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`)
      : out.replace("</head>", `<title>${safeTitle}</title></head>`);
    out = out.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${safeTitle}$2`);
    out = out.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${safeTitle}$2`);
  }

  if (description) {
    const safeDesc = escapeHtml(description);
    out = /<meta name="description"/.test(out)
      ? out.replace(/(<meta name="description" content=")[^"]*(")/, `$1${safeDesc}$2`)
      : out.replace("</head>", `<meta name="description" content="${safeDesc}"></head>`);
    out = out.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${safeDesc}$2`);
    out = out.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${safeDesc}$2`);
  }

  if (url) {
    out = out.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapeHtml(url)}$2`);
    out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(url)}$2`);
  }

  if (image) {
    out = out.replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`);
    out = out.replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${escapeHtml(image)}$2`);
  }

  return out;
}

async function safeFetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildMetaForPath(pathname, query) {
  const matchMatch = pathname.match(/^\/match\/([^/]+)/);
  if (matchMatch) {
    const [, matchId] = matchMatch;
    const json = await safeFetchJson(`${API_BASE}/match/${matchId}`);
    const m = json?.data;
    if (m) {
      const home = m.homeTeam?.name || m.homeName || "Home";
      const away = m.awayTeam?.name || m.awayName || "Away";
      const league = m.league?.name || m.leagueName || "";
      return {
        title: `${home} vs ${away} — Live Score, Prediction & H2H | ZOKASCORE`,
        description: `${home} vs ${away}${league ? ` (${league})` : ""} — live score, head-to-head stats, and match prediction on ZOKASCORE.`,
        url: `https://zokascore.xyz${pathname}`,
        image: m.homeTeam?.logo || m.homeLogo,
      };
    }
  }

  const teamMatch = pathname.match(/^\/team\/([^/]+)/);
  if (teamMatch) {
    const [, teamId] = teamMatch;
    const json = await safeFetchJson(`${API_BASE}/teams/${teamId}`);
    const t = json?.data || json;
    if (t?.name) {
      return {
        title: `${t.name} — Fixtures, Results & Stats | ZOKASCORE`,
        description: `Latest fixtures, results, and statistics for ${t.name} on ZOKASCORE.`,
        url: `https://zokascore.xyz${pathname}`,
        image: t.logo,
      };
    }
  }

  const leagueMatch = pathname.match(/^\/(league|competition)\/([^/]+)/);
  if (leagueMatch) {
    const [, , leagueId] = leagueMatch;
    const json = await safeFetchJson(`${API_BASE}/standings?league=${leagueId}`);
    const leagueName = json?.data?.league?.name;
    if (leagueName) {
      return {
        title: `${leagueName} — Table, Fixtures & Results | ZOKASCORE`,
        description: `Live ${leagueName} standings, fixtures, and results on ZOKASCORE.`,
        url: `https://zokascore.xyz${pathname}`,
        image: json?.data?.league?.logo,
      };
    }
  }

  return null;
}

export default async function handler(req, res) {
  const baseHtml = await readBaseHtml(req);
  const ua = req.headers["user-agent"] || "";
  const isBot = BOT_UA_PATTERN.test(ua);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");

  if (!isBot) {
    return res.status(200).send(baseHtml);
  }

  try {
    const pathname = req.url.split("?")[0];
    const meta = await buildMetaForPath(pathname, req.query);
    const html = meta ? injectMeta(baseHtml, meta) : baseHtml;
    return res.status(200).send(html);
  } catch (e) {
    return res.status(200).send(baseHtml);
  }
}