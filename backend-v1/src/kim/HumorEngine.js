'use strict';

/**
 * ============================================================
 * KIM — PROFESSIONAL HUMOR ENGINE
 * ============================================================
 * Version: 3.1.0
 * 
 * Purpose:
 *   Adds controlled, contextual personality to KIM.
 *   Humor NEVER becomes the source of truth. It is strictly 
 *   an enhancement layer applied after data/reasoning.
 * ============================================================
 */

class HumorEngine {
  constructor() {
    this.VERSION = '3.1.0';

    this.personality = {
      smart: 0.95, funny: 0.65, friendly: 0.90,
      confidence: 0.80, humility: 0.90, sarcasm: 0.35, aggression: 0.05
    };

    this.config = {
      defaultChance: 0.22, maxChance: 0.90, cooldownMessages: 2,
      maxHumorStreak: 2, historyLimit: 12, categoryRepeatPenalty: 0.35,
      lineRepeatPenalty: 0.20, momentumBonus: 0.10, playfulBonus: 0.15,
      explicitHumorChance: 0.95
    };

    this.state = new Map();
    this.templates = this.buildTemplates();
  }

  /* ============================================================
     HUMOR LIBRARY
  ============================================================ */

  buildTemplates() {
    return {
      greeting: [
        "Look who just entered KIM's territory. 😏",
        "And we're live. What are we cooking today? 😂",
        "KIM online. Brain warmed up. Let's go. 🧠",
        "I'm listening. Try not to break my football database. 😂",
        "You have arrived. The football laboratory is open. 😂"
      ],
      match_analysis: [
        "Alright, let's put the football crystal ball away and use actual data. 😂",
        "Let's inspect the evidence before I start making accusations. 😭",
        "The numbers have entered the chat. 👀",
        "Time to investigate this football crime scene. 😂",
        "Let's see what actually happened before we blame the referee. 😏"
      ],
      team_form: [
        "Form is temporary... but screenshots are forever. 😂",
        "Let's check whether they're actually in form or just surviving. 😭",
        "Five matches should tell us whether this is form or pure football chaos.",
        "The form table is about to expose somebody. 👀"
      ],
      prediction: [
        "Alright, prediction hat on. No refunds if football decides to be football. 😂",
        "Let's make a prediction before the football gods change the script. 😭",
        "The numbers have spoken. Whether football listens is another matter. 😂",
        "I have data. Football has chaos. Let's see who wins. 😏"
      ],
      wrong_prediction: [
        "Well... that prediction aged terribly. 😂",
        "Football has officially rejected my application for being a prophet. 😭",
        "The data said one thing. Football said: 'Nice try.' 😂",
        "Let's quietly place that prediction in the historical archives. 😭"
      ],
      loss: [
        "Football really woke up and chose violence today. 😭",
        "That result needs a moment of silence. 😂",
        "Ouch. The scoreboard was not feeling charitable today.",
        "That's one of those results you stare at for five minutes hoping it changes. 😭"
      ],
      win: [
        "Three points secured. Someone's sleeping peacefully tonight. 😂",
        "Now THAT is a scoreboard worth looking at. 🔥",
        "Football decided to cooperate today. Rare behavior. 😂",
        "Victory unlocked. Somebody check the trophy cabinet. 😏"
      ],
      draw: [
        "A draw. Football's favorite way of saying 'nobody gets everything.' 😂",
        "Neither side wanted to fully commit to the drama. 😭",
        "Shared points. Shared disappointment. Possibly shared relief. 😂"
      ],
      high_scoring: [
        "Apparently defending was optional today. 😂",
        "The goals department was clearly working overtime.",
        "Someone forgot to tell the defenders this was a football match. 😭"
      ],
      low_scoring: [
        "The goals were apparently stuck in traffic. 😭",
        "Not exactly a goal festival. More like a goal meeting. 😂",
        "The scoreboard could use some entertainment. 😏"
      ],
      red_card: [
        "And there goes the plot twist. 🟥😂",
        "Someone has officially left the chat. 😭",
        "The referee has entered villain mode. 😂"
      ],
      penalty: [
        "Penalty. Every goalkeeper's favorite five seconds. 😭",
        "Now everybody suddenly becomes a goalkeeper coach. 😂",
        "That little white spot just became the most important place on Earth. 👀"
      ],
      clean_sheet: [
        "Defenders are taking the victory lap today. 🧱",
        "The back line said: absolutely nothing gets through here. 😂",
        "Clean sheet secured. The defense understood the assignment."
      ],
      dominant_team: [
        "That wasn't just control. That was football ownership. 😂",
        "One team came to play. The other came to participate. 😭",
        "The numbers are looking slightly disrespectful. 👀"
      ],
      user_confused: [
        "Don't worry. KIM translation services are available. 😂",
        "Let's slow it down and remove the football PhD requirement. 😭",
        "I'll explain it like we're having a normal conversation, not sitting an exam. 😂"
      ],
      technical: [
        "Alright, switching from street football mode to tactical laboratory mode. 🧪😂",
        "Now we're getting serious. Time to bring out the tactical microscope. 🔬",
        "Football nerd mode: activated. 😏"
      ],
      casual: [
        "Fair question. 👀",
        "Now that's an interesting one.",
        "Okay, I wasn't expecting that question. 😂",
        "You really decided to make KIM think today. 😭"
      ],
      playful: [
        "😂 Now we're speaking my language.",
        "You came here looking for trouble, didn't you? 😭",
        "I see the vibes today. 😂",
        "Okay okay... I know where this conversation is going. 😏"
      ],
      fallback: [
        "Interesting question. Let's work through it.",
        "Okay, let's investigate this one. 👀",
        "Now you've given my processors something to do. 😂",
        "Let's see what we've got."
      ]
    };
  }

