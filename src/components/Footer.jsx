import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Smartphone, Download, Activity, CheckCircle } from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures';
import { useDailyLeaderboard } from '../hooks/useUserData';
import { todayStr } from '../utils/dates';

const year = new Date().getFullYear();

const sections = [
  {
    title: "Platform",
    links: [
      { label: "Live Scores", to: "/fixtures" },
      { label: "Predictions", to: "/predictions" },
      { label: "Leaderboard", to: "/leaderboard" },
      { label: "Highlights", to: "/highlights" },
      { label: "Live Stream", to: "/livestream" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Contact", to: "/contact" },
      { label: "Careers", to: "/careers" },
      { label: "Advertise", to: "/advertise" },
    ],
  },
  {
    title: "Support & Legal",
    links: [
      { label: "Help Center", to: "/help-center" },
      { label: "FAQ", to: "/faq" },
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", to: "/terms" },
    ],
  },
];

const topLeagues = [
  { label: "Premier League", to: "/league/39/premier-league" },
  { label: "La Liga", to: "/league/140/la-liga" },
  { label: "Serie A", to: "/league/135/serie-a" },
  { label: "Bundesliga", to: "/league/78/bundesliga" },
  { label: "Ligue 1", to: "/league/61/ligue-1" },
  { label: "Champions League", to: "/league/2/uefa-champions-league" },
];

const socialLinks = [
  { name: "Twitter", href: "https://twitter.com/zokascore", icon: '𝕏' },
  { name: "Facebook", href: "https://facebook.com/zokascore", icon: 'f' },
  { name: "Instagram", href: "https://instagram.com/zokascore", icon: '◉' },
  { name: "Telegram", href: "https://t.me/zokascore", icon: '✈' },
];

export default function Footer() {
  const { data: rawFixtures = [] } = useFixtures(todayStr());
  const { data: dailyLB = null } = useDailyLeaderboard(todayStr());

  const liveCount = rawFixtures.filter(m => m.isLive).length;
  const todayFixturesCount = rawFixtures.length;
  const dailyStats = dailyLB?.stats || { preds: 0, players: 0 };

  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPromptEvent(e);
    };
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
  };

  return (
    <footer className="zoka-footer" style={{ paddingTop: 'var(--sp-32)' }}>
      <div className="zoka-footer-container flex-col gap-24">
        
        {/* 1. Live Stats Bar */}
        <div className="glass-card flex-between p-16 gap-12 flex-wrap">
          <div className="flex-center gap-8">
            <Activity size={16} style={{ color: 'var(--danger)' }} className="anim-live-pulse" />
            <span className="font-bold text-primary">{liveCount}</span>
            <span className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>LIVE MATCHES</span>
          </div>
          <div className="flex-center gap-8">
            <span style={{ fontSize: 'var(--fs-md)' }}>📅</span>
            <span className="font-bold text-primary">{todayFixturesCount}</span>
            <span className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>FIXTURES TODAY</span>
          </div>
          <div className="flex-center gap-8">
            <span style={{ fontSize: 'var(--fs-md)' }}>🎯</span>
            <span className="font-bold text-primary">{dailyStats.preds.toLocaleString()}</span>
            <span className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>PREDICTIONS</span>
          </div>
        </div>

        {/* 2. Newsletter & PWA */}
        <div className="grid gap-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <div className="glass-card flex-col gap-12 p-20">
            <h3 className="text-primary" style={{ fontSize: 'var(--fs-md)' }}>Get Daily Winning Picks</h3>
            <ul className="flex-col gap-8 text-secondary" style={{ fontSize: 'var(--fs-sm)' }}>
              <li>✔ Match predictions</li>
              <li>✔ Live alerts</li>
              <li>✔ Breaking football news</li>
            </ul>
            <div className="flex gap-8 mt-4">
              <input type="email" placeholder="Enter your email" className="form-input" style={{ flex: 1 }} />
              <button className="btn btn-primary">Subscribe</button>
            </div>
          </div>
          
          <div className="glass-card flex-col gap-12 p-20 flex-center text-center">
            <Smartphone size={32} className="text-primary" />
            <h3 className="text-primary" style={{ fontSize: 'var(--fs-md)' }}>Install ZOKASCORE</h3>
            <p className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>Fast, Offline, Notifications.</p>
            {isInstalled ? (
              <button className="btn btn-secondary" disabled>
                <CheckCircle size={16} /> Installed
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleInstallClick} disabled={!installPromptEvent}>
                <Download size={16} /> Install App
              </button>
            )}
          </div>
        </div>

        {/* 3. Main Grid */}
        <div className="grid gap-24" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="flex-col gap-12">
            <Link to="/" className="flex-center gap-8">
              <img src="/icons/icon-192.png" alt="ZOKASCORE" width="40" height="40" style={{ borderRadius: 'var(--r-12)' }} />
              <span className="font-extrabold text-primary" style={{ fontSize: 'var(--fs-lg)' }}>ZOKASCORE</span>
            </Link>
            <p className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
              The smartest football companion. Live scores, AI-powered predictions, and real-time updates.
            </p>
            <div className="flex gap-8 mt-8">
              {socialLinks.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noreferrer" aria-label={s.name} className="btn-icon btn-ghost">
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="flex-col gap-8">
              <h4 className="text-secondary font-bold" style={{ fontSize: 'var(--fs-sm)' }}>{section.title}</h4>
              {section.links.map((link) => (
                <Link key={link.to} to={link.to} className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>

        {/* 4. SEO Links Section */}
        <div className="glass-card p-16 flex-col gap-12">
          <h5 className="text-muted font-bold" style={{ fontSize: 'var(--fs-xs)' }}>TOP COMPETITIONS</h5>
          <div className="flex gap-8 flex-wrap">
            {topLeagues.map(l => <Link key={l.to} to={l.to} className="badge badge-muted">{l.label}</Link>)}
          </div>
        </div>

        {/* 5. Bottom Bar */}
        <div className="flex-between p-16 flex-wrap gap-8" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>© {year} ZOKASCORE. All rights reserved.</p>
          <div className="flex-center gap-8 text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            <ShieldCheck size={12} /> HTTPS Protected 
            <span style={{ margin: '0 4px' }}>•</span> 
            <Lock size={12} /> 18+ Play Responsibly
          </div>
        </div>

      </div>
    </footer>
  );
}