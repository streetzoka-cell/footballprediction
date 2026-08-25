import { Link } from 'react-router-dom';
import SEO from '../components/SEO';
import { Headset, Mail, BookOpen, Shield, Users, Zap, HelpCircle, MessageCircle } from 'lucide-react';

export default function HelpCenter() {
  return (
    <div className="company-page">
      <SEO title="Help Center & Support" path="/help-center" />
      
      <div className="company-hero-card">
        <div className="company-hero-icon" style={{ background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }}><Headset size={32} /></div>
        <h1 className="text-primary font-extrabold text-2xl">How can we help you?</h1>
        <p className="text-muted text-sm">Browse our guides, troubleshoot issues, or reach out to our support team.</p>
      </div>

      <div className="company-grid">
        <article className="company-mini-card">
          <div className="icon-wrap" style={{ background: 'rgba(var(--primary-rgb),.08)', color: 'var(--primary)' }}><BookOpen size={24} /></div>
          <h2>Getting Started</h2>
          <p>New to ZOKASCORE? Learn how to create an account, make your first score prediction, and start climbing the daily leaderboards.</p>
          <Link to="/faq" className="company-link">Read the FAQ →</Link>
        </article>

        <article className="company-mini-card">
          <div className="icon-wrap" style={{ background: 'rgba(var(--gold-rgb),.08)', color: 'var(--gold)' }}><Zap size={24} /></div>
          <h2>Predictions & Points</h2>
          <p>Understand our scoring system. Learn how exact scores, correct outcomes, and daily streaks multiply your points.</p>
          <Link to="/leaderboard" className="company-link">View Leaderboard →</Link>
        </article>

        <article className="company-mini-card">
          <div className="icon-wrap" style={{ background: 'rgba(var(--accent-rgb),.08)', color: 'var(--accent)' }}><Shield size={24} /></div>
          <h2>Account & Privacy</h2>
          <p>Manage your profile, update your preferences, and learn how we protect your data and ensure fair play.</p>
          <Link to="/privacy" className="company-link">Privacy Policy →</Link>
        </article>
      </div>

      <div className="company-card">
        <h2 className="text-primary font-bold text-xl mb-16"><Mail size={20} /> Contact Support</h2>
        <p className="text-secondary text-sm mb-16">If you're experiencing technical issues or need assistance with your account, our team is ready to help.</p>
        <div className="flex gap-12 flex-wrap">
          <a href="mailto:support@zokascore.xyz" className="btn btn-primary"><Mail size={16} /> Email Support</a>
          <Link to="/contact" className="btn btn-ghost"><Users size={16} /> Contact Form</Link>
        </div>
      </div>

      <div className="company-directory">
        <h3>Support Directory</h3>
        <div className="dir-grid">
          <Link to="/faq" className="dir-link"><HelpCircle size={16} /> FAQ</Link>
          <Link to="/terms" className="dir-link"><Shield size={16} /> Terms</Link>
          <Link to="/privacy" className="dir-link"><Shield size={16} /> Privacy</Link>
          <Link to="/contact" className="dir-link"><MessageCircle size={16} /> Contact</Link>
        </div>
      </div>
    </div>
  );
}