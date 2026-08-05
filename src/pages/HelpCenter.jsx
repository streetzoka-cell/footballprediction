import { Link } from "react-router-dom";
import SEO from "../components/SEO";
import { Headset, Mail, BookOpen, Shield, Users, Zap } from "lucide-react";

export default function HelpCenter() {
  const contactSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "ZOKASCORE Help Center & Support",
    "description": "Find answers to common questions, troubleshooting guides, and contact support for ZOKASCORE.",
    "url": "https://zokascore.xyz/help-center",
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "support@zokascore.xyz",
      "contactType": "customer support",
      "availableLanguage": "English"
    }
  };

  return (
    <div className="zoka-page">
      <SEO
        title="Help Center, Support & User Guides | ZOKASCORE"
        description="Find answers to common questions, troubleshooting guides, account support, and helpful resources to get the most out of ZOKASCORE's football predictions and live scores."
        keywords="ZOKASCORE help, help center, customer support, football prediction help, troubleshooting, FAQ"
        robots="index,follow"
        structuredData={contactSchema}
      />

      <div className="zoka-wrap">
        <div className="glass-card p-24 mb-24 text-center">
          <div className="flex-center gap-12 mb-12">
            <div className="flex-center" style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }}>
              <Headset size={24} />
            </div>
          </div>
          <h1 className="text-primary font-extrabold text-2xl mb-8">How can we help you?</h1>
          <p className="text-secondary text-sm max-w-500 mx-auto">
            Welcome to the ZOKASCORE Help Center. Browse our guides, troubleshoot issues, or reach out to our support team.
          </p>
        </div>

        <div className="grid gap-16 mb-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <article className="glass-card p-20 flex-col gap-12">
            <BookOpen size={24} className="text-primary" />
            <h2 className="text-primary font-bold text-lg">Getting Started</h2>
            <p className="text-secondary text-sm leading-relaxed">
              New to ZOKASCORE? Learn how to create an account, make your first score prediction, and start climbing the daily leaderboards.
            </p>
            <Link to="/faq" className="text-primary font-bold text-sm mt-auto hover:underline">Read the FAQ →</Link>
          </article>

          <article className="glass-card p-20 flex-col gap-12">
            <Zap size={24} className="text-gold" />
            <h2 className="text-primary font-bold text-lg">Predictions & Points</h2>
            <p className="text-secondary text-sm leading-relaxed">
              Understand our scoring system. Learn how exact scores, correct outcomes, and daily streaks multiply your points on the leaderboard.
            </p>
            <Link to="/leaderboard" className="text-primary font-bold text-sm mt-auto hover:underline">View Leaderboard →</Link>
          </article>

          <article className="glass-card p-20 flex-col gap-12">
            <Shield size={24} className="text-accent" />
            <h2 className="text-primary font-bold text-lg">Account & Privacy</h2>
            <p className="text-secondary text-sm leading-relaxed">
              Manage your profile, update your preferences, and learn how we protect your data and ensure fair play across the platform.
            </p>
            <Link to="/privacy" className="text-primary font-bold text-sm mt-auto hover:underline">Privacy Policy →</Link>
          </article>
        </div>

        <div className="glass-card p-24 mb-24">
          <h2 className="text-primary font-bold text-xl mb-16 flex-center gap-8" style={{justifyContent: 'flex-start'}}>
            <Mail size={20} /> Contact Support
          </h2>
          <p className="text-secondary text-sm leading-relaxed mb-16">
            If you're experiencing technical issues, have suggestions for new features, or need assistance with your account, our team is ready to help.
          </p>
          <div className="flex gap-12 flex-wrap">
            <a href="mailto:support@zokascore.xyz" className="btn btn-primary flex-center gap-8">
              <Mail size={16} /> Email support@zokascore.xyz
            </a>
            <Link to="/contact" className="btn btn-ghost flex-center gap-8">
              <Users size={16} /> Contact Form
            </Link>
          </div>
        </div>

        {/* ★ SEO INTERNAL LINKING: Quick Links Directory */}
        <nav className="glass-card p-24" aria-label="Help Center Directory">
          <h3 className="text-primary font-bold mb-12">Quick Links</h3>
          <ul className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
            <li><Link to="/fixtures" className="text-secondary text-sm hover:text-primary">Live Fixtures</Link></li>
            <li><Link to="/predictions" className="text-secondary text-sm hover:text-primary">Make Predictions</Link></li>
            <li><Link to="/highlights" className="text-secondary text-sm hover:text-primary">News & Highlights</Link></li>
            <li><Link to="/terms" className="text-secondary text-sm hover:text-primary">Terms of Service</Link></li>
            <li><Link to="/about" className="text-secondary text-sm hover:text-primary">About ZOKASCORE</Link></li>
          </ul>
        </nav>
      </div>
    </div>
  );
}