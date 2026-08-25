import React, { useState, useEffect } from 'react';
import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Smartphone, Download, Activity, CheckCircle, Phone } from 'lucide-react';
import { useFixtures } from '../hooks/useFixtures';
import { useDailyLeaderboard } from '../hooks/useUserData';
import { todayStr } from '../utils/dates';

const year = new Date().getFullYear();

const sections = [
  { title: "Platform", links: [
    { label: "Live Scores", to: "/fixtures" }, { label: "Predictions", to: "/predictions" },
    { label: "Leaderboard", to: "/leaderboard" }, { label: "Highlights", to: "/highlights" },
    { label: "Live Stream", to: "/livestream" }, { label: "Creator Studio", to: "/studio" },
  ]},
  { title: "Company", links: [
    { label: "About Us", to: "/about" }, { label: "Contact", to: "/contact" },
    { label: "Careers", to: "/careers" }, { label: "Advertise", to: "/advertise" },
  ]},
  { title: "Support & Legal", links: [
    { label: "Help Center", to: "/help-center" }, { label: "FAQ", to: "/faq" },
    { label: "Privacy Policy", to: "/privacy" }, { label: "Terms of Service", to: "/terms" },
  ]},
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
  const dailyStats = {
    preds: Number(dailyLB?.stats?.preds ?? 0),
    players: Number(dailyLB?.stats?.players ?? 0),
  };

  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(!!window.deferredPrompt);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) setIsInstalled(true);
    const onInstallable = () => setCanInstall(true);
    window.addEventListener('pwaInstallable', onInstallable);
    return () => window.removeEventListener('pwaInstallable', onInstallable);
  }, []);

  const handleInstallClick = async () => {
    if (window.deferredPrompt) {
      window.deferredPrompt.prompt();
      await window.deferredPrompt.userChoice;
      window.deferredPrompt = null;
      setCanInstall(false);
    }
  };

  return (
    <footer className="zoka-footer pt-32">
      <div className="zoka-footer-container flex-col gap-24">
        
        {/* 1. Live Stats Bar */}
        <div className="glass-card flex-between p-16 gap-12 flex-wrap" role="group" aria-label="Platform live statistics">
          <div className="flex-center gap-8">
            <Activity size={16} className="text-danger anim-live-pulse" aria-hidden="true" />
            <span className="font-bold text-primary">{liveCount}</span>
            <span className="text-muted font-bold text-xs">LIVE MATCHES</span>
          </div>
          <div className="flex-center gap-8">
            <span className="text-md" aria-hidden="true">📅</span> 
            <span className="font-bold text-primary">{todayFixturesCount}</span>
            <span className="text-muted font-bold text-xs">FIXTURES TODAY</span>
          </div>
          <div className="flex-center gap-8">
            <span className="text-md" aria-hidden="true">🎯</span> 
            <span className="font-bold text-primary">{dailyStats.preds.toLocaleString()}</span>
            <span className="text-muted font-bold text-xs">PREDICTIONS</span>
          </div>
        </div>

        {/* 2. Newsletter & PWA */}
        <div className="admin-grid-280">
          <div className="glass-card flex-col gap-12 p-20">
            <h3 className="text-primary text-md">Get Daily Winning Picks</h3>
            <ul className="flex-col gap-8 text-secondary text-sm">
              <li>✔ Match predictions</li><li>✔ Live alerts</li><li>✔ Breaking football news</li>
            </ul>
            <form className="flex gap-8 mt-4" onSubmit={(e) => e.preventDefault()}>
              <label htmlFor="footer-email" className="sr-only">Email address</label>
              <input id="footer-email" type="email" placeholder="Enter your email" className="form-input flex-1" />
              <button type="submit" className="btn btn-primary">Subscribe</button>
            </form>
          </div>
          
          <div className="glass-card flex-col gap-12 p-20 flex-center text-center">
            <Smartphone size={32} className="text-primary" aria-hidden="true" />
            <h3 className="text-primary text-md">Install ZOKASCORE</h3>
            <p className="text-muted text-sm">Fast, Offline, Notifications.</p>
            {isInstalled ? (
              <button className="btn btn-secondary" disabled>
                <CheckCircle size={16} /> Installed
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleInstallClick} disabled={!canInstall}>
                <Download size={16} /> Install App
              </button>
            )}
          </div>
        </div>

        {/* 3. Main Grid */}
        <nav className="admin-grid-200" aria-label="Footer Navigation">
          <div className="flex-col gap-12">
            <Link to="/" className="flex-center gap-8" aria-label="ZOKASCORE Home">
              <img src="/icons/icon-192.png" alt="ZOKASCORE" width="40" height="40" className="rounded-12" />
              <span className="font-extrabold text-primary text-lg">ZOKASCORE</span>
            </Link>
            <p className="text-muted text-sm">The smartest football companion. Live scores, AI-powered predictions, and real-time updates.</p>
            
            <div className="flex-col gap-4 mt-8">
              <div className="text-muted font-bold text-xs">24/7 SUPPORT</div>
              <div className="flex-center gap-8 text-secondary text-sm">
                <Phone size={14} className="text-primary" aria-hidden="true" />
                <a href="tel:0728720281" className="text-secondary font-bold">0728720281</a>
                <span className="text-muted" aria-hidden="true">/</span>
                <a href="tel:0721635810" className="text-secondary font-bold">0721635810</a>
              </div>
            </div>

            <div className="flex gap-8 mt-8">
              {socialLinks.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noreferrer" aria-label={s.name} className="btn-icon btn-ghost">{s.icon}</a>
              ))}
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="flex-col gap-8">
              <h4 className="text-secondary font-bold text-sm">{section.title}</h4>
              <ul className="flex-col gap-8">
                {section.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-muted hover:text-primary transition-colors text-sm">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* 4. EXPLORE ZOKASCORE (SEO Mega-Directory) */}
        <nav className="glass-card p-20 mb-24" aria-label="Explore ZOKASCORE Directory">
          <h3 className="text-primary font-bold text-lg mb-16 text-center">Explore ZOKASCORE</h3>
          <div className="admin-grid-160">
             <div>
               <h4 className="text-muted text-xs font-bold uppercase mb-8">Live Data</h4>
               <ul className="flex-col gap-4 text-sm">
                 <li><a href="/fixtures" className="text-secondary hover:text-primary">Live Scores</a></li>
                 <li><a href="/results" className="text-secondary hover:text-primary">Historical Results</a></li>
                 <li><a href="/predictions" className="text-secondary hover:text-primary">AI Predictions</a></li>
                 <li><a href="/leaderboard" className="text-secondary hover:text-primary">Leaderboards</a></li>
               </ul>
             </div>
             <div>
               <h4 className="text-muted text-xs font-bold uppercase mb-8">Top Leagues</h4>
               <ul className="flex-col gap-4 text-sm">
                 <li><a href="/league/39/premier-league" className="text-secondary hover:text-primary">Premier League</a></li>
                 <li><a href="/league/140/la-liga" className="text-secondary hover:text-primary">La Liga</a></li>
                 <li><a href="/league/2/uefa-champions-league" className="text-secondary hover:text-primary">Champions League</a></li>
                 <li><a href="/league/135/serie-a" className="text-secondary hover:text-primary">Serie A</a></li>
               </ul>
             </div>
             <div>
               <h4 className="text-muted text-xs font-bold uppercase mb-8">Popular Teams</h4>
               <ul className="flex-col gap-4 text-sm">
                 <li><a href="/team/33/manchester-united" className="text-secondary hover:text-primary">Man Utd</a></li>
                 <li><a href="/team/40/liverpool" className="text-secondary hover:text-primary">Liverpool</a></li>
                 <li><a href="/team/541/real-madrid" className="text-secondary hover:text-primary">Real Madrid</a></li>
                 <li><a href="/team/529/barcelona" className="text-secondary hover:text-primary">Barcelona</a></li>
               </ul>
             </div>
             <div>
               <h4 className="text-muted text-xs font-bold uppercase mb-8">Tools & Knowledge</h4>
               <ul className="flex-col gap-4 text-sm">
                 <li><a href="/studio" className="text-secondary hover:text-primary">Creator Studio</a></li>
                 <li><a href="/football-knowledge" className="text-secondary hover:text-primary">Football Laws</a></li>
                 <li><a href="/faq" className="text-secondary hover:text-primary">FAQ</a></li>
                 <li><a href="/highlights" className="text-secondary hover:text-primary">News & Highlights</a></li>
               </ul>
             </div>
          </div>
        </nav>

        {/* 5. Bottom Bar */}
        <div className="flex-between p-16 flex-wrap gap-8 border-top">
          <p className="text-muted text-xs">© {year} ZOKASCORE. All rights reserved.</p>
          <div className="flex-center gap-8 text-muted text-xs">
            <ShieldCheck size={12} aria-hidden="true" /> HTTPS Protected 
            <span className="mx-4" aria-hidden="true">•</span> 
            <Lock size={12} aria-hidden="true" /> 18+ Play Responsibly
          </div>
        </div>

      </div>
    </footer>
  );
}