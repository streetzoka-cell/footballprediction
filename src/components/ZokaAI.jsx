import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Brain, Send, Loader, X, Plus, MessageSquare, Trash2, 
  Menu, User, Sparkles, AlertCircle, RefreshCw 
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
  const [error, setError] = useState(null);
  
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
      setError(null);
    }
  }, [isOpen]);

  const startNewChat = () => {
    setActiveChatId(null);
    setInput("");
    setError(null);
    setShowSidebar(false);
    inputRef.current?.focus();
  };

  const deleteChat = (id, e) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) {
      setActiveChatId(null);
      setError(null);
    }
  };

  const handleRetry = async () => {
    if (!messages.length) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;
    
    // Remove the error message if it exists
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return { ...c, messages: c.messages.filter(m => !m.isError) };
      }
      return c;
    }));
    
    await sendMessageToBackend(lastUserMsg.content, true);
  };

  const sendMessageToBackend = async (currentInput, isRetry = false) => {
    setLoading(true);
    setError(null);

    try {
      const history = (activeChat?.messages || []).filter(m => !m.isError).map(m => ({ role: m.role, content: m.content }));
      
      const response = await fetch(`${BACKEND_URL}/api/v1/ai/zoka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, history, appContext })
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Failed to get response');
      
      const aiMsg = { role: 'assistant', content: data.reply };
      
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...c.messages.filter(m => !m.isError), aiMsg] };
        }
        return c;
      }));

    } catch (error) {
      console.error('AI Request Failed:', error);
      const errorMsg = { 
        role: 'assistant', 
        content: error.message, 
        isError: true 
      };
      setChats(prev => prev.map(c => {
        if (c.id === activeChatId) {
          return { ...c, messages: [...c.messages, errorMsg] };
        }
        return c;
      }));
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const currentInput = input.trim();
    const userMsg = { role: 'user', content: currentInput };
    setInput("");
    setError(null);

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

    await sendMessageToBackend(currentInput);
  };

  // Simple markdown-like formatter for AI responses
  const formatMessage = (text) => {
    return text.split('\n').map((line, i) => {
      if (line.startsWith('###') || line.startsWith('##') || line.startsWith('#')) {
        return <h4 key={i} className="font-bold text-primary mt-3 mb-1">{line.replace(/^#+\s*/, '')}</h4>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={i} className="ml-4 list-disc text-sm opacity-90">{line.substring(2)}</li>;
      }
      if (line.trim() === '') return <br key={i} />;
      return <p key={i} className="text-sm leading-relaxed">{line}</p>;
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="kim-backdrop" onClick={onClose} />
      
      <div className="kim-window">
        {showSidebar && <div className="kim-sidebar-overlay" onClick={() => setShowSidebar(false)} />}
        
        {/* Sidebar */}
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
            {chats.length === 0 && (
              <div className="kim-sidebar-empty">No recent chats.</div>
            )}
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); setError(null); }}
                className={`kim-chat-item ${activeChatId === chat.id ? 'active' : ''}`}
              >
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

        {/* Main Chat Area */}
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
                <div className={`kim-bubble ${msg.role === 'user' ? 'user' : 'ai'} ${msg.isError ? 'error' : ''}`}>
                  {msg.isError ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{msg.content}</span>
                      <button onClick={handleRetry} className="ml-2 text-xs underline flex items-center gap-1">
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  ) : (
                    formatMessage(msg.content)
                  )}
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
                  <Loader size={14} className="anim-spin" /> <span>Analyzing tactics...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="kim-input-area">
            <div className="kim-input-wrap">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Message Kim..."
                className="kim-input"
                disabled={loading}
              />
              <button 
                onClick={handleSend} 
                disabled={loading || !input.trim()} 
                className={`kim-send-btn ${!input.trim() || loading ? 'disabled' : ''}`}
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}