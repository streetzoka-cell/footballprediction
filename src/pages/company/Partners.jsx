import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Handshake, Eye, BarChart3, Users, Zap, Mail, Trophy, HelpCircle } from 'lucide-react';
import SEO from '../../components/SEO';

const METRICS = [
  { n: 'Global', l: 'Football Audience', color: 'var(--primary)', delay: 0 },
  { n: 'Premium', l: 'Brand Visibility', color: 'var(--accent)', delay: 60 },
  { n: '24/7', l: 'Platform Exposure', color: 'var(--gold)', delay: 120 },
];

const OPPORTUNITIES = [
  { title: 'Sponsored Leaderboard', icon: <Trophy size={16} />, desc: 'Showcase your brand on ZOKASCORE leaderboards for continuous visibility among active football fans.', features: ['Logo placement', 'Custom branding', 'Dedicated leaderboard', 'Campaign insights'] },
  { title: 'Banner Ads', icon: <Eye size={16} />, desc: 'Reach football fans across fixtures, predictions, and match pages with premium display placements.', features: ['Audience targeting', 'Frequency capping', 'Brand placement', 'Performance reporting'] },
  { title: 'Match Sponsorship', icon: <BarChart3 size={16} />, desc: 'Associate your brand with high-profile football matches through dedicated sponsorship placements.', features: ['League targeting', 'Match type filtering', 'Brand placement', 'Performance reporting'] },
];

export default function Partners() {
  const nav = useNavigate();

  return (
    <div className="company-page">
      <SEO title="Partner with ZOKASCORE" path="/partners" />
      <div className="company-sticky-hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
        <div className="text-primary font-extrabold text-sm flex-center gap-8"><Handshake size={14} /> Partners</div>
      </div>

      <div className="company-hero-card anim-fade-up">
        <div className="company-hero-icon"><Handshake size={32} /></div>
        <h1 className="text-primary font-extrabold text-lg">Partner With <span className="text-gold">ZOKASCORE</span></h1>
        <p className="text-muted text-sm">Build meaningful partnerships with one of the fastest-growing football platforms. Promote your brand through sponsorships and premium advertising placements.</p>
      </div>

      <div className="company-grid">
        {METRICS.map((m, i) => (
          <div key={i} className="company-mini-card anim-pop" style={{ animationDelay: `${m.delay + 100}ms` }}>
            <div className="font-extrabold text-md" style={{ color: m.color }}>{m.n}</div>
            <div className="text-muted text-xs font-bold uppercase">{m.l}</div>
          </div>
        ))}
      </div>

      <h2 className="text-primary font-extrabold text-sm mb-12">Advertising & Partnership Solutions</h2>

      <div className="flex-col gap-12">
        {OPPORTUNITIES.map((opp, i) => (
          <article key={i} className="company-card anim-fade-up" style={{ animationDelay: `${i * 60 + 200}ms` }}>
            <h3 className="text-primary font-bold text-sm flex-center gap-8">{opp.icon} {opp.title}</h3>
            <p className="text-muted text-sm mb-12">{opp.desc}</p>
            <div className="flex gap-8 flex-wrap">
              {opp.features.map(f => <span key={f} className="badge badge-muted"><Zap size={8} /> {f}</span>)}
            </div>
            <a href="mailto:streetzoka@gmail.com" className="btn btn-secondary btn-sm self-start mt-12"><Mail size={13} /> Start Conversation</a>
          </article>
        ))}
      </div>

      <div className="company-directory">
        <h3>Business Directory</h3>
        <div className="dir-grid">
          <Link to="/advertise" className="dir-link"><Eye size={16} /> Advertise</Link>
          <Link to="/careers" className="dir-link"><Users size={16} /> Careers</Link>
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
        </div>
      </div>
    </div>
  );
}