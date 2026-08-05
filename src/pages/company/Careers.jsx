import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, Clock, Zap, Code, Palette, BarChart3, Shield, Users, Star, Heart, Send, AlertCircle } from 'lucide-react';
import SEO from '../../components/SEO';

const PERKS = [
  { icon: <Zap size={16} />, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', title: 'Move Fast', desc: 'No bureaucracy. Ship features in days, not months.' },
  { icon: <Users size={16} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', title: 'Remote First', desc: 'Collaborate from anywhere. We are globally distributed.' },
  { icon: <Heart size={16} />, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),.08)', title: 'Football Obsessed', desc: 'Work on something you genuinely love.' },
  { icon: <Star size={16} />, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.08)', title: 'Impact', desc: 'Your work directly shapes the experience of thousands of fans.' },
];

// ★ FIX: Replaced fake corporate jobs with Freelance/Community collaborations
const COLLABORATIONS = [
  { title: 'Freelance Football Writer', dept: 'Content', color: 'var(--gold)', location: 'Remote', type: 'Freelance / Pitch-based', desc: 'We are not hiring full-time staff, but we accept pitches from passionate football writers for match previews, tactical analyses, and transfer rumors on our News Hub.', tags: ['Writing', 'Tactics', 'Freelance'] },
  { title: 'Community Moderator', dept: 'Community', color: 'var(--accent)', location: 'Remote', type: 'Volunteer / Perks', desc: 'Help keep the ZOKASCORE prediction leagues and Discord safe, engaging, and fun. Moderators earn exclusive profile badges and early access to new features.', tags: ['Discord', 'Community', 'Moderation'] },
  { title: 'Data & API Integrators', dept: 'Engineering', color: 'var(--primary)', location: 'Remote', type: 'Open Source / Bounty', desc: 'Occasionally we open bounties for specific API integrations, data scraping, or normalization scripts for niche football leagues.', tags: ['Node.js', 'Python', 'APIs'] },
];

export default function Careers() {
  const nav = useNavigate();

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Careers & Collaborations at ZOKASCORE",
    "description": "ZOKASCORE is a lean, independent team. While not actively hiring full-time, we are open to freelance collaborations and community moderators."
  };

  return (
    <div className="zoka-page">
      <SEO
        title="Careers & Collaborations | ZOKASCORE"
        description="ZOKASCORE is an independent, lean team. We are not currently hiring full-time, but explore freelance, community, and partnership collaborations here."
        keywords="ZOKASCORE careers, freelance football writer, sports tech community, remote football jobs"
        path="/careers"
        robots="index,follow"
        structuredData={pageSchema}
      />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><Briefcase size={14} /> Collaborate</div>
          </div>
        </div>

        <article className="glass-card p-24 mb-24 text-center flex-col items-center gap-12 anim-fade-up">
          <h1 className="text-primary font-extrabold text-lg">Build the Future of Football</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 600 }}>
            ZOKASCORE is currently an independent, lean operation. While we are <strong className="text-primary">not actively hiring</strong> for full-time corporate roles, we are always open to freelance collaborations, community moderators, and strategic partnerships.
          </p>
        </article>

        <div className="glass-card p-16 mb-24 flex-center gap-12 text-center anim-fade-up" style={{ background: 'rgba(var(--warning-rgb), 0.05)', borderColor: 'rgba(var(--warning-rgb), 0.2)' }}>
          <AlertCircle size={20} className="text-warning" />
          <p className="text-secondary text-sm" style={{ margin: 0 }}>
            <strong className="text-primary">Notice:</strong> We do not currently have any open full-time or part-time W-2 employment positions. Please only reach out via the collaboration channels below.
          </p>
        </div>

        <section className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PERKS.map((p, i) => (
            <div key={i} className="glass-card p-16 flex-col items-center gap-8 text-center anim-pop" style={{ animationDelay: `${i * 60 + 100}ms` }}>
              <div className="flex-center" style={{ width: 40, height: 40, borderRadius: 'var(--r-10)', background: p.bg, color: p.color }}>{p.icon}</div>
              <h3 className="text-primary font-bold text-sm">{p.title}</h3>
              <p className="text-muted text-xs">{p.desc}</p>
            </div>
          ))}
        </section>

        <h2 className="text-primary font-extrabold text-sm mb-12">Freelance & Community Opportunities</h2>

        <section className="flex-col gap-12">
          {COLLABORATIONS.map((job, i) => (
            <article key={i} className="glass-card p-20 flex-col gap-12 anim-fade-up" style={{ animationDelay: `${i * 60 + 300}ms` }}>
              <div className="flex-between">
                <div>
                  <h3 className="text-primary font-bold text-sm">{job.title}</h3>
                  <span className="badge badge-muted mt-4">{job.dept}</span>
                </div>
              </div>
              <p className="text-muted text-sm">{job.desc}</p>
              <div className="flex gap-12 flex-wrap">
                <span className="text-muted text-xs flex-center gap-4"><MapPin size={11} /> {job.location}</span>
                <span className="text-muted text-xs flex-center gap-4"><Clock size={11} /> {job.type}</span>
                {job.tags.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
              </div>
              <a href={`mailto:streetzoka@gmail.com?subject=Collaboration: ${job.title}`} className="btn btn-primary btn-sm self-start mt-8"><Send size={13} /> Pitch / Apply</a>
            </article>
          ))}
        </section>

        <footer className="glass-card p-24 mt-24 text-center flex-col items-center gap-12 anim-pop" style={{ background: 'rgba(var(--accent-rgb), 0.03)', borderColor: 'rgba(var(--accent-rgb), 0.15)' }}>
          <h3 className="text-primary font-bold">Want to Partner Instead?</h3>
          <p className="text-muted text-sm" style={{ maxWidth: 480 }}>If you are a brand, agency, or football organization looking for sponsorships or advertising, visit our Partners page.</p>
          <button onClick={() => nav('/partners')} className="btn btn-primary"><Zap size={14} /> View Partnerships</button>
        </footer>
      </div>
    </div>
  );
}