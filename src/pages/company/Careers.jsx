import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Briefcase, MapPin, Clock, Zap, Users, Heart, Star, Send, AlertCircle, HelpCircle, Mail } from 'lucide-react';
import SEO from '../../components/SEO';

const PERKS = [
  { icon: <Zap size={16} />, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', title: 'Move Fast', desc: 'No bureaucracy. Ship features in days, not months.' },
  { icon: <Users size={16} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', title: 'Remote First', desc: 'Collaborate from anywhere. We are globally distributed.' },
  { icon: <Heart size={16} />, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),.08)', title: 'Football Obsessed', desc: 'Work on something you genuinely love.' },
  { icon: <Star size={16} />, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.08)', title: 'Impact', desc: 'Your work directly shapes the experience of thousands of fans.' },
];

const COLLABORATIONS = [
  { title: 'Freelance Football Writer', dept: 'Content', location: 'Remote', type: 'Freelance', desc: 'We accept pitches from passionate football writers for match previews and tactical analyses.', tags: ['Writing', 'Tactics'] },
  { title: 'Community Moderator', dept: 'Community', location: 'Remote', type: 'Volunteer', desc: 'Help keep the ZOKASCORE prediction leagues safe and engaging. Earn exclusive badges.', tags: ['Discord', 'Community'] },
];

export default function Careers() {
  const nav = useNavigate();

  return (
    <div className="company-page">
      <SEO title="Careers & Collaborations" path="/careers" />
      <div className="company-sticky-hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
        <div className="text-primary font-extrabold text-sm flex-center gap-8"><Briefcase size={14} /> Collaborate</div>
      </div>

      <div className="company-hero-card anim-fade-up">
        <div className="company-hero-icon"><Briefcase size={32} /></div>
        <h1 className="text-primary font-extrabold text-lg">Build the Future of Football</h1>
        <p className="text-muted text-sm">ZOKASCORE is an independent, lean operation. We are always open to freelance collaborations and community moderators.</p>
      </div>

      <div className="company-card flex-center gap-12" style={{ background: 'rgba(var(--warning-rgb), 0.05)', borderColor: 'rgba(var(--warning-rgb), 0.2)' }}>
        <AlertCircle size={20} className="text-warning" />
        <p className="text-secondary text-sm"><strong className="text-primary">Notice:</strong> We do not currently have any open full-time W-2 employment positions.</p>
      </div>

      <div className="company-grid">
        {PERKS.map((p, i) => (
          <div key={i} className="company-mini-card anim-pop" style={{ animationDelay: `${i * 60 + 100}ms` }}>
            <div className="icon-wrap" style={{ background: p.bg, color: p.color }}>{p.icon}</div>
            <h3>{p.title}</h3>
            <p>{p.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="text-primary font-extrabold text-sm mb-12">Freelance & Community Opportunities</h2>

      <div className="flex-col gap-12">
        {COLLABORATIONS.map((job, i) => (
          <article key={i} className="company-card anim-fade-up" style={{ animationDelay: `${i * 60 + 300}ms` }}>
            <div className="flex-between mb-8">
              <div>
                <h3 className="text-primary font-bold text-sm">{job.title}</h3>
                <span className="badge badge-muted mt-4">{job.dept}</span>
              </div>
            </div>
            <p className="text-muted text-sm mb-12">{job.desc}</p>
            <div className="flex gap-12 flex-wrap mb-12">
              <span className="text-muted text-xs flex-center gap-4"><MapPin size={11} /> {job.location}</span>
              <span className="text-muted text-xs flex-center gap-4"><Clock size={11} /> {job.type}</span>
              {job.tags.map(t => <span key={t} className="badge badge-muted">{t}</span>)}
            </div>
            <a href="mailto:streetzoka@gmail.com" className="btn btn-primary btn-sm self-start"><Send size={13} /> Pitch / Apply</a>
          </article>
        ))}
      </div>

      <div className="company-directory">
        <h3>Business Directory</h3>
        <div className="dir-grid">
          <Link to="/team" className="dir-link"><Users size={16} /> The Team</Link>
          <Link to="/advertise" className="dir-link"><Briefcase size={16} /> Advertise</Link>
          <Link to="/contact" className="dir-link"><Mail size={16} /> Contact</Link>
        </div>
      </div>
    </div>
  );
}