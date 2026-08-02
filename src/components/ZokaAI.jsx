import React, { useState, useEffect, useRef } from 'react';
import { Brain, Send, Loader, X } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../utils/firebase'; // Your firebase init file

const functions = getFunctions(app);
const askZokaAi = httpsCallable(functions, 'askZokaAi');

export default function ZokaAI({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Welcome to the Pitch. I am Zoka AI. Ask me about any match, player, or tactic, and I'll give you the master breakdown." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      // Format history for OpenAI (only role and content)
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      const result = await askZokaAi({ 
        message: input,
        history: history 
      });
      
      const aiMsg = { role: 'assistant', content: result.data.reply };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      const errorMsg = { role: 'assistant', content: "I'm having trouble connecting to the mainframe right now. Try again in a moment." };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="flex-center" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, padding: '20px' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="glass-card flex-col" style={{ width: '100%', maxWidth: '600px', height: '80vh', overflow: 'hidden' }}>
        
        {/* Header */}
        <div className="flex-between p-16" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-center gap-8">
            <Brain size={20} className="text-primary" />
            <h2 className="text-primary font-extrabold">Zoka AI</h2>
          </div>
          <button onClick={onClose} className="btn-icon"><X size={20} /></button>
        </div>

        {/* Chat Body */}
        <div className="flex-col gap-12 p-16" style={{ overflowY: 'auto', flex: 1 }}>
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                className="glass-card p-12" 
                style={{ 
                  maxWidth: '80%', 
                  background: msg.role === 'user' ? 'var(--primary)' : 'var(--bg-elevated)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="glass-card p-12 flex-center gap-8" style={{ background: 'var(--bg-elevated)' }}>
                <Loader size={16} className="anim-spin text-primary" /> Analyzing...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div className="flex gap-8 p-16" style={{ borderTop: '1px solid var(--border)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask Zoka AI... (e.g., How do Liverpool beat Real Madrid?)"
            className="form-input"
            style={{ flex: 1 }}
            disabled={loading}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="btn btn-primary">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}