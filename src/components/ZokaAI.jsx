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
      setTimeout(() => inputRef.current?.focus(), 100);
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

    // Optimistic UI update
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
    <div className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, padding: '0', backdropFilter: 'blur(10px)' }} onClick={onClose}>
      
      {/* Main Chat Container */}
      <div 
        onClick={e => e.stopPropagation()} 
        className="glass-card flex-col" 
        style={{ 
          width: '100%', 
          maxWidth: '900px', 
          height: '100vh', 
          maxHeight: '100vh', 
          overflow: 'hidden', 
          borderRadius: '0',
          borderLeft: showSidebar ? '1px solid var(--border)' : 'none',
          borderRight: 'none',
          borderTop: 'none',
          borderBottom: 'none',
          margin: 0,
          position: 'relative'
        }}
      >
        
        {/* Header */}
        <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <div className="flex-center gap-12">
            <button onClick={() => setShowSidebar(!showSidebar)} className="btn-icon btn-ghost" style={{ padding: '4px' }}>
              <Menu size={20} />
            </button>
            <div className="flex-center gap-8">
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={16} color="#fff" />
              </div>
              <div className="flex-col">
                <h2 className="text-primary font-extrabold" style={{ fontSize: '1.1rem', lineHeight: 1 }}>Kim</h2>
                <span className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 600 }}>Football Intelligence</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={20} /></button>
        </div>

        {/* Chat Body */}
        <div className="flex-col gap-16 p-16" style={{ overflowY: 'auto', flex: 1, background: 'var(--bg-deep)' }}>
          {messages.length === 0 && (
            <div className="flex-col items-center justify-center text-center" style={{ flex: 1, gap: '16px' }}>
              <Brain size={48} className="text-primary" style={{ opacity: 0.5 }} />
              <div>
                <h3 className="text-primary font-bold" style={{ fontSize: '1.2rem' }}>Chat with Kim</h3>
                <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>Ask me about today's matches, tactical breakdowns, or predictions.</p>
              </div>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-8 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role !== 'user' && (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Sparkles size={14} color="#fff" />
                </div>
              )}
              <div 
                style={{ 
                  maxWidth: '75%', 
                  background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-card)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap'
                }}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={14} color="#fff" />
                </div>
              )}
            </div>
          ))}
          
          {loading && (
            <div className="flex gap-8 justify-start">
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={14} color="#fff" />
              </div>
              <div className="flex-center gap-8" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: '16px 16px 16px 4px' }}>
                <Loader size={14} className="anim-spin text-primary" /> <span className="text-muted" style={{ fontSize: '0.85rem' }}>Analyzing...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-16" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
          <div className="flex gap-8 items-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px 4px 4px 16px' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Message Kim..."
              className="form-input"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', padding: '8px 0' }}
              disabled={loading}
            />
            <button onClick={handleSend} disabled={loading || !input.trim()} className="btn btn-primary" style={{ borderRadius: '8px', minWidth: '40px', height: '40px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      {showSidebar && (
        <>
          <div onClick={() => setShowSidebar(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10 }} />
          <div 
            className="glass-card flex-col" 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              height: '100%', 
              width: '300px', 
              zIndex: 20, 
              borderRadius: 0, 
              borderRight: '1px solid var(--border)',
              background: 'var(--bg-deep)'
            }}
          >
            <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="text-primary font-bold">Chat History</span>
              <button onClick={() => setShowSidebar(false)} className="btn-icon btn-ghost"><X size={18} /></button>
            </div>
            
            <div className="p-12">
              <button onClick={startNewChat} className="btn btn-primary w-full flex-center gap-8" style={{ justifyContent: 'center' }}>
                <Plus size={16} /> New Chat
              </button>
            </div>

            <div className="flex-col gap-4 p-8" style={{ overflowY: 'auto', flex: 1 }}>
              {chats.length === 0 && (
                <div className="text-center p-16">
                  <p className="text-muted text-sm">No recent chats.</p>
                </div>
              )}
              {chats.map(chat => (
                <div 
                  key={chat.id} 
                  onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); }}
                  className={`flex-between p-12 cursor-pointer ${activeChatId === chat.id ? 'bg-elevated' : ''}`}
                  style={{ 
                    borderRadius: '8px', 
                    background: activeChatId === chat.id ? 'rgba(var(--primary-rgb), 0.1)' : 'transparent', 
                    border: `1px solid ${activeChatId === chat.id ? 'var(--primary)' : 'transparent'}`,
                    transition: 'all 0.2s'
                  }}
                >
                  <div className="flex-center gap-8" style={{ overflow: 'hidden' }}>
                    <MessageSquare size={14} className="text-muted" style={{ flexShrink: 0 }} />
                    <span className="text-secondary text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chat.title}</span>
                  </div>
                  <button onClick={(e) => deleteChat(chat.id, e)} className="btn-icon btn-ghost" style={{ padding: '4px', opacity: 0.5 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}