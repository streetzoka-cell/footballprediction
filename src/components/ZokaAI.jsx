import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles, AlertCircle, RefreshCw, Lock, WifiOff, Activity, Target, Zap, ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

// ═══════════════════════════════════════════════════════════
// LOCAL INTENT ENGINE
// ═══════════════════════════════════════════════════════════
const APP_KNOWLEDGE_BASE = [
  {
    keywords: ['how to predict', 'make a prediction', 'how do i get points', 'what are points', 'scoring system', 'prediction lock', 'how to play'],
    response: `# How Predictions Work\nMaking a prediction is easy! Go to the **Predictions** tab and enter your expected score before the match locks.\n\n- **Exact Score:** 10 Points 🎯\n- **Correct Result (Win/Draw/Loss):** 3 Points 📈\n- **Miss:** 0 Points\n\n*Note: Matches lock 60 minutes before kickoff to ensure fair play!*`
  },
  {
    keywords: ['zokascore studio', 'how to use the studio', 'reactor studio', 'face ar', 'graphic editor', 'reaction cam'],
    response: `# ZOKASCORE Studio\nThe Studio is our built-in pro creator toolkit! Access it from the main menu.\n\n- **Graphic Editor:** Build custom scoreboards and news cards.\n- **Reactor Studio:** Create viral TikTok/Reels templates with effects.\n- **Face AR:** Apply football masks and filters to your camera.\n- **Reaction Cam:** Record your match reactions in 9:16 format.`
  },
  {
    keywords: ['leaderboard', 'how do i rank', 'goat rank', 'weekly leaderboard', 'daily leaderboard', 'monthly leaderboard', 'hall of fame'],
    response: `# Leaderboards & Ranks\nCompete against fans worldwide!\n\n- **Daily:** Resets every 24 hours.\n- **Weekly & Monthly:** Cumulative points for the week/month.\n- **G.O.A.T:** The all-time hall of fame.\n\nCheck your rank by tapping the **Trophy** icon in the navbar!`
  },
  {
    keywords: ['zoka picks', 'admin picks', 'what are zoka picks', 'expert picks'],
    response: `# Zoka Picks\nThese are the premium, expert predictions made by the ZOKASCORE team. You can find them on the Predictions page. You can also vote "Agree" or "Disagree" on them to see how the community feels and join the debate!`
  },
  {
    keywords: ['install zokascore', 'download the app', 'install app', 'pwa', 'add to home screen', 'offline mode'],
    response: `# Install the App\nZOKASCORE is a Progressive Web App (PWA)! You can install it directly to your home screen for an offline-capable, native app experience.\n\nScroll to the bottom of the page and tap **"Install App"**, or use your browser's "Add to Home Screen" option.`
  },
  {
    keywords: ['who made zokascore', 'who built zokascore', 'zokascore developer', 'zokascore creator', 'about the creator', 'who made this'],
    response: `# About the Creator\nZOKASCORE is 100% independently designed, developed, and maintained by a single passionate developer. No big corporate teams, just pure love for football and clean code! ⚽`
  },
  {
    keywords: ['contact support', 'report a bug', 'zokascore email', 'help center', 'how to contact'],
    response: `# Need Help?\nIf you found a bug or need support, head over to the **Contact** page in the footer. You can also email us directly at **streetzoka@gmail.com**. We usually reply within 24 hours!`
  },
];

const FOOTBALL_TRIGGERS = [
  'world cup', 'offside rule', 'foul play', 'penalty kick', 'tactical analysis', 
  'football formation', 'gegenpress', 'low block', 'match result', 'who won', 
  'who hosted', '2014 world cup', '2018 world cup', '2022 world cup', 'champion of',
  'final match', 'build-up play', 'false 9', 'var check'
];

