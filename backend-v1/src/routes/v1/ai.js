const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

const ZOKASCORE_KNOWLEDGE_BASE = `
ZOKASCORE APP KNOWLEDGE BASE:
- Overview: ZOKASCORE is a premium football intelligence, live scores, predictions, and content creation platform.
- Frontend: React + Vite + Tailwind. Hosted on Vercel.
- Backend: Node.js/Express (backend-v1) hosted on a VPS via PM2. Cloudflare tunnel (api.zokascore.xyz).
- Database: Firebase Firestore (users, news_posts, predictions) & Local JSON files (fixtures, live matches).
- API Providers: API-Football, iSports, Football-Data.org, TheSportsDB.

PAGES & FEATURES:
1. Home (/): Hero match, live ticker, daily challenge (+50 pts), Zoka Picks, Featured Matches, Daily Leaderboard, Latest News.
2. Fixtures (/fixtures): Live scores, yesterday/today/tomorrow dates, top matches, live matches, standings, teams. Includes "Match of the Day" with community voting (Home/Draw/Away).
3. Predictions (/predictions): User score predictions. Locks 60 mins before kickoff. Features Quick Picks, Surprise Dice, and Zoka Picks (Agree/Disagree voting). Results overlay shows exact/result/miss points.
4. Leaderboard (/leaderboard): Daily, Weekly, Monthly, G.O.A.T (All Time) periods. Features a Podium for top 3, rival tracking (points behind next rank), and badges (Sniper, Streak, Veteran).
5. Highlights (/highlights): News articles & match reports. Categories: Breaking, Official, Rumour, Transfers, Injuries.
6. Live Stream (/livestream): Watch matches.
7. Studio (/studio): Reactor Studio (Video editor for TikTok/Reels/Shorts), Web Showcase, Media Studio, Face AR Studio.
   - Reactor Studio Features: 30+ templates (Pro, TikTok, Insta, YT, Gaming, Football), PIP (camera/B-roll), video effects (glitch, VHS, Ken Burns), filters, stickers, audio import, timeline (split/trim), 1080p export. Users earn XP and achievements for editing.
8. Profile (/profile): Animated stats, Accuracy Ring, Achievements (First Step, 5-Day Streak, Sharpshooter, Beat ZOKA, Top 10). Tracks Fun Season vs Real Season.
9. Admin (/admin): Admin panel to manage featured matches, zoka picks, leaderboards, and resolve matches.

POINTS SYSTEM:
- Exact Score Prediction: +10 points
- Correct Result (Win/Draw/Loss): +3 points
- Wrong Prediction: 0 points
- Daily Challenge: +50 bonus points
- Streaks: Users get fire badges for consecutive days of predicting.

SUPPORT:
- 24/7 Support Numbers: 0728720281 / 0721635810
- Socials: Twitter (X), Facebook, Instagram, Telegram.
`;

const SYSTEM_PROMPT = `You are Kim, the official AI of ZOKASCORE. You were built by Kim.
You are an elite football analyst, tactical expert, friendly, professional, and honest.

FORMATTING RULES:
- Keep text extremely clean, professional, and minimal.
- NEVER use bold text (asterisks) around the word ZOKASCORE. Just write it normally.
- Avoid excessive markdown or cluttered formatting.
- Use simple, clean bullet points and short paragraphs.
- Never invent facts, hallucinate scores, or pretend to know unavailable live data.
- Explain reasoning clearly and concisely.
- Represent the brand professionally.
- Only use supplied context.`;

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"];
const FALLBACK_CODES = [429, 404, 503];
const CACHE_TTL_MS = 60 * 60 * 1000; 
const MAX_CACHE_SIZE = 1000;

const CACHE_DIR = path.resolve(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'ai_responses.json');
const memoryCache = new Map();
let saveCacheTimeout = null;

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
  } catch (err) {
    console.error('[ZOKASCORE AI] Cache dir init failed:', err.message);
  }
}

function loadCache() {
  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    Object.keys(parsed).forEach(key => memoryCache.set(key, parsed[key]));
    console.log(`[ZOKASCORE AI] Loaded ${memoryCache.size} items into AI cache.`);
  } catch (err) {
    console.error('[ZOKASCORE AI] Cache load failed:', err.message);
  }
}

function saveCache() {
  try {
    const cacheObj = {};
    const keys = Array.from(memoryCache.keys()).slice(-MAX_CACHE_SIZE);
    keys.forEach(key => { cacheObj[key] = memoryCache.get(key); });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf8');
  } catch (err) {
    console.error('[ZOKASCORE AI] Cache save failed:', err.message);
  }
}

function normalizeQuery(query) {
  return query.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
}

function getFromCache(normalizedQuery) {
  const cached = memoryCache.get(normalizedQuery);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) return cached;
  if (cached) memoryCache.delete(normalizedQuery);

  if (normalizedQuery.length > 15) {
    for (const [key, value] of memoryCache.entries()) {
      if (Date.now() - value.timestamp < CACHE_TTL_MS) {
        if (key.includes(normalizedQuery) || normalizedQuery.includes(key)) return value;
      }
    }
  }
  return null;
}

function addToCache(normalizedQuery, reply, model) {
  memoryCache.set(normalizedQuery, { reply, model, timestamp: Date.now() });
  if (saveCacheTimeout) clearTimeout(saveCacheTimeout);
  saveCacheTimeout = setTimeout(saveCache, 3000);
}

ensureCacheDir();
loadCache();

