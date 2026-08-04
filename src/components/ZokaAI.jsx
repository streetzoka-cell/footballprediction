import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles, AlertCircle, RefreshCw, Lock
} from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr } from '../utils/dates';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

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

  const { data: rawFixtures = [] } = useFixtures(todayStr());

  const appContext = useMemo(() => {
    const live = rawFixtures.filter(m => m.isLive).slice(0, 5)
      .map(m => `${m.homeName} vs ${m.awayName} (${m.displayMinute || 0}', Score: ${m.homeScore}-${m.awayScore})`);
    const top = rawFixtures.filter(m => m.category === 'FEATURED' || m.category === 'IMPORTANT').slice(0, 5)
      .map(m => `${m.homeName} vs ${m.awayName} (Kickoff: ${m.kickoff || 'TBD'})`);
    return { currentDate: todayStr(), liveMatches: live, topMatches: top };
  }, [rawFixtures]);

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
    setLoading(true);
    setError(null);

    try {
      const currentMessages = chats.find(c => c.id === chatId)?.messages || [];
      const history = currentMessages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));
      
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${BACKEND_URL}/api/v1/ai/zoka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ message: currentInput, history, appContext })
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

    } catch (error) {
      console.error('AI Request Failed:', error);
      const errorMsg = { role: 'assistant', content: error.message, isError: true, id: Date.now() + 1 };
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, errorMsg] } : c));
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    
    if (!currentUser) {
      setError("Please log in to chat with Kim.");
      return;
    }

    const currentInput = input.trim();
    setInput("");
    setError(null);
    setTypingMessageId(null);
    
    const newChatId = activeChatId || Date.now().toString();
    const chatTitle = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');
    const userMsg = { role: 'user', content: currentInput, id: Date.now() };

    const currentMessages = activeChat?.messages || [];
    const history = currentMessages.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));

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

    await sendMessageToBackend(currentInput, newChatId);
  };

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
                <p>Ask me about today's matches, tactical breakdowns, or your prediction stats.</p>
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
                <Lock size={12} /> Authentication required to chat.
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
              <button onClick={handleSend} disabled={loading || !input.trim() || !currentUser} className={`kim-send-btn ${!input.trim() || loading || !currentUser ? 'disabled' : ''}`}>
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}