import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles, AlertCircle, RefreshCw, Lock, WifiOff, Activity, Target
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

// ═══════════════════════════════════════════════════════════
// LOCAL INTENT ENGINE (Strict multi-word phrases ONLY)
// ═══════════════════════════════════════════════════════════
const APP_KNOWLEDGE_BASE = [
  {
    // Removed: 'predict', 'points', 'scoring', 'exact', 'result', 'miss'
    keywords: ['how to predict', 'make a prediction', 'how do i get points', 'what are points', 'scoring system', 'prediction lock', 'how to play'],
    response: `# How Predictions Work\nMaking a prediction is easy! Go to the **Predictions** tab and enter your expected score before the match locks.\n\n- **Exact Score:** 10 Points 🎯\n- **Correct Result (Win/Draw/Loss):** 3 Points 📈\n- **Miss:** 0 Points\n\n*Note: Matches lock 60 minutes before kickoff to ensure fair play!*`
  },
  {
    // Removed: 'edit', 'video', 'image', 'create', 'graphic', 'template'
    keywords: ['zokascore studio', 'how to use the studio', 'reactor studio', 'face ar', 'graphic editor', 'reaction cam'],
    response: `# ZOKASCORE Studio\nThe Studio is our built-in pro creator toolkit! Access it from the main menu.\n\n- **Graphic Editor:** Build custom scoreboards and news cards.\n- **Reactor Studio:** Create viral TikTok/Reels templates with effects.\n- **Face AR:** Apply football masks and filters to your camera.\n- **Reaction Cam:** Record your match reactions in 9:16 format.`
  },
  {
    // Removed: 'rank', 'weekly', 'daily', 'monthly', 'compete'
    keywords: ['leaderboard', 'how do i rank', 'goat rank', 'weekly leaderboard', 'daily leaderboard', 'monthly leaderboard', 'hall of fame'],
    response: `# Leaderboards & Ranks\nCompete against fans worldwide!\n\n- **Daily:** Resets every 24 hours.\n- **Weekly & Monthly:** Cumulative points for the week/month.\n- **G.O.A.T:** The all-time hall of fame.\n\nCheck your rank by tapping the **Trophy** icon in the navbar!`
  },
  {
    // Removed: 'expert', 'best pick', 'vote'
    keywords: ['zoka picks', 'admin picks', 'what are zoka picks', 'expert picks'],
    response: `# Zoka Picks\nThese are the premium, expert predictions made by the ZOKASCORE team. You can find them on the Predictions page. You can also vote "Agree" or "Disagree" on them to see how the community feels and join the debate!`
  },
  {
    // Removed: 'offline', 'pwa', 'install', 'app', 'download', 'home screen'
    keywords: ['install zokascore', 'download the app', 'install app', 'pwa', 'add to home screen', 'offline mode'],
    response: `# Install the App\nZOKASCORE is a Progressive Web App (PWA)! You can install it directly to your home screen for an offline-capable, native app experience.\n\nScroll to the bottom of the page and tap **"Install App"**, or use your browser's "Add to Home Screen" option.`
  },
  {
    // Removed: 'developer', 'creator', 'built', 'team', 'company'
    keywords: ['who made zokascore', 'who built zokascore', 'zokascore developer', 'zokascore creator', 'about the creator', 'who made this'],
    response: `# About the Creator\nZOKASCORE is 100% independently designed, developed, and maintained by a single passionate developer. No big corporate teams, just pure love for football and clean code! ⚽`
  },
  {
    // Removed: 'help', 'support', 'contact', 'bug', 'report', 'email'
    keywords: ['contact support', 'report a bug', 'zokascore email', 'help center', 'how to contact'],
    response: `# Need Help?\nIf you found a bug or need support, head over to the **Contact** page in the footer. You can also email us directly at **streetzoka@gmail.com**. We usually reply within 24 hours!`
  },
  {
    // Removed: 'game', 'play'
    keywords: ['mastergames', 'master games', 'play mini games', 'arcade'],
    response: `# Master Games\nMaster Games is our premium arcade section where you can play football-themed mini-games to test your reflexes and earn bonus bragging rights! Check the main menu to start playing.`
  }
];

