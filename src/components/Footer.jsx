import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, LogIn } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════
   SOCIAL ICONS (inline — lucide has no branded icons)
   ═══════════════════════════════════════════════════════════════ */
const IconX = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4l11.733 16h4.267l-11.733-16zM4 20l6.768-6.768M20 4l-6.768 6.768" />
  </svg>
);
const IconInstagram = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
const IconTikTok = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12a4 4 0 1 0 4 4V4c1.5 2.5 4 4 6.5 4" />
  </svg>
);

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('footer-zoka-v1')) return;
  const s = document.createElement('style');
  s.id = 'footer-zoka-v1';
  s.textContent = `
    @keyframes ftFadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ftFadeIn{from{opacity:0}to{opacity:1}}
    @keyframes ftShine{0%,100%{left:-120%}50%{left:160%}}

    .ft{position:relative;margin-top:56px;background:var(--bg-card);border-top:1px solid var(--border)}
    .ft::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 5%,var(--accent) 50%,transparent 95%);opacity:.2}
    .ft-inner{max-width:var(--max-width);margin:0 auto;padding:48px 24px 32px;display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px}

    .ft-brand{grid-column:1}
    .ft-logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:14px;text-decoration:none;transition:opacity .15s}
    .ft-logo:hover{opacity:.85}
    .ft-logo-mark{width:34px;height:34px;border-radius:9px;position:relative;overflow:hidden;background:linear-gradient(135deg,var(--accent),#00c853);display:flex;align-items:center;justify-content:center;font-size:.8rem;color:var(--bg-deep);font-weight:800;box-shadow:0 2px 12px rgba(0,230,118,.12)}
    .ft-logo-shine{position:absolute;top:0;left:-120%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent);animation:ftShine 5s ease-in-out infinite}
    .ft-logo-text{font-family:var(--font-display);font-size:1.2rem;font-weight:700;color:var(--text-primary);letter-spacing:-.02em}
    .ft-logo-dot{color:var(--accent)}
    .ft-logo-sub{font-size:.55rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;opacity:.5;margin-left:1px}
    .ft-tagline{font-size:.8rem;color:var(--text-muted);line-height:1.65;max-width:300px;margin-bottom:20px}
    .ft-socials{display:flex;gap:8px}
    .ft-soc{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-muted);transition:all .2s ease;cursor:default;text-decoration:none}
    .ft-soc:hover{background:rgba(0,230,118,.06);border-color:rgba(0,230,118,.15);color:var(--accent);transform:translateY(-2px)}
    .ft-soc svg{width:15px;height:15px}

    .ft-col h4{font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin:0 0 14px;display:flex;align-items:center;gap:8px}
    .ft-col h4::after{content:'';flex:1;height:1px;background:var(--border)}
    .ft-col a{display:block;padding:5px 0;font-size:.8rem;font-weight:500;color:var(--text-secondary);text-decoration:none;transition:color .15s ease,transform .15s ease}
    .ft-col a:hover{color:var(--accent);transform:translateX(3px)}

    .ft-signout{
      display:flex;align-items:center;gap:7px;padding:5px 0;font-size:.8rem;font-weight:500;
      color:#f87171;background:none;border:none;cursor:pointer;
      transition:color .15s ease,transform .15s ease;width:100%;text-align:left;
    }
    .ft-signout:hover{color:#fca5a5;transform:translateX(3px)}
    .ft-signout svg{width:14px;height:14px;flex-shrink:0}

    .ft-divider{max-width:var(--max-width);margin:0 auto;padding:0 24px}
    .ft-divider-line{height:1px;background:linear-gradient(90deg,transparent,var(--border) 15%,var(--border) 85%,transparent)}

    .ft-bottom{max-width:var(--max-width);margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
    .ft-copy{font-size:.7rem;color:var(--text-muted);font-weight:500}
    .ft-legal{font-size:.64rem;color:var(--text-muted);opacity:.35;font-weight:400}

    .ft-s{opacity:0;animation:ftFadeUp .5s cubic-bezier(.22,1,.36,1) both}
    .ft-sf{opacity:0;animation:ftFadeIn .6s ease both}

    @media(max-width:768px){
      .ft-inner{grid-template-columns:1fr 1fr;gap:28px}
      .ft-brand{grid-column:1/-1;margin-bottom:8px}
      .ft-tagline{max-width:100%}
      .ft-bottom{flex-direction:column;align-items:center;text-align:center;gap:4px}
    }
    @media(max-width:480px){
      .ft-inner{grid-template-columns:1fr;gap:22px}
      .ft-brand{margin-bottom:4px}
    }
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   LINKS
   ═══════════════════════════════════════════════════════════════ */
const PLATFORM = [
  { to: '/fixtures',     label: 'Fixtures' },
  { to: '/predictions',  label: 'Predictions' },
  { to: '/leaderboard',  label: 'Leaderboard' },
  { to: '/highlights',   label: 'Highlights' },
  { to: '/livestream',   label: 'Live Stream' },
];

const LEAGUES = [
  { to: '/predictions?league=39',  label: 'Premier League' },
  { to: '/predictions?league=140', label: 'La Liga' },
  { to: '/predictions?league=2',   label: 'Champions League' },
  { to: '/predictions?league=135', label: 'Serie A' },
];

/* ═══════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Footer() {
  injectStyles();

  const { currentUser, signOut } = useAuth();
  const navigate = useNavigate();
  const d = (i) => `${i * 60 + 100}ms`;

  const handleSignOut = async () => {
    try { await signOut(); } catch {}
    navigate('/');
  };

  return (
    <footer className="ft">
      <div className="ft-inner">

        {/* ── Brand ── */}
        <div className="ft-brand ft-s" style={{ animationDelay: d(0) }}>
          <Link to="/" className="ft-logo">
            <div className="ft-logo-mark">
              <span className="ft-logo-shine" />
              <span style={{ position: 'relative', zIndex: 1 }}>ZS</span>
            </div>
            <span className="ft-logo-text">ZOKASCORE<span className="ft-logo-dot">.</span><span className="ft-logo-sub">xyz</span></span>
          </Link>
          <p className="ft-tagline">
            Data-driven football predictions with real-time analysis.
            Compete with thousands of fans to predict match outcomes accurately.
          </p>
          <div className="ft-socials">
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="ft-soc" aria-label="X"><IconX /></a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="ft-soc" aria-label="Instagram"><IconInstagram /></a>
            <a href="https://tiktok.com" target="_blank" rel="noopener noreferrer" className="ft-soc" aria-label="TikTok"><IconTikTok /></a>
          </div>
        </div>

        {/* ── Platform ── */}
        <div className="ft-col ft-s" style={{ animationDelay: d(1) }}>
          <h4>Platform</h4>
          {PLATFORM.map(l => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
        </div>

        {/* ── Leagues ── */}
        <div className="ft-col ft-s" style={{ animationDelay: d(2) }}>
          <h4>Leagues</h4>
          {LEAGUES.map(l => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
        </div>

        {/* ── Account ── */}
        <div className="ft-col ft-s" style={{ animationDelay: d(3) }}>
          <h4>Account</h4>
          {currentUser ? (
            <>
              <Link to="/profile">My Profile</Link>
              <Link to="/leaderboard">Rankings</Link>
              <button className="ft-signout" onClick={handleSignOut}>
                <LogOut /> Sign Out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <LogIn style={{ width: 14, height: 14, flexShrink: 0 }} /> Sign In
              </Link>
              <Link to="/leaderboard">Rankings</Link>
            </>
          )}
        </div>
      </div>

      <div className="ft-divider">
        <div className="ft-divider-line" />
      </div>

      <div className="ft-bottom ft-sf" style={{ animationDelay: '380ms' }}>
        <span className="ft-copy">© {new Date().getFullYear()} ZOKASCORE. All rights reserved.</span>
        <span className="ft-legal">Predictions for entertainment only.</span>
      </div>
    </footer>
  );
}