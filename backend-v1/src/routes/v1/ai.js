const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');

// Initialize Google GenAI client
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// ==========================================
// CONSTANTS & KNOWLEDGE BASE
// ==========================================

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

const SYSTEM_PROMPT = `You are Kim, the official AI of ZOKASCORE.
You are an elite football analyst, tactical expert, friendly, professional, and honest.
Rules:
- Never invent facts.
- Never hallucinate scores.
- Never pretend to know unavailable live data.
- Explain reasoning clearly.
- Keep answers concise.
- Use headings and bullet points where useful.
- Represent the ZOKASCORE brand professionally.
- Only use supplied context. Never invent information.`;

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite"
];

const FALLBACK_CODES = [429, 404, 503];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function validateRequest(body) {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: "Invalid JSON payload." };
  }
  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    return { valid: false, error: "Message is required and cannot be empty." };
  }
  if (body.message.length > 2000) {
    return { valid: false, error: "Message is too long. Maximum 2000 characters." };
  }
  if (body.history && !Array.isArray(body.history)) {
    return { valid: false, error: "History must be an array." };
  }
  if (body.appContext && typeof body.appContext !== 'object') {
    return { valid: false, error: "App context must be an object." };
  }
  return { valid: true };
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-15) // Limit to latest 15 messages
    .filter(msg => msg && typeof msg.role === 'string' && typeof msg.content === 'string')
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      content: msg.content.substring(0, 1500) // Prevent massive tokens per message
    }));
}

function buildPrompt({ message, history, appContext }) {
  const contents = [];
  const sanitizedHistory = sanitizeHistory(history);
  
  for (const msg of sanitizedHistory) {
    contents.push({
      role: msg.role,
      parts: [{ text: msg.content }]
    });
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
  
  const contextString = contextParts.length > 0 
    ? `\n[REAL-TIME CONTEXT]\n${contextParts.join('\n')}\n` 
    : '';
    
  const knowledgeBaseString = `\n[ZOKASCORE KNOWLEDGE BASE]\n${ZOKASCORE_KNOWLEDGE_BASE}\n`;
  const finalUserMessage = `${contextString}${knowledgeBaseString}User Query: ${message}`;
  
  contents.push({
    role: 'user',
    parts: [{ text: finalUserMessage }]
  });
  
  return contents;
}

function handleGeminiError(err, model) {
  const code = err.status || err.code;
  console.error(`[ZOKASCORE AI] Error ${code} on model ${model}:`, err.message);
  
  let clientError = "An unexpected error occurred. Please try again.";
  
  if (err.message === 'TIMEOUT' || code === 408) {
    clientError = "The AI is taking longer than expected. Please try again.";
  } else if (code === 400) {
    clientError = "Invalid request format. Please check your input.";
  } else if (code === 401 || code === 403) {
    clientError = "Authentication failed. Please contact support.";
  } else if (code === 404) {
    clientError = "AI model temporarily unavailable.";
  } else if (code === 429) {
    clientError = "Rate limit exceeded. Please slow down and try again.";
  } else if (code === 500) {
    clientError = "Internal server error. Our team has been notified.";
  } else if (code === 503) {
    clientError = "AI service is temporarily overloaded. Please try again shortly.";
  } else if (err.message && err.message.toLowerCase().includes('quota')) {
    clientError = "API quota exceeded. Please try again later.";
  } else if (err.message && err.message.toLowerCase().includes('network')) {
    clientError = "Network error. Please check your connection and try again.";
  }
  
  return {
    success: false,
    error: clientError,
    model: model || "unknown"
  };
}

async function generateWithFallback(contents) {
  for (const model of MODELS) {
    const startTime = Date.now();
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), 15000);
      });
      
      const generationPromise = ai.models.generateContent({
        model,
        contents,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.55,
          topP: 0.9,
          topK: 32,
          maxOutputTokens: 800
        }
      });
      
      const response = await Promise.race([generationPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;
      
      console.log(`[ZOKASCORE AI] Success with model: ${model} in ${responseTime}ms`);
      
      if (response.usageMetadata) {
        console.log(`[ZOKASCORE AI] Tokens - Prompt: ${response.usageMetadata.promptTokenCount}, Completion: ${response.usageMetadata.candidatesTokenCount}`);
      }
      
      return {
        success: true,
        model,
        reply: response.text || "I'm unable to answer that at the moment.",
        responseTime: `${responseTime}ms`
      };
      
    } catch (err) {
      const errCode = err.status || err.code;
      
      if (err.message === 'TIMEOUT' || errCode === 408) {
        console.warn(`[ZOKASCORE AI] Timeout on ${model} after 15s. Switching model...`);
        continue;
      }
      
      if (FALLBACK_CODES.includes(errCode) || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('unavailable')) {
        console.warn(`[ZOKASCORE AI] Fallback triggered for ${model}. Error: ${errCode || err.message}`);
        continue;
      }
      
      if ([400, 401, 403, 500].includes(errCode)) {
        console.error(`[ZOKASCORE AI] Fatal error on ${model}:`, err);
        return handleGeminiError(err, model);
      }
      
      console.warn(`[ZOKASCORE AI] Network/Other error on ${model}, trying next:`, err.message);
      continue;
    }
  }
  
  console.error(`[ZOKASCORE AI] All models failed.`);
  return {
    success: false,
    error: "Our AI is currently experiencing high demand. Please try again in a moment.",
    model: "fallback_failed"
  };
}

// ==========================================
// EXPRESS ROUTE
// ==========================================

router.post('/zoka', async (req, res) => {
  try {
    if (!env.GEMINI_API_KEY) {
      console.error('[ZOKASCORE AI] GEMINI_API_KEY is not configured.');
      return res.status(500).json({ 
        success: false, 
        error: "AI service is currently misconfigured. Please contact support.",
        model: "none"
      });
    }

    const validation = validateRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({ 
        success: false, 
        error: validation.error,
        model: "none"
      });
    }

    const { message, history = [], appContext = {} } = req.body;
    const contents = buildPrompt({ message, history, appContext });
    const result = await generateWithFallback(contents);

    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(503).json(result);
    }

  } catch (err) {
    console.error('[ZOKASCORE AI] Unhandled route error:', err);
    return res.status(500).json({ 
      success: false, 
      error: "An unexpected error occurred. Please try again.",
      model: "unknown"
    });
  }
});

module.exports = router;