function interceptLocalQuery(query) {
  const q = query.toLowerCase();
  if (FOOTBALL_TRIGGERS.some(kw => q.includes(kw))) return null; 
  for (const item of APP_KNOWLEDGE_BASE) {
    if (item.keywords.some(kw => q.includes(kw))) return item.response;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════
const generateChatTitle = (text) => {
  return text.replace(/[?.!]/g, '').trim().split(/\s+/).slice(0, 5).join(' ') || 'New Chat';
};

const inferLoadingState = (query) => {
  const q = query.toLowerCase();
  if (/(predict|vs|versus|analyze|analysis)/i.test(q)) return "Analyzing the matchup...";
  if (/(today|fixture|live|score|playing)/i.test(q)) return "Fetching live match data...";
  if (/(win|lost|history|who|when|what is|rule|law)/i.test(q)) return "Checking football knowledge...";
  return "Thinking...";
};

const getEngineBadge = (model) => {
  if (!model) return null;
  if (model.includes('local-engine') || model.includes('local-app')) return { icon: Brain, text: 'Verified Knowledge', cls: 'badge-local' };
  if (model.includes('match-engine')) return { icon: Activity, text: 'Live Match Data', cls: 'badge-match' };
  if (model.includes('prediction-engine')) return { icon: Target, text: 'Match Prediction', cls: 'badge-prediction' };
  if (model.includes('gemini')) return { icon: Sparkles, text: 'AI Analysis', cls: 'badge-ai' };
  if (model.includes('cached')) return { icon: Zap, text: 'Cached Response', cls: 'badge-cached' };
  return null;
};

const groupChatsByDate = (chats) => {
  const now = new Date();
  const today = []; const yesterday = []; const earlier = [];

  chats.forEach(chat => {
    if (!chat.createdAt) {
      earlier.push(chat);
      return;
    }
    const diffDays = Math.floor((now - new Date(chat.createdAt)) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) today.push(chat);
    else if (diffDays === 1) yesterday.push(chat);
    else earlier.push(chat);
  });

  return { today, yesterday, earlier };
};

// ═══════════════════════════════════════════════════════════
// TYPEWRITER COMPONENT (Adaptive Speed & Smooth Scroll)
// ═══════════════════════════════════════════════════════════
const TypewriterText = ({ text, isActive, onComplete }) => {
  const [displayed, setDisplayed] = useState('');
  const containerRef = useRef(null);

  const getTypingSpeed = (length) => {
    if (length < 150) return 15;
    if (length < 400) return 8;
    return 4;
  };

  useEffect(() => {
    if (!isActive) {
      setDisplayed(text);
      if (onComplete) onComplete();
      return;
    }
    setDisplayed('');
    let i = 0;
    const speed = getTypingSpeed(text.length);
    
    const timer = setInterval(() => {
      setDisplayed(text.substring(0, i));
      i++;
      if (i > text.length) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, isActive, onComplete]);

  useEffect(() => {
    if (isActive && containerRef.current) {
      containerRef.current.scrollIntoView({ behavior: "auto", block: "end" });
    }
  }, [displayed, isActive]);

  const cleanFormat = (str) => {
    let clean = str.replace(/\*\*(ZOKASCORE|Zokascore|zokascore)\*\*/gi, 'ZOKASCORE');
    return clean.split('\n').map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed === '') return <br key={idx} />;
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (
          <div key={idx} className="kim-bullet-item">
            <span className="kim-bullet-dot">●</span>
            <span className="kim-bullet-text">{trimmed.substring(2)}</span>
          </div>
        );
      }
      if (trimmed.match(/^#{1,3}\s+(.*)/)) {
        return (
          <h4 key={idx} className="kim-text-heading">
            {trimmed.replace(/^#{1,3}\s+/, '')}
          </h4>
        );
      }
      return <p key={idx} className="kim-text-para">{trimmed}</p>;
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
  const [loadingText, setLoadingText] = useState("Thinking...");
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState(null);
  const [typingMessageId, setTypingMessageId] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [matchContext, setMatchContext] = useState(null);
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const handleSendRef = useRef(null); 

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];
  const groupedChats = groupChatsByDate(chats);

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
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, loading, typingMessageId]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setShowSidebar(false);
      setError(null);
      setTypingMessageId(null);
      setMatchContext(null);
    }
  }, [isOpen]);

  const startNewChat = () => {
    setActiveChatId(null);
    setInput("");
    setError(null);
    setTypingMessageId(null);
    setMatchContext(null);
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
      
      const aiMsg = { 
        role: 'assistant', 
        content: data.reply, 
        model: data.model, 
        type: data.type || 'knowledge', 
        data: data.data || null,
        id: Date.now() + 1 
      };
      
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
    setMatchContext(null);
    
    setLoadingText(inferLoadingState(currentInput));
    
    const newChatId = activeChatId || Date.now().toString();
    const chatTitle = generateChatTitle(currentInput);
    const userMsg = { role: 'user', content: currentInput, id: Date.now() };

    setChats(prev => {
      const existing = prev.find(c => c.id === newChatId);
      if (existing) {
        return prev.map(c => c.id === newChatId ? { ...c, messages: [...c.messages, userMsg] } : c);
      } else {
        return [{ id: newChatId, title: chatTitle, createdAt: Date.now(), messages: [userMsg] }, ...prev];
      }
    });
    setActiveChatId(newChatId);
    setLoading(true);

    const localReply = interceptLocalQuery(currentInput);
    
    if (localReply) {
      const aiMsg = { role: 'assistant', content: localReply, model: 'local-app', type: 'knowledge', id: Date.now() + 1 };
      setTypingMessageId(aiMsg.id);
      setChats(prev => prev.map(c => {
        if (c.id === newChatId) {
          const cleanMessages = c.messages.filter(m => !m.isError && m.id !== userMsg.id);
          return { ...c, messages: [...cleanMessages, userMsg, aiMsg] };
        }
        return c;
      }));
      setLoading(false);
      return; 
    }

    await sendMessageToBackend(currentInput, newChatId);
  }, [input, loading, currentUser, activeChatId, chats, isOnline]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  useEffect(() => {
    const handleExternalOpen = (e) => {
      const promptMessage = e.detail?.message;
      const context = e.detail?.matchContext;
      
      if (context) setMatchContext(context);
      
      if (promptMessage && isOpen) {
        setTimeout(() => handleSendRef.current(promptMessage), 400);
      }
    };
    window.addEventListener('openZokaAI', handleExternalOpen);
    return () => window.removeEventListener('openZokaAI', handleExternalOpen);
  }, [isOpen]);

  if (!isOpen) return null;

  const renderChatGroup = (title, chatsInGroup) => {
    if (chatsInGroup.length === 0) return null;
    return (
      <div className="kim-sidebar-group">
        <div className="kim-sidebar-group-title">{title}</div>
        {chatsInGroup.map(chat => (
          <div key={chat.id} onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); setError(null); setTypingMessageId(null); }} className={`kim-chat-item ${activeChatId === chat.id ? 'active' : ''}`}>
            <div className="kim-chat-item-info">
              <MessageSquare size={14} />
              <span className="kim-chat-title-text">{chat.title}</span>
            </div>
            <button onClick={(e) => deleteChat(chat.id, e)} className="kim-chat-delete" title="Delete chat">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderMessageContent = (msg) => {
    if (msg.data?.type === 'match' || msg.data?.type === 'prediction') {
      return (
        <div>
          <TypewriterText text={msg.content} isActive={msg.id === typingMessageId} onComplete={() => setTypingMessageId(null)} />
          <div className="kim-action-row">
            <button className="kim-action-link">
              View Match <ChevronRight size={12} />
            </button>
          </div>
        </div>
      );
    }
    return <TypewriterText text={msg.content} isActive={msg.id === typingMessageId} onComplete={() => setTypingMessageId(null)} />;
  };

  return (
    <>
      <div className="kim-backdrop" onClick={onClose} />
      <div className="kim-window">
        {showSidebar && <div className="kim-sidebar-overlay" onClick={() => setShowSidebar(false)} />}
        
        <div className={`kim-sidebar ${showSidebar ? 'open' : ''}`}>
          <div className="kim-sidebar-header">
            <span className="kim-sidebar-title">KIM</span>
            <button onClick={() => setShowSidebar(false)} className="btn-icon btn-ghost"><X size={18} /></button>
          </div>
          <div className="kim-sidebar-actions">
            <button onClick={startNewChat} className="btn btn-primary">
              <Plus size={16} /> New chat
            </button>
          </div>
          <div className="kim-sidebar-list">
            {chats.length === 0 && <div className="kim-sidebar-empty">No recent chats.</div>}
            {renderChatGroup("TODAY", groupedChats.today)}
            {renderChatGroup("YESTERDAY", groupedChats.yesterday)}
            {renderChatGroup("EARLIER", groupedChats.earlier)}
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
                  <span className="kim-status">
                    {!isOnline ? <><WifiOff size={10} /> Offline</> : "ZOKASCORE Intelligence"}
                  </span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="btn-icon btn-ghost"><X size={20} /></button>
          </div>

          <div className="kim-body">
            {messages.length === 0 && (
              <div className="kim-empty-state">
                <div className="kim-empty-icon">
                  <Sparkles size={28} color="#fff" />
                </div>
                <h3>Ask Kim</h3>
                <p>{matchContext ? `${matchContext.home} vs ${matchContext.away}` : "Football intelligence built into ZOKASCORE"}</p>
                
                <div className="kim-starters-grid">
                  {matchContext ? (
                    <>
                      <button onClick={() => handleSend(`Analyze ${matchContext.home} vs ${matchContext.away}`)} className="kim-starter-btn">
                        <span className="kim-starter-icon">🔮</span> Analyze this match
                      </button>
                      <button onClick={() => handleSend(`Predict ${matchContext.home} vs ${matchContext.away}`)} className="kim-starter-btn">
                        <span className="kim-starter-icon">📊</span> Give me a prediction
                      </button>
                      <button onClick={() => handleSend(`Who is likely to score in ${matchContext.home} vs ${matchContext.away}?`)} className="kim-starter-btn">
                        <span className="kim-starter-icon">⚽</span> Who will score?
                      </button>
                      <button onClick={() => handleSend(`Compare recent form for ${matchContext.home} and ${matchContext.away}`)} className="kim-starter-btn">
                        <span className="kim-starter-icon">📈</span> Compare form
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleSend("What matches are playing today?")} className="kim-starter-btn">
                        <span className="kim-starter-icon">⚽</span> Today's matches
                      </button>
                      <button onClick={() => handleSend("What are my prediction stats?")} className="kim-starter-btn">
                        <span className="kim-starter-icon">📊</span> My prediction stats
                      </button>
                      <button onClick={() => handleSend("Explain the offside rule")} className="kim-starter-btn">
                        <span className="kim-starter-icon">🧠</span> Ask about football
                      </button>
                      <button onClick={() => handleSend("Analyze Arsenal vs Chelsea")} className="kim-starter-btn">
                        <span className="kim-starter-icon">🔮</span> Analyze a match
                      </button>
                    </>
                  )}
                </div>
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
                    {badge && !msg.isError && (
                      <div className={`kim-engine-badge ${badge.cls}`}>
                        <BadgeIcon size={9} /> {badge.text}
                      </div>
                    )}
                    
                    {msg.isError ? (
                      <div className="kim-error-content">
                        <AlertCircle size={14} />
                        <span>{msg.content}</span>
                        <button onClick={handleRetry} className="kim-retry-btn">
                          <RefreshCw size={12} /> Retry
                        </button>
                      </div>
                    ) : msg.role === 'assistant' ? (
                      renderMessageContent(msg)
                    ) : (
                      <div className="kim-user-text">{msg.content}</div>
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
                  <Loader size={14} className="anim-spin" /> <span>{loadingText}</span>
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
                placeholder={loading ? "Kim is thinking..." : !isOnline ? "You're offline" : "Ask Kim anything about football..."}
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