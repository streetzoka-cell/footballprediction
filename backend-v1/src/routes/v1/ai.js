const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const { authenticateFirebaseUser } = require('../../middleware/firebaseAuth');
const { getDb } = require('../../config/firebase');

// ★ PRO: Import the Local Reasoning Engine
const kimEngine = require('../../services/KimLocalEngine');

// ★ FIX: Initialize safely to prevent crash if API key is missing
let ai = null;
if (env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

// ★ PRO UPGRADE: Enhanced System Prompt
const SYSTEM_PROMPT = `You are Kim, the official AI of ZOKASCORE. You were built by an independent developer.
You are an elite football analyst, tactical expert, friendly, professional, and honest.

APP KNOWLEDGE (Use this if asked about the platform):
- ZOKASCORE Studio: A built-in pro creator toolkit containing the Graphic Editor, Reactor Studio (for viral TikToks/Reels), Face AR (camera masks), and Reaction Cam.
- Predictions: Users predict exact scores (10 pts) or match results (3 pts). Matches lock 60 mins before kickoff.
- Leaderboards: Daily, Weekly, Monthly, and G.O.A.T (All-time).
- Zoka Picks: Expert/Admin predictions that users can vote on.
- PWA: ZOKASCORE is a Progressive Web App and can be installed to the home screen for offline use.

FORMATTING RULES:
- Keep text extremely clean, professional, and minimal.
- NEVER use bold text (asterisks) around the word ZOKASCORE. Just write it normally.
- Avoid excessive markdown or cluttered formatting.
- Use simple, clean bullet points and short paragraphs.
- Never invent facts, hallucinate scores, or pretend to know unavailable live data.
- Explain reasoning clearly and concisely.
- Represent the brand professionally.
- If a user asks about their points, rank, or predictions, refer strictly to the [USER PROFILE] provided. If it's missing, tell them to make a prediction first.
- If a user asks about today's matches or Zoka Picks, refer to the [PLATFORM DATA] provided.
- If a user asks about football rules, laws, or tactics, refer strictly to the [FOOTBALL LAWS CONTEXT] provided. Apply the 3-layer logic (Authoritative Law -> Explanation -> Application).`;

const MODELS = ["gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"];
const FALLBACK_CODES = [429, 404, 503];
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 1000;

const GREETING_TRIGGERS = ['hi', 'hello', 'hey', 'hi there', 'hello there', 'good morning', 'good afternoon', 'good evening', 'how are you', 'yo', 'sup', 'hola'];
const GREETING_REPLIES = [
  "Hello! I'm Kim, your ZOKASCORE AI assistant. How can I help you dominate the predictions leaderboard today?",
  "Hi there! Ask me about today's fixtures, tactical breakdowns, or how to use the Studio.",
  "Hey! Ready to analyze some football matches? Ask me anything about today's games.",
  "Greetings! I'm here to give you the edge in your football predictions. What's on your mind?"
];

const CACHE_DIR = path.resolve(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'ai_responses.json');
const memoryCache = new Map();
let saveCacheTimeout = null;

// In-memory cache for platform data (refreshes every 5 mins)
let platformDataCache = { data: null, timestamp: 0 };
const PLATFORM_CACHE_TTL = 5 * 60 * 1000;

function ensureCacheDir() {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (!fs.existsSync(CACHE_FILE)) fs.writeFileSync(CACHE_FILE, JSON.stringify({}), 'utf8');
  } catch (err) {
    logger.error('[ZOKASCORE AI] Cache dir init failed:', err.message);
  }
}

function loadCache() {
  try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(data);
    Object.keys(parsed).forEach(key => memoryCache.set(key, parsed[key]));
    logger.info(`[ZOKASCORE AI] Loaded ${memoryCache.size} items into AI cache.`);
  } catch (err) {
    logger.error('[ZOKASCORE AI] Cache load failed:', err.message);
  }
}

function saveCache() {
  try {
    const cacheObj = {};
    const keys = Array.from(memoryCache.keys()).slice(-MAX_CACHE_SIZE);
    keys.forEach(key => { cacheObj[key] = memoryCache.get(key); });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheObj, null, 2), 'utf8');
  } catch (err) {
    logger.error('[ZOKASCORE AI] Cache save failed:', err.message);
  }
}

function normalizeQuery(query) {
  return query.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, ' ').trim();
}

function getFromCache(cacheKey) {
  const cached = memoryCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) return cached;
  if (cached) memoryCache.delete(cacheKey);
  return null;
}

function addToCache(cacheKey, reply, model) {
  memoryCache.set(cacheKey, { reply, model, timestamp: Date.now() });
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
  return { valid: true };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-15).filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string')
    .map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', content: msg.content.substring(0, 1500) }));
}

