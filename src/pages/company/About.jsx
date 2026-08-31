import { useNavigate, Link } from 'react-router-dom';
import { Target, Shield, Zap, Heart, Star, ArrowLeft, Globe, Award, Clock, Mail, Phone, MessageCircle, HelpCircle, Users, Briefcase } from 'lucide-react';
import SEO from '../../components/SEO';

const TIMELINE = [
  { year: 'Inception', text: 'ZOKASCORE founded.', sub: 'Vision established' },
  { year: 'Growth', text: 'Launched daily leaderboards.', sub: 'Integrated major leagues' },
  { year: 'Today', text: 'Scaling globally.', sub: 'Mobile apps coming soon' },
];

export default function About() {
  const nav = useNavigate();

  return (
    <div className="company-page">
      <SEO title="About ZOKASCORE" path="/about" />
      <div className="company-sticky-hdr">
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
        <div className="text-primary font-extrabold text-sm flex-center gap-8"><Globe size={14} /> About</div>
      </div>

      <div className="company-hero-card anim-fade-up">
        <div className="company-hero-icon" style={{ animation: 'zk-bounce 4s ease-in-out infinite' }}><Target size={32} /></div>
        <h1 className="text-primary font-extrabold text-lg">Football Prediction, Reimagined</h1>
        <p className="text-muted text-sm">ZOKASCORE is a premier football platform where fans compete on daily leaderboards and experience live scores in real-time.</p>
      </div>

      <div className="company-card anim-fade-up">
        <h2><Star size={15} className="text-primary" /> Our Mission</h2>
        <p>We believe every football fan deserves a platform that celebrates knowledge of the game — not just luck. ZOKASCORE transforms passive match-watching into an engaging, competitive experience.</p>
      </div>

      <div className="company-card anim-fade-up">
        <h2><Award size={15} className="text-gold" /> Our Journey</h2>
        <ol className="timeline">
          {TIMELINE.map((t, i) => (
            <li key={i} className="timeline-item">
              <div className="timeline-year">{t.year}</div>
              <div className="timeline-text">{t.text}</div>
              <div className="timeline-sub">{t.sub}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="company-directory">
        <h3>Connect With Us</h3>
        <div className="dir-grid">
          <Link to="/team" className="dir-link"><Users size={16} /> The Team</Link>
          <Link to="/careers" className="dir-link"><Briefcase size={16} /> Careers</Link>
          <Link to="/contact" className="dir-link"><Mail size={16} /> Contact</Link>
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
        </div>
      </div>
    </div>
  );
}