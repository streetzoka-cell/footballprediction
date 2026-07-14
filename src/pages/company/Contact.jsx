// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/company/Contact.jsx
// ═════════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Globe, Mail, Phone, MapPin, Send, CheckCircle,
  MessageCircle, Clock, User, FileText, AlertCircle, Loader
} from 'lucide-react';
import SEO from '../../components/SEO';

const injectCSS = () => {
  if (document.getElementById('co-contact-css')) return;
  const s = document.createElement('style');
  s.id = 'co-contact-css';
  s.textContent = `
@keyframes cc-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes cc-pop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
@keyframes cc-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

.cc-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.cc-wrap{max-width:640px;margin:0 auto;padding:0 18px}
.cc-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.cc-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.cc-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.cc-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.cc-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--text-primary)}

.cc-hero{text-align:center;padding:36px 0 28px;animation:cc-fade-up .4s ease both}
.cc-hero h1{margin:0 0 6px;font-size:1.6rem;font-weight:900;color:var(--text-primary)}
.cc-hero p{margin:0;font-size:.84rem;color:var(--text-muted);font-weight:600;line-height:1.5}

.cc-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px}
.cc-info-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;align-items:center;gap:12px;transition:all .15s;animation:cc-pop .35s cubic-bezier(.34,1.56,.64,1) both;cursor:default}
.cc-info-card:hover{border-color:var(--border-hover);transform:translateY(-1px)}
.cc-info-icon{width:42px;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.cc-info-label{font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.cc-info-val{font-size:.84rem;font-weight:700;color:var(--text-primary);line-height:1.3}

.cc-form{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:20px;animation:cc-fade-up .4s ease both;animation-delay:200ms}
.cc-form h3{margin:0 0 16px;font-size:.95rem;font-weight:900;color:var(--text-primary);display:flex;align-items:center;gap:8px}
.cc-field{margin-bottom:14px}
.cc-label{display:block;font-size:.72rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.cc-input{width:100%;padding:12px 16px;border-radius:11px;background:var(--bg-surface);border:1.5px solid var(--border);color:var(--text-primary);font-size:.86rem;font-weight:600;outline:none;transition:all .15s;font-family:inherit;box-sizing:border-box}
.cc-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.08)}
.cc-input::placeholder{color:var(--text-muted);opacity:.35}
.cc-textarea{min-height:120px;resize:vertical;font-family:inherit}
.cc-select{appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.cc-submit{width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;font-size:.88rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;font-family:inherit;box-shadow:0 2px 14px rgba(16,185,129,.2)}
.cc-submit:hover{transform:translateY(-1px);box-shadow:0 4px 18px rgba(16,185,129,.25)}
.cc-submit:active{transform:scale(.98)}
.cc-submit:disabled{opacity:.4;pointer-events:none}

.cc-success{text-align:center;padding:40px 20px;background:var(--bg-card);border:1.5px solid rgba(0,230,118,.2);border-radius:16px;animation:cc-pop .4s cubic-bezier(.34,1.56,.64,1) both}
.cc-success h3{margin:0 0 8px;font-size:1.1rem;font-weight:900;color:var(--accent)}
.cc-success p{margin:0;font-size:.84rem;color:var(--text-muted);font-weight:600}
.cc-success-icon{width:56px;height:56px;border-radius:16px;background:rgba(0,230,118,.08);border:1.5px solid rgba(0,230,118,.15);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px;color:var(--accent)}

.cc-error{color:#ef4444;font-size:.78rem;font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:6px}

.cc-faq{margin-top:8px}
.cc-faq-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;animation:cc-fade-up .3s ease both}
.cc-faq-q{font-size:.82rem;font-weight:800;color:var(--text-primary);margin-bottom:4px;display:flex;align-items:center;gap:6px}
.cc-faq-a{font-size:.78rem;color:var(--text-muted);font-weight:600;line-height:1.6}

.cc-spinning{animation:cc-spin .8s linear infinite}

@media(max-width:480px){
  .cc-info{grid-template-columns:1fr}
  .cc-hero h1{font-size:1.4rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

const SUBJECTS = [
  'General Inquiry',
  'Partnership / Sponsorship',
  'Bug Report',
  'Feature Request',
  'Advertising',
  'Press / Media',
  'Legal / DMCA',
  'Other',
];

export default function Contact() {
  injectCSS();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('https://formsubmit.co/ajax/streetzoka@gmail.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          subject: `[ZokaPredict] ${form.subject || 'Contact Form'}`,
          message: form.message,
          _subject: `ZokaPredict Contact: ${form.subject || 'General'}`,
        }),
      });
      if (res.ok) setSent(true);
      else setError('Failed to send. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    }
    setSending(false);
  };

  const upd = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  return (
    <div className="cc-page">
      <SEO
        title="Contact ZOKASCORE Support Team"
        description="Need assistance? Contact the ZOKASCORE team for support, bug reports, feature requests, or business partnerships. We're here to help you 24/7."
        keywords="contact ZOKASCORE, customer support, feature request, bug report, business partnership, help center"
        path="/contact"
        robots="index,follow"
      />

      <div className="cc-hdr">
        <div className="cc-wrap">
          <div className="cc-hdr-inner">
            <button className="cc-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="cc-hdr-title"><MessageCircle size={14} /> Contact</div>
          </div>
        </div>
      </div>

      <div className="cc-wrap">
        <div className="cc-hero">
          <h1>Get In Touch</h1>
          <p>Have a question, feedback, or business inquiry? We'd love to hear from you.</p>
        </div>

        <div className="cc-info">
          <div className="cc-info-card" style={{ animationDelay: '100ms' }}>
            <div className="cc-info-icon" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)' }}><Mail size={18} /></div>
            <div><div className="cc-info-label">Email</div><div className="cc-info-val">streetzoka@gmail.com</div></div>
          </div>
          <div className="cc-info-card" style={{ animationDelay: '150ms' }}>
            <div className="cc-info-icon" style={{ background: 'rgba(96,165,250,.08)', color: '#60a5fa' }}><Phone size={18} /></div>
            <div><div className="cc-info-label">Phone</div><div className="cc-info-val">+254 721 635 810</div></div>
          </div>
          <div className="cc-info-card" style={{ animationDelay: '200ms' }}>
            <div className="cc-info-icon" style={{ background: 'rgba(245,197,66,.08)', color: 'var(--gold)' }}><Clock size={18} /></div>
            <div><div className="cc-info-label">Response Time</div><div className="cc-info-val">Within 24 hours</div></div>
          </div>
          <div className="cc-info-card" style={{ animationDelay: '250ms' }}>
            <div className="cc-info-icon" style={{ background: 'rgba(168,85,247,.08)', color: '#a855f7' }}><MapPin size={18} /></div>
            <div><div className="cc-info-label">Location</div><div className="cc-info-val">Nairobi, Kenya</div></div>
          </div>
        </div>

        {sent ? (
          <div className="cc-success">
            <div className="cc-success-icon"><CheckCircle size={28} /></div>
            <h3>Message Sent!</h3>
            <p>Thank you for reaching out. We'll get back to you within 24 hours.</p>
          </div>
        ) : (
          <form className="cc-form" onSubmit={handleSubmit}>
            <h3><Send size={16} /> Send a Message</h3>
            <div className="cc-field">
              <label className="cc-label">Name *</label>
              <input className="cc-input" placeholder="Your full name" value={form.name} onChange={e => upd('name', e.target.value)} required />
            </div>
            <div className="cc-field">
              <label className="cc-label">Email *</label>
              <input className="cc-input" type="email" placeholder="you@example.com" value={form.email} onChange={e => upd('email', e.target.value)} required />
            </div>
            <div className="cc-field">
              <label className="cc-label">Subject</label>
              <select className="cc-input cc-select" value={form.subject} onChange={e => upd('subject', e.target.value)}>
                <option value="">Select a topic...</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="cc-field">
              <label className="cc-label">Message *</label>
              <textarea className="cc-input cc-textarea" placeholder="Tell us what's on your mind..." value={form.message} onChange={e => upd('message', e.target.value)} required />
            </div>
            {error && (
              <div className="cc-error">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <button type="submit" className="cc-submit" disabled={sending}>
              {sending ? <Loader size={16} className="cc-spinning" /> : <Send size={16} />}
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}

        <div className="cc-faq">
          <div className="cc-faq-item" style={{ animationDelay: '300ms' }}>
            <div className="cc-faq-q"><FileText size={12} /> How quickly do you respond?</div>
            <div className="cc-faq-a">We aim to respond to all inquiries within 24 hours during business days. Urgent issues are prioritized.</div>
          </div>
          <div className="cc-faq-item" style={{ animationDelay: '350ms' }}>
            <div className="cc-faq-q"><User size={12} /> Can I request a feature?</div>
            <div className="cc-faq-a">Absolutely! Select "Feature Request" as the subject. We review all suggestions and build the most requested features.</div>
          </div>
          <div className="cc-faq-item" style={{ animationDelay: '400ms' }}>
            <div className="cc-faq-q"><AlertCircle size={12} /> Found a bug?</div>
            <div className="cc-faq-a">Please select "Bug Report" and include your device, browser, and steps to reproduce. Screenshots help a lot!</div>
          </div>
        </div>
      </div>
    </div>
  );
}