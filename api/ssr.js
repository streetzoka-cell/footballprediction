// api/ssr.js

export default async function handler(req, res) {
  try {
    const host = req.headers.host ? `https://${req.headers.host}` : 'https://zokascore.xyz';
    
    // 1. Fetch the base HTML shell
    const response = await fetch(`${host}/index.html`);
    if (!response.ok) return res.status(500).send('Failed to load base HTML');
    let html = await response.text();

    // 2. Extract parameters from req.url (e.g., /match/123/arsenal-vs-chelsea)
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
    
    // ★ FIX 4: Visible body content (No more visibility:hidden)
    let seoH1 = 'ZOKASCORE - Football Predictions & Live Scores';
    let seoBodyText = 'Follow live football scores, predictions, and match statistics on ZOKASCORE.';

    const BASE_API = "https://api.zokascore.xyz/api/v1";

    // 3. MATCH PAGE
    if (matchId && slug) {
      let matchData = null;
      try {
        let r = await fetch(`${BASE_API}/matches/${matchId}`);
        if (!r.ok) r = await fetch(`${BASE_API}/match/${matchId}`);
        if (r.ok) {
          const data = await r.json();
          if (data.success && data.data) matchData = data.data;
        }
      } catch (e) { console.error("Match fetch failed", e.message); }

      const parts = slug.split('-vs-');
      if (parts.length === 2) {
        const homeName = matchData?.homeName || matchData?.homeTeam?.name || parts[0].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const awayName = matchData?.awayName || matchData?.awayTeam?.name || parts[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const leagueName = matchData?.leagueName || matchData?.league?.name || 'Football';
        
        title = `${homeName} vs ${awayName} Prediction, Live Score & H2H | ZOKASCORE`;
        description = `${homeName} vs ${awayName} live score, prediction, statistics, H2H and match analysis. ${leagueName} match.`;
        canonicalUrl = `${host}/match/${matchId}/${slug}`;
        
        seoH1 = `${homeName} vs ${awayName}`;
        seoBodyText = `Follow ${homeName} vs ${awayName} live score, predictions, H2H, and match statistics on ZOKASCORE. ${leagueName} match.`;
        
        // Dynamic Event Status Mapper
        const getEventStatus = (status) => {
          switch ((status || '').toUpperCase()) {
            case 'FT': case 'AET': case 'PEN': return 'https://schema.org/EventCompleted';
            case 'LIVE': case '1H': case '2H': case 'HT': return 'https://schema.org/EventInProgress';
            case 'PST': return 'https://schema.org/EventPostponed';
            case 'CANC': return 'https://schema.org/EventCancelled';
            default: return 'https://schema.org/EventScheduled';
          }
        };

        jsonLd = {
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          "name": `${homeName} vs ${awayName}`,
          "sport": "Football",
          "startDate": matchData?.date || undefined,
          "eventStatus": getEventStatus(matchData?.status || matchData?.display?.status),
          "competitor": [
            { "@type": "SportsTeam", "name": homeName, "logo": matchData?.homeLogo || matchData?.homeTeam?.logo || undefined },
            { "@type": "SportsTeam", "name": awayName, "logo": matchData?.awayLogo || matchData?.awayTeam?.logo || undefined }
          ],
          "superEvent": { "@type": "SportsLeague", "name": leagueName }
        };

        if (matchData?.isFinished) {
          jsonLd.result = { "@type": "SportsResult", "homeTeamScore": matchData.homeScore, "awayTeamScore": matchData.awayScore };
        }
      }
    }

    // 4. TEAM & LEAGUE (Abbreviated for brevity, same pattern as above)
    if (teamId && slug) {
      const teamName = formatName(slug);
      title = `${teamName} Fixtures, Results & Live Scores | ZOKASCORE`;
      description = `Latest fixtures, form, results and statistics for ${teamName}.`;
      canonicalUrl = `${host}/team/${teamId}/${slug}`;
      seoH1 = `${teamName} Fixtures & Results`;
      seoBodyText = `View ${teamName} live scores, upcoming fixtures, match results, and statistics on ZOKASCORE.`;
      jsonLd = { "@context": "https://schema.org", "@type": "SportsTeam", "name": teamName, "sport": "Football", "url": canonicalUrl };
    }

    if (leagueId && slug) {
      const leagueName = formatName(slug);
      title = `${leagueName} Table, Fixtures & Standings | ZOKASCORE`;
      description = `Live ${leagueName} standings, fixtures, results and statistics.`;
      canonicalUrl = `${host}/league/${leagueId}/${slug}`;
      seoH1 = `${leagueName} Standings & Fixtures`;
      seoBodyText = `Get the latest ${leagueName} table, fixtures, live scores, and results on ZOKASCORE.`;
      jsonLd = { "@context": "https://schema.org", "@type": "SportsLeague", "name": leagueName, "sport": "Football", "url": canonicalUrl };
    }

    // 5. Construct SEO tags
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

    // ★ FIX 4: Visible content for <body> inside a container React won't destroy
    const bodyContent = `
      <div id="seo-content" style="position: absolute; left: -9999px; opacity: 0;">
        <h1>${seoH1}</h1>
        <p>${seoBodyText}</p>
      </div>
    `;

    // 6. Inject tags
    html = html.replace('</head>', `${seoTags}</head>`);
    html = html.replace('<div id="root"></div>', `${bodyContent}<div id="root"></div>`);

    // ★ FIX 6: Prevent indexing of the /api/ route itself
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
    
  } catch (err) {
    console.error("SSR Fatal Error:", err);
    return res.status(500).send('Internal Server Error');
  }
}

function formatName(slugPart) {
  return slugPart.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}