  /* ============================================================
     PUBLIC API
  ============================================================ */

  inject(intent, context = {}) {
    const normalizedIntent = this.normalizeIntent(intent);
    const userId = context.userId || 'global';
    const state = this.getUserState(userId);

    if (context.allowHumor === false || context.serious || context.critical || context.noHumor || this.isSensitive(context)) {
      return null;
    }

    if (this.isOnCooldown(userId)) return null;

    const score = this.calculateChance(normalizedIntent, context, state);

    if (context.userRequestedHumor) {
      return this.generateHumor(normalizedIntent, context, userId, state, Math.max(score, this.config.explicitHumorChance));
    }

    if (Math.random() > score) return null;

    return this.generateHumor(normalizedIntent, context, userId, state, score);
  }

  contextual(context = {}) {
    return this.inject(context.intent || 'casual', context);
  }

  /* ============================================================
     GENERATE HUMOR
  ============================================================ */

  generateHumor(intent, context, userId, state, score) {
    const category = this.selectCategory(intent, context, state);
    const line = this.pickWeighted(category, state);

    if (!line) return null;

    const intensity = this.calculateIntensity(context, state);
    const placement = this.selectPlacement(context);

    this.recordHumor(userId, category, line);

    return {
      text: line,
      category,
      intensity,
      placement,
      score: Number(score.toFixed(3)),
      confidence: Number(Math.min(1, score + 0.10).toFixed(3)),
      generatedAt: Date.now()
    };
  }

  normalizeIntent(intent) {
    if (!intent) return 'casual';
    const value = String(intent).toLowerCase().replace(/[-\s]/g, '_');
    const aliases = {
      match: 'match_analysis', analysis: 'match_analysis',
      form: 'team_form', predict: 'prediction',
      hello: 'greeting', hi: 'greeting', tactics: 'technical',
      smalltalk: 'casual', small_talk: 'casual'
    };
    return aliases[value] || value;
  }

  /* ============================================================
     HUMOR PROBABILITY & CATEGORY SELECTION
  ============================================================ */

