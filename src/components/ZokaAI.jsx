import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Brain, Send, Loader, X, Plus, MessageSquare, Trash2, Menu, User, Sparkles, AlertCircle, RefreshCw, WifiOff, Activity, Target, Zap, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../services/backendAuth';

const BACKEND_URL = 'https://api.zokascore.xyz';
const STORAGE_KEY = 'kim_chats';
const STORAGE_VERSION = 2;
const MAX_HISTORY_MESSAGES = 30;

const APP_KNOWLEDGE_BASE = [
  { keywords: ['how to predict','make a prediction','how do i get points','what are points','scoring system','prediction lock','how to play'], response: `# How Predictions Work\n\nMaking a prediction is easy. Go to the **Predictions** tab and enter your expected score before the match locks.\n\n- **Exact Score:** 10 Points 🎯\n- **Correct Result:** 3 Points 📈\n- **Miss:** 0 Points\n\nMatches lock before kickoff to keep predictions fair.` },
  { keywords: ['zokascore studio','how to use the studio','reactor studio','face ar','graphic editor','reaction cam'], response: `# ZOKASCORE Studio\n\nThe Studio is ZOKASCORE's creator toolkit.\n\n- **Graphic Editor:** Create football graphics and scoreboards.\n- **Reactor Studio:** Create short-form football content.\n- **Face AR:** Football masks and camera effects.\n- **Reaction Cam:** Record match reactions in vertical format.` },
  { keywords: ['leaderboard','how do i rank','goat rank','weekly leaderboard','daily leaderboard','monthly leaderboard','hall of fame'], response: `# Leaderboards & Ranks\n\nCompete with other football fans.\n\n- **Daily:** Daily ranking.\n- **Weekly:** Weekly competition.\n- **Monthly:** Monthly competition.\n- **G.O.A.T:** Long-term leaderboard.\n\nCheck the leaderboard from the ZOKASCORE navigation.` },
  { keywords: ['zoka picks','admin picks','what are zoka picks','expert picks'], response: `# Zoka Picks\n\nZoka Picks are curated predictions published by the ZOKASCORE team.\n\nYou can also use the community voting features to see how other users feel about a prediction.` },
  { keywords: ['install zokascore','download the app','install app','pwa','add to home screen','offline mode'], response: `# Install ZOKASCORE\n\nZOKASCORE is a Progressive Web App.\n\nYou can install it directly from a supported browser using **Add to Home Screen** or the browser's install option.\n\nOnce installed, it behaves much more like a native application.` },
  { keywords: ['who made zokascore','who built zokascore','zokascore developer','zokascore creator','about the creator','who made this'], response: `# About ZOKASCORE\n\nZOKASCORE is an independently developed football platform focused on live football data, fixtures, results, statistics, predictions and football intelligence. ⚽` },
  { keywords: ['contact support','report a bug','zokascore email','help center','how to contact'], response: `# Need Help?\n\nFor support or bug reports, use the Contact section of ZOKASCORE.\n\nYou can also reach the team at **streetzoka@gmail.com**.` }
];

const FOOTBALL_TRIGGERS = ['world cup','offside','foul','penalty','tactical','formation','gegenpress','low block','match','who won','who hosted','champion','final','build-up','false 9','var','fixture','score','prediction','predict','form','h2h','head to head','compare','standings','table','league','team','player','goal','goals','today','tomorrow','yesterday','live'];

function interceptLocalQuery(query) {
  const q = String(query || '').toLowerCase();
  if (FOOTBALL_TRIGGERS.some(keyword => q.includes(keyword))) return null;
  for (const item of APP_KNOWLEDGE_BASE) {
    if (item.keywords.some(keyword => q.includes(keyword))) return item.response;
  }
  return null;
}

const generateChatTitle = text => {
  const title = String(text || '').replace(/[?.!]/g, '').trim().split(/\s+/).slice(0, 6).join(' ');
  return title || 'New Chat';
};

