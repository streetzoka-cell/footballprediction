// backend-v1/src/services/StatsEngine.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const logger = require('../utils/logger');

const STATS_DIR = path.join(process.cwd(), 'public_data', 'stats');
const GLOBAL_STATS_FILE = path.join(STATS_DIR, 'global.json');

const DEFAULT_STATS = {
    totalUsers: 0,
    totalPlayers: 0,
    totalPredictions: 0,
    predictionsToday: 0,
    activePlayersToday: 0,
    lastUpdated: null,
};

let statsCache = { ...DEFAULT_STATS };
let isInitialized = false;
let activeUsersToday = new Set();

async function initializeCache() {
    if (isInitialized) return;
    
    try {
        await fsp.mkdir(STATS_DIR, { recursive: true });
        const raw = await fsp.readFile(GLOBAL_STATS_FILE, 'utf8');
        statsCache = { ...DEFAULT_STATS, ...JSON.parse(raw) };
        logger.info('[StatsEngine] Initialized stats cache from local JSON (0 Firestore reads).');
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.info('[StatsEngine] global.json not found. Creating with defaults.');
            statsCache = { ...DEFAULT_STATS };
            await persist();
        } else {
            logger.error(`[StatsEngine] Failed to initialize cache: ${err.message}`);
            statsCache = { ...DEFAULT_STATS };
        }
    }
    
    isInitialized = true;
}

async function persist() {
    try {
        statsCache.lastUpdated = new Date().toISOString();
        await fsp.mkdir(STATS_DIR, { recursive: true });
        await fsp.writeFile(GLOBAL_STATS_FILE, JSON.stringify(statsCache, null, 2), 'utf8');
    } catch (err) {
        logger.error(`[StatsEngine] Failed to persist global.json: ${err.message}`);
    }
}

async function getStats() {
    if (!isInitialized) await initializeCache();
    return statsCache;
}

async function userRegistered() {
    if (!isInitialized) await initializeCache();
    statsCache.totalUsers++;
    await persist();
}

async function playerActivated() {
    if (!isInitialized) await initializeCache();
    statsCache.totalPlayers++;
    await persist();
}

async function predictionCreated(uid) {
    if (!isInitialized) await initializeCache();
    
    statsCache.totalPredictions++;
    statsCache.predictionsToday++;
    
    if (uid && !activeUsersToday.has(uid)) {
        activeUsersToday.add(uid);
        statsCache.activePlayersToday++;
    }
    
    await persist();
}

async function resetDailyStats() {
    if (!isInitialized) await initializeCache();
    
    statsCache.predictionsToday = 0;
    statsCache.activePlayersToday = 0;
    activeUsersToday.clear();
    
    await persist();
    logger.info('[StatsEngine] Daily stats reset to 0.');
}

module.exports = {
    initializeCache,
    getStats,
    userRegistered,
    playerActivated,
    predictionCreated,
    resetDailyStats
};