  calculateChance(intent, context = {}, state = {}) {
    let chance = this.config.defaultChance * (this.personality.funny / 0.65);

    if (['greeting', 'casual', 'small_talk'].includes(intent)) chance += 0.15;
    if (['match_analysis', 'team_form', 'prediction'].includes(intent)) chance += 0.08;
    
    if (context.userLaughing || context.userUsedEmoji || context.userTone === 'playful') {
      chance += this.config.playfulBonus;
    }
    if (context.userRequestedHumor) chance = this.config.explicitHumorChance;
    if (['sad', 'angry', 'worried'].includes(context.emotion)) chance -= 0.10;
    if (state?.conversationMomentum >= 3) chance += this.config.momentumBonus;
    if (state?.humorStreak >= this.config.maxHumorStreak) chance = 0;
    if (state?.lastCategory) chance -= 0.03;

    return Math.min(this.config.maxChance, Math.max(0, chance));
  }

  selectCategory(intent, context = {}, state = {}) {
    if (context.redCard) return 'red_card';
    if (context.penalty) return 'penalty';
    if (context.userSaidLost || context.result === 'loss') return 'loss';
    if (context.result === 'win') return 'win';
    if (context.result === 'draw') return 'draw';
    if (context.highScoring) return 'high_scoring';
    if (context.lowScoring) return 'low_scoring';
    if (context.cleanSheet) return 'clean_sheet';
    if (context.dominant) return 'dominant_team';

    if (context.userTone === 'playful' || context.userLaughing) {
      if (this.templates.playful && Math.random() < 0.35) return 'playful';
    }

    if (this.templates[intent]) return intent;
    if (context.emotion === 'sad' || context.userSaidLost) return 'loss';
    if (context.confused) return 'user_confused';
    if (context.technical || intent === 'tactics') return 'technical';

    return 'casual';
  }

  isSensitive(context = {}) {
    const sensitiveIntents = ['medical', 'health', 'self_harm', 'crisis', 'grief', 'trauma', 'legal', 'financial_crisis'];
    const intent = this.normalizeIntent(context.intent);
    if (sensitiveIntents.includes(intent)) return true;
    if (context.critical || context.noHumor) return true;
    return false;
  }

  /* ============================================================
     INTENSITY & PLACEMENT
  ============================================================ */

  calculateIntensity(context = {}, state = {}) {
    if (context.userRequestedHumor) {
      return context.humorIntensity ? Math.min(3, Math.max(1, Number(context.humorIntensity))) : 3;
    }
    if (context.userTone === 'playful') return 2;
    if (state?.conversationMomentum >= 5) return 2;
    return 1;
  }

  selectPlacement(context = {}) {
    if (context.humorPlacement) return context.humorPlacement;
    if (context.answerLength === 'long') return 'after_intro';
    if (context.answerLength === 'short') return 'inline';
    
    const roll = Math.random();
    if (roll < 0.25) return 'before_answer';
    if (roll < 0.75) return 'after_answer';
    return 'inline';
  }

  /* ============================================================
     WEIGHTED LINE SELECTION
  ============================================================ */

