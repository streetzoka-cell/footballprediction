// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/company/Partners.jsx
// ═════════════════════════════════════════════════════════════════════════════════

import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Globe, Handshake, TrendingUp, Users, BarChart3, Eye, Zap, 
  ChevronRight, Mail, Trophy 
} from 'lucide-react';
import SEO from '../../components/SEO';

const injectCSS = () => {
  if (document.getElementById('co-partners-css')) return;
  const s = document.createElement('style');
  s.id = 'co-partners-css';
  s.textContent = `
@keyframes pa-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes pa-pop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}

.pa-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.pa-wrap{max-width:700px;margin:0 auto;padding:0 18px}
.pa-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.pa-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.pa-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.pa-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.pa-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--text-primary)}

.pa-hero{text-align:center;padding:36px 0 28px;animation:pa-fade-up .4s ease both}
.pa-hero h1{margin:0 0 10px;font-size:1.8rem;font-weight:900;color:var(--text-primary);line-height:1.2}
.pa-hero p{margin:0;font-size:.84rem;color:var(--text-muted);font-weight:600;line-height:1.6;max-width:560px;margin-left:auto;margin-right:auto}

.pa-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:32px}
.pa-metric{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:18px 10px;text-align:center;animation:pa-pop .35s cubic-bezier(.34,1.56,.64,1) both}
.pa-metric .n{font-size:1.1rem;font-weight:900;font-family:var(--font-display);line-height:1;letter-spacing:0.02em}
.pa-metric .l{font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:6px}

.pa-section-title{font-size:.88rem;font-weight:900;color:var(--text-primary);margin-bottom:14px}

.pa-opp{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:12px;animation:pa-fade-up .3s ease both}
.pa-opp:hover{border-color:var(--border-hover)}
.pa-opp h3{margin:0 0 8px;font-size:.92rem;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:8px}
.pa-opp p{margin:0 0 12px;font-size:.8rem;color:var(--text-muted);font-weight:600;line-height:1.6}
.pa-opp-features{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.pa-opp-feat{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:.66rem;font-weight:700;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted)}
.pa-opp-cta{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:10px;background:linear-gradient(135deg,var(--gold),#eab308);color:#000;font-size:.8rem;font-weight:800;border:none;cursor:pointer;transition:all .15s;font-family:inherit;box-shadow:0 2px 12px rgba(245,197,66,.18);text-decoration:none}
.pa-opp-cta:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(245,197,66,.22)}
.pa-opp-cta:active{transform:scale(.97)}

.pa-cta{text-align:center;padding:32px 20px;background:linear-gradient(135deg,rgba(245,197,66,.04),rgba(245,197,66,.01));border:1.5px solid rgba(245,197,66,.12);border-radius:16px;margin-top:24px;animation:pa-pop .4s cubic-bezier(.34,1.56,.64,1) both}
.pa-cta h3{margin:0 0 8px;font-size:1rem;font-weight:900;color:var(--text-primary)}
.pa-cta p{margin:0 0 16px;font-size:.8rem;color:var(--text-muted);font-weight:600;line-height:1.6;max-width:480px;margin-left:auto;margin-right:auto}

@media(max-width:480px){
  .pa-metrics{grid-template-columns:repeat(2,1fr)}
  .pa-hero h1{font-size:1.5rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

const METRICS = [
  { n: 'Global', l: 'Football Audience', color: 'var(--accent)', delay: 0 },
  { n: 'Premium', l: 'Brand Visibility', color: '#a855f7', delay: 60 },
  { n: '24/7', l: 'Platform Exposure', color: 'var(--gold)', delay: 120 },
];

const OPPORTUNITIES = [
  {
    title: 'Sponsored Leaderboard',
    icon: <Trophy size={16} />,
    desc: 'Showcase your brand on ZOKASCORE leaderboards and gain continuous visibility among active football fans throughout the competition season.',
    features: ['Logo placement', 'Custom branding', 'Dedicated leaderboard', 'Campaign insights'],
  },
  {
    title: 'Banner Ads',
    icon: <Eye size={16} />,
    desc: 'Reach football fans across fixtures, predictions, match pages, and live experiences with premium display placements.',
    features: ['Audience targeting', 'Frequency capping', 'Brand placement', 'Performance reporting'],
  },
  {
    title: 'Match Sponsorship',
    icon: <BarChart3 size={16} />,
    desc: 'Associate your brand with high-profile football matches through dedicated sponsorship placements and branded experiences.',
    features: ['League targeting', 'Match type filtering', 'Brand placement', 'Performance reporting'],
  },
  {
    title: 'Content Partnership',
    icon: <Users size={16} />,
    desc: 'Collaborate with ZOKASCORE to create branded football content, match features, fan campaigns, and exclusive experiences.',
    features: ['Branded content', 'Social cross-posting', 'Expert co-hosting', 'Campaign insights'],
  },
  {
    title: 'Official Competition Partner',
    icon: <Globe size={16} />,
    desc: 'Become the official partner of prediction competitions, seasonal events, and special football campaigns.',
    features: ['Exclusive branding', 'Season campaigns', 'Competition sponsorship', 'Premium visibility'],
  },
];

export default function Partners() {
  injectCSS();
  const nav = useNavigate();

  return (
    <div className="pa-page">
      <SEO
        title="Partner with ZOKASCORE | Advertising, Sponsorships & Brand Collaborations"
        description="Partner with ZOKASCORE through sponsorships, advertising, branded campaigns, featured placements, and football marketing opportunities. Connect your brand with passionate football fans."
        keywords="partner with ZOKASCORE, football sponsorship, sports advertising, football marketing, brand partnerships, display advertising, sponsored content"
        path="/partners"
        robots="index,follow"
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Partners", path: "/partners" }
        ]}
      />

      <div className="pa-hdr">
        <div className="pa-wrap">
          <div className="pa-hdr-inner">
            <button className="pa-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="pa-hdr-title"><Handshake size={14} /> Partners</div>
          </div>
        </div>
      </div>

      <div className="pa-wrap">
        <div className="pa-hero">
          <h1>
            Partner With
            <br />
            <span style={{ color: "var(--gold)" }}>ZOKASCORE</span>
          </h1>
          <p>
            Build meaningful partnerships with one of the fastest-growing football
            platforms. Promote your brand through sponsorships, featured campaigns,
            match experiences, and premium advertising placements.
          </p>
        </div>

        <div className="pa-metrics">
          {METRICS.map((m, i) => (
            <div key={i} className="pa-metric" style={{ animationDelay: `${m.delay + 100}ms` }}>
              <div className="n" style={{ color: m.color }}>{m.n}</div>
              <div className="l">{m.l}</div>
            </div>
          ))}
        </div>

        <div className="pa-section-title">Advertising & Partnership Solutions</div>

        {OPPORTUNITIES.map((opp, i) => (
          <div key={i} className="pa-opp" style={{ animationDelay: `${i * 60 + 200}ms` }}>
            <h3>{opp.icon} {opp.title}</h3>
            <p>{opp.desc}</p>
            <div className="pa-opp-features">
              {opp.features.map(f => <span key={f} className="pa-opp-feat"><Zap size={8} /> {f}</span>)}
            </div>
            <a href={`mailto:streetzoka@gmail.com?subject=Partnership: ${opp.title}`} style={{ textDecoration: 'none' }}>
              <button className="pa-opp-cta"><Mail size={13} /> Start Conversation</button>
            </a>
          </div>
        ))}

        <div className="pa-cta">
          <h3>Grow With ZOKASCORE</h3>
          <p>Whether you're a global brand, local business, football organization, media company, or technology partner, we're ready to build impactful campaigns that connect with football fans.</p>
          <a href="mailto:streetzoka@gmail.com?subject=Partnership Inquiry" style={{ textDecoration: 'none' }}>
            <button className="pa-opp-cta" style={{ padding: '12px 24px', borderRadius: 12, fontSize: '.85rem' }}>
              <Handshake size={15} /> Become a Partner
            </button>
          </a>
        </div>
      </div>
    </div>
  );
}