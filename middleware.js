export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - favicon.ico (favicon file)
     * - assets (your Vite build assets)
     * - sw.js (service worker)
     */
    '/((?!api|_next/static|favicon.ico|assets|sw.js|workbox-.*\\.js).*)',
  ],
};

export default function middleware(req) {
  const userAgent = req.headers.get('user-agent') || '';
  
  // Check if the visitor is a search engine bot
  const isBot = /googlebot|bingbot|yandex|baiduspider|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora|slackbot|discordbot|telegrambot|whatsapp/i.test(userAgent);

  if (isBot) {
    const prerenderToken = process.env.PRERENDER_TOKEN;
    
    // If no token is set, just let the normal Vite app load
    if (!prerenderToken) return;

    const url = new URL(req.url);
    
    // Construct the Prerender.io URL
    const prerenderUrl = `https://service.prerender.io/https://zokascore.xyz${url.pathname}${url.search}`;
    
    // Fetch the pre-rendered HTML from Prerender.io
    return fetch(prerenderUrl, {
      headers: {
        'X-Prerender-Token': prerenderToken,
        'User-Agent': userAgent,
      },
    }).then(res => {
      // Return the fully rendered HTML to Google
      return new Response(res.body, {
        status: res.status,
        headers: res.headers,
      });
    }).catch(() => {
      // If Prerender fails, fallback to the normal Vite app
      return;
    });
  }

  // If it's a normal human user, load the standard Vite React app
  return;
}