const inferLoadingState = query => {
  const q = String(query || '').toLowerCase();
  if (/(predict|prediction|vs|versus|analyze|analysis|compare|h2h|form)/.test(q)) return 'Analyzing the matchup...';
  if (/(today|tomorrow|fixture|live|score|playing|standings|table)/.test(q)) return 'Fetching football data...';
  if (/(win|lost|history|who|when|what is|rule|law|offside)/.test(q)) return 'Checking football knowledge...';
  return 'Thinking...';
};

const getEngineBadge = model => {
  if (!model) return null;
  const normalized = String(model).toLowerCase();
  if (normalized.includes('local-engine') || normalized.includes('local-app') || normalized.includes('strict-block')) return { icon: Brain, text: 'Verified Knowledge', cls: 'badge-local' };
  if (normalized.includes('match-engine')) return { icon: Activity, text: 'Live Match Data', cls: 'badge-match' };
  if (normalized.includes('prediction-engine')) return { icon: Target, text: 'Match Prediction', cls: 'badge-prediction' };
  if (normalized.includes('gemini')) return { icon: Sparkles, text: 'AI Analysis', cls: 'badge-ai' };
  if (normalized.includes('cached')) return { icon: Zap, text: 'Cached Response', cls: 'badge-cached' };
  if (normalized.includes('reasoning')) return { icon: Brain, text: 'KIM Reasoning', cls: 'badge-ai' };
  return null;
};

const groupChatsByDate = chats => {
  const now = new Date();
  const today = []; const yesterday = []; const earlier = [];
  chats.forEach(chat => {
    if (!chat.createdAt) { earlier.push(chat); return; }
    const date = new Date(chat.createdAt);
    if (Number.isNaN(date.getTime())) { earlier.push(chat); return; }
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) today.push(chat); else if (diffDays === 1) yesterday.push(chat); else earlier.push(chat);
  });
  return { today, yesterday, earlier };
};

const loadStoredChats = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(chat => chat && chat.id && Array.isArray(chat.messages));
  } catch (error) { console.warn('KIM chat storage could not be loaded:', error); return []; }
};

const TypewriterText = ({ text, isActive, onComplete }) => {
  const [displayed, setDisplayed] = useState('');
  const containerRef = useRef(null);
  const safeText = String(text || '');
  const getTypingSpeed = length => { if (length < 150) return 15; if (length < 400) return 8; return 4; };
  useEffect(() => {
    if (!isActive) { setDisplayed(safeText); if (onComplete) onComplete(); return undefined; }
    setDisplayed(''); let index = 0; const speed = getTypingSpeed(safeText.length);
    const timer = setInterval(() => {
      setDisplayed(safeText.substring(0, index)); index += 1;
      if (index > safeText.length) { clearInterval(timer); if (onComplete) onComplete(); }
    }, speed);
    return () => clearInterval(timer);
  }, [safeText, isActive, onComplete]);
  useEffect(() => { if (isActive && containerRef.current) { containerRef.current.scrollIntoView({ behavior: 'auto', block: 'end' }); } }, [displayed, isActive]);
  const cleanFormat = str => {
    const normalized = String(str || '').replace(/\*\*(ZOKASCORE|Zokascore|zokascore)\*\*/gi, 'ZOKASCORE');
    return normalized.split('\n').map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return (<br key={index} />);
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return (<div key={index} className="kim-bullet-item"><span className="kim-bullet-dot">●</span><span className="kim-bullet-text">{trimmed.substring(2)}</span></div>);
      }
      if (/^#{1,3}\s+/.test(trimmed)) return (<h4 key={index} className="kim-text-heading">{trimmed.replace(/^#{1,3}\s+/, '')}</h4>);
      return (<p key={index} className="kim-text-para">{trimmed}</p>);
    });
  };
  return (<div ref={containerRef}>{cleanFormat(displayed)}{isActive && (<span className="typewriter-cursor" />)}</div>);
};

