'use strict';

/**
 * ============================================================
 * KIM — QUERY NORMALIZER
 * ============================================================
 * Converts messy human input into a predictable representation
 * that the rest of KIM can understand.
 *
 * This acts as the canonical normalization layer.
 * ============================================================
 */

class QueryNormalizer {
  constructor() {
    this.VERSION = '2.1.0';

    /* ----------------------------------------------------------
       SHENG / SLANG MAPPINGS
    ---------------------------------------------------------- */
    this.shengMappings = {
      "leo uko aje": "how are you today",
      "usinipatie story za bure": "do not give me useless stories",
      "wamechapa": "did they beat",
      "wanapigwa": "are they losing",
      "bana": "bro",
      "msee": "bro",
      "sai": "right now",
      "ako aje": "how are they doing",
      "wako aje": "how are they doing",
      "nani alibeba": "who won",
      "ni team gani ilishinda": "which team won",
      "lazima ishinde": "guaranteed to win"
    };

    this.contractions = {
      "what's": "what is", "whats": "what is", "who's": "who is", "whos": "who is",
      "where's": "where is", "wheres": "where is", "how's": "how is", "hows": "how is",
      "why's": "why is", "whys": "why is", "can't": "cannot", "cant": "cannot",
      "won't": "will not", "wont": "will not", "don't": "do not", "dont": "do not",
      "doesn't": "does not", "doesnt": "does not", "didn't": "did not", "didnt": "did not",
      "isn't": "is not", "isnt": "is not", "aren't": "are not", "arent": "are not",
      "wasn't": "was not", "wasnt": "was not", "weren't": "were not", "werent": "were not",
      "shouldn't": "should not", "shouldnt": "should not", "couldn't": "could not", "couldnt": "could not",
      "wouldn't": "would not", "wouldnt": "would not", "i'm": "i am", "im": "i am",
      "i've": "i have", "ive": "i have", "i'll": "i will", "ill": "i will",
      "i'd": "i would", "id": "i would", "you're": "you are", "youre": "you are",
      "you've": "you have", "youve": "you have", "you'll": "you will", "youll": "you will",
      "they're": "they are", "theyre": "they are", "that's": "that is", "thats": "that is",
      "there's": "there is", "theres": "there is"
    };

    this.abbreviations = {
      "epl": "premier league", "pl": "premier league", "ucl": "champions league",
      "uel": "europa league", "uecl": "conference league", "wc": "world cup",
      "afcon": "africa cup of nations", "bpl": "premier league", "var": "video assistant referee",
      "gk": "goalkeeper", "cb": "centre back", "lb": "left back", "rb": "right back",
      "dm": "defensive midfielder", "cm": "central midfielder", "am": "attacking midfielder",
      "lw": "left winger", "rw": "right winger", "st": "striker", "cf": "centre forward",
      "h2h": "head to head", "btts": "both teams to score",
      "xg": "expected goals", "xga": "expected goals against", "ppg": "points per game"
    };

    // Pre-compile replacement regexes
    this._shengRegex = this._buildRegex(this.shengMappings);
    this._contractionRegex = this._buildRegex(this.contractions);
    this._abbreviationRegex = this._buildRegex(this.abbreviations);
    
    // Longest-first ordering for invocation to prevent partial overlaps
    this._invocationPrefix = /^(alright kim|okay kim|hello kim|hey kim|hi kim|yo kim|kim)[,:]?\s+/i;
    
    // Removed 'man' to prevent destroying "Man United" entity
    this._fillerWords = /\b(please|kindly|bro|brother|mate|hey|hi|hello|can you|could you|tell me|i want to know)\b/gi;
    
    this._questionStarters = /^(who|what|when|where|why|how|which|can|could|will|would|is|are|was|were|do|does|did|should|should i|tell me|explain|compare|predict)\b/i;
    this._footballLangRegex = /\b(football|soccer|match|game|goal|goals|score|scored|league|cup|tournament|team|club|player|striker|midfielder|defender|goalkeeper|manager|coach|referee|var|offside|penalty|corner|free kick|formation|tactics|transfer|fixture|result|standings|table|points|win|draw|loss|defeat|premier league|champions league|europa league|world cup|africa cup of nations)\b/i;
    this._emotionWords = /\b(happy|sad|angry|mad|excited|bored|tired|devastated|frustrated|annoyed|love|hate|afraid|scared|worried|shocked|crazy|amazing|terrible|awful|brilliant)\b/i;
    this._greetingWords = /\b(hi|hello|hey|yo|sup|good morning|good afternoon|good evening|morning|evening)\b/i;
  }

