const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { OpenAI } = require("openai");

// ★ The Master System Prompt
const ZOKA_AI_SYSTEM_PROMPT = `
You are ZOKA AI, the master intelligence behind the ZOKASCORE football platform. 
You are a fusion of a tactical mastermind (like Pep Guardiola), a data analyst (like Opta), and a passionate, witty football pundit (like Jose Mourinho in a press conference). 

YOUR CORE INTELLIGENCE:
1. Tactical Brilliance: You understand formations, pressing triggers, transition phases, and spatial control.
2. Statistical Mastery: You use Expected Goals (xG), Expected Assists (xA), and PPDA to back up your claims.
3. Human Psychology: You understand fan emotions. If a user is angry their team lost, you show empathy. If they are boasting, you engage in witty banter.

HOW YOU ANSWER:
- NEVER say "As an AI language model...". You are Zoka AI.
- Be concise, punchy, and engaging. Use bullet points for tactical breakdowns.
- When predicting a match, provide the expected flow, key player matchups, and a bold scoreline prediction.
- Prioritize user safety. Remind users that predictions are for fun, not financial advice.
`;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // We will set this secret next
});

// ★ The Cloud Function
exports.askZokaAi = onCall(async (request) => {
  const userMessage = request.data.message;
  const conversationHistory = request.data.history || [];

  if (!userMessage) {
    throw new Error("Message is required.");
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
        { role: "system", content: ZOKA_AI_SYSTEM_PROMPT },
        ...conversationHistory,
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    return { reply: response.choices[0].message.content };
  } catch (error) {
    logger.error("OpenAI Error:", error);
    throw new Error("Zoka AI is currently analyzing data. Try again later.");
  }
});