export default function ZokaAI({ isOpen, onClose }) {
  const { currentUser } = useAuth();
  const [chats, setChats] = useState(loadStoredChats);
  const [activeChatId, setActiveChatId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Thinking...');
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState(null);
  const [typingMessageId, setTypingMessageId] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [matchContext, setMatchContext] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const handleSendRef = useRef(null);
  const abortControllerRef = useRef(null);

  const activeChat = useMemo(() => chats.find(chat => chat.id === activeChatId), [chats, activeChatId]);
  const messages = activeChat?.messages || [];
  const groupedChats = useMemo(() => groupChatsByDate(chats), [chats]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
      localStorage.setItem(`${STORAGE_KEY}_version`, String(STORAGE_VERSION));
    } catch (storageError) { console.warn('Unable to persist KIM chats:', storageError); }
  }, [chats]);

  useEffect(() => {
    if (!typingMessageId) { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
  }, [messages, loading, typingMessageId]);

  useEffect(() => {
    if (isOpen) { setTimeout(() => { inputRef.current?.focus(); }, 300); }
    else {
      setShowSidebar(false); setError(null); setTypingMessageId(null); setMatchContext(null);
      if (abortControllerRef.current) { abortControllerRef.current.abort(); abortControllerRef.current = null; }
    }
  }, [isOpen]);

  const startNewChat = useCallback(() => {
    setActiveChatId(null); setInput(''); setError(null); setTypingMessageId(null); setMatchContext(null); setShowSidebar(false);
    setTimeout(() => { inputRef.current?.focus(); }, 50);
  }, []);

  const deleteChat = useCallback((id, event) => {
    event.stopPropagation();
    setChats(previous => previous.filter(chat => chat.id !== id));
    if (activeChatId === id) { setActiveChatId(null); setError(null); setTypingMessageId(null); }
  }, [activeChatId]);

  const sendMessageToBackend = useCallback(async (currentInput, chatId, historyOverride) => {
    try {
      if (!isOnline) throw new Error('You are offline. Please check your connection.');
      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const history = Array.isArray(historyOverride) ? historyOverride : [];
      const authHeaders = currentUser ? await getAuthHeaders() : {};
      const response = await fetch(`${BACKEND_URL}/api/v1/ai/zoka`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ message: currentInput, history: history.slice(-MAX_HISTORY_MESSAGES).map(message => ({ role: message.role, content: message.content })) }),
        signal: controller.signal
      });
      const contentType = response.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) { data = await response.json(); }
      else { const text = await response.text(); data = { success: false, error: text || 'The AI server returned an invalid response.' }; }
      if (!response.ok || !data?.success) throw new Error(data?.error || 'Failed to get a response from KIM.');
      const aiMsg = { role: 'assistant', content: data.reply || 'I received the request but could not generate a response.', model: data.model || 'kim-reasoning-engine', type: data.type || 'knowledge', data: data.data || null, id: `${Date.now()}-ai` };
      setTypingMessageId(aiMsg.id);
      setChats(previous => previous.map(chat => {
        if (chat.id !== chatId) return chat;
        const cleanMessages = chat.messages.filter(message => !message.isError);
        const alreadyHasUserMessage = cleanMessages.some(message => message.role === 'user' && message.content === currentInput);
        const finalMessages = alreadyHasUserMessage ? [...cleanMessages, aiMsg] : [...cleanMessages, { role: 'user', content: currentInput, id: `${Date.now()}-user` }, aiMsg];
        return { ...chat, messages: finalMessages };
      }));
      return aiMsg;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      console.error('KIM request failed:', err);
      const message = err?.message || 'Something went wrong while contacting KIM.';
      const errorMsg = { role: 'assistant', content: message, isError: true, id: `${Date.now()}-error` };
      setChats(previous => previous.map(chat => chat.id === chatId ? { ...chat, messages: [...chat.messages, errorMsg] } : chat));
      setError(message);
      return null;
    } finally {
      setLoading(false);
      if (abortControllerRef.current) abortControllerRef.current = null;
    }
  }, [currentUser, isOnline]);

  const handleSend = useCallback(async overrideText => {
    const textToSend = (overrideText || input).trim();
    if (!textToSend || loading) return;
    const currentInput = textToSend;
    setInput(''); setError(null); setTypingMessageId(null);
    setLoadingText(inferLoadingState(currentInput));
    const newChatId = activeChatId || `chat-${Date.now()}`;
    const userMsg = { role: 'user', content: currentInput, id: `user-${Date.now()}` };
    const existingChat = chats.find(chat => chat.id === newChatId);
    const existingMessages = existingChat?.messages || [];
    const conversationForBackend = [...existingMessages.filter(message => !message.isError), userMsg];
    setChats(previous => {
      const existing = previous.find(chat => chat.id === newChatId);
      if (existing) return previous.map(chat => chat.id === newChatId ? { ...chat, messages: [...chat.messages, userMsg] } : chat);
      return [{ id: newChatId, title: generateChatTitle(currentInput), createdAt: Date.now(), messages: [userMsg] }, ...previous];
    });
    setActiveChatId(newChatId);
    setLoading(true);
    const localReply = interceptLocalQuery(currentInput);
    if (localReply) {
      const aiMsg = { role: 'assistant', content: localReply, model: 'local-app', type: 'knowledge', id: `local-${Date.now()}` };
      setTypingMessageId(aiMsg.id);
      setChats(previous => previous.map(chat => chat.id === newChatId ? { ...chat, messages: [...chat.messages.filter(message => message.id !== aiMsg.id), aiMsg] } : chat));
      setLoading(false);
      return;
    }
    await sendMessageToBackend(currentInput, newChatId, conversationForBackend);
  }, [input, loading, activeChatId, chats, sendMessageToBackend]);

  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  const handleRetry = useCallback(async () => {
    if (!activeChatId) return;
    const chat = chats.find(item => item.id === activeChatId);
    if (!chat) return;
    const lastUserMsg = [...chat.messages].reverse().find(message => message.role === 'user');
    if (!lastUserMsg) return;
    const cleanMessages = chat.messages.filter(message => !message.isError);
    setChats(previous => previous.map(item => item.id === activeChatId ? { ...item, messages: cleanMessages } : item));
    setError(null); setLoading(true); setLoadingText(inferLoadingState(lastUserMsg.content));
    await sendMessageToBackend(lastUserMsg.content, activeChatId, cleanMessages);
  }, [activeChatId, chats, sendMessageToBackend]);

  useEffect(() => {
    const handleExternalOpen = event => {
      const promptMessage = event.detail?.message;
      const context = event.detail?.matchContext;
      if (context) setMatchContext(context);
      if (promptMessage && isOpen) { setTimeout(() => { handleSendRef.current?.(promptMessage); }, 400); }
    };
    window.addEventListener('openZokaAI', handleExternalOpen);
    return () => window.removeEventListener('openZokaAI', handleExternalOpen);
  }, [isOpen]);

  const renderChatGroup = (title, chatsInGroup) => {
    if (chatsInGroup.length === 0) return null;
    return (
      <div className="kim-sidebar-group">
        <div className="kim-sidebar-group-title">{title}</div>
        {chatsInGroup.map(chat => (
          <div key={chat.id} onClick={() => { setActiveChatId(chat.id); setShowSidebar(false); setError(null); setTypingMessageId(null); }} className={`kim-chat-item ${activeChatId === chat.id ? 'active' : ''}`}>
            <div className="kim-chat-item-info"><MessageSquare size={14} /><span className="kim-chat-title-text">{chat.title}</span></div>
            <button onClick={event => deleteChat(chat.id, event)} className="kim-chat-delete" title="Delete chat"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    );
  };

  const renderMessageContent = msg => {
    if (msg.data?.type === 'match' || msg.data?.type === 'prediction') {
      return (<div><TypewriterText text={msg.content} isActive={msg.id === typingMessageId} onComplete={() => setTypingMessageId(null)} /><div className="kim-action-row"><button className="kim-action-link">View Match<ChevronRight size={12} /></button></div></div>);
    }
    return (<TypewriterText text={msg.content} isActive={msg.id === typingMessageId} onComplete={() => setTypingMessageId(null)} />);
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .kim-backdrop{position:fixed; inset:0; background:rgba(0,0,0,0.76); backdrop-filter:blur(16px); z-index:9998; animation: zk-fade-in 0.22s ease}
        .kim-window{position:fixed; inset:0; z-index:9999; display:flex; background: radial-gradient(800px 500px at 50% 0%, rgba(16,185,129,0.10), transparent 60%), #05070a; overflow:hidden}
        .kim-sidebar{width:280px; background:rgba(10,15,26,0.92); backdrop-filter:blur(24px) saturate(200%); border-right:1px solid rgba(255,255,255,0.08); display:flex; flex-direction:column; transform: translateX(-100%); transition: transform 0.32s cubic-bezier(0.22,1,0.36,1); position:absolute; inset:0 auto 0 0; z-index:10; box-shadow: 8px 0 32px rgba(0,0,0,0.42), inset -1px 0 0 rgba(255,255,255,0.06)}
        .kim-sidebar.open{transform: translateX(0)}
        @media(min-width:768px){.kim-sidebar{position:relative; transform: translateX(0)} .kim-sidebar-overlay{display:none}}
        .kim-sidebar-overlay{position:fixed; inset:0; background:rgba(0,0,0,0.42); z-index:5}
        .kim-sidebar-header{display:flex; justify-content:space-between; align-items:center; padding:16px; border-bottom:1px solid rgba(255,255,255,0.08)}
        .kim-sidebar-title{font-weight:900; letter-spacing:0.08em; font-size:12px; color:#10b981}
        .kim-sidebar-actions{padding:12px}
        .kim-sidebar-actions .btn{width:100%; padding:10px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); color:#fff; border:1px solid rgba(255,255,255,0.18); font-weight:800; font-size:13px; display:flex; align-items:center; justify-content:center; gap:6px; box-shadow:0 8px 24px rgba(16,185,129,0.28), inset 0 1px 0 rgba(255,255,255,0.22); cursor:pointer; transition: all 0.22s}
        .kim-sidebar-actions .btn:hover{transform:translateY(-1px); filter:brightness(1.12)}
        .kim-sidebar-list{flex:1; overflow-y:auto; padding:8px}
        .kim-sidebar-empty{color:#64748b; font-size:12px; text-align:center; padding:20px; font-weight:600}
        .kim-sidebar-group{margin-bottom:16px}
        .kim-sidebar-group-title{font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; padding:6px 8px}
        .kim-chat-item{display:flex; justify-content:space-between; align-items:center; padding:10px 8px; border-radius:8px; cursor:pointer; border:1px solid transparent; transition: all 0.18s; background:rgba(255,255,255,0.02)}
        .kim-chat-item:hover{background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.08); transform:translateX(2px)}
        .kim-chat-item.active{background:rgba(16,185,129,0.12); border-color:rgba(16,185,129,0.24); box-shadow:0 0 16px rgba(16,185,129,0.12)}
        .kim-chat-item-info{display:flex; align-items:center; gap:8px; min-width:0; flex:1; font-size:13px; font-weight:600; color:#94a3b8}
        .kim-chat-item.active .kim-chat-item-info{color:#10b981}
        .kim-chat-title-text{white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
        .kim-chat-delete{background:rgba(255,255,255,0.06); border:1px solid transparent; color:#64748b; width:24px; height:24px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: all 0.18s; flex-shrink:0}
        .kim-chat-delete:hover{background:rgba(239,68,68,0.14); color:#ef4444; border-color:rgba(239,68,68,0.22)}
        .kim-main{flex:1; display:flex; flex-direction:column; min-width:0; background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent)}
        .kim-header{display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(10,15,26,0.82); backdrop-filter:blur(24px) saturate(200%); border-bottom:1px solid rgba(255,255,255,0.08); box-shadow:0 1px 0 rgba(255,255,255,0.06) inset}
        .kim-header-left{display:flex; align-items:center; gap:12px}
        .btn-icon{width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); color:#94a3b8; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.22s; backdrop-filter:blur(8px)}
        .btn-icon:hover{background:rgba(255,255,255,0.10); color:#f8fafc; transform:translateY(-1px)}
        .kim-header-info{display:flex; align-items:center; gap:10px}
        .kim-avatar{width:32px; height:32px; border-radius:10px; background:linear-gradient(135deg, #10b981, #38bdf8); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.22)}
        .kim-name{font-size:14px; font-weight:900; margin:0; letter-spacing:-0.01em}
        .kim-status{font-size:10px; color:#64748b; font-weight:700; display:flex; align-items:center; gap:4px; text-transform:uppercase; letter-spacing:0.06em}
        .kim-body{flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:16px; -webkit-overflow-scrolling:touch}
        .kim-empty-state{display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:40px 16px; gap:12px; flex:1}
        .kim-empty-icon{width:64px; height:64px; border-radius:20px; background:linear-gradient(135deg, rgba(16,185,129,0.18), rgba(56,189,248,0.12)); border:1px solid rgba(16,185,129,0.22); display:flex; align-items:center; justify-content:center; box-shadow:0 0 32px rgba(16,185,129,0.14), inset 0 1px 0 rgba(255,255,255,0.08); animation: zk-bounce 2s infinite}
        .kim-empty-state h3{font-size:18px; font-weight:900; margin:0; letter-spacing:-0.02em}
        .kim-empty-state p{font-size:13px; color:#64748b; font-weight:600; margin:0}
        .kim-starters-grid{display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%; max-width:360px; margin-top:12px}
        .kim-starter-btn{padding:12px; border-radius:12px; background:rgba(255,255,255,0.04); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.08); color:#94a3b8; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:8px; transition:all 0.22s; text-align:left; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04)}
        .kim-starter-btn:hover{background:rgba(255,255,255,0.08); border-color:rgba(16,185,129,0.22); color:#f8fafc; transform:translateY(-2px); box-shadow:0 8px 20px rgba(0,0,0,0.22), 0 0 16px rgba(16,185,129,0.10)}
        .kim-starter-icon{font-size:16px; flex-shrink:0}
        .kim-msg-row{display:flex; gap:10px; max-width:85%; animation: zk-fade-up 0.32s both}
        .kim-msg-row.user{align-self:flex-end; flex-direction:row-reverse}
        .kim-msg-avatar{width:28px; height:28px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px}
        .kim-msg-avatar.user{background:linear-gradient(135deg, #10b981, #059669); border-color:rgba(16,185,129,0.22)}
        .kim-bubble{padding:12px 14px; border-radius:16px; font-size:13px; line-height:1.6; backdrop-filter:blur(16px) saturate(180%); border:1px solid rgba(255,255,255,0.08); box-shadow:0 4px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06); position:relative; overflow:hidden}
        .kim-bubble.user{background:linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08)); border-color:rgba(16,185,129,0.22); color:#f8fafc}
        .kim-bubble.ai{background:rgba(16,24,40,0.82); color:#cbd5e1}
        .kim-bubble.error{background:rgba(239,68,68,0.10); border-color:rgba(239,68,68,0.22)}
        .kim-bubble.loading{display:flex; align-items:center; gap:8px; color:#64748b; font-weight:700; font-size:12px}
        .kim-engine-badge{display:inline-flex; align-items:center; gap:4px; font-size:9px; font-weight:800; padding:3px 7px; border-radius:20px; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px; border:1px solid}
        .badge-local{background:rgba(16,185,129,0.12); color:#10b981; border-color:rgba(16,185,129,0.22)}
        .badge-match{background:rgba(56,189,248,0.12); color:#38bdf8; border-color:rgba(56,189,248,0.22)}
        .badge-prediction{background:rgba(245,158,11,0.12); color:#f59e0b; border-color:rgba(245,158,11,0.22)}
        .badge-ai{background:rgba(168,85,247,0.12); color:#a855f7; border-color:rgba(168,85,247,0.22)}
        .badge-cached{background:rgba(100,116,139,0.12); color:#64748b; border-color:rgba(100,116,139,0.22)}
        .kim-bullet-item{display:flex; gap:8px; margin:6px 0; font-size:13px}
        .kim-bullet-dot{color:#10b981; font-size:8px; margin-top:6px; flex-shrink:0; text-shadow:0 0 8px #10b981}
        .kim-text-heading{font-size:14px; font-weight:800; color:#f8fafc; margin:12px 0 6px; letter-spacing:-0.01em}
        .kim-text-para{margin:6px 0; color:#94a3b8; font-weight:500}
        .kim-action-row{margin-top:12px}
        .kim-action-link{display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.22); color:#10b981; font-size:11px; font-weight:800; cursor:pointer; transition:all 0.18s}
        .kim-action-link:hover{background:rgba(16,185,129,0.18); transform:translateX(2px)}
        .kim-user-text{color:#f8fafc; font-weight:600}
        .kim-error-content{display:flex; flex-direction:column; gap:8px}
        .kim-retry-btn{display:inline-flex; align-items:center; gap:4px; padding:6px 10px; border-radius:8px; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.22); color:#ef4444; font-size:11px; font-weight:800; cursor:pointer; width:fit-content}
        .typewriter-cursor{display:inline-block; width:2px; height:14px; background:#10b981; margin-left:2px; animation: blink 1s infinite; vertical-align:middle; box-shadow:0 0 8px #10b981}
        @keyframes blink{0%,50%{opacity:1}51%,100%{opacity:0}}
        .kim-input-area{padding:12px 16px; background:rgba(10,15,26,0.92); backdrop-filter:blur(24px) saturate(200%); border-top:1px solid rgba(255,255,255,0.08); box-shadow:0 -1px 0 rgba(255,255,255,0.06) inset}
        .kim-input-wrap{display:flex; align-items:center; gap:8px; padding:6px 6px 6px 14px; background:rgba(255,255,255,0.04); backdrop-filter:blur(16px); border:1px solid rgba(255,255,255,0.08); border-radius:14px; transition:all 0.22s; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04)}
        .kim-input-wrap:focus-within{border-color:rgba(16,185,129,0.32); box-shadow:0 0 0 4px rgba(16,185,129,0.12), inset 0 1px 0 rgba(255,255,255,0.06); background:rgba(255,255,255,0.06)}
        .kim-input{flex:1; background:transparent; border:none; outline:none; color:#f8fafc; font-size:14px; font-weight:500; min-width:0}
        .kim-input::placeholder{color:#475569}
        .kim-send-btn{width:36px; height:36px; border-radius:10px; background:linear-gradient(135deg, #10b981, #059669); border:1px solid rgba(255,255,255,0.18); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(16,185,129,0.22), inset 0 1px 0 rgba(255,255,255,0.22); transition:all 0.22s; flex-shrink:0}
        .kim-send-btn:hover{transform:translateY(-1px) scale(1.04); filter:brightness(1.12); box-shadow:0 8px 20px rgba(16,185,129,0.32)}
        .kim-send-btn:active{transform:translateY(1px) scale(0.96)}
        .kim-send-btn.disabled{opacity:0.42; pointer-events:none; filter:grayscale(0.6)}
        .anim-spin{animation: spin 1s linear infinite}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes zk-fade-in{from{opacity:0}to{opacity:1}}
        @keyframes zk-fade-up{from{transform:translateY(12px); opacity:0}to{transform:translateY(0); opacity:1}}
        @keyframes zk-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
      `}</style>

      <div className="kim-backdrop" onClick={onClose} />

      <div className="kim-window">
        {showSidebar && (<div className="kim-sidebar-overlay" onClick={() => setShowSidebar(false)} />)}

        <div className={`kim-sidebar ${showSidebar ? 'open' : ''}`}>
          <div className="kim-sidebar-header">
            <span className="kim-sidebar-title">KIM • MIDNIGHT</span>
            <button onClick={() => setShowSidebar(false)} className="btn-icon"><X size={18} /></button>
          </div>

          <div className="kim-sidebar-actions">
            <button onClick={startNewChat} className="btn"><Plus size={16} />New chat</button>
          </div>

          <div className="kim-sidebar-list">
            {chats.length === 0 && (<div className="kim-sidebar-empty">No recent chats. Start with a football question.</div>)}
            {renderChatGroup('TODAY', groupedChats.today)}
            {renderChatGroup('YESTERDAY', groupedChats.yesterday)}
            {renderChatGroup('EARLIER', groupedChats.earlier)}
          </div>
        </div>

        <div className="kim-main">
          <div className="kim-header">
            <div className="kim-header-left">
              <button onClick={() => setShowSidebar(previous => !previous)} className="btn-icon"><Menu size={20} /></button>
              <div className="kim-header-info">
                <div className="kim-avatar"><Sparkles size={16} color="#fff" /></div>
                <div>
                  <h2 className="kim-name">Kim</h2>
                  <span className="kim-status">{!isOnline ? (<><WifiOff size={10} />Offline</>) : ('ZOKASCORE Intelligence • Midnight')}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="btn-icon"><X size={20} /></button>
          </div>

          <div className="kim-body">
            {messages.length === 0 && (
              <div className="kim-empty-state">
                <div className="kim-empty-icon"><Sparkles size={28} color="#fff" /></div>
                <h3>Ask Kim</h3>
                <p>{matchContext ? `${matchContext.home} vs ${matchContext.away}` : 'Football intelligence built into ZOKASCORE • Midnight Glass'}</p>
                <div className="kim-starters-grid">
                  {matchContext ? (
                    <>
                      <button onClick={() => handleSend(`Analyze ${matchContext.home} vs ${matchContext.away}`)} className="kim-starter-btn"><span className="kim-starter-icon">🔮</span>Analyze this match</button>
                      <button onClick={() => handleSend(`Predict ${matchContext.home} vs ${matchContext.away}`)} className="kim-starter-btn"><span className="kim-starter-icon">📊</span>Give me a prediction</button>
                      <button onClick={() => handleSend(`Who is likely to score in ${matchContext.home} vs ${matchContext.away}?`)} className="kim-starter-btn"><span className="kim-starter-icon">⚽</span>Who will score?</button>
                      <button onClick={() => handleSend(`Compare recent form for ${matchContext.home} and ${matchContext.away}`)} className="kim-starter-btn"><span className="kim-starter-icon">📈</span>Compare form</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleSend('What matches are playing today?')} className="kim-starter-btn"><span className="kim-starter-icon">⚽</span>Today's matches</button>
                      {currentUser && (<button onClick={() => handleSend('What are my prediction stats?')} className="kim-starter-btn"><span className="kim-starter-icon">📊</span>My prediction stats</button>)}
                      <button onClick={() => handleSend('Explain the offside rule')} className="kim-starter-btn"><span className="kim-starter-icon">🧠</span>Ask about football</button>
                      <button onClick={() => handleSend('Analyze Arsenal vs Chelsea')} className="kim-starter-btn"><span className="kim-starter-icon">🔮</span>Analyze a match</button>
                    </>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const badge = msg.role === 'assistant' ? getEngineBadge(msg.model) : null;
              const BadgeIcon = badge?.icon;
              return (
                <div key={msg.id || index} className={`kim-msg-row ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.role !== 'user' && (<div className="kim-msg-avatar"><Sparkles size={14} color="#fff" /></div>)}
                  <div className={`kim-bubble ${msg.role === 'user' ? 'user' : 'ai'} ${msg.isError ? 'error' : ''}`}>
                    {badge && !msg.isError && (<div className={`kim-engine-badge ${badge.cls}`}><BadgeIcon size={9} />{badge.text}</div>)}
                    {msg.isError ? (
                      <div className="kim-error-content"><AlertCircle size={14} /><span>{msg.content}</span><button onClick={handleRetry} className="kim-retry-btn"><RefreshCw size={12} />Retry</button></div>
                    ) : msg.role === 'assistant' ? (renderMessageContent(msg)) : (<div className="kim-user-text">{msg.content}</div>)}
                  </div>
                  {msg.role === 'user' && (<div className="kim-msg-avatar user"><User size={14} color="#fff" /></div>)}
                </div>
              );
            })}

            {loading && !typingMessageId && (
              <div className="kim-msg-row ai">
                <div className="kim-msg-avatar"><Sparkles size={14} color="#fff" /></div>
                <div className="kim-bubble ai loading"><Loader size={14} className="anim-spin" /><span>{loadingText}</span></div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="kim-input-area">
            <div className="kim-input-wrap">
              <input ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } }} placeholder={loading ? 'Kim is thinking...' : !isOnline ? "You're offline" : 'Ask Kim anything about football...'} className="kim-input" disabled={loading || !isOnline} autoComplete="off" />
              <button onClick={() => handleSend()} disabled={loading || !input.trim() || !isOnline} className={`kim-send-btn ${!input.trim() || loading || !isOnline ? 'disabled' : ''}`} aria-label="Send message"><Send size={18} /></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

