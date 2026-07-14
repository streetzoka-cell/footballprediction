// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/company/Advertise.jsx
// ═════════════════════════════════════════════════════════════════════════════════

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Megaphone, Eye, BarChart3, Zap, Target, Users, Trophy, Star, Mail, CheckCircle, TrendingUp } from 'lucide-react';
import SEO from '../../components/SEO';

const injectCSS = () => {
  if (document.getElementById('co-adv-css')) return;
  const s = document.createElement('style');
  s.id = 'co-adv-css';
  s.textContent = `
@keyframes ad-fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes ad-pop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}

.ad-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:80px}
.ad-wrap{max-width:700px;margin:0 auto;padding:0 18px}
.ad-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.ad-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.ad-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}
.ad-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.ad-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:800;color:var(--text-primary)}

.ad-hero{text-align:center;padding:36px 0 28px;animation:ad-fade-up .4s ease both}
.ad-hero h1{margin:0 0 6px;font-size:1.6rem;font-weight:900;color:var(--text-primary)}
.ad-hero p{margin:0;font-size:.84rem;color:var(--text-muted);font-weight:600;line-height:1.5;max-width:540px;margin-left:auto;margin-right:auto}

.ad-plans{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px}
.ad-plan{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:22px;transition:all .15s;animation:ad-pop .35s cubic-bezier(.34,1.56,.64,1) both;position:relative;overflow:hidden}
.ad-plan:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15)}
.ad-plan.featured{border-color:rgba(0,230,118,.2)}
.ad-plan.featured::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--accent),#34d399)}
.ad-plan-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px}
.ad-plan h3{margin:0 0 4px;font-size:1rem;font-weight:900;color:var(--text-primary)}
.ad-plan .price{margin:8px 0 14px;font-size:2rem;font-weight:900;font-family:var(--font-display);line-height:1}
.ad-plan .price span{font-size:.8rem;font-weight:600;color:var(--text-muted)}
.ad-plan-features{list-style:none;padding:0;margin:0 0 18px}
.ad-plan-features li{display:flex;align-items:flex-start;gap:8px;padding:5px 0;font-size:.78rem;color:var(--text-muted);font-weight:600}
.ad-plan-features li svg{flex-shrink:0;margin-top:2px;color:var(--accent)}
.ad-plan-btn{width:100%;padding:12px;border-radius:11px;font-size:.84rem;font-weight:800;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;font-family:inherit}
.ad-plan-btn:active{transform:scale(.97)}

.ad-why{margin-bottom:28px}
.ad-why h2{font-size:.95rem;font-weight:900;color:var(--text-primary);margin:0 0 14px}
.ad-why-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ad-why-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:16px;animation:ad-fade-up .3s ease both}
.ad-why-item h4{margin:0 0 4px;font-size:.82rem;font-weight:800;color:var(--text-primary);display:flex;align-items:center;gap:6px}
.ad-why-item p{margin:0;font-size:.72rem;color:var(--text-muted);font-weight:600;line-height:1.5}

.ad-faq{margin-top:8px}
.ad-faq-item{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:8px;animation:ad-fade-up .3s ease both}
.ad-faq-q{font-size:.82rem;font-weight:800;color:var(--text-primary);margin-bottom:4px}
.ad-faq-a{font-size:.76rem;color:var(--text-muted);font-weight:600;line-height:1.6}

@media(max-width:480px){
  .ad-plans{grid-template-columns:1fr}
  .ad-why-grid{grid-template-columns:1fr}
  .ad-hero h1{font-size:1.4rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

const PLANS = [
  {
    name: 'Starter',
    price: 'KES 15K',
    period: '/month',
    featured: false,
    features: [
      'Up to 50K impressions/month',
      '1 banner placement',
      'Basic click tracking',
      'Email support',
    ],
    cta: 'Get Started',
    ctaBg: 'var(--bg-surface)',
    ctaColor: 'var(--text-primary)',
    ctaBorder: '1px solid var(--border)',
  },
  {
    name: 'Growth',
    price: 'KES 50K',
    period: '/month',
    featured: true,
    badge: 'Most Popular',
    badgeColor: 'var(--accent)',
    badgeBg: 'rgba(0,230,118,.1)',
    features: [
      'Up to 200K impressions/month',
      '3 banner placements',
      'Sponsored leaderboard spot',
      'Advanced analytics dashboard',
      'Priority support',
      'A/B testing included',
    ],
    cta: 'Start Growing',
    ctaBg: 'linear-gradient(135deg,#10b981,#059669)',
    ctaColor: '#fff',
    ctaBorder: 'none',
    ctaShadow: '0 2px 12px rgba(16,185,129,.2)',
  },
];

export default function Advertise() {
  injectCSS();
  const nav = useNavigate();

  return (
    <div className="ad-page">
      <SEO
        title="Advertise With ZOKASCORE | Sports Marketing"
        description="Promote your brand to over 50,000 engaged football fans with ZOKASCORE. Explore our premium banner ads and sponsored leaderboard marketing opportunities."
        keywords="advertise on ZOKASCORE, sports marketing, football ads, banner advertising, sponsored leaderboards"
        path="/advertise"
        robots="index,follow"
      />

      <div className="ad-hdr">
        <div className="ad-wrap">
          <div className="ad-hdr-inner">
            <button className="ad-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="ad-hdr-title"><Megaphone size={14} /> Advertise</div>
          </div>
        </div>
      </div>

      <div className="ad-wrap">
        <div className="ad-hero">
          <h1>Put Your Brand<br />In Front of Football Fans</h1>
          <p>Targeted, measurable advertising to one of Africa's most engaged football prediction communities.</p>
        </div>

        <div className="ad-plans">
          {PLANS.map((plan, i) => (
            <div key={i} className={`ad-plan${plan.featured ? ' featured' : ''}`} style={{ animationDelay: `${i * 80 + 100}ms` }}>
              {plan.badge && <span className="ad-plan-badge" style={{ background: plan.badgeBg, color: plan.badgeColor, border: `1px solid ${plan.badgeBg}` }}>{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <div className="price">{plan.price}<span>{plan.period}</span></div>
              <ul className="ad-plan-features">
                {plan.features.map(f => (
                  <li key={f}><CheckCircle size={14} /> {f}</li>
                ))}
              </ul>
              <a href={`mailto:streetzoka@gmail.com?subject=Ad Inquiry: ${plan.name} Plan`} style={{ textDecoration: 'none' }}>
                <button className="ad-plan-btn" style={{ background: plan.ctaBg, color: plan.ctaColor, border: plan.ctaBorder, boxShadow: plan.ctaShadow || 'none' }}>
                  {plan.cta}
                </button>
              </a>
            </div>
          ))}
        </div>

        <div className="ad-why">
          <h2><TrendingUp size={15} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Why Advertise With Us</h2>
          <div className="ad-why-grid">
            {[
              { icon: <Target size={14} />, title: 'High Intent Audience', desc: 'Users are actively predicting — not passively scrolling. Higher engagement than social ads.' },
              { icon: <Users size={14} />, title: 'Football Obsessed', desc: 'Every user is here because they love football. Your brand reaches real fans, not casual browsers.' },
              { icon: <BarChart3 size={14} />, title: 'Full Transparency', desc: 'Real-time impression and click analytics. Know exactly where your budget goes.' },
              { icon: <Star size={14} />, title: 'Premium Placement', desc: 'Ads appear natively within the prediction flow — not as disruptive pop-ups or spam.' },
            ].map((w, i) => (
              <div key={i} className="ad-why-item" style={{ animationDelay: `${i * 60 + 300}ms` }}>
                <h4>{w.icon} {w.title}</h4>
                <p>{w.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ad-faq">
          {[
            { q: 'What ad formats do you support?', a: 'We offer banner ads (static and animated), sponsored leaderboard placements, and branded content sections. All ads are mobile-optimized.' },
            { q: 'Can I target specific leagues or countries?', a: 'Yes. We can target by football league (EPL, La Liga, etc.), user location, device type, and time of day.' },
            { q: 'What are the payment methods?', a: 'M-Pesa (Paybill), bank transfer, or PayPal for international partners. We provide invoices for all campaigns.' },
            { q: 'Is there a minimum spend?', a: 'Our Starter plan begins at KES 15,000/month. Custom enterprise deals are available for larger budgets.' },
          ].map((f, i) => (
            <div key={i} className="ad-faq-item" style={{ animationDelay: `${i * 50 + 400}ms` }}>
              <div className="ad-faq-q">{f.q}</div>
              <div className="ad-faq-a">{f.a}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}