import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Smartphone, Globe, Download, Activity, Server, Cpu } from 'lucide-react';
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
      { label: "Studio", to: "/studio" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Team", to: "/team" },
      { label: "Careers", to: "/careers" },
      { label: "Contact", to: "/contact" },
      { label: "Partners", to: "/partners" },
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
      { label: "Responsible Gaming", to: "/responsible-gaming" },
    ],
  },
];

// SEO Link Data
const topLeagues = [
  { label: "Premier League", to: "/league/39/premier-league" },
  { label: "La Liga", to: "/league/140/la-liga" },
  { label: "Serie A", to: "/league/135/serie-a" },
  { label: "Bundesliga", to: "/league/78/bundesliga" },
  { label: "Ligue 1", to: "/league/61/ligue-1" },
  { label: "Champions League", to: "/league/2/uefa-champions-league" },
  { label: "Europa League", to: "/league/3/uefa-europa-league" },
  { label: "AFCON", to: "/league/5/caf-nations-cup" },
];

const popularTeams = [
  { label: "Manchester United", to: "/team/33/manchester-united" },
  { label: "Real Madrid", to: "/team/541/real-madrid" },
  { label: "Barcelona", to: "/team/529/barcelona" },
  { label: "Liverpool", to: "/team/40/liverpool" },
  { label: "Arsenal", to: "/team/42/arsenal" },
  { label: "Chelsea", to: "/team/49/chelsea" },
  { label: "Bayern Munich", to: "/team/157/bayern-munich" },
  { label: "PSG", to: "/team/85/paris-saint-germain" },
];

const socialLinks = [
  { name: "Twitter", href: "https://twitter.com/zokascore", icon: (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>) },
  { name: "Facebook", href: "https://facebook.com/zokascore", icon: (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>) },
  { name: "Instagram", href: "https://instagram.com/zokascore", icon: (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>) },
  { name: "Telegram", href: "https://t.me/zokascore", icon: (<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>) },
];

export default function Footer() {
  // ★ REAL DATA HOOKS
  const { data: rawFixtures = [] } = useFixtures(todayStr());
  const { data: dailyLB = null } = useDailyLeaderboard(todayStr());

  // Calculate real stats
  const liveCount = rawFixtures.filter(m => m.isLive).length;
  const todayFixturesCount = rawFixtures.length;
  
  const dailyStats = dailyLB?.stats || { preds: 0, players: 0 };
  const predictionsToday = dailyStats.preds || 0;
  const playersOnline = dailyStats.players || 0;

  return (
    <footer className="zoka-footer">
      <div className="zoka-footer-container">
        
        {/* 1. Live Stats Bar (Dynamic) */}
        <div className="ft-stats-bar">
          <div className="ft-stat-item">
            <Activity size={14} className="ft-stat-icon live" />
            <span className="ft-stat-val">{liveCount}</span>
            <span className="ft-stat-lbl">Live Matches</span>
          </div>
          <div className="ft-stat-item">
            <span className="ft-stat-emoji">📅</span>
            <span className="ft-stat-val">{todayFixturesCount}</span>
            <span className="ft-stat-lbl">Today's Fixtures</span>
          </div>
          <div className="ft-stat-item">
            <span className="ft-stat-emoji">🎯</span>
            <span className="ft-stat-val">{predictionsToday.toLocaleString()}</span>
            <span className="ft-stat-lbl">Predictions</span>
          </div>
          <div className="ft-stat-item">
            <span className="ft-stat-emoji">👥</span>
            <span className="ft-stat-val">{playersOnline.toLocaleString()}</span>
            <span className="ft-stat-lbl">Players</span>
          </div>
        </div>

        {/* 2. API Status Bar */}
        <div className="ft-api-status">
          <div className="ft-api-title">SYSTEM STATUS</div>
          <div className="ft-api-grid">
            <div className="ft-api-item"><span className="ft-api-dot live"></span> Live Scores</div>
            <div className="ft-api-item"><span className="ft-api-dot live"></span> Predictions</div>
            <div className="ft-api-item"><span className="ft-api-dot live"></span> Database</div>
            <div className="ft-api-item"><span className="ft-api-dot live"></span> Authentication</div>
          </div>
        </div>

        {/* 3. Newsletter & PWA */}
        <div className="ft-top-grid">
          <div className="ft-newsletter">
            <h3>Get Daily Winning Picks</h3>
            <ul>
              <li>✔ Match predictions</li>
              <li>✔ Live alerts</li>
              <li>✔ Major transfers</li>
              <li>✔ Breaking football news</li>
            </ul>
            <div className="ft-news-form">
              <input type="email" placeholder="Enter your email" />
              <button>Subscribe Free</button>
            </div>
          </div>
          
          <div className="ft-pwa-card">
            <Smartphone size={24} className="ft-pwa-icon" />
            <h3>Install ZOKASCORE</h3>
            <p>Fast, Offline, Notifications.</p>
            <button className="ft-install-btn">
              <Download size={14} /> Install App
            </button>
          </div>
        </div>

        {/* 4. Main Grid */}
        <div className="ft-main-grid">
          <div className="ft-brand-col">
            <Link to="/" className="ft-brand-logo">
              <img src="/icons/icon-192.png" alt="ZOKASCORE" />
              <span>ZOKASCORE</span>
            </Link>
            <p className="ft-brand-desc">
              The smartest football companion. Live scores, AI-powered predictions, match analytics, and real-time updates. Built for football fans worldwide.
            </p>
            <div className="ft-contact-info">
              <a href="mailto:zokastreet@gmail.com">📧 zokastreet@gmail.com</a>
              <a href="tel:+254721635810">📞 +254 721 635 810</a>
              <div>📍 Nairobi, Kenya</div>
            </div>
            <div className="ft-socials">
              {socialLinks.map((s) => (
                <a key={s.name} href={s.href} target="_blank" rel="noreferrer" aria-label={s.name} className="ft-social-btn">
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {sections.map((section) => (
            <div key={section.title} className="ft-link-col">
              <h4>{section.title}</h4>
              <ul>
                {section.links.map((link) => (
                  <li key={link.to}><Link to={link.to}>{link.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 5. SEO Links Section */}
        <div className="ft-seo-section">
          <div className="ft-seo-block">
            <h5>Top Competitions</h5>
            <div className="ft-seo-links">
              {topLeagues.map(l => <Link key={l.to} to={l.to}>{l.label}</Link>)}
            </div>
          </div>
          <div className="ft-seo-block">
            <h5>Popular Teams</h5>
            <div className="ft-seo-links">
              {popularTeams.map(t => <Link key={t.to} to={t.to}>{t.label}</Link>)}
            </div>
          </div>
        </div>

        {/* 6. Trust & Responsible Gaming */}
        <div className="ft-trust-grid">
          <div className="ft-trust-badges">
            <span><ShieldCheck size={12} /> Real-time Updates</span>
            <span><Lock size={12} /> HTTPS Protected</span>
            <span><Smartphone size={12} /> Mobile Friendly</span>
          </div>
          <div className="ft-responsible">
            <span className="ft-18-plus">18+</span>
            <span>Predictions are for entertainment. Play responsibly.</span>
          </div>
        </div>

        {/* 7. Bottom Bar */}
        <div className="ft-bottom-bar">
          <p>© {year} ZOKASCORE. All rights reserved.</p>
          <p>Built by <span className="ft-credit-name">Kimutai Gibson</span></p>
          <div className="ft-powered-by">
            Powered by: <span>React</span> • <span>Firebase</span> • <span>Cloudflare</span> • <span>ZOKASCORE AI</span>
          </div>
        </div>

      </div>
    </footer>
  );
}