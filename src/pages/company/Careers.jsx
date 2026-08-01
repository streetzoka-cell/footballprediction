import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, Clock, Zap, Code, Palette, BarChart3, Shield, Users, Star, Heart, Send } from 'lucide-react';
import SEO from '../../components/SEO';

const PERKS = [
  { icon: <Zap size={16} />, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', title: 'Move Fast', desc: 'No bureaucracy. Ship features in days, not months.' },
  { icon: <Users size={16} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', title: 'Remote First', desc: 'Work from anywhere. We\'re fully distributed.' },
  { icon: <Heart size={16} />, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),.08)', title: 'Football Obsessed', desc: 'Work on something you genuinely love.' },
  { icon: <Star size={16} />, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.08)', title: 'Equity Available', desc: 'Early team members get equity options.' },
];

const JOBS = [
  { title: 'Senior Frontend Engineer', dept: 'Engineering', color: 'var(--accent)', location: 'Remote', type: 'Full-time', desc: 'Build the prediction UI, leaderboard system, and real-time match experience. You\'ll work with React, Firebase, and modern CSS to create the smoothest football prediction platform.', tags: ['React', 'Firebase', 'CSS', 'TypeScript'] },
  { title: 'Backend / Data Engineer', dept: 'Engineering', color: 'var(--accent)', location: 'Remote', type: 'Full-time', desc: 'Design and maintain our data pipeline — from football API ingestion to real-time scoring, leaderboard calculations, and analytics. Experience with Cloud Functions and Firestore is a plus.', tags: ['Node.js', 'Firebase', 'Python', 'Data'] },
  { title: 'Football Content Creator', dept: 'Content', color: 'var(--gold)', location: 'Remote', type: 'Part-time / Contract', desc: 'Create match previews, highlight reels, prediction analysis content, and social media posts. You live and breathe football and know how to make it engaging.', tags: ['Video', 'Writing', 'Social Media', 'Football'] },
  { title: 'Community & Social Manager', dept: 'Growth', color: 'var(--primary)', location: 'Remote', type: 'Full-time', desc: 'Grow and manage the ZOKASCORE community across social platforms, Discord, and in-app. You\'ll run engagement campaigns, moderate discussions, and be the voice of the brand.', tags: ['Social Media', 'Community', 'Discord', 'Growth'] },
];

export default function Careers() {
  const nav = useNavigate();

  return (
    <div className="zoka-page">
      <SEO
        title="Careers at ZOKASCORE | Build the Future of Football"
        description="Explore career opportunities at ZOKASCORE. Join a team building innovative football experiences through live scores, predictions, fixtures, statistics, and fan engagement."
        keywords="ZOKASCORE careers, football technology jobs, sports tech careers, software engineering, product design, marketing careers, remote opportunities, football platform"
        path="/careers"
        robots="index,follow"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Careers", path: "/careers" }]}
      />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><Briefcase size={14} /> Careers</div>
          </div>
        </div>

        <div className="glass-card p-24 mb-24 text-center flex-col items-center gap-12 anim-fade-up">
          <h1 className="text-primary font-extrabold text-lg">Build the Future of Football with ZOKASCORE</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 560 }}>Join a team building innovative football experiences through live scores, predictions, and fan engagement. We're looking for passionate people who love football and great software.</p>
        </div>

        <div className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PERKS.map((p, i) => (
            <div key={i} className="glass-card p-16 flex-col items-center gap-8 text-center anim-pop" style={{ animationDelay: `${i * 60 + 100}ms` }}>
              <div className="flex-center" style={{ width: 40, height: 40, borderRadius: 'var(--r-10)', background: p.bg, color: p.color }}>{p.icon}</div>
              <h4 className="text-primary font-bold text-sm">{p.title}</h4>
              <p className="text-muted text-xs">{p.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-primary font-extrabold text-sm mb-12">Open Positions</div>

        <div className="flex-col gap-12">
          {JOBS.map((job, i) => (
            <div key={i} className="glass-card p-20 flex-col gap-12 anim-fade-up" style={{ animationDelay: `${i * 60 + 300}ms` }}>
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
              <a href={`mailto:streetzoka@gmail.com?subject=Application: ${job.title}`} className="btn btn-primary btn-sm self-start mt-8"><Send size={13} /> Apply Now</a>
            </div>
          ))}
        </div>

        <div className="glass-card p-24 mt-24 text-center flex-col items-center gap-12 anim-pop" style={{ background: 'rgba(var(--accent-rgb), 0.03)', borderColor: 'rgba(var(--accent-rgb), 0.15)' }}>
          <h3 className="text-primary font-bold">Don't See Your Role?</h3>
          <p className="text-muted text-sm" style={{ maxWidth: 480 }}>We're always looking for talented people. Send us your portfolio and tell us how you can contribute to ZOKASCORE.</p>
          <a href="mailto:streetzoka@gmail.com?subject=General Application" className="btn btn-primary"><Send size={14} /> Send Open Application</a>
        </div>
      </div>
    </div>
  );
}