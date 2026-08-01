import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Send, CheckCircle, MessageCircle, Clock, User, FileText, AlertCircle, Loader } from 'lucide-react';
import SEO from '../../components/SEO';

const SUBJECTS = ['General Inquiry', 'Partnership / Sponsorship', 'Bug Report', 'Feature Request', 'Advertising', 'Press / Media', 'Legal / DMCA', 'Other'];

export default function Contact() {
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) { setError('Please fill in all required fields'); return; }
    setSending(true); setError('');
    try {
      const res = await fetch('https://formsubmit.co/ajax/streetzoka@gmail.com', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, subject: `[ZokaPredict] ${form.subject || 'Contact Form'}`, message: form.message, _subject: `ZokaPredict Contact: ${form.subject || 'General'}` }),
      });
      if (res.ok) setSent(true); else setError('Failed to send. Please try again.');
    } catch { setError('Network error. Please try again.'); }
    setSending(false);
  };

  const upd = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError(''); };

  return (
    <div className="zoka-page">
      <SEO
        title="Contact ZOKASCORE | Support, Partnerships & Feedback"
        description="Get in touch with the ZOKASCORE team for support, business partnerships, advertising inquiries, bug reports, feature suggestions, or general feedback. We're ready to help you improve your football experience."
        keywords="contact ZOKASCORE, football support, customer support, business partnerships, advertise with ZOKASCORE, bug report, feature request, football platform"
        path="/contact"
        robots="index,follow"
         />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><MessageCircle size={14} /> Contact</div>
          </div>
        </div>

        <div className="glass-card p-24 mb-24 text-center flex-col items-center gap-8 anim-fade-up">
          <h1 className="text-primary font-extrabold text-lg">Get In Touch</h1>
          <p className="text-muted text-sm">Have a question, feedback, or business inquiry? We'd love to hear from you.</p>
        </div>

        <div className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[
            { icon: <Mail size={18} />, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.08)', label: 'Email', val: 'streetzoka@gmail.com' },
            { icon: <Phone size={18} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', label: 'Phone', val: '+254 721 635 810' },
            { icon: <Clock size={18} />, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', label: 'Response Time', val: 'Within 24 hours' },
            { icon: <MapPin size={18} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', label: 'Location', val: 'Nairobi, Kenya' },
          ].map((c, i) => (
            <div key={i} className="glass-card p-16 flex-center gap-12 anim-pop" style={{ animationDelay: `${i * 50 + 100}ms` }}>
              <div className="flex-center" style={{ width: 42, height: 42, borderRadius: 'var(--r-12)', background: c.bg, color: c.color }}>{c.icon}</div>
              <div className="flex-col">
                <div className="text-muted text-xs font-bold uppercase">{c.label}</div>
                <div className="text-primary font-bold text-sm">{c.val}</div>
              </div>
            </div>
          ))}
        </div>

        {sent ? (
          <div className="glass-card p-32 flex-col items-center gap-12 text-center anim-pop" style={{ borderColor: 'rgba(var(--primary-rgb), 0.2)' }}>
            <div className="flex-center text-primary" style={{ width: 56, height: 56, borderRadius: 'var(--r-16)', background: 'rgba(var(--primary-rgb), 0.08)' }}><CheckCircle size={28} /></div>
            <h3 className="text-primary font-bold text-md">Message Sent!</h3>
            <p className="text-muted text-sm">Thank you for reaching out. We'll get back to you within 24 hours.</p>
          </div>
        ) : (
          <form className="glass-card p-24 mb-16 flex-col gap-16 anim-fade-up" onSubmit={handleSubmit}>
            <h3 className="text-primary font-bold flex-center gap-8"><Send size={16} /> Send a Message</h3>
            <div className="flex-col gap-8">
              <label className="text-muted text-xs font-bold uppercase">Name *</label>
              <input className="form-input" placeholder="Your full name" value={form.name} onChange={e => upd('name', e.target.value)} required />
            </div>
            <div className="flex-col gap-8">
              <label className="text-muted text-xs font-bold uppercase">Email *</label>
              <input className="form-input" type="email" placeholder="you@example.com" value={form.email} onChange={e => upd('email', e.target.value)} required />
            </div>
            <div className="flex-col gap-8">
              <label className="text-muted text-xs font-bold uppercase">Subject</label>
              <select className="form-input" value={form.subject} onChange={e => upd('subject', e.target.value)}>
                <option value="">Select a topic...</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex-col gap-8">
              <label className="text-muted text-xs font-bold uppercase">Message *</label>
              <textarea className="form-input" placeholder="Tell us what's on your mind..." value={form.message} onChange={e => upd('message', e.target.value)} required style={{ minHeight: 120, resize: 'vertical' }} />
            </div>
            {error && <div className="text-danger text-sm flex-center gap-4"><AlertCircle size={14} /> {error}</div>}
            <button type="submit" className="btn btn-primary w-full" disabled={sending}>
              {sending ? <Loader size={16} className="anim-spin" /> : <Send size={16} />} {sending ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}

        <div className="flex-col gap-8">
          {[
            { q: 'How quickly do you respond?', a: 'We aim to respond to all inquiries within 24 hours during business days. Urgent issues are prioritized.' },
            { q: 'Can I request a feature?', a: 'Absolutely! Select "Feature Request" as the subject. We review all suggestions and build the most requested features.' },
            { q: 'Found a bug?', a: 'Please select "Bug Report" and include your device, browser, and steps to reproduce. Screenshots help a lot!' },
          ].map((f, i) => (
            <div key={i} className="glass-card p-16 flex-col gap-4 anim-fade-up" style={{ animationDelay: `${i * 50 + 300}ms` }}>
              <div className="text-primary font-bold text-sm flex-center gap-8"><FileText size={12} /> {f.q}</div>
              <div className="text-muted text-sm">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}