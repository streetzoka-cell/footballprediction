// api/match/[matchId]/[slug].js
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

// ★ FIX 4: Dynamic Event Status Mapper
const getEventStatus = (status) => {
  switch ((status || '').toUpperCase()) {
    case 'FT':
    case 'AET':
    case 'PEN':
      return 'https://schema.org/EventCompleted';
    case 'LIVE':
    case '1H':
    case '2H':
    case 'HT':
      return 'https://schema.org/EventInProgress';
    case 'PST':
      return 'https://schema.org/EventPostponed';
    case 'CANC':
      return 'https://schema.org/EventCancelled';
    default:
      return 'https://schema.org/EventScheduled';
  }
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

    // 2. Extract parameters directly from req.url
    const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
    
    let matchId = null;
    let teamId = null;
    let leagueId = null;
    let slug = null;

    if (pathParts.length >= 3) {
      const type = pathParts[0];
      const id = pathParts[1];
      slug = pathParts.slice(2).join('/');
      
      if (type === 'match') matchId = id;
      if (type === 'team') teamId = id;
      if (type === 'league') leagueId = id;
    }
    
    // ★ FIX 8: Strip query parameters from canonical URL
    let canonicalUrl = `${host}${req.url.split('?')[0]}`;
    
    let title = 'ZOKASCORE | Football Predictions, Live Scores & Fixtures';
    let description = 'Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world.';
    let jsonLd = null;
    
    let seoH1 = 'ZOKASCORE - Football Predictions & Live Scores';
    let seoBodyText = 'Follow live football scores, predictions, and match statistics on ZOKASCORE.';

    const BASE_API = "https://api.zokascore.xyz/api/v1";

    // 3. MATCH PAGE
    if (matchId && slug) {
      let matchData = null;
      
      // ★ FIX 3: Fetch real match data instead of relying purely on slug
      try {
        let r = await fetchUrl(`${BASE_API}/matches/${matchId}`);
        if (r.status !== 200) r = await fetchUrl(`${BASE_API}/match/${matchId}`);
        
        if (r.status === 200) {
          const data = JSON.parse(r.data);
          if (data.success && data.data) matchData = data.data;
        }
      } catch (e) { console.error("Match fetch failed", e.message); }

      const parts = slug.split('-vs-');
      if (parts.length === 2) {
        const homeName = matchData?.homeName || matchData?.homeTeam?.name || formatName(parts[0]);
        const awayName = matchData?.awayName || matchData?.awayTeam?.name || formatName(parts[1]);
        const leagueName = matchData?.leagueName || matchData?.league?.name || 'Football';
        
        title = `${homeName} vs ${awayName} Prediction, Live Score & H2H | ZOKASCORE`;
        description = `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis. ${leagueName} match.`;
        canonicalUrl = `${host}/match/${matchId}/${slug}`;
        
        seoH1 = `${homeName} vs ${awayName}`;
        seoBodyText = `Follow ${homeName} vs ${awayName} live score, predictions, H2H, and match statistics on ZOKASCORE. ${leagueName} match.`;
        
        jsonLd = {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          "name": `${homeName} vs ${awayName}`,
          "sport": "Football",
          "startDate": matchData?.date || undefined,
          "eventStatus": getEventStatus(matchData?.status || matchData?.display?.status),
          "competitor": [
            { 
              "@type": "SportsTeam", 
              "name": homeName,
              "logo": matchData?.homeLogo || matchData?.homeTeam?.logo || undefined
            },
            { 
              "@type": "SportsTeam", 
              "name": awayName,
              "logo": matchData?.awayLogo || matchData?.awayTeam?.logo || undefined
            }
          ],
          "superEvent": { 
            "@type": "SportsLeague", 
            "name": leagueName 
          }
        };

        if (matchData?.isFinished) {
          jsonLd.result = {
            "@type": "SportsResult",
            "homeTeamScore": matchData.homeScore,
            "awayTeamScore": matchData.awayScore
          };
        }
      }
    }

    // 4. TEAM PAGE
    if (teamId && slug) {
      let teamData = null;
      try {
        const r = await fetchUrl(`${BASE_API}/teams/${teamId}`);
        if (r.status === 200) {
          const data = JSON.parse(r.data);
          if (data.success && data.data) teamData = data.data;
        }
      } catch (e) { console.error("Team fetch failed", e.message); }

      const teamName = teamData?.name || formatName(slug);
      title = `${teamName} Fixtures, Results & Live Scores | ZOKASCORE`;
      description = `Latest fixtures, form, results and statistics for ${teamName}.`;
      canonicalUrl = `${host}/team/${teamId}/${slug}`;
      
      seoH1 = `${teamName} Fixtures & Results`;
      seoBodyText = `View ${teamName} live scores, upcoming fixtures, match results, and statistics on ZOKASCORE.`;
      
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsTeam",
        "name": teamName,
        "sport": "Football",
        "logo": teamData?.logo || undefined,
        "url": canonicalUrl
      };
    }

    // 5. LEAGUE PAGE
    if (leagueId && slug) {
      let leagueData = null;
      try {
        const r = await fetchUrl(`${BASE_API}/leagues/${leagueId}`);
        if (r.status === 200) {
          const data = JSON.parse(r.data);
          if (data.success && data.data) leagueData = data.data;
        }
      } catch (e) { console.error("League fetch failed", e.message); }

      const leagueName = leagueData?.name || formatName(slug);
      title = `${leagueName} Table, Fixtures & Standings | ZOKASCORE`;
      description = `Live ${leagueName} standings, fixtures, results and statistics.`;
      canonicalUrl = `${host}/league/${leagueId}/${slug}`;
      
      seoH1 = `${leagueName} Standings & Fixtures`;
      seoBodyText = `Get the latest ${leagueName} table, fixtures, live scores, and results on ZOKASCORE.`;
      
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "SportsLeague",
        "name": leagueName,
        "sport": "Football",
        "logo": leagueData?.logo || undefined,
        "url": canonicalUrl
      };
    }

    // 6. Construct the SEO tags for <head>
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

    // 7. Construct Flashscore-style hidden content for <body>
    const bodyContent = `
      <div style="position:absolute;left:-9999px;top:-9999px;visibility:hidden;" aria-hidden="true">
        <h1>${seoH1}</h1>
        <p>${seoBodyText}</p>
      </div>
    `;

    // 8. Inject head tags before </head>
    html = html.replace('</head>', `${seoTags}</head>`);
    
    // 9. Inject body content right before <div id="root"></div>
    html = html.replace('<div id="root"></div>', `${bodyContent}<div id="root"></div>`);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error("SSR Fatal Error:", err);
    return res.status(500).send('Internal Server Error');
  }
}