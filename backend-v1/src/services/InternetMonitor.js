// backend-v1/src/services/InternetMonitor.js
const axios = require('axios');
const logger = require('../utils/logger');
const EventEmitter = require('events');

class InternetMonitor extends EventEmitter {
  constructor() {
    super();
    this.isOnline = true;
    this.checkInterval = null;
    this.failCount = 0;
  }

  start() {
    this.checkInterval = setInterval(() => this.check(), 30000); // Check every 30s
    logger.info('[InternetMonitor] Started monitoring internet connection.');
  }

  async check() {
    try {
      // Use Cloudflare's trace endpoint. It's very fast and reliable.
      await axios.get('https://1.1.1.1/cdn-cgi/trace', { 
        timeout: 5000 
      });
      
      this.failCount = 0; // Reset fail count on success
      if (!this.isOnline) {
        logger.info('[InternetMonitor] 🌐 Internet restored! Triggering catch-up sync...');
        this.isOnline = true;
        this.emit('restored');
      }
    } catch (err) {
      this.failCount++;
      // Only pause if it fails 2 times in a row (60 seconds of no internet)
      if (this.failCount >= 2 && this.isOnline) {
        logger.warn('[InternetMonitor] ⚠️ Internet lost (2 consecutive fails). Pausing API polling.');
        this.isOnline = false;
      }
    }
  }
}

module.exports = new InternetMonitor();