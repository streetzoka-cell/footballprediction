import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Megaphone, CheckCircle, TrendingUp, Target, Users, BarChart3, Star } from 'lucide-react';
import SEO from '../../components/SEO';

const PLANS = [
  {
    name: 'Essential', price: 'KES 15K', period: '/month', featured: false,
    features: ['Up to 50K impressions/month', '1 banner placement', 'Performance reporting', 'Email support'],
    cta: 'Start Conversation',
  },
  {
    name: 'Premium Campaign', price: 'KES 50K', period: '/month', featured: true, badge: 'Most Popular',
    features: ['Up to 200K impressions/month', '3 banner placements', 'Sponsored leaderboard spot', 'Campaign insights', 'Priority support', 'A/B testing included'],
    cta: 'Request Proposal',
  },
];

export default function Advertise() {
  const nav = useNavigate();

  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "serviceType": "Sports Advertising & Sponsorships",
    "provider": {
      "@type": "Organization",
      "name": "ZOKASCORE",
      "url": "https://zokascore.xyz"
    },
    "areaServed": "Global",
    "description": "Premium advertising and partnership solutions designed to connect brands with passionate football fans."
  };

  return (
    <div className="zoka-page">
      <SEO
        title="Advertise with ZOKASCORE | Reach Football Fans Worldwide"
        description="Grow your brand with ZOKASCORE through football sponsorships, display advertising, featured campaigns, and promotional opportunities."
        keywords="advertise with ZOKASCORE, football advertising, sports marketing, football sponsorship"
        path="/advertise"
        robots="index,follow"
        structuredData={serviceSchema}
      />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><Megaphone size={14} /> Advertise</div>
          </div>
        </div>

        <article className="glass-card p-24 mb-24 text-center flex-col items-center gap-12 anim-fade-up">
          <h1 className="text-primary font-extrabold text-lg">Connect Your Brand<br />with Football Fans</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 560 }}>Premium advertising and partnership solutions designed to connect your brand with passionate football fans worldwide.</p>
        </article>

        <section className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {PLANS.map((plan, i) => (
            <div key={i} className={`glass-card p-24 flex-col gap-12 anim-pop ${plan.featured ? 'border-primary' : ''}`} style={{ animationDelay: `${i * 80 + 100}ms` }}>
              {plan.badge && <span className="badge badge-primary self-start">{plan.badge}</span>}
              <h2 className="text-primary font-extrabold text-md">{plan.name}</h2>
              <div className="font-extrabold text-primary" style={{ fontSize: 'var(--fs-2xl)' }}>{plan.price}<span className="text-muted text-sm font-normal">{plan.period}</span></div>
              <ul className="flex-col gap-8 text-muted text-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {plan.features.map(f => <li key={f} className="flex-center gap-8"><CheckCircle size={14} className="text-primary" /> {f}</li>)}
              </ul>
              <a href={`mailto:streetzoka@gmail.com?subject=Ad Inquiry: ${plan.name} Plan`} className="btn btn-primary w-full mt-8">{plan.cta}</a>
            </div>
          ))}
        </section>

        <section className="glass-card p-24 mb-16 flex-col gap-12">
          <h2 className="text-primary font-bold flex-center gap-8"><TrendingUp size={15} /> Why Advertise With Us</h2>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            {[
              { icon: <Target size={14} />, title: 'Audience Targeting', desc: 'Users are actively engaged in predictions and live scores, offering higher intent than passive social media scrolling.' },
              { icon: <Users size={14} />, title: 'Football Obsessed', desc: 'Every user is here because they love football. Your brand reaches real fans, not casual browsers.' },
              { icon: <BarChart3 size={14} />, title: 'Full Transparency', desc: 'Real-time impression and click analytics. Know exactly where your budget goes.' },
              { icon: <Star size={14} />, title: 'Premium Placement', desc: 'Ads appear natively within the platform flow — not as disruptive pop-ups or spam.' },
            ].map((w, i) => (
              <div key={i} className="glass-card p-16 flex-col gap-8">
                <h3 className="text-primary font-bold text-sm flex-center gap-8">{w.icon} {w.title}</h3>
                <p className="text-muted text-xs">{w.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex-col gap-8">
          <h2 className="sr-only">Advertising FAQ</h2>
          {[
            { q: 'What advertising formats do you support?', a: 'We offer banner ads (static and animated), sponsored leaderboard placements, and branded content sections. All ads are fully mobile-optimized.' },
            { q: 'Can I target specific leagues or countries?', a: 'Yes. We can target by football league (EPL, La Liga, etc.), user location, device type, and time of day to maximize campaign effectiveness.' },
            { q: 'What are the payment methods?', a: 'M-Pesa (Paybill), bank transfer, or PayPal for international partners. We provide official invoices for all campaigns.' },
            { q: 'Is there a minimum spend?', a: 'Our Essential plan begins at KES 15,000/month. Custom enterprise deals are available for larger budgets and specific campaign requirements.' },
          ].map((f, i) => (
            <div key={i} className="glass-card p-16 flex-col gap-4">
              <h3 className="text-primary font-bold text-sm">{f.q}</h3>
              <p className="text-muted text-xs">{f.a}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}