// ★ GENIUS FIX: Football Safety Net
// If the user mentions ANY of these words, we immediately step aside 
// and let the Backend Kim Engine handle it.
const FOOTBALL_TRIGGERS = [
  'world cup', 'offside', 'foul', 'penalty', 'kick', 'tactic', 'formation', 
  'gegenpress', 'low block', 'match', 'score', 'goal', 'win', 'loss', 'draw', 
  'referee', 'var', '2014', '2018', '2022', '1930', 'champion', 'host', 
  'teams', 'played', 'final', 'most', 'who won', 'build-up', 'false 9'
];

function interceptLocalQuery(query) {
  const q = query.toLowerCase();
  
  // 1. Safety Check: If it looks like a football question, DO NOT intercept.
  if (FOOTBALL_TRIGGERS.some(kw => q.includes(kw))) {
    return null; 
  }

  // 2. Strict Phrase Match: Only intercept if exact multi-word app phrases are used.
  for (const item of APP_KNOWLEDGE_BASE) {
    if (item.keywords.some(kw => q.includes(kw))) {
      return item.response;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Engine Badge Mapper
// ═══════════════════════════════════════════════════════════
const getEngineBadge = (model) => {
  if (!model) return null;
  
  if (model.includes('local-engine') || model.includes('local-app')) return { icon: Brain, text: 'Verified Knowledge', color: 'text-primary' };
  if (model.includes('match-engine')) return { icon: Activity, text: 'Live Match Data', color: 'text-success' };
  if (model.includes('prediction-engine')) return { icon: Target, text: 'Tactical Prediction', color: 'text-warning' };
  if (model.includes('gemini')) return { icon: Sparkles, text: 'AI Analysis', color: 'text-secondary' };
  if (model.includes('cached')) return { icon: Activity, text: 'Cached Response', color: 'text-base-300' };
  
  return null;
};

// ═══════════════════════════════════════════════════════════
// TYPEWRITER COMPONENT
// ═══════════════════════════════════════════════════════════
const TypewriterText = ({ text, isActive, onComplete }) => {
  const [displayed, setDisplayed] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isActive) {
      setDisplayed(text);
      if (onComplete) onComplete();
      return;
    }
    setDisplayed('');
    let i = 0;
    const timer = setInterval(() => {
      setDisplayed(text.substring(0, i));
      i++;
      if (i > text.length) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, 12);
    return () => clearInterval(timer);
  }, [text, isActive, onComplete]);

  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [displayed, isActive]);

  const cleanFormat = (str) => {
    let clean = str.replace(/\*\*(ZOKASCORE|Zokascore|zokascore)\*\*/gi, 'ZOKASCORE');
    return clean.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed === '') return <br key={idx} />;
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <div key={idx} className="flex items-start gap-2 ml-1 my-1">
            <span className="text-primary mt-1.5 text-[10px]">●</span>
            <span className="text-sm opacity-90 leading-relaxed">{trimmed.substring(2)}</span>
          </div>
        );
      }
      if (trimmed.match(/^#{1,3}\s+(.*)/)) {
        return (
          <h4 key={idx} className="font-semibold text-primary mt-3 mb-1 text-sm uppercase tracking-wide">
            {trimmed.replace(/^#{1,3}\s+/, '')}
          </h4>
        );
      }
      return <p key={idx} className="text-sm leading-relaxed mb-1 opacity-90">{trimmed}</p>;
    });
  };

  return (
    <div ref={containerRef}>
      {cleanFormat(displayed)}
      {isActive && <span className="typewriter-cursor" />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN ZOKA AI COMPONENT
// ═══════════════════════════════════════════════════════════
export default function ZokaAI({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kim_chats')) || []; } 
    catch { return []; }
  });
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState(null);
  const [typingMessageId, setTypingMessageId] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const handleSendRef = useRef(null); // Prevent stale closures in external triggers

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  // ★ PRO: Track internet connection status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('kim_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    if (!typingMessageId) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, typingMessageId]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setShowSidebar(false);
      setError(null);
      setTypingMessageId(null);
    }
  }, [isOpen]);

  const startNewChat = () => {
    setActiveChatId(null);
    setInput("");
    setError(null);
    setTypingMessageId(null);
    setShowSidebar(false);
    inputRef.current?.focus();
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
      setError(null);
      setTypingMessageId(null);
    }
  };

  const handleRetry = async () => {
    if (!messages.length) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    setChats(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: c.messages.filter(m => !m.isError) } : c));
    await sendMessageToBackend(lastUserMsg.content, activeChatId);
  };

  const sendMessageToBackend = async (currentInput, chatId) => {
    try {
      if (!isOnline) throw new Error("You are offline. Please check your connection.");
      
      const currentMessages = chats.find(c => c.id === chatId)?.messages || [];
      const history = currentMessages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));
      
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/v1/ai/zoka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ message: currentInput, history })
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to get response');
      
      // ★ NEW: Store the model string to render the badge
      const aiMsg = { role: 'assistant', content: data.reply, model: data.model, id: Date.now() + 1 };
      setTypingMessageId(aiMsg.id);
      
      setChats(prev => prev.map(c => {
        if (c.id === chatId) {
          const cleanMessages = c.messages.filter(m => !m.isError);
          return { ...c, messages: [...cleanMessages, aiMsg] };
        }
        return c;
      }));

    } catch (err) {
      console.error('AI Request Failed:', err);
      const errorMsg = { role: 'assistant', content: err.message, isError: true, id: Date.now() + 1 };
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, errorMsg] } : c));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = useCallback(async (overrideText) => {
    const textToSend = (overrideText || input).trim();
    if (!textToSend || loading) return;
    
    if (!currentUser) {
      setError("Please log in to chat with Kim.");
      return;
    }

    const currentInput = textToSend;
    setInput("");
    setError(null);
    setTypingMessageId(null);
    
    const newChatId = activeChatId || Date.now().toString();
    const chatTitle = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
    const userMsg = { role: 'user', content: currentInput, id: Date.now() };

    setChats(prev => {
      const existing = prev.find(c => c.id === newChatId);
      if (existing) {
        return prev.map(c => c.id === newChatId ? { ...c, messages: [...c.messages, userMsg] } : c);
      } else {
        return [{ id: newChatId, title: chatTitle, messages: [userMsg] }, ...prev];
      }
    });
    setActiveChatId(newChatId);
    setLoading(true);

    // ★ PRO UPGRADE: Intercept simple app questions locally to save API calls
    const localReply = interceptLocalQuery(currentInput);
    
    if (localReply) {
      // Simulate AI "thinking" for 800ms so the typewriter feels natural
      setTimeout(() => {
        // ★ NEW: Assign 'local-app' model to local app knowledge
        const aiMsg = { role: 'assistant', content: localReply, model: 'local-app', id: Date.now() + 1 };
        setTypingMessageId(aiMsg.id);
        setChats(prev => prev.map(c => {
          if (c.id === newChatId) {
            const cleanMessages = c.messages.filter(m => !m.isError && m.id !== userMsg.id);
            return { ...c, messages: [...cleanMessages, userMsg, aiMsg] };
          }
          return c;
        }));
        setLoading(false);
      }, 800);
      return; // Stop execution, do not call backend
    }

    // If not a simple app question, call the backend Gemini API
    await sendMessageToBackend(currentInput, newChatId);
  }, [input, loading, currentUser, activeChatId, chats, isOnline]);

  // Keep ref updated to prevent stale closures in external event listeners
  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Listen for external triggers (e.g., from TeamPage or MatchPage)
  useEffect(() => {
    const handleExternalOpen = (e) => {
      const promptMessage = e.detail?.message;
      if (promptMessage && isOpen) {
        setTimeout(() => {
          handleSendRef.current(promptMessage); 
        }, 400);
      }
    };
    
    window.addEventListener('openZokaAI', handleExternalOpen);
    return () => window.removeEventListener('openZokaAI', handleExternalOpen);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="kim-backdrop" onClick={onClose} />
      <div className="kim-window">
        {showSidebar && <div className="kim-sidebar-overlay" onClick={() => setShowSidebar(false)} />}
        
        <div className={`kim-sidebar ${showSidebar ? 'open' : ''}`}>
          <div className="kim-sidebar-header">
            <span className="kim-sidebar-title">Chat History</span>
            <button onClick={() => setShowSidebar(false)} className="btn-icon btn-ghost"><X size={18} /></button>
          </div>
          <div className="kim-sidebar-actions">
            <button onClick={startNewChat} className="btn btn-primary w-full flex-center gap-2">
              <Plus size={16} /> New Chat
            </button>
          </div>
          <div className="kim-sidebar-list">
            {chats.length === 0 && <div className="kim-sidebar-empty">No recent chats.</div>}
            {chats.map(chat => (
              <div key={chat.id} onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); setError(null); setTypingMessageId(null); }} className={`kim-chat-item ${activeChatId === chat.id ? 'active' : ''}`}>
                <div className="kim-chat-item-info">
                  <MessageSquare size={14} />
                  <span className="truncate">{chat.title}</span>
                </div>
                <button onClick={(e) => deleteChat(chat.id, e)} className="kim-chat-delete" title="Delete chat">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="kim-main">
          <div className="kim-header">
            <div className="kim-header-left">
              <button onClick={() => setShowSidebar(!showSidebar)} className="btn-icon btn-ghost">
                <Menu size={20} />
              </button>
              <div className="kim-header-info">
                <div className="kim-avatar">
                  <Sparkles size={16} color="#fff" />
                </div>
                <div>
                  <h2 className="kim-name">Kim</h2>
                  <span className="kim-status flex items-center gap-1">
                    {!isOnline ? <><WifiOff size={10} /> Offline Mode</> : "Football Intelligence"}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="btn-icon btn-ghost"><X size={20} /></button>
          </div>

          <div className="kim-body">
            {messages.length === 0 && (
              <div className="kim-empty-state">
                <Brain size={48} className="text-primary mb-4" style={{ opacity: 0.5 }} />
                <h3>Chat with Kim</h3>
                <p>Ask me about today's matches, how to use the Studio, or your prediction stats.</p>
              </div>
            )}
            
            {messages.map((msg, i) => {
              const badge = msg.role === 'assistant' ? getEngineBadge(msg.model) : null;
              const BadgeIcon = badge?.icon;
              
              return (
                <div key={msg.id || i} className={`kim-msg-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.role !== 'user' && (
                    <div className="kim-msg-avatar">
                      <Sparkles size={14} color="#fff" />
                    </div>
                  )}
                  <div className={`kim-bubble ${msg.role === 'user' ? 'user' : 'ai'} ${msg.isError ? 'error' : ''}`}>
                    {/* ★ NEW: Reasoning Badge */}
                    {badge && !msg.isError && (
                      <div className={`flex items-center gap-1 mb-2 text-[10px] font-bold uppercase tracking-wider ${badge.color}`}>
                        <BadgeIcon size={10} /> {badge.text}
                      </div>
                    )}
                    
                    {msg.isError ? (
                      <div className="flex items-center gap-2">
                        <AlertCircle size={14} />
                        <span>{msg.content}</span>
                        <button onClick={handleRetry} className="ml-2 text-xs underline flex items-center gap-1 hover:text-white transition-colors">
                          <RefreshCw size={12} /> Retry
                        </button>
                      </div>
                    ) : msg.role === 'assistant' ? (
                      <TypewriterText text={msg.content} isActive={msg.id === typingMessageId} onComplete={() => setTypingMessageId(null)} />
                    ) : (
                      <div className="text-sm leading-relaxed">{msg.content}</div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="kim-msg-avatar user">
                      <User size={14} color="#fff" />
                    </div>
                  )}
                </div>
              );
            })}
            
            {loading && !typingMessageId && (
              <div className="kim-msg-row ai">
                <div className="kim-msg-avatar">
                  <Sparkles size={14} color="#fff" />
                </div>
                <div className="kim-bubble ai loading">
                  <Loader size={14} className="anim-spin" /> <span>Analyzing tactics...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="kim-input-area">
            {!currentUser && (
              <div className="kim-auth-warning">
                <Lock size={12} /> Authentication required to chat with Kim.
              </div>
            )}
            <div className="kim-input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={currentUser ? "Message Kim..." : "Log in to chat..."}
                className="kim-input"
                disabled={loading || !currentUser}
              />
              <button onClick={() => handleSend()} disabled={loading || !input.trim() || !currentUser} className={`kim-send-btn ${!input.trim() || loading || !currentUser ? 'disabled' : ''}`}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}