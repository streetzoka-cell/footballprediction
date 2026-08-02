import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles 
} from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures';
import { todayStr } from '../utils/dates';

const BACKEND_URL = 'https://api.zokascore.xyz'; 

export default function ZokaAI({ isOpen, onClose }) {
  const [chats, setChats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kim_chats')) || []; } 
    catch { return []; }
  });
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setShowSidebar(false);
    }
  }, [isOpen]);

  const startNewChat = () => {
    setActiveChatId(null);
    setInput("");
    setShowSidebar(false);
    inputRef.current?.focus();
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input };
    const currentInput = input;
    setInput("");
    setLoading(true);

    const newChatId = activeChatId || Date.now().toString();
    const chatTitle = currentInput.substring(0, 30) + (currentInput.length > 30 ? '...' : '');

    setChats(prev => {
      const existing = prev.find(c => c.id === newChatId);
      if (existing) {
        return prev.map(c => c.id === newChatId ? { ...c, messages: [...c.messages, userMsg] } : c);
      } else {
        return [{ id: newChatId, title: chatTitle, messages: [userMsg] }, ...prev];
      }
    });
    setActiveChatId(newChatId);

    try {
      const history = (activeChat?.messages || []).map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch(`${BACKEND_URL}/api/v1/ai/zoka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, history, appContext })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get response');
      
      const aiMsg = { role: 'assistant', content: data.reply };
      
      setChats(prev => {
        return prev.map(c => {
          if (c.id === newChatId) {
            return { ...c, messages: [...c.messages, aiMsg] };
          }
          return c;
        });
      });

    } catch (error) {
      const errorMsg = { role: 'assistant', content: "I'm having trouble connecting to the mainframe right now. Try again in a moment." };
      setChats(prev => prev.map(c => c.id === newChatId ? { ...c, messages: [...c.messages, errorMsg] } : c));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Transparent backdrop to catch outside clicks without darkening screen */}
      <div className="kim-backdrop" onClick={onClose} />
      
      {/* Main Chat Window */}
      <div className="kim-window">
        
        {/* Sidebar Overlay */}
        {showSidebar && (
          <div className="kim-sidebar-overlay" onClick={() => setShowSidebar(false)} />
        )}
        
        {/* Sidebar */}
        <div className={`kim-sidebar ${showSidebar ? 'open' : ''}`}>
          <div className="kim-sidebar-header">
            <span className="kim-sidebar-title">Chat History</span>
            <button onClick={() => setShowSidebar(false)} className="btn-icon btn-ghost"><X size={18} /></button>
          </div>
          
          <div className="kim-sidebar-actions">
            <button onClick={startNewChat} className="btn btn-primary w-full flex-center gap-8" style={{ justifyContent: 'center' }}>
              <Plus size={16} /> New Chat
            </button>
          </div>

          <div className="kim-sidebar-list">
            {chats.length === 0 && (
              <div className="kim-sidebar-empty">No recent chats.</div>
            )}
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); }}
                className={`kim-chat-item ${activeChatId === chat.id ? 'active' : ''}`}
              >
                <div className="kim-chat-item-info">
                  <MessageSquare size={14} />
                  <span>{chat.title}</span>
                </div>
                <button onClick={(e) => deleteChat(chat.id, e)} className="kim-chat-delete">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Main Area */}
        <div className="kim-main">
          {/* Header */}
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

          {/* Chat Body */}
          <div className="kim-body">
            {messages.length === 0 && (
              <div className="kim-empty-state">
                <Brain size={48} className="text-primary" style={{ opacity: 0.5 }} />
                <h3>Chat with Kim</h3>
                <p>Ask me about today's matches, tactical breakdowns, or predictions.</p>
              </div>
            )}
            
            {messages.map((msg, i) => (
              <div key={i} className={`kim-msg-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
                {msg.role !== 'user' && (
                  <div className="kim-msg-avatar">
                    <Sparkles size={14} color="#fff" />
                  </div>
                )}
                <div className={`kim-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="kim-msg-avatar user">
                    <User size={14} color="#fff" />
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div className="kim-msg-row ai">
                <div className="kim-msg-avatar">
                  <Sparkles size={14} color="#fff" />
                </div>
                <div className="kim-bubble ai loading">
                  <Loader size={14} className="anim-spin" /> <span>Analyzing...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="kim-input-area">
            <div className="kim-input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Message Kim..."
                className="kim-input"
                disabled={loading}
              />
              <button onClick={handleSend} disabled={loading || !input.trim()} className="kim-send-btn">
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}