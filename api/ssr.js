// api/ssr.js
import https from 'https';

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

const formatName = (slugPart) => {
  return slugPart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export default async function handler(req, res) {
  try {
    const host = req.headers.host ? `https://${req.headers.host}` : 'https://zokascore.xyz';
    
    // 1. Fetch the base HTML shell
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

    // 3. MATCH PAGE (Generate SEO directly from the URL slug!)
    if (matchId && slug) {
      const parts = slug.split('-vs-');
      if (parts.length === 2) {
        const homeName = formatName(parts[0]);
        const awayName = formatName(parts[1]);
        
        title = `${homeName} vs ${awayName} Prediction, Live Score & H2H | ZOKASCORE`;
        description = `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis.`;
        canonicalUrl = `${host}/match/${matchId}/${slug}`;
        
        jsonLd = {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          "name": `${homeName} vs ${awayName}`,
          "sport": "Football",
          "eventStatus": "https://schema.org/EventScheduled",
          "competitor": [
            { "@type": "SportsTeam", "name": homeName },
            { "@type": "SportsTeam", "name": awayName }
          ]
        };
      }
    }

    // 4. TEAM PAGE
    if (teamId && slug) {
      const teamName = formatName(slug);
      title = `${teamName} Fixtures, Results & Live Scores | ZOKASCORE`;
      description = `Latest fixtures, form, results and statistics for ${teamName}.`;
      canonicalUrl = `${host}/team/${teamId}/${slug}`;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsTeam",
        "name": teamName,
        "sport": "Football",
        "url": canonicalUrl
      };
    }

    // 5. LEAGUE PAGE
    if (leagueId && slug) {
      const leagueName = formatName(slug);
      title = `${leagueName} Table, Fixtures & Standings | ZOKASCORE`;
      description = `Live ${leagueName} standings, fixtures, results and statistics.`;
      canonicalUrl = `${host}/league/${leagueId}/${slug}`;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsLeague",
        "name": leagueName,
        "sport": "Football",
        "url": canonicalUrl
      };
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
}