async function fetchSystemContext(uid) {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  
  let userContext = "[USER PROFILE]\nNo user data found. Ask them to make a prediction first.";
  let platformContext = "";

  try {
    const userDoc = await db.collection('user_points_total').doc(uid).get();
    let userData = null;
    if (userDoc.exists) {
      const d = userDoc.data();
      userData = {
        name: d.displayName || 'Player',
        totalPoints: d.totalPoints || 0,
        predictions: d.predictionsCount || 0,
        exact: d.exactCount || 0,
        result: d.resultCount || 0,
        streak: d.streak || 0
      };
    }

    let dailyRank = 'Unranked';
    let dailyPoints = 0;

    const dailyBoardPath = path.join(process.cwd(), 'public_data', 'leaderboard', 'daily', `${today}.json`);
    if (fs.existsSync(dailyBoardPath)) {
      try {
        const boardData = JSON.parse(fs.readFileSync(dailyBoardPath, 'utf8'));
        const entries = boardData.entries || [];
        const userEntry = entries.find(e => e.uid === uid);
        if (userEntry) {
          dailyRank = userEntry.rank || 'Unranked';
          dailyPoints = userEntry.points || 0;
        }
      } catch (e) {
        logger.warn(`[AI Context] Failed to read daily leaderboard JSON: ${e.message}`);
      }
    }

    if (userData) {
      userContext = `
[USER PROFILE]
- Name: ${userData.name}
- All-Time Points: ${userData.totalPoints}
- Today's Rank: #${dailyRank} (${dailyPoints} pts today)
- Total Predictions Made: ${userData.predictions}
- Exact Scores Hit: ${userData.exact}
- Correct Results Hit: ${userData.result}
- Current Streak: ${userData.streak} days
`;
    }
  } catch (e) {
    logger.warn(`[AI Context] Failed to fetch user data: ${e.message}`);
  }

  try {
    const now = Date.now();
    if (!platformDataCache.data || (now - platformDataCache.timestamp > PLATFORM_CACHE_TTL)) {
      const featuredPath = path.join(process.cwd(), 'public_data', 'featured', `${today}.json`);
      const zokaPath = path.join(process.cwd(), 'public_data', 'zokapicks', `${today}.json`);

      let matches = [];
      if (fs.existsSync(featuredPath)) {
        const featuredData = JSON.parse(fs.readFileSync(featuredPath, 'utf8'));
        matches = featuredData.matches || [];
      }

      let zokaPicks = [];
      if (fs.existsSync(zokaPath)) {
        const zokaData = JSON.parse(fs.readFileSync(zokaPath, 'utf8'));
        zokaPicks = zokaData.matches || [];
      }

      platformDataCache.data = { matches, zokaPicks };
      platformDataCache.timestamp = now;
    }

    const { matches, zokaPicks } = platformDataCache.data;

    if (matches.length > 0 || zokaPicks.length > 0) {
      platformContext = `
[PLATFORM DATA FOR TODAY ${today}]
Featured Matches: ${matches.map(m => `${m.homeTeam?.name || 'Home'} vs ${m.awayTeam?.name || 'Away'} (${m.kickoff || 'TBD'})`).join(' | ') || 'None scheduled'}
Zoka AI Picks: ${zokaPicks.map(p => `${p.homeTeam?.name || 'Home'} vs ${p.awayTeam?.name || 'Away'} (Zoka Prediction: ${p.adminPick?.home}-${p.adminPick?.away})`).join(' | ') || 'None scheduled'}
`;
    }
  } catch (e) {
    logger.warn(`[AI Context] Failed to fetch platform data: ${e.message}`);
  }

  return { userContext, platformContext };
}

async function buildPrompt({ message, history, context, lawKnowledge }) {
  const contents = [];
  const sanitizedHistory = sanitizeHistory(history);
  for (const msg of sanitizedHistory) {
    contents.push({ role: msg.role, parts: [{ text: msg.content }] });
  }
  
  const lawContext = lawKnowledge ? `\n[FOOTBALL LAWS CONTEXT]\n${lawKnowledge}\n` : "";
  const finalUserMessage = `${context.userContext}\n${context.platformContext}\n${lawContext}\nUser Query: ${message}`;
  contents.push({ role: 'user', parts: [{ text: finalUserMessage }] });
  return contents;
}