  pickWeighted(category, state = {}) {
    const options = this.templates[category];
    if (!Array.isArray(options) || options.length === 0) return null;

    const history = state.humorHistory || [];
    const weighted = options.map(line => {
      let weight = 1;
      if (history.includes(line)) weight *= this.config.lineRepeatPenalty;
      return { line, weight };
    });

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of weighted) {
      random -= item.weight;
      if (random <= 0) return item.line;
    }
    return weighted[0].line;
  }

  /* ============================================================
     USER STATE & TRACKING
  ============================================================ */

  getUserState(userId) {
    if (!this.state.has(userId)) {
      this.state.set(userId, {
        messageCounter: 0, lastHumorMessage: -999, humorStreak: 0,
        conversationMomentum: 0, lastCategory: null, humorHistory: [],
        categoryHistory: [], lastHumorAt: null
      });
    }
    return this.state.get(userId);
  }

  recordMessage(userId) {
    const state = this.getUserState(userId);
    state.messageCounter++;
    
    if (state.lastHumorMessage >= 0 && (state.messageCounter - state.lastHumorMessage) > this.config.cooldownMessages) {
      state.humorStreak = 0;
    }
    
    state.conversationMomentum = Math.min(10, state.conversationMomentum + 1);
    return state;
  }

  recordHumor(userId, category, line) {
    const state = this.getUserState(userId);
    state.lastHumorMessage = state.messageCounter;
    state.humorStreak++;
    state.lastCategory = category;
    state.lastHumorAt = Date.now();
    
    state.humorHistory.push(line);
    state.categoryHistory.push(category);
    
    if (state.humorHistory.length > this.config.historyLimit) state.humorHistory.shift();
    if (state.categoryHistory.length > this.config.historyLimit) state.categoryHistory.shift();
  }

  isOnCooldown(userId) {
    const state = this.getUserState(userId);
    if (state.lastHumorMessage < 0) return false;
    const messagesSince = state.messageCounter - state.lastHumorMessage;
    return messagesSince < this.config.cooldownMessages;
  }

  /* ============================================================
     DIRECT JOKE REQUEST
  ============================================================ */

  joke(context = {}) {
    const userId = context.userId || 'global';
    if (this.isSensitive(context)) return null;

    const state = this.getUserState(userId);
    const intent = this.normalizeIntent(context.intent || 'casual');
    
    const jokeContext = { ...context, userRequestedHumor: true, allowHumor: true };
    const category = this.selectCategory(intent, jokeContext, state);
    const text = this.pickWeighted(category, state);

    if (!text) {
      return {
        text: "I'd tell you a football joke, but VAR is still reviewing it. 😂",
        category: 'fallback', intensity: 2, placement: 'standalone', generatedAt: Date.now()
      };
    }

    this.recordHumor(userId, category, text);
    return { text, category, intensity: 3, placement: 'standalone', score: 1, confidence: 1, generatedAt: Date.now() };
  }

  /* ============================================================
     CONTROLS & DEBUG
  ============================================================ */

  setPersonality(values = {}) {
    const allowed = ['smart', 'funny', 'friendly', 'confidence', 'humility', 'sarcasm', 'aggression'];
    for (const key of allowed) {
      if (typeof values[key] === 'number') {
        this.personality[key] = Math.min(1, Math.max(0, values[key]));
      }
    }
    return this.personality;
  }

  setUserPreference(userId, preference) {
    const state = this.getUserState(userId);
    state.humorPreference = preference;
    return true;
  }

  resetConversation(userId) {
    if (!userId) return false;
    const state = this.getUserState(userId);
    state.conversationMomentum = 0;
    state.humorStreak = 0;
    state.lastCategory = null;
    state.humorHistory = [];
    state.categoryHistory = [];
    return true;
  }

  getStats() {
    const categories = Object.keys(this.templates);
    let totalLines = 0;
    for (const category of categories) totalLines += this.templates[category].length;

    return {
      version: this.VERSION,
      personality: { ...this.personality },
      categories: categories.length,
      totalLines,
      defaultChance: this.config.defaultChance,
      maxChance: this.config.maxChance,
      activeUsers: this.state.size
    };
  }

  getUserStats(userId) {
    const state = this.state.get(userId);
    if (!state) return null;
    return {
      messageCounter: state.messageCounter,
      lastHumorMessage: state.lastHumorMessage,
      humorStreak: state.humorStreak,
      conversationMomentum: state.conversationMomentum,
      lastCategory: state.lastCategory,
      recentCategories: [...state.categoryHistory],
      recentHumor: [...state.humorHistory],
      lastHumorAt: state.lastHumorAt,
      onCooldown: this.isOnCooldown(userId)
    };
  }

  resetUser(userId) {
    if (!userId) return false;
    return this.state.delete(userId);
  }

  resetAll() {
    this.state.clear();
    return true;
  }
}

module.exports = new HumorEngine();