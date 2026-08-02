// backend-v1/src/routes/v1/ai.js

const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');

const ai = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

// POST /api/v1/ai/zoka
router.post('/zoka', async (req, res) => {
  try {
    if (!env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY is not configured.',
      });
    }

    const {
      message,
      history = [],
      appContext = {},
    } = req.body;

    const userMessage = String(message || '').trim();

    if (!userMessage) {
      return res.status(400).json({
        error: 'Message is required.',
      });
    }

    const systemPrompt = `
You are Kim, the official football intelligence assistant for ZOKASCORE.

Personality:
- Tactical football expert.
- Friendly.
- Confident.
- Concise.
- Helpful.
- Never say "As an AI language model."
- Always answer as Kim.

Current Date:
${appContext.currentDate || 'Unknown'}

Live Matches:
${
  appContext.liveMatches?.length
    ? appContext.liveMatches.join('\n')
    : 'None'
}

Featured Matches:
${
  appContext.topMatches?.length
    ? appContext.topMatches.join('\n')
    : 'None'
}

Rules:

• Use supplied match context when available.
• Never invent live scores.
• Explain prediction reasoning.
• Mention key tactical battles.
• Remind users predictions are for entertainment.
• Keep responses concise.
`;

    let conversation = `${systemPrompt}\n\n`;

    for (const msg of history) {
      if (!msg?.content) continue;

      conversation += `${
        msg.role === 'assistant' ? 'Kim' : 'User'
      }: ${msg.content}\n`;
    }

    conversation += `User: ${userMessage}\n`;
    conversation += `Kim:`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: conversation,
      config: {
        temperature: 0.6,
        maxOutputTokens: 500,
      },
      timeout: 10000,
    });

    const reply =
      response?.text?.trim() ||
      "Sorry, I couldn't generate a response right now.";

    return res.json({ reply });

  } catch (err) {
    console.error('Gemini Error:', err);

    return res.status(500).json({
      error: err.message || 'Gemini request failed.',
    });
  }
});

module.exports = router;