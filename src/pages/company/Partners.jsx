import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Handshake, Eye, BarChart3, Users, Zap, Mail, Trophy } from 'lucide-react';
import SEO from '../../components/SEO';

const METRICS = [
  { n: 'Global', l: 'Football Audience', color: 'var(--primary)', delay: 0 },
  { n: 'Premium', l: 'Brand Visibility', color: 'var(--accent)', delay: 60 },
  { n: '24/7', l: 'Platform Exposure', color: 'var(--gold)', delay: 120 },
];

const OPPORTUNITIES = [
  { title: 'Sponsored Leaderboard', icon: <Trophy size={16} />, desc: 'Showcase your brand on ZOKASCORE leaderboards and gain continuous visibility among active football fans throughout the competition season.', features: ['Logo placement', 'Custom branding', 'Dedicated leaderboard', 'Campaign insights'] },
  { title: 'Banner Ads', icon: <Eye size={16} />, desc: 'Reach football fans across fixtures, predictions, match pages, and live experiences with premium display placements.', features: ['Audience targeting', 'Frequency capping', 'Brand placement', 'Performance reporting'] },
  { title: 'Match Sponsorship', icon: <BarChart3 size={16} />, desc: 'Associate your brand with high-profile football matches through dedicated sponsorship placements and branded experiences.', features: ['League targeting', 'Match type filtering', 'Brand placement', 'Performance reporting'] },
  { title: 'Content Partnership', icon: <Users size={16} />, desc: 'Collaborate with ZOKASCORE to create branded football content, match features, fan campaigns, and exclusive experiences.', features: ['Branded content', 'Social cross-posting', 'Expert co-hosting', 'Campaign insights'] },
  { title: 'Official Competition Partner', icon: <Globe size={16} />, desc: 'Become the official partner of prediction competitions, seasonal events, and special football campaigns.', features: ['Exclusive branding', 'Season campaigns', 'Competition sponsorship', 'Premium visibility'] },
];

export default function Partners() {
  const nav = useNavigate();

  return (
    <div className="zoka-page">
      <SEO
        title="Partner with ZOKASCORE | Advertising, Sponsorships & Brand Collaborations"
        description="Partner with ZOKASCORE through sponsorships, advertising, branded campaigns, featured placements, and football marketing opportunities. Connect your brand with passionate football fans."
        keywords="partner with ZOKASCORE, football sponsorship, sports advertising, football marketing, brand partnerships, display advertising, sponsored content"
        path="/partners"
        robots="index,follow"
         />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><Handshake size={14} /> Partners</div>
          </div>
        </div>

        <div className="glass-card p-24 mb-24 text-center flex-col items-center gap-12 anim-fade-up">
          <h1 className="text-primary font-extrabold text-lg">Partner With<br /><span className="text-gold">ZOKASCORE</span></h1>
          <p className="text-muted text-sm" style={{ maxWidth: 560 }}>Build meaningful partnerships with one of the fastest-growing football platforms. Promote your brand through sponsorships, featured campaigns, match experiences, and premium advertising placements.</p>
        </div>

        <div className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {METRICS.map((m, i) => (
            <div key={i} className="glass-card p-16 flex-col items-center gap-4 text-center anim-pop" style={{ animationDelay: `${m.delay + 100}ms` }}>
              <div className="font-extrabold text-md" style={{ color: m.color }}>{m.n}</div>
              <div className="text-muted text-xs font-bold uppercase">{m.l}</div>
            </div>
          ))}
        </div>

        <div className="text-primary font-extrabold text-sm mb-12">Advertising & Partnership Solutions</div>

        <div className="flex-col gap-12">
          {OPPORTUNITIES.map((opp, i) => (
            <div key={i} className="glass-card p-20 flex-col gap-12 anim-fade-up" style={{ animationDelay: `${i * 60 + 200}ms` }}>
              <h3 className="text-primary font-bold text-sm flex-center gap-8">{opp.icon} {opp.title}</h3>
              <p className="text-muted text-sm">{opp.desc}</p>
              <div className="flex gap-8 flex-wrap">
                {opp.features.map(f => <span key={f} className="badge badge-muted"><Zap size={8} /> {f}</span>)}
              </div>
              <a href={`mailto:streetzoka@gmail.com?subject=Partnership: ${opp.title}`} className="btn btn-secondary btn-sm self-start mt-4"><Mail size={13} /> Start Conversation</a>
            </div>
          ))}
        </div>

        <div className="glass-card p-24 mt-24 text-center flex-col items-center gap-12 anim-pop" style={{ background: 'rgba(var(--gold-rgb), 0.03)', borderColor: 'rgba(var(--gold-rgb), 0.15)' }}>
          <h3 className="text-primary font-bold">Grow With ZOKASCORE</h3>
          <p className="text-muted text-sm" style={{ maxWidth: 480 }}>Whether you're a global brand, local business, football organization, media company, or technology partner, we're ready to build impactful campaigns that connect with football fans.</p>
          <a href="mailto:streetzoka@gmail.com?subject=Partnership Inquiry" className="btn btn-primary"><Handshake size={15} /> Become a Partner</a>
        </div>
      </div>
    </div>
  );
}