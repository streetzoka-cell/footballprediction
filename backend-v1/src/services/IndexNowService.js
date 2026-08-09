const https = require('https');
const HOST = 'https://zokascore.xyz';
const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'zokascore_indexnow_key_2026';
const INDEXNOW_HOST = 'api.indexnow.org';

let urlQueue = new Set();
let isProcessing = false;

const submitUrl = (path) => {
  if (!path) return;
  const fullUrl = `${HOST}${path}`;
  
  if (urlQueue.has(fullUrl)) return;
  urlQueue.add(fullUrl);
  
  // Debounce: wait 10 seconds to batch rapid live updates together
  if (!isProcessing) {
    setTimeout(processQueue, 10000);
  }
};

const processQueue = () => {
  if (urlQueue.size === 0 || isProcessing) return;
  
  isProcessing = true;
  const urlsToSubmit = Array.from(urlQueue);
  urlQueue.clear();
  
  const payload = JSON.stringify({
    host: HOST.replace('https://', ''),
    key: INDEXNOW_KEY,
    keyLocation: `${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urlsToSubmit
  });

  const options = {
    hostname: INDEXNOW_HOST,
    path: '/IndexNow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`[IndexNow] Submitted ${urlsToSubmit.length} URLs. Status: ${res.statusCode}`);
    isProcessing = false;
  });

  req.on('error', (e) => {
    console.error('[IndexNow] Submission failed:', e.message);
    isProcessing = false;
  });

  req.write(payload);
  req.end();
};

module.exports = { submitUrl };