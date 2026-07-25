import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const routesToPrerender = [
  '/', '/fixtures', '/predictions', '/about', '/terms', '/privacy', '/faq', '/help', '/contact', '/leaderboard', '/basketball', '/livestream'
];

async function prerender() {
  console.log('Starting Puppeteer prerendering...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  for (const route of routesToPrerender) {
    const url = `http://localhost:4173${route}`; // Vite preview default port
    console.log(`Prerendering ${url}...`);
    
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
      
      // Extract the rendered HTML
      const html = await page.content();
      
      // Determine file path
      const filePath = path.join('dist', route, 'index.html');
      
      // Create directory if it doesn't exist
      if (route !== '/') {
        fs.mkdirSync(path.join('dist', route), { recursive: true });
      }
      
      // Save the prerendered HTML
      fs.writeFileSync(filePath, html);
      console.log(`✅ Saved ${filePath}`);
    } catch (err) {
      console.error(`❌ Failed to prerender ${route}:`, err.message);
    }
  }

  await browser.close();
  console.log('Prerendering complete!');
}

prerender();