import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Clock, MapPin, Send, CheckCircle, AlertCircle, Loader, MessageCircle, HelpCircle, Shield } from 'lucide-react';
import SEO from '../../components/SEO';

export default function Contact() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) { setError('Please fill in all fields'); return; }
    setSending(true);
    setTimeout(() => { setSent(true); setSending(false); }, 1000);
  };

  return (
    <div className="company-page">
      <SEO title="Contact ZOKASCORE" path="/contact" />
      <div className="company-sticky-hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
        <div className="text-primary font-extrabold text-sm flex-center gap-8"><MessageCircle size={14} /> Contact</div>
      </div>

      <div className="company-hero-card anim-fade-up">
        <h1 className="text-primary font-extrabold text-lg">Get In Touch</h1>
        <p className="text-muted text-sm">Have a question or business inquiry? We'd love to hear from you.</p>
      </div>

      <div className="company-grid">
        <div className="company-mini-card anim-pop">
          <div className="icon-wrap" style={{ background: 'rgba(var(--primary-rgb),.08)', color: 'var(--primary)' }}><Mail size={18} /></div>
          <div className="text-muted text-xs font-bold uppercase">Email</div>
          <div className="text-primary font-bold text-sm">streetzoka@gmail.com</div>
        </div>
        <div className="company-mini-card anim-pop" style={{ animationDelay: '50ms' }}>
          <div className="icon-wrap" style={{ background: 'rgba(var(--accent-rgb),.08)', color: 'var(--accent)' }}><Phone size={18} /></div>
          <div className="text-muted text-xs font-bold uppercase">Phone</div>
          <div className="text-primary font-bold text-sm">+254 721 635 810</div>
        </div>
      </div>

      {sent ? (
        <div className="company-card flex-col items-center gap-12 text-center anim-pop" style={{ borderColor: 'rgba(var(--primary-rgb), 0.2)' }}>
          <div className="company-hero-icon" style={{ width: 56, height: 56 }}><CheckCircle size={28} /></div>
          <h2 className="text-primary font-bold text-md">Message Sent!</h2>
          <p className="text-muted text-sm">We'll get back to you within 24 hours.</p>
        </div>
      ) : (
        <form className="company-card anim-fade-up" onSubmit={handleSubmit}>
          <h2 className="text-primary font-bold flex-center gap-8"><Send size={16} /> Send a Message</h2>
          <div className="flex-col gap-8 mb-12">
            <label className="text-muted text-xs font-bold uppercase">Name *</label>
            <input className="form-input" placeholder="Your name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
          </div>
          <div className="flex-col gap-8 mb-12">
            <label className="text-muted text-xs font-bold uppercase">Email *</label>
            <input className="form-input" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          </div>
          <div className="flex-col gap-8 mb-12">
            <label className="text-muted text-xs font-bold uppercase">Message *</label>
            <textarea className="form-input" placeholder="What's on your mind?" value={form.message} onChange={e => setForm({...form, message: e.target.value})} required style={{ minHeight: 120, resize: 'vertical' }} />
          </div>
          {error && <div className="text-danger text-sm flex-center gap-4 mb-12"><AlertCircle size={14} /> {error}</div>}
          <button type="submit" className="btn btn-primary w-full" disabled={sending}>
            {sending ? <Loader size={16} className="anim-spin" /> : <Send size={16} />} Send Message
          </button>
        </form>
      )}

      <div className="company-directory">
        <h3>Support Directory</h3>
        <div className="dir-grid">
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
          <Link to="/terms" className="dir-link"><Shield size={16} /> Terms</Link>
          <Link to="/help-center" className="dir-link"><MessageCircle size={16} /> Help Center</Link>
        </div>
      </div>
    </div>
  );
}