  _buildRegex(map) {
    // Sort by length descending to match longer phrases first
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    const escaped = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  }

  /* ============================================================
     MAIN NORMALIZE FUNCTION
  ============================================================ */

  normalize(input) {
    const original = typeof input === 'string' ? input : String(input ?? '');
    
    // Safely strip conversational invocation prefix
    let text = original.replace(this._invocationPrefix, '').trim();

    // Normalize Unicode apostrophes and dashes
    text = text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');

    // Lowercase for matching
    let normalized = text.toLowerCase();

    // Pipeline sequence: Sheng -> Contractions -> Abbreviations
    normalized = this._expand(normalized, this._shengRegex, this.shengMappings);
    normalized = this._expand(normalized, this._contractionRegex, this.contractions);
    normalized = this._expand(normalized, this._abbreviationRegex, this.abbreviations);

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Search-friendly representation (strips punctuation)
    const searchable = normalized.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const tokens = searchable ? searchable.split(' ') : [];

    // Surgical score/prediction detection
    const isHistoricalScore = /\b(what was|what is the final|final score|scoreline|result)\b.*\bscore\b/i.test(normalized) || /\bwhat was the score\b/i.test(normalized);
    const isPredictedScore = /\b(predict|prediction|predict the score|what will the score|score prediction)\b/i.test(normalized) || /\b(who will win|likely to win|win probability|odds|chance of winning)\b/i.test(normalized);

    return {
      original,
      normalized,
      searchable,
      tokens,
      length: normalized.length,
      wordCount: tokens.length,
      isQuestion: this.isQuestion(normalized),
      questionType: this.detectQuestionType(normalized, isPredictedScore),
      hasQuestionMark: /[?？]/.test(original),
      hasGreeting: this._greetingWords.test(normalized),
      hasEmotion: this._emotionWords.test(normalized),
      hasFootballLanguage: this._footballLangRegex.test(normalized),
      isHistoricalScore,
      isPredictedScore
    };
  }

  _expand(text, regex, map) {
    return text.replace(regex, (match) => map[match.toLowerCase()] || match);
  }

  isQuestion(text) {
    if (!text) return false;
    if (/[?？]$/.test(text.trim())) return true;
    return this._questionStarters.test(text.trim());
  }

  detectQuestionType(text, isPredictedScore = false) {
    if (!text) return 'none';
    const value = text.trim();

    if (isPredictedScore) return 'prediction';
    
    if (/^(who)\b/i.test(value)) return 'who';
    if (/^(what)\b/i.test(value)) return 'what';
    if (/^(when)\b/i.test(value)) return 'when';
    if (/^(where)\b/i.test(value)) return 'where';
    if (/^(why)\b/i.test(value)) return 'why';
    if (/^(how)\b/i.test(value)) return 'how';
    if (/^(which)\b/i.test(value)) return 'which';
    
    if (/\b(compare|versus|vs|better than|stronger than)\b/i.test(value)) return 'comparison';
    
    if (/^(can|could|will|would|should|is|are|was|were|do|does|did)\b/i.test(value)) return 'yes_no';

    return 'statement';
  }

  clean(text) {
    return String(text ?? '').replace(/\s+/g, ' ').replace(/[!?]{2,}/g, '?').trim();
  }

  tokenize(text) {
    return this.normalize(text).tokens;
  }

  variants(text) {
    const normalized = this.normalize(text);
    const variants = new Set();

    if (normalized.searchable) variants.add(normalized.searchable);
    if (normalized.normalized) variants.add(normalized.normalized);

    const withoutFiller = normalized.searchable
      .replace(this._fillerWords, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (withoutFiller) variants.add(withoutFiller);

    return Array.from(variants);
  }
}

module.exports = new QueryNormalizer();