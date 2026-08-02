// footballprediction/scripts/prerender-warmup.js

const PRERENDER_TOKEN = process.env.PRERENDER_TOKEN;

if (PRERENDER_TOKEN) {
  console.log("Pinging Prerender.io to warm up cache via sitemap...");
  fetch(`https://api.prerender.io/recache`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PRERENDER_TOKEN}`
    },
    body: JSON.stringify({
      // Tell Prerender to recache everything in the sitemap
      url:  "https://zokascore.xyz/zokascore-sitemap.xml"
    })
  })
  .then(() => console.log("âœ… Prerender.io notified!"))
  .catch(err => console.error("âŒ Prerender ping failed:", err.message));
} else {
  console.log("Skipping Prerender warmup (no token found).");
}
