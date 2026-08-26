import fs from "fs";
import path from "path";

const API_BASE = "https://api.zokascore.xyz/api/v1";

const escapeHtml = (str = "") =>
  String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function getBaseHtml() {
  try {
    const p1 = path.join(process.cwd(), "dist", "index.html");
    const p2 = path.join(process.cwd(), "public", "index.html");
    const p3 = path.join(process.cwd(), "..", "dist", "index.html");
    for (const p of [p1, p2, p3]) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    return fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  } catch {
    return "<!DOCTYPE html><html><head><title>ZOKASCORE</title></head><body><div id='root'></div></body></html>";
  }
}

function injectMeta(html, { title, description, url, image }) {
  let out = html;
  if (title) {
    const t = escapeHtml(title);
    out = out.replace(/<title>.*?<\/title>/, `<title>${t}</title>`);
    out = out.replace(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${t}"`);
    out = out.replace(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${t}"`);
  }
  if (description) {
    const d = escapeHtml(description);
    out = out.replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
    out = out.replace(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${d}"`);
    out = out.replace(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${d}"`);
  }
  if (url) {
    const u = escapeHtml(url);
    out = out.replace(/<link rel="canonical" href="[^"]*"/, `<link rel="canonical" href="${u}"`);
    out = out.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${u}"`);
  }
  if (image) {
    out = out.replace(/<meta property="og:image" content="[^"]*"/, `<meta property="og:image" content="${escapeHtml(image)}"`);
    out = out.replace(/<meta property="og:image:secure_url" content="[^"]*"/, `<meta property="og:image:secure_url" content="${escapeHtml(image)}"`);
    out = out.replace(/<meta name="twitter:image" content="[^"]*"/, `<meta name="twitter:image" content="${escapeHtml(image)}"`);
  }
  return out;
}

async function safeFetchJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function buildMeta(pathname) {
  const mMatch = pathname.match(/^\/match\/([^/]+)/);
  if (mMatch) {
    const json = await safeFetchJson(`${API_BASE}/match/${mMatch[1]}`);
    const m = json?.data;
    if (m) {
      const home = m.homeTeam?.name || m.homeName || "Home";
      const away = m.awayTeam?.name || m.awayName || "Away";
      const league = m.league?.name || "";
      return {
        title: `${home} vs ${away} Live Score, Prediction & H2H | ZOKASCORE`,
        description: `${home} vs ${away} ${league} live score, lineups, head-to-head and AI prediction on ZOKASCORE.`,
        url: `https://zokascore.xyz${pathname}`,
        image: m.homeTeam?.logo,
      };
    }
  }
  const tMatch = pathname.match(/^\/team\/([^/]+)/);
  if (tMatch) {
    const json = await safeFetchJson(`${API_BASE}/teams/${tMatch[1]}`);
    const t = json?.data || json;
    if (t?.name) return {
      title: `${t.name} Live Scores, Fixtures, Results & Stats | ZOKASCORE`,
      description: `${t.name} fixtures, results, standings and player stats. Live scores and schedule on ZOKASCORE.`,
      url: `https://zokascore.xyz${pathname}`,
      image: t.logo,
    };
  }
  const lMatch = pathname.match(/^\/(league|competition)\/([^/]+)/);
  if (lMatch) {
    const json = await safeFetchJson(`${API_BASE}/standings?league=${lMatch[2]}`);
    const name = json?.data?.league?.name || "Football League";
    return {
      title: `${name} Table, Live Scores, Fixtures & Results 2026/2027 | ZOKASCORE`,
      description: `Live ${name} standings, fixtures, results and top scorers. Updated hourly on ZOKASCORE.`,
      url: `https://zokascore.xyz${pathname}`,
    };
  }
  return null;
}

export default async function handler(req, res) {
  const baseHtml = getBaseHtml();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  try {
    const pathname = req.url.split("?")[0].replace(/\/$/, "") || "/";
    const meta = await buildMeta(pathname);
    return res.status(200).send(meta ? injectMeta(baseHtml, meta) : baseHtml);
  } catch {
    return res.status(200).send(baseHtml);
  }
}