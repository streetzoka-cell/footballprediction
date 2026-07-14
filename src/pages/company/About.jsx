// ═══════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/company/About.jsx
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target, Trophy, Users, Globe, Shield, Zap, Star,
  ChevronRight, ArrowLeft, Award, TrendingUp, Heart,
  MessageCircle, Phone, Mail, MapPin, Calendar,
  BarChart3, Crown, Flame, Eye, Clock, CheckCircle
} from 'lucide-react';
import SEO from '../../components/SEO';

const injectCSS = () => {
  if (document.getElementById('co-about-css')) return;
  const s = document.createElement('style');
  s.id = 'co-about-css';
  s.textContent = `
@keyframes co-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes co-pop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
@keyframes co-shine{0%{left:-100%}100%{left:200%}}
@keyframes co-count{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes co-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}

.co-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.co-wrap{max-width:760px;margin:0 auto;padding:0 18px;position:relative}

.co-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.co-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.co-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.co-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.co-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--text-primary)}

.co-hero{text-align:center;padding:40px 0 36px;animation:co-fade-up .5s ease both}
.co-hero-icon{width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,rgba(0,230,118,.1),rgba(0,230,118,.03));border:1.5px solid rgba(0,230,118,.15);display:inline-flex;align-items:center;justify-content:center;margin-bottom:18px;animation:co-float 4s ease-in-out infinite}
.co-hero h1{margin:0 0 8px;font-size:1.8rem;font-weight:900;color:var(--text-primary);letter-spacing:-.02em}
.co-hero p{margin:0;font-size:.88rem;color:var(--text-muted);font-weight:600;line-height:1.6;max-width:560px;margin-left:auto;margin-right:auto}

.co-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:36px}
.co-stat{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:18px 16px;text-align:center;transition:transform .15s,box-shadow .15s;animation:co-pop .4s cubic-bezier(.34,1.56,.64,1) both;position:relative;overflow:hidden}
.co-stat::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.03),transparent);animation:co-shine 5s ease-in-out infinite}
.co-stat:hover{transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.2)}
.co-stat .n{font-size:1.6rem;font-weight:900;font-family:var(--font-display);line-height:1;animation:co-count .4s ease both}
.co-stat .l{font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:5px}

.co-section{margin-bottom:32px;animation:co-fade-up .4s ease both}
.co-section-title{display:flex;align-items:center;gap:8px;font-size:1rem;font-weight:900;color:var(--text-primary);margin-bottom:14px}
.co-section-icon{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}

.co-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:12px;transition:all .15s;position:relative;overflow:hidden}
.co-card::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.02),transparent);animation:co-shine 6s ease-in-out infinite}
.co-card:hover{border-color:var(--border-hover);transform:translateY(-1px)}
.co-card h3{margin:0 0 6px;font-size:.92rem;font-weight:800;color:var(--text-primary)}
.co-card p{margin:0;font-size:.82rem;color:var(--text-muted);font-weight:600;line-height:1.65}

.co-values{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.co-value{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:18px 16px;transition:all .15s}
.co-value:hover{border-color:rgba(0,230,118,.15);background:rgba(0,230,118,.02)}
.co-value-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}
.co-value h4{margin:0 0 4px;font-size:.82rem;font-weight:800;color:var(--text-primary)}
.co-value p{margin:0;font-size:.72rem;color:var(--text-muted);font-weight:600;line-height:1.5}

.co-timeline{position:relative;padding-left:28px}
.co-timeline::before{content:'';position:absolute;left:8px;top:4px;bottom:4px;width:2px;background:linear-gradient(to bottom,var(--accent),rgba(0,230,118,.1));border-radius:2px}
.co-tl-item{position:relative;margin-bottom:24px;animation:co-fade-up .3s ease both}
.co-tl-dot{position:absolute;left:-24px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--accent);border:2px solid var(--bg-deep,#0a0f1a);box-shadow:0 0 8px rgba(0,230,118,.3)}
.co-tl-year{font-size:.68rem;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.co-tl-text{font-size:.82rem;color:var(--text-primary);font-weight:700;line-height:1.5}
.co-tl-sub{font-size:.72rem;color:var(--text-muted);font-weight:600;margin-top:2px}

.co-contact-bar{background:linear-gradient(135deg,rgba(0,230,118,.04),rgba(0,230,118,.01));border:1.5px solid rgba(0,230,118,.12);border-radius:16px;padding:20px;margin-top:36px;text-align:center;position:relative;overflow:hidden;animation:co-pop .4s cubic-bezier(.34,1.56,.64,1) both}
.co-contact-bar::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,230,118,.04),transparent);animation:co-shine 4s ease-in-out infinite}
.co-contact-bar h3{margin:0 0 12px;font-size:.95rem;font-weight:900;color:var(--text-primary)}
.co-contact-links{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.co-contact-link{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:9px;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted);font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;text-decoration:none;font-family:inherit}
.co-contact-link:hover{color:var(--accent);border-color:rgba(0,230,118,.2);background:rgba(0,230,118,.04)}

@media(max-width:640px){
  .co-hero h1{font-size:1.5rem}
  .co-hero{padding:28px 0 24px}
  .co-values{grid-template-columns:1fr}
  .co-stats{grid-template-columns:repeat(2,1fr);gap:8px}
  .co-stat .n{font-size:1.35rem}
  .co-contact-links{flex-direction:column;align-items:center}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

const STATS = [
  { n: '50K+', l: 'Active Users', color: 'var(--accent)', bg: 'rgba(0,230,118,.06)', icon: <Users size={18} />, delay: 0 },
  { n: '2M+', l: 'Predictions Made', color: '#a855f7', bg: 'rgba(168,85,247,.06)', icon: <Target size={18} />, delay: 60 },
  { n: '15+', l: 'Leagues Covered', color: 'var(--gold)', bg: 'rgba(245,197,66,.06)', icon: <Trophy size={18} />, delay: 120 },
  { n: '89%', l: 'User Accuracy', color: '#60a5fa', bg: 'rgba(96,165,250,.06)', icon: <BarChart3 size={18} />, delay: 180 },
];

const VALUES = [
  { icon: <Target size={18} />, color: 'var(--accent)', bg: 'rgba(0,230,118,.08)', title: 'Accuracy First', desc: 'We reward precise score predictions over lucky guesses. Exact scores earn 10x points.' },
  { icon: <Shield size={18} />, color: '#60a5fa', bg: 'rgba(96,165,250,.08)', title: 'Fair Play', desc: 'Anti-cheat systems and transparent scoring ensure every player competes on equal ground.' },
  { icon: <Zap size={18} />, color: 'var(--gold)', bg: 'rgba(245,197,66,.08)', title: 'Real-Time', desc: 'Live scores, instant leaderboard updates, and real-time match tracking.' },
  { icon: <Heart size={18} />, color: '#ef4444', bg: 'rgba(239,68,68,.08)', title: 'Community', desc: 'Built by football fans, for football fans. Your feedback shapes every feature.' },
];

const TIMELINE = [
  { year: '2024 Q1', text: 'ZokaPredict founded with a mission to make football prediction social and competitive.', sub: 'First 100 users joined within 2 weeks' },
  { year: '2024 Q2', text: 'Launched daily & weekly leaderboards with real-time scoring and G.O.A.T rankings.', sub: 'Integrated 10+ football leagues' },
  { year: '2024 Q3', text: 'Introduced Zoka Picks — expert predictions with community voting and accuracy tracking.', sub: 'Reached 10,000 active users' },
  { year: '2024 Q4', text: 'Added live streaming, highlights, and master games. Expanded to basketball predictions.', sub: '50,000+ users, 2M+ predictions' },
  { year: '2025', text: 'Scaling across Africa and beyond. Mobile apps, premium features, and pro leagues coming soon.', sub: 'The journey continues...' },
];

export default function About() {
  injectCSS();
  const nav = useNavigate();

  return (
    <div className="co-page">
      <SEO
        title="About ZOKASCORE | Football Predictions Platform"
        description="Learn more about ZOKASCORE, your trusted platform for football predictions, live scores, and community gaming. Discover our mission and what we offer."
        keywords="about ZOKASCORE, football platform, prediction community, sports gaming, company info"
        path="/about"
        robots="index,follow"
      />

      <div className="co-hdr">
        <div className="co-wrap">
          <div className="co-hdr-inner">
            <button className="co-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="co-hdr-title"><Globe size={14} /> About Us</div>
          </div>
        </div>
      </div>

      <div className="co-wrap">
        <div className="co-hero">
          <div className="co-hero-icon"><Target size={32} style={{ color: 'var(--accent)' }} /></div>
          <h1>Football Prediction,<br />Reimagined</h1>
          <p>ZokaPredict is a real-time football prediction platform where fans compete on daily leaderboards, track accuracy, and prove they know the beautiful game better than anyone else.</p>
        </div>

        <div className="co-stats">
          {STATS.map((s, i) => (
            <div key={i} className="co-stat" style={{ animationDelay: `${s.delay}ms` }}>
              <div style={{ color: s.bg, marginBottom: 6 }}>{s.icon}</div>
              <div className="n" style={{ color: s.color, animationDelay: `${s.delay + 80}ms` }}>{s.n}</div>
              <div className="l">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="co-section" style={{ animationDelay: '200ms' }}>
          <div className="co-section-title">
            <div className="co-section-icon" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)' }}><Star size={15} /></div>
            Our Mission
          </div>
          <div className="co-card">
            <p>We believe every football fan deserves a platform that celebrates knowledge of the game — not just luck. ZokaPredict was built to transform passive match-watching into an engaging, competitive experience where your understanding of teams, form, and tactics directly translates into rankings and recognition.</p>
          </div>
        </div>

        <div className="co-section" style={{ animationDelay: '280ms' }}>
          <div className="co-section-title">
            <div className="co-section-icon" style={{ background: 'rgba(245,197,66,.08)', color: 'var(--gold)' }}><Award size={15} /></div>
            Our Values
          </div>
          <div className="co-values">
            {VALUES.map((v, i) => (
              <div key={i} className="co-value" style={{ animationDelay: `${i * 60 + 300}ms` }}>
                <div className="co-value-icon" style={{ background: v.bg, color: v.color }}>{v.icon}</div>
                <h4>{v.title}</h4>
                <p>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="co-section" style={{ animationDelay: '380ms' }}>
          <div className="co-section-title">
            <div className="co-section-icon" style={{ background: 'rgba(168,85,247,.08)', color: '#a855f7' }}><Clock size={15} /></div>
            Our Journey
          </div>
          <div className="co-timeline">
            {TIMELINE.map((t, i) => (
              <div key={i} className="co-tl-item" style={{ animationDelay: `${i * 60 + 400}ms` }}>
                <div className="co-tl-dot" />
                <div className="co-tl-year">{t.year}</div>
                <div className="co-tl-text">{t.text}</div>
                <div className="co-tl-sub">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="co-section" style={{ animationDelay: '480ms' }}>
          <div className="co-section-title">
            <div className="co-section-icon" style={{ background: 'rgba(96,165,250,.08)', color: '#60a5fa' }}><Users size={15} /></div>
            The Team
          </div>
          <div className="co-card">
            <p>ZokaPredict is built and maintained by a small, passionate team of football enthusiasts and software engineers based in Kenya. We're bootstrapped, independent, and focused on building the best prediction experience in Africa — and beyond.</p>
          </div>
        </div>

        <div className="co-contact-bar" style={{ animationDelay: '560ms' }}>
          <h3>Get In Touch</h3>
          <div className="co-contact-links">
            <a href="mailto:streetzoka@gmail.com" className="co-contact-link"><Mail size={13} /> streetzoka@gmail.com</a>
            <a href="tel:+254721635810" className="co-contact-link"><Phone size={13} /> +254 721 635 810</a>
            <button className="co-contact-link" onClick={() => nav('/company/contact')}><MessageCircle size={13} /> Contact Form</button>
          </div>
        </div>
      </div>
    </div>
  );
}