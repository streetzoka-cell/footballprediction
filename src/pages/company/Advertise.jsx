import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Megaphone, CheckCircle, TrendingUp, Target, Users, BarChart3, Star, Mail, HelpCircle } from 'lucide-react';
import SEO from '../../components/SEO';

const PLANS = [
  { name: 'Essential', price: 'KES 15K', period: '/month', featured: false, features: ['Up to 50K impressions/month', '1 banner placement', 'Performance reporting', 'Email support'], cta: 'Start Conversation' },
  { name: 'Premium Campaign', price: 'KES 50K', period: '/month', featured: true, badge: 'Most Popular', features: ['Up to 200K impressions/month', '3 banner placements', 'Sponsored leaderboard spot', 'Campaign insights', 'Priority support', 'A/B testing included'], cta: 'Request Proposal' },
];

export default function Advertise() {
  const nav = useNavigate();

  return (
    <div className="company-page">
      <SEO title="Advertise with ZOKASCORE" path="/advertise" />
      <div className="company-sticky-hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
        <div className="text-primary font-extrabold text-sm flex-center gap-8"><Megaphone size={14} /> Advertise</div>
      </div>

      <div className="company-hero-card anim-fade-up">
        <div className="company-hero-icon"><Megaphone size={32} /></div>
        <h1 className="text-primary font-extrabold text-lg">Connect Your Brand with Football Fans</h1>
        <p className="text-muted text-sm">Premium advertising and partnership solutions designed to connect your brand with passionate football fans worldwide.</p>
      </div>

      <div className="company-grid">
        {PLANS.map((plan, i) => (
          <div key={i} className={`pricing-card anim-pop ${plan.featured ? 'featured' : ''}`} style={{ animationDelay: `${i * 80 + 100}ms` }}>
            {plan.badge && <span className="badge badge-primary self-start">{plan.badge}</span>}
            <h2 className="text-primary font-extrabold text-md">{plan.name}</h2>
            <div className="pricing-price">{plan.price}<span>{plan.period}</span></div>
            <ul className="company-list">
              {plan.features.map(f => <li key={f} className="flex-center gap-8"><CheckCircle size={14} className="text-primary" /> {f}</li>)}
            </ul>
            <a href="mailto:streetzoka@gmail.com" className="btn btn-primary w-full mt-8">{plan.cta}</a>
          </div>
        ))}
      </div>

      <div className="company-card anim-fade-up">
        <h2><TrendingUp size={15} /> Why Advertise With Us</h2>
        <div className="company-grid">
          <div className="company-mini-card">
            <div className="icon-wrap" style={{ background: 'rgba(var(--primary-rgb),.08)', color: 'var(--primary)' }}><Target size={14} /></div>
            <h3>Audience Targeting</h3>
            <p>Users are actively engaged in predictions and live scores, offering higher intent than passive social media scrolling.</p>
          </div>
          <div className="company-mini-card">
            <div className="icon-wrap" style={{ background: 'rgba(var(--accent-rgb),.08)', color: 'var(--accent)' }}><Users size={14} /></div>
            <h3>Football Obsessed</h3>
            <p>Every user is here because they love football. Your brand reaches real fans, not casual browsers.</p>
          </div>
        </div>
      </div>

      <div className="company-directory">
        <h3>Business Directory</h3>
        <div className="dir-grid">
          <Link to="/partners" className="dir-link"><Star size={16} /> Partnerships</Link>
          <Link to="/contact" className="dir-link"><Mail size={16} /> Contact Us</Link>
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
        </div>
      </div>
    </div>
  );
}