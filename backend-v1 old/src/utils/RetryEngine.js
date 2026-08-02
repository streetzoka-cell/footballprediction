// footballprediction/backend-v1/src/utils/RetryEngine.js
const axios = require('axios');

async function fetchWithRetry(config, retries = 3) {
  let delay = 1000;
  for (let i = 0; i < retries; i++) {
    try {
      return await axios(config);
    } catch (err) {
      const isNetworkError = ['ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err.code);
      if (!isNetworkError || i === retries - 1) throw err;
      
      console.log(`[RetryEngine] Network error. Retry ${i + 1}/${retries} in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

module.exports = { fetchWithRetry };
