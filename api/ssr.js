// api/ssr.js
const fs = require('fs');
const path = require('path');

export default async function handler(req, res) => {
  try {
    // 1. Read the built index.html
    let html = '';
    const distPath = path.join(process.cwd(), 'dist', 'index.html');
    const rootPath = path.join(process.cwd(), 'index.html');
    
    if (fs.existsSync(distPath)) html = fs.readFileSync(distPath, 'utf8');
    else if (fs.existsSync(rootPath)) html = fs.readFileSync(rootPath, 'utf8');
    else {
      return res.status(404).send('HTML template not found');
    }

    // 2. Extract parameters
    const { matchId, slug } = req.query;
    
    let title = 'ZOKASCORE | Football Predictions, Live Scores & Fixtures';
    let description = 'Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.';
    let canonicalUrl = `https://zokascore.xyz${req.url}`;
    let jsonLd = null;

    // 3. Fetch match data if it's a match route
    if (matchId) {
      try {
        const r = await fetch(`https://api.zokascore.xyz/api/v1/matches/${matchId}`);
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
        console.error("SSR Data fetch failed, serving default HTML:", e.message);
      }
    }

    // 4. Construct the SEO tags
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

    // 5. Inject tags right before </head>
    html = html.replace('</head>', `${seoTags}</head>`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error("SSR Fatal Error:", err);
    return res.status(500).send('Internal Server Error');
  }
}