function validateRequest(body) {
  if (!body || typeof body !== 'object') return { valid: false, error: "Invalid JSON payload." };
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) return { valid: false, error: "Message is required." };
  if (body.message.length > 2000) return { valid: false, error: "Message is too long." };
  if (body.history && !Array.isArray(body.history)) return { valid: false, error: "History must be an array." };
  if (body.appContext && typeof body.appContext !== 'object') return { valid: false, error: "App context must be an object." };
  return { valid: true };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-15).filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string')
    .map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', content: msg.content.substring(0, 1500) }));
}

function buildPrompt({ message, history, appContext }) {
  const contents = [];
  const sanitizedHistory = sanitizeHistory(history);
  for (const msg of sanitizedHistory) {
    contents.push({ role: msg.role, parts: [{ text: msg.content }] });
  }
  
  const contextParts = [];
  if (appContext) {
    if (appContext.currentDate) contextParts.push(`Current Date: ${appContext.currentDate}`);
    if (appContext.liveMatches?.length) contextParts.push(`Live Matches: ${appContext.liveMatches.join(' | ')}`);
    if (appContext.topMatches?.length) contextParts.push(`Top Matches: ${appContext.topMatches.join(' | ')}`);
    if (appContext.leagueStandings) contextParts.push(`League Standings: ${appContext.leagueStandings}`);
    if (appContext.fixtures) contextParts.push(`Fixtures: ${appContext.fixtures}`);
    if (appContext.userFavorites) contextParts.push(`User Favorites: ${appContext.userFavorites}`);
    if (appContext.latestNews) contextParts.push(`Latest News: ${appContext.latestNews}`);
    if (appContext.competition) contextParts.push(`Competition: ${appContext.competition}`);
  }
  
  const contextString = contextParts.length > 0 ? `\n[REAL-TIME CONTEXT]\n${contextParts.join('\n')}\n` : '';
  const finalUserMessage = `${contextString}\n[ZOKASCORE KNOWLEDGE BASE]\n${ZOKASCORE_KNOWLEDGE_BASE}\nUser Query: ${message}`;
  contents.push({ role: 'user', parts: [{ text: finalUserMessage }] });
  return contents;
}

function handleGeminiError(err, model) {
  const code = err.status || err.code;
  console.error(`[ZOKASCORE AI] Error ${code} on model ${model}:`, err.message);
  let clientError = "An unexpected error occurred. Please try again.";
  if (err.message === 'TIMEOUT' || code === 408) clientError = "The AI is taking longer than expected. Please try again.";
  else if (code === 400) clientError = "Invalid request format.";
  else if (code === 401 || code === 403) clientError = "Authentication failed.";
  else if (code === 404) clientError = "AI model temporarily unavailable.";
  else if (code === 429) clientError = "Rate limit exceeded. Please slow down.";
  else if (code === 500) clientError = "Internal server error.";
  else if (code === 503) clientError = "AI service is temporarily overloaded.";
  else if (err.message?.toLowerCase().includes('quota')) clientError = "API quota exceeded. Please try again later.";
  
  return { success: false, error: clientError, model: model || "unknown" };
}

async function generateWithFallback(contents) {
  for (const model of MODELS) {
    const startTime = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000));
      const generationPromise = ai.models.generateContent({
        model, contents, systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: 0.55, topP: 0.9, topK: 32, maxOutputTokens: 800 }
      });
      const response = await Promise.race([generationPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;
      console.log(`[ZOKASCORE AI] Success with model: ${model} in ${responseTime}ms`);
      return { success: true, model, reply: response.text || "I'm unable to answer that at the moment.", responseTime: `${responseTime}ms` };
    } catch (err) {
      const errCode = err.status || err.code;
      if (err.message === 'TIMEOUT' || errCode === 408) { console.warn(`[ZOKASCORE AI] Timeout on ${model}. Switching...`); continue; }
      if (FALLBACK_CODES.includes(errCode) || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('unavailable')) { console.warn(`[ZOKASCORE AI] Fallback triggered for ${model}.`); continue; }
      if ([400, 401, 403, 500].includes(errCode)) return handleGeminiError(err, model);
      console.warn(`[ZOKASCORE AI] Network/Other error on ${model}, trying next:`, err.message);
      continue;
    }
  }
  return { success: false, error: "Our AI is currently experiencing high demand. Please try again in a moment.", model: "fallback_failed" };
}

router.post('/zoka', async (req, res) => {
  try {
    if (!env.GEMINI_API_KEY) return res.status(500).json({ success: false, error: "AI service misconfigured.", model: "none" });
    const validation = validateRequest(req.body);
    if (!validation.valid) return res.status(400).json({ success: false, error: validation.error, model: "none" });

    const { message, history = [], appContext = {} } = req.body;
    const normalizedQuery = normalizeQuery(message);
    const cachedResponse = getFromCache(normalizedQuery);

    if (cachedResponse) {
      console.log(`[ZOKASCORE AI] Cache hit for: "${normalizedQuery.substring(0, 40)}..."`);
      return res.status(200).json({ success: true, model: `${cachedResponse.model} (cached)`, reply: cachedResponse.reply, responseTime: "0ms" });
    }

    const contents = buildPrompt({ message, history, appContext });
    const result = await generateWithFallback(contents);

    if (result.success) {
      addToCache(normalizedQuery, result.reply, result.model);
      return res.status(200).json(result);
    } else {
      return res.status(503).json(result);
    }
  } catch (err) {
    console.error('[ZOKASCORE AI] Unhandled route error:', err);
    return res.status(500).json({ success: false, error: "An unexpected error occurred.", model: "unknown" });
  }
});

module.exports = router;