function handleGeminiError(err, model) {
  const code = err.status || err.code;
  logger.error(`[ZOKASCORE AI] Error ${code} on model ${model}: ${err.message}`);
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

async function generateWithFallback(contents, systemOverride = null) {
  const sysPrompt = systemOverride || SYSTEM_PROMPT;
  for (const model of MODELS) {
    const startTime = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 12000));
      const generationPromise = ai.models.generateContent({
        model, 
        contents, 
        systemInstruction: sysPrompt,
        generationConfig: { temperature: 0.45, topP: 0.9, topK: 32, maxOutputTokens: 600 }
      });
      const response = await Promise.race([generationPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;
      logger.info(`[ZOKASCORE AI] Success with model: ${model} in ${responseTime}ms`);
      return { success: true, model, reply: response.text || "I'm unable to answer that at the moment.", responseTime: `${responseTime}ms` };
    } catch (err) {
      const errCode = err.status || err.code;
      if (err.message === 'TIMEOUT' || errCode === 408) { 
        logger.warn(`[ZOKASCORE AI] Timeout on ${model}. Switching...`); 
        continue; 
      }
      if (FALLBACK_CODES.includes(errCode) || err.message?.toLowerCase().includes('quota') || err.message?.toLowerCase().includes('unavailable')) { 
        logger.warn(`[ZOKASCORE AI] Fallback triggered for ${model}.`); 
        continue; 
      }
      if ([400, 401, 403, 500].includes(errCode)) return handleGeminiError(err, model);
      logger.warn(`[ZOKASCORE AI] Network/Other error on ${model}, trying next: ${err.message}`);
      continue;
    }
  }
  return { success: false, error: "Our AI is currently experiencing high demand. Please try again in a moment.", model: "fallback_failed" };
}

// ★ PRO: Ultimate Graceful Fallback Reply
const GRACEFUL_FALLBACK_REPLY = "I'm currently experiencing high traffic and couldn't process that through my advanced engine. However, based on general knowledge, please try rephrasing or ask again in a moment.";

// Route: POST /api/v1/ai/zoka
router.post('/zoka', authenticateFirebaseUser, async (req, res) => {
  try {
    if (!ai) return res.status(500).json({ success: false, error: "AI service misconfigured.", model: "none" });
    
    const validation = validateRequest(req.body);
    if (!validation.valid) return res.status(400).json({ success: false, error: validation.error, model: "none" });

    const { message, history = [] } = req.body;
    const normalizedQuery = normalizeQuery(message);

    // 1. Instant Greeting Response
    if (GREETING_TRIGGERS.includes(normalizedQuery)) {
      const reply = GREETING_REPLIES[Math.floor(Math.random() * GREETING_REPLIES.length)];
      return res.status(200).json({ success: true, model: "instant-greeting", reply, responseTime: "1ms" });
    }

    // 2. Check Cache
    const cacheKey = `${req.user.uid}:${normalizedQuery}`;
    const cachedResponse = getFromCache(cacheKey);
    if (cachedResponse) {
      logger.info(`[ZOKASCORE AI] Cache hit for user ${req.user.uid}`);
      return res.status(200).json({ success: true, model: `${cachedResponse.model} (cached)`, reply: cachedResponse.reply, responseTime: "0ms" });
    }

    // 3. Fetch all context securely on the backend
    const context = await fetchSystemContext(req.user.uid);

    // 4. ★ PRO: Local Reasoning & Gemini Gate (with Engine Isolation) ★
    let localResult = { status: "UNCERTAIN", evidence: [], confidence: 0, routedKnowledge: [] };
    try {
      localResult = await kimEngine.resolveQuery(message);
    } catch (err) {
      logger.warn('[ZOKASCORE AI] Local engine failed, falling back to Gemini directly:', err.message);
    }

    if (localResult.status === "ANSWERED_LOCALLY") {
        // GEMINI GATE: BLOCKED. We answer locally with 0 API calls.
        // ★ PRO: Safe join to prevent crashes if routedKnowledge is missing
        logger.info(`[ZOKASCORE AI] Answered locally (0 API calls). Confidence: ${localResult.confidence.toFixed(2)}. Knowledge: ${(localResult.routedKnowledge || []).join(',')}`);
        
        const reply = `According to the Laws of the Game:\n\n${localResult.evidence}`;
        
        addToCache(cacheKey, reply, "local-engine");
        return res.status(200).json({ success: true, model: "local-engine", reply, responseTime: "1ms" });
    } else {
        // GEMINI GATE: OPEN. Uncertain query, fallback to Gemini with evidence attached.
        logger.info(`[ZOKASCORE AI] Gemini Gate triggered. Confidence: ${localResult.confidence.toFixed(2)}. Knowledge: ${(localResult.routedKnowledge || []).join(',')}`);
        
        const contents = await buildPrompt({ message, history, context, lawKnowledge: localResult.evidence });
        const result = await generateWithFallback(contents);
        
        if (result.success) {
          addToCache(cacheKey, result.reply, `gemini-${result.model}`);
          return res.status(200).json(result);
        } else {
          // ★ PRO: If Gemini fails, return a graceful 200 response instead of a 503 error to keep UI stable
          return res.status(200).json({ 
            success: true, 
            model: "graceful-fallback", 
            reply: GRACEFUL_FALLBACK_REPLY,
            responseTime: "1ms"
          });
        }
    }
  } catch (err) {
    logger.error('[ZOKASCORE AI] Unhandled route error:', err);
    // ★ PRO: Ultimate fallback to prevent 500 errors from breaking the frontend UI
    return res.status(200).json({ 
      success: true, 
      model: "emergency-fallback", 
      reply: "I encountered an unexpected error while processing that. Please try asking a different question.",
      responseTime: "1ms"
    });
  }
});

module.exports = router;