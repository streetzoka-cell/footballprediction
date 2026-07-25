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
      url: "https://zokascore.xyz/sitemap.xml" 
    })
  })
  .then(() => console.log("✅ Prerender.io notified!"))
  .catch(err => console.error("❌ Prerender ping failed:", err.message));
} else {
  console.log("Skipping Prerender warmup (no token found).");
}