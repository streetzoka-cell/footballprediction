// api/ssr.cjs
const https = require('https');

// Native Node.js fetch to avoid Vercel dependency issues
const fetchUrl = (url) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, data });
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
};

module.exports = async (req, res) => {
  try {
    const host = req.headers.host ? `https://${req.headers.host}` : 'https://zokascore.xyz';
    
    // 1. Fetch the base HTML shell from the live site
    const htmlRes = await fetchUrl(`${host}/index.html`);
    let html = htmlRes.data;

    if (!html || htmlRes.status !== 200) {
      return res.status(500).send('Failed to load base HTML');
    }

    // 2. Extract parameters
    const { matchId, slug, teamId, leagueId } = req.query;
    
    let title = 'ZOKASCORE | Football Predictions, Live Scores & Fixtures';
    let description = 'Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.';
    let canonicalUrl = `${host}${req.url}`;
    let jsonLd = null;
    let is404 = false;

    const BASE_API = "https://api.zokascore.xyz/api/v1";

    // 3. MATCH PAGE
    if (matchId) {
      try {
        const r = await fetchUrl(`${BASE_API}/matches/${matchId}`);
        if (r.status === 404) is404 = true;
        const data = JSON.parse(r.data);
        if (data.success && data.data) {
          const m = data.data;
          const homeName = m.homeName || m.homeTeam?.name || 'Home';
          const awayName = m.awayName || m.awayTeam?.name || 'Away';
          const leagueName = m.leagueName || m.league?.name || 'Football';
          
          title = `${homeName} vs ${awayName} Prediction, Live Score & H2H | ZOKASCORE`;
          description = `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis. ${leagueName} match.`;
          canonicalUrl = `${host}/match/${matchId}/${slug || ''}`;
          
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
      } catch (e) { console.error("Match fetch failed", e.message); }
    }

    // 4. TEAM PAGE
    if (teamId) {
      try {
        const r = await fetchUrl(`${BASE_API}/teams/${teamId}`);
        if (r.status === 404) is404 = true;
        const data = JSON.parse(r.data);
        if (data.success && data.data) {
          const t = data.data;
          title = `${t.name} Fixtures, Results & Live Scores | ZOKASCORE`;
          description = `Latest fixtures, form, results and statistics for ${t.name}.`;
          canonicalUrl = `${host}/team/${teamId}/${slug || ''}`;
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "SportsTeam",
            "name": t.name,
            "sport": "Football",
            "logo": t.logo,
            "url": canonicalUrl
          };
        }
      } catch (e) { console.error("Team fetch failed", e.message); }
    }

    // 5. LEAGUE PAGE
    if (leagueId) {
      try {
        const r = await fetchUrl(`${BASE_API}/leagues/${leagueId}`);
        if (r.status === 404) is404 = true;
        const data = JSON.parse(r.data);
        if (data.success && data.data) {
          const l = data.data;
          title = `${l.name} Table, Fixtures & Standings | ZOKASCORE`;
          description = `Live ${l.name} standings, fixtures, results and statistics.`;
          canonicalUrl = `${host}/league/${leagueId}/${slug || ''}`;
          jsonLd = {
            "@context": "https://schema.org",
            "@type": "SportsLeague",
            "name": l.name,
            "sport": "Football",
            "logo": l.logo,
            "url": canonicalUrl
          };
        }
      } catch (e) { console.error("League fetch failed", e.message); }
    }

    if (is404) {
      return res.status(404).send('Match or Entity not found');
    }

    // 6. Construct the SEO tags
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

    // 7. Inject tags right before </head>
    html = html.replace('</head>', `${seoTags}</head>`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error("SSR Fatal Error:", err);
    return res.status(500).send('Internal Server Error');
  }
};