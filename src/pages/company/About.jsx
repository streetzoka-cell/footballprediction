import { useNavigate } from 'react-router-dom';
import {
  Target, Trophy, Users, Globe, Shield, Zap, Star,
  ArrowLeft, Award, Clock, Heart, MessageCircle, Phone, Mail, BarChart3
} from 'lucide-react';
import SEO from '../../components/SEO';

const STATS = [
  { n: 'Global', l: 'Football Audience', color: 'var(--accent)', icon: <Users size={18} />, delay: 0 },
  { n: 'Real-Time', l: 'Match Tracking', color: 'var(--accent)', icon: <Target size={18} />, delay: 60 },
  { n: '15+', l: 'Leagues Covered', color: 'var(--gold)', icon: <Trophy size={18} />, delay: 120 },
  { n: '100%', l: 'Independent Platform', color: 'var(--accent)', icon: <BarChart3 size={18} />, delay: 180 },
];

const VALUES = [
  { icon: <Target size={18} />, color: 'var(--primary)', bg: 'rgba(var(--primary-rgb),.08)', title: 'Accuracy First', desc: 'We reward precise score predictions over lucky guesses. Exact scores earn maximum points.' },
  { icon: <Shield size={18} />, color: 'var(--accent)', bg: 'rgba(var(--accent-rgb),.08)', title: 'Fair Play', desc: 'Anti-cheat systems and transparent scoring ensure every player competes on equal ground.' },
  { icon: <Zap size={18} />, color: 'var(--gold)', bg: 'rgba(var(--gold-rgb),.08)', title: 'Real-Time', desc: 'Live scores, instant leaderboard updates, and real-time match tracking.' },
  { icon: <Heart size={18} />, color: 'var(--danger)', bg: 'rgba(var(--danger-rgb),.08)', title: 'Community', desc: 'Built by football fans, for football fans. Your feedback shapes every feature.' },
];

const TIMELINE = [
  { year: 'Inception', text: 'ZOKASCORE founded with a mission to make football predictions social, competitive, and rewarding.', sub: 'Platform architecture and initial vision established' },
  { year: 'Growth', text: 'Launched daily & weekly leaderboards with real-time scoring and G.O.A.T rankings.', sub: 'Integrated major football leagues worldwide' },
  { year: 'Expansion', text: 'Introduced expert predictions, community voting, and accuracy tracking features.', sub: 'Platform audience rapidly expanded' },
  { year: 'Innovation', text: 'Added live experiences, highlights, and premium match features.', sub: 'Continuous improvement of the user experience' },
  { year: 'Today', text: 'Scaling across Africa and beyond. Mobile apps, premium features, and pro leagues coming soon.', sub: 'The journey continues...' },
];

export default function About() {
  const nav = useNavigate();

  return (
    <div className="zoka-page">
      <SEO
        title="About ZOKASCORE | Football Predictions, Live Scores & Match Insights"
        description="Learn about ZOKASCORE, the football platform built for match predictions, live scores, fixtures, standings, and interactive football competitions. Discover our mission and how we're making football more exciting for fans worldwide."
        keywords="ZOKASCORE, about ZOKASCORE, football predictions, live scores, football fixtures, football standings, football platform, sports community"
        path="/about"
        robots="index,follow"
         />

      <div className="zoka-wrap">
        <div className="glass sticky top-0 z-sticky mb-16">
          <div className="flex-between p-12">
            <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="text-primary font-extrabold text-sm flex-center gap-8"><Globe size={14} /> About Us</div>
          </div>
        </div>

        <div className="glass-card p-24 mb-16 text-center flex-col items-center gap-12 anim-fade-up">
          <div className="flex-center text-primary" style={{ width: 72, height: 72, borderRadius: 'var(--r-20)', background: 'rgba(var(--primary-rgb), 0.1)', animation: 'zk-bounce 4s ease-in-out infinite' }}>
            <Target size={32} />
          </div>
          <h1 className="text-primary font-extrabold text-lg">Football Prediction,<br />Reimagined</h1>
          <p className="text-muted text-sm" style={{ maxWidth: 560 }}>ZOKASCORE is a premier football platform where fans compete on daily leaderboards, track match predictions, and experience live scores, fixtures, and standings in real-time.</p>
        </div>

        <div className="grid gap-12 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {STATS.map((s, i) => (
            <div key={i} className="glass-card p-16 flex-col items-center gap-4 anim-pop" style={{ animationDelay: `${s.delay}ms` }}>
              <div style={{ color: s.color }}>{s.icon}</div>
              <div className="font-extrabold text-md" style={{ color: s.color }}>{s.n}</div>
              <div className="text-muted text-xs font-bold uppercase">{s.l}</div>
            </div>
          ))}
        </div>

        <div className="glass-card p-24 mb-16 flex-col gap-8 anim-fade-up">
          <h2 className="text-primary font-bold flex-center gap-8"><Star size={15} className="text-primary" /> Our Mission</h2>
          <p className="text-secondary text-sm">We believe every football fan deserves a platform that celebrates knowledge of the game — not just luck. ZOKASCORE was built to transform passive match-watching into an engaging, competitive experience where your understanding of teams, form, and tactics directly translates into rankings and recognition.</p>
        </div>

        <div className="glass-card p-24 mb-16 flex-col gap-12 anim-fade-up">
          <h2 className="text-primary font-bold flex-center gap-8"><Award size={15} className="text-gold" /> Our Values</h2>
          <div className="grid gap-12" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            {VALUES.map((v, i) => (
              <div key={i} className="glass-card p-16 flex-col gap-8">
                <div className="flex-center" style={{ width: 40, height: 40, borderRadius: 'var(--r-10)', background: v.bg, color: v.color }}>{v.icon}</div>
                <h4 className="text-primary font-bold text-sm">{v.title}</h4>
                <p className="text-muted text-xs">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-24 mb-16 flex-col gap-12 anim-fade-up">
          <h2 className="text-primary font-bold flex-center gap-8"><Clock size={15} className="text-accent" /> Our Journey</h2>
          <div className="flex-col gap-16 pl-16 relative">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border"></div>
            {TIMELINE.map((t, i) => (
              <div key={i} className="relative pl-16">
                <div className="absolute left-0 top-4 w-2 h-2 rounded-full bg-primary"></div>
                <div className="text-accent text-xs font-bold uppercase">{t.year}</div>
                <div className="text-primary font-bold text-sm">{t.text}</div>
                <div className="text-muted text-xs">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-24 flex-col items-center gap-12 text-center anim-fade-up" style={{ background: 'rgba(var(--primary-rgb), 0.03)', borderColor: 'rgba(var(--primary-rgb), 0.15)' }}>
          <h3 className="text-primary font-bold">Get In Touch</h3>
          <div className="flex gap-8 flex-wrap justify-center">
            <a href="mailto:streetzoka@gmail.com" className="btn btn-secondary btn-sm"><Mail size={13} /> streetzoka@gmail.com</a>
            <a href="tel:+254721635810" className="btn btn-secondary btn-sm"><Phone size={13} /> +254 721 635 810</a>
            <button className="btn btn-primary btn-sm" onClick={() => nav('/contact')}><MessageCircle size={13} /> Contact Form</button>
          </div>
        </div>
      </div>
    </div>
  );
}