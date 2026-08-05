import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles, AlertCircle, RefreshCw, Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

// ═══════════════════════════════════════════════════════════
// LOCAL INTENT ENGINE (Saves API Calls & Gives Instant Answers)
// ═══════════════════════════════════════════════════════════
const APP_KNOWLEDGE_BASE = [
  {
    keywords: ['predict', 'how to predict', 'make prediction', 'points', 'scoring', 'exact', 'result', 'miss'],
    response: `# How Predictions Work\nMaking a prediction is easy! Go to the **Predictions** tab and enter your expected score before the match locks.\n\n- **Exact Score:** 10 Points 🎯\n- **Correct Result (Win/Draw/Loss):** 3 Points 📈\n- **Miss:** 0 Points\n\n*Note: Matches lock 60 minutes before kickoff to ensure fair play!*`
  },
  {
    keywords: ['studio', 'edit', 'video', 'image', 'reactor', 'face ar', 'create', 'graphic', 'template'],
    response: `# ZOKASCORE Studio\nThe Studio is our built-in pro creator toolkit! Access it from the main menu.\n\n- **Graphic Editor:** Build custom scoreboards and news cards.\n- **Reactor Studio:** Create viral TikTok/Reels templates with effects.\n- **Face AR:** Apply football masks and filters to your camera.\n- **Reaction Cam:** Record your match reactions in 9:16 format.`
  },
  {
    keywords: ['leaderboard', 'rank', 'goat', 'weekly', 'daily', 'monthly', 'compete'],
    response: `# Leaderboards & Ranks\nCompete against fans worldwide!\n\n- **Daily:** Resets every 24 hours.\n- **Weekly & Monthly:** Cumulative points for the week/month.\n- **G.O.A.T:** The all-time hall of fame.\n\nCheck your rank by tapping the **Trophy** icon in the navbar!`
  },
  {
    keywords: ['zoka picks', 'admin picks', 'expert', 'best pick', 'vote'],
    response: `# Zoka Picks\nThese are the premium, expert predictions made by the ZOKASCORE team. You can find them on the Predictions page. You can also vote "Agree" or "Disagree" on them to see how the community feels and join the debate!`
  },
  {
    keywords: ['live', 'score', 'fixture', 'match', 'today', 'where', 'find'],
    response: `# Live Scores & Fixtures\nTo see today's matches, tap the **Fixtures** or **Activity** icon in the navigation. Live matches will pulse with a red dot and update in real-time with possession stats and timelines!`
  },
  {
    keywords: ['offline', 'pwa', 'install', 'app', 'download', 'home screen'],
    response: `# Install the App\nZOKASCORE is a Progressive Web App (PWA)! You can install it directly to your home screen for an offline-capable, native app experience.\n\nScroll to the bottom of the page and tap **"Install App"**, or use your browser's "Add to Home Screen" option.`
  },
  {
    keywords: ['who made', 'developer', 'creator', 'built', 'team', 'company'],
    response: `# About the Creator\nZOKASCORE is 100% independently designed, developed, and maintained by a single passionate developer. No big corporate teams, just pure love for football and clean code! ⚽`
  },
  {
    keywords: ['help', 'support', 'contact', 'bug', 'report', 'email'],
    response: `# Need Help?\nIf you found a bug or need support, head over to the **Contact** page in the footer. You can also email us directly at **streetzoka@gmail.com**. We usually reply within 24 hours!`
  },
  {
    keywords: ['mastergames', 'master games', 'game', 'play'],
    response: `# Master Games\nMaster Games is our premium arcade section where you can play football-themed mini-games to test your reflexes and earn bonus bragging rights! Check the main menu to start playing.`
  }
];

function interceptLocalQuery(query) {
  const q = query.toLowerCase();
  for (const item of APP_KNOWLEDGE_BASE) {
    if (item.keywords.some(kw => q.includes(kw))) {
      return item.response;
    }
  }
  return null;
}

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
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const handleSendRef = useRef(null); // Prevent stale closures in external triggers

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

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
      
      const aiMsg = { role: 'assistant', content: data.reply, id: Date.now() + 1 };
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
        const aiMsg = { role: 'assistant', content: localReply, id: Date.now() + 1 };
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
  }, [input, loading, currentUser, activeChatId, chats]);

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
                  <span className="kim-status">Football Intelligence</span>
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
            
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`kim-msg-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
                {msg.role !== 'user' && (
                  <div className="kim-msg-avatar">
                    <Sparkles size={14} color="#fff" />
                  </div>
                )}
                <div className={`kim-bubble ${msg.role === 'user' ? 'user' : 'ai'} ${msg.isError ? 'error' : ''}`}>
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
            ))}
            
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