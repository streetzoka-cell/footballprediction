// api/ssr.js
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  try {
    // 1. Robustly locate the built index.html
    let html = '';
    const possiblePaths = [
      path.join(process.cwd(), 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html'),
      path.join(__dirname, '..', 'index.html'),
      path.join(__dirname, '..', '..', 'index.html')
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        html = fs.readFileSync(p, 'utf8');
        break;
      }
    }

    if (!html) {
      console.error("SSR Error: index.html not found in paths:", possiblePaths);
      return res.status(500).send('HTML template not found');
    }

    // 2. Extract parameters from Vercel query
    const { matchId, slug, teamId, leagueId } = req.query;
    
    let title = 'ZOKASCORE | Football Predictions, Live Scores & Fixtures';
    let description = 'Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.';
    let canonicalUrl = `https://zokascore.xyz${req.url}`;
    let jsonLd = null;
    let is404 = false;

    const BASE_API = "https://api.zokascore.xyz/api/v1";

    // 3. MATCH PAGE
    if (matchId) {
      try {
        const r = await fetch(`${BASE_API}/matches/${matchId}`);
        if (r.status === 404) is404 = true;
        const data = await r.json();
        if (data.success && data.data) {
          const m = data.data;
          const homeName = m.homeName || m.homeTeam?.name || 'Home';
          const awayName = m.awayName || m.awayTeam?.name || 'Away';
          const leagueName = m.leagueName || m.league?.name || 'Football';
          
          title = `${homeName} vs ${awayName} Prediction, Live Score & H2H | ZOKASCORE`;
          description = `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis. ${leagueName} match.`;
          canonicalUrl = `https://zokascore.xyz/match/${matchId}/${slug || ''}`;
          
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            "name": `${homeName} vs ${awayName}`,
            "sport": "Football",
            "startDate": m.date,
            "eventStatus": m.isFinished ? "https://schema.org/EventCompleted" : "https://schema.org/EventScheduled",
            "competitor": [
              { "@type": "SportsTeam", "name": homeName, "logo": m.homeLogo },
              { "@type": "SportsTeam", "name": awayName, "logo": m.awayLogo }
            ],
            "superEvent": { "@type": "SportsLeague", "name": leagueName }
          };
        }
      } catch (e) {
        console.error("SSR Match fetch failed:", e.message);
      }
    }

    // 4. TEAM PAGE
    if (teamId) {
      try {
        const r = await fetch(`${BASE_API}/teams/${teamId}`);
        if (r.status === 404) is404 = true;
        const data = await r.json();
        if (data.success && data.data) {
          const t = data.data;
          title = `${t.name} Fixtures, Results & Live Scores | ZOKASCORE`;
          description = `Latest fixtures, form, results and statistics for ${t.name}.`;
          canonicalUrl = `https://zokascore.xyz/team/${teamId}/${slug || ''}`;
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            "name": t.name,
            "sport": "Football",
            "logo": t.logo,
            "url": canonicalUrl
          };
        }
      } catch (e) {
        console.error("SSR Team fetch failed:", e.message);
      }
    }

    // 5. LEAGUE PAGE
    if (leagueId) {
      try {
        const r = await fetch(`${BASE_API}/leagues/${leagueId}`);
        if (r.status === 404) is404 = true;
        const data = await r.json();
        if (data.success && data.data) {
          const l = data.data;
          title = `${l.name} Table, Fixtures & Standings | ZOKASCORE`;
          description = `Live ${l.name} standings, fixtures, results and statistics.`;
          canonicalUrl = `https://zokascore.xyz/league/${leagueId}/${slug || ''}`;
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "SportsLeague",
            "name": l.name,
            "sport": "Football",
            "logo": l.logo,
            "url": canonicalUrl
          };
        }
      } catch (e) {
        console.error("SSR League fetch failed:", e.message);
      }
    }

    // 6. HANDLE 404 (SOFT 404 PREVENTION)
    if (is404) {
      return res.status(404).send('Match or Entity not found');
    }

    // 7. Construct the SEO tags
    const seoTags = `
      <title>${title}</title>
      <meta name="description" content="${description}" />
      <link rel="canonical" href="${canonicalUrl}" />
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:url" content="${canonicalUrl}" />
      <meta name="twitter:card" content="summary_large_image" />
      ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : ''}
    `;

    // 8. Inject tags right before </head>
    html = html.replace('</head>', `${seoTags}</head>`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error("SSR Fatal Error:", err);
    return res.status(500).send('Internal Server Error');
  }
};