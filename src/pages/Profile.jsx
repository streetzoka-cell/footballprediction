import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, Target, Trophy, Flame, Calendar, Edit3, Shield, ChevronRight, 
  Mail, Star, ArrowRight, Zap, Lock, TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SEO from "../components/SEO";
/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('profile-pro-v2')) return;
  const s = document.createElement('style');
  s.id = 'profile-pro-v2';
  s.textContent = `
    @keyframes pro_fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pro_pop{0%{transform:scale(.92);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
    @keyframes pro_shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes barGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes badgeUnlock{0%{transform:scale(.8) rotate(-5deg);opacity:0}50%{transform:scale(1.05) rotate(1deg)}100%{transform:scale(1) rotate(0);opacity:1}}
    @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(0,230,118,.25)}50%{box-shadow:0 0 0 8px rgba(0,230,118,0)}}
    @keyframes slideInRight{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
    .pro-enter{animation:pro_fadeUp .6s cubic-bezier(.22,1,.36,1) both}
    .pro-pop{animation:pro_pop .4s cubic-bezier(.22,1,.36,1) both}
    .pro-bar-grow{animation:barGrow .8s cubic-bezier(.22,1,.36,1) both;transform-origin:left}
    .pro-badge-unlock{animation:badgeUnlock .5s cubic-bezier(.22,1,.36,1) both}
    .pro-slide-r{animation:slideInRight .4s cubic-bezier(.22,1,.36,1) both}
    .skel-profile{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:pro_shimmer 1.5s ease-in-out infinite;border-radius:8px}
    .zoka-btn{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zoka-btn:hover{transform:translateY(-1px)}
    .zoka-btn:active{transform:translateY(0) scale(.98)}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   HOOKS — Fixed: stable opts reference prevents infinite re-renders
   ═══════════════════════════════════════════════════════════════ */
const useInView = (threshold = 0.1) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.unobserve(el); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]); // ← stable primitive, not object reference
  return [ref, visible];
};

const calculateAccuracy = (exact, result, total) => {
  if (!total || total === 0) return 0;
  return parseFloat(((exact + result) / total * 100).toFixed(1));
};

/* ── Badge Definitions ── */
const BADGE_DEFS = [
  { id: 'first-pred', name: 'First Step', icon: '👟', color: '#60a5fa', check: (p) => p.predictions >= 1, hint: 'Make your first prediction' },
  { id: 'pred-10', name: 'Getting Started', icon: '🎯', color: 'var(--accent)', check: (p) => p.predictions >= 10, hint: 'Make 10 predictions' },
  { id: 'pred-50', name: 'Dedicated', icon: '📊', color: '#8b5cf6', check: (p) => p.predictions >= 50, hint: 'Reach 50 predictions' },
  { id: 'exact-1', name: 'Bullseye', icon: '🎯', color: '#f97116', check: (p) => p.correctScore >= 1, hint: 'Get 1 exact score correct' },
  { id: 'exact-10', name: 'Sharpshooter', icon: '🔥', color: '#ef4444', check: (p) => p.correctScore >= 10, hint: 'Get 10 exact scores correct' },
  { id: 'acc-50', name: '50% Club', icon: '🧠', color: 'var(--gold)', check: (p) => calculateAccuracy(p.correctScore, p.correctResult, p.predictions) >= 50, hint: 'Reach 50% accuracy' },
  { id: 'top-100', name: 'Top 100', icon: '🏆', color: '#eab308', check: (p) => p.points > 0, hint: 'Score points on the leaderboard' },
];

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

const AnimatedStat = ({ value, label, color, suffix = '', decimals = 0, delay = 0, icon }) => {
  const [val, setVal] = useState(0);
  const [ref, visible] = useInView(0.5);

  useEffect(() => {
    if (!visible) return;
    let start = null;
    const duration = 1400;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = eased * value;
      setVal(decimals > 0 ? cur.toFixed(decimals) : Math.floor(cur).toLocaleString());
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, value, decimals]);

  return (
    <div ref={ref} className="pro-pop" style={{
      padding: '20px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 14, textAlign: 'center', position: 'relative', overflow: 'hidden',
      animationDelay: `${delay}ms`,
    }}>
      <div style={{
        position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
        width: '90%', height: '100%', background: `radial-gradient(ellipse, ${color}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `${color}15`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color, marginBottom: 10,
        }}>{icon}</div>
      )}
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 800, lineHeight: 1,
        color, marginBottom: 5, position: 'relative',
      }}>{val}{suffix}</div>
      <div style={{
        fontSize: '.7rem', color: 'var(--text-muted)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.06em', position: 'relative',
      }}>{label}</div>
    </div>
  );
};

const AccuracyRing = ({ value, size = 110 }) => {
  const [ref, visible] = useInView(0.5);
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? 'var(--accent)' : value >= 50 ? 'var(--gold)' : '#f97116';

  return (
    <div ref={ref} className="pro-pop" style={{
      width: size, height: size, position: 'relative',
      opacity: visible ? 1 : 0, animationDelay: '0.2s',
    }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={visible ? offset : circ} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) .3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}%</span>
        <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>Accuracy</span>
      </div>
    </div>
  );
};

const BadgeCard = ({ badge, earned, delay = 0 }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={earned ? 'pro-badge-unlock' : 'pro-pop'}
      style={{
        opacity: earned ? 1 : 0.35,
        transform: hovered && earned ? 'translateY(-2px) scale(1.02)' : hovered ? 'translateY(-1px)' : 'translateY(0)',
        filter: earned ? 'none' : 'grayscale(1)',
        transition: 'all .25s cubic-bezier(.22,1,.36,1)',
        animationDelay: `${delay}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        background: hovered && earned ? `${badge.color}12` : 'var(--bg-card)',
        border: `1px solid ${hovered && earned ? `${badge.color}30` : 'var(--border)'}`,
        borderRadius: 20, transition: 'all .2s',
        boxShadow: hovered && earned ? `0 4px 16px ${badge.color}18` : 'none',
        position: 'relative', overflow: 'hidden',
      }}>
        <span style={{
          width: 30, height: 30, borderRadius: '50%',
          background: `${badge.color}${earned ? '20' : '08'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.85rem', flexShrink: 0,
          boxShadow: earned ? `0 0 12px ${badge.color}20` : 'none',
          transition: 'box-shadow .3s',
        }}>{badge.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: earned ? 'var(--text-primary)' : 'var(--text-muted)', display: 'block' }}>{badge.name}</span>
          {!earned && hovered && (
            <span className="pro-slide-r" style={{ fontSize: '.66rem', color: 'var(--text-muted)', display: 'block', marginTop: 1 }}>{badge.hint}</span>
          )}
        </div>
        {!earned && <Lock size={12} style={{ color: 'var(--text-muted)', opacity: .4, flexShrink: 0 }} />}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   SKELETON — prevents flash of demo state before auth resolves
   ═══════════════════════════════════════════════════════════════ */
const ProfileSkeleton = () => (
  <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>
      <div style={{ padding: 32, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28 }}>
        <div className="skel-profile" style={{ width: 88, height: 88, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skel-profile" style={{ width: 180, height: 22, marginBottom: 10 }} />
          <div className="skel-profile" style={{ width: 220, height: 14, marginBottom: 8 }} />
          <div className="skel-profile" style={{ width: 140, height: 12 }} />
        </div>
        <div className="skel-profile" style={{ width: 110, height: 110, borderRadius: '50%', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ padding: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'center' }}>
            <div className="skel-profile" style={{ width: 60, height: 28, margin: '0 auto 8px' }} />
            <div className="skel-profile" style={{ width: 90, height: 10, margin: '0 auto' }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   MAIN PROFILE COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Profile() {
  injectStyles();
  const { currentUser, userProfile, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isDemo = !authLoading && !currentUser;

  // Show skeleton while auth is resolving
  if (authLoading) return <ProfileSkeleton />;

  const profile = userProfile || {
    displayName: 'Guest', email: 'Sign in to get started', points: 0,
    predictions: 0, correctScore: 0, correctResult: 0, role: 'user',
  };

  const accuracyNum = calculateAccuracy(profile.correctScore, profile.correctResult, profile.predictions);
  const initials = useMemo(() => profile.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2), [profile.displayName]);
  const memberSince = useMemo(
    () => currentUser?.metadata?.creationTime
      ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : null,
    [currentUser]
  );

  const earnedBadges = useMemo(() => BADGE_DEFS.filter(b => b.check(profile)), [profile]);
  const lockedBadges = useMemo(() => BADGE_DEFS.filter(b => !b.check(profile)), [profile]);
  const missedCount = Math.max(0, profile.predictions - profile.correctScore - profile.correctResult);
  const totalCorrect = profile.correctScore + profile.correctResult;
  const hasData = profile.predictions > 0;

  const handleLogout = useCallback(async () => {
    try { await logout(); } catch {}
    navigate('/');
  }, [logout, navigate]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SEO
        title="My Profile"
        description="View your prediction stats, accuracy, badges, and leaderboard rank on ZOKASCORE."
        keywords="profile, prediction stats, accuracy, badges, leaderboard rank"
        url="https://zokascore.com/profile"
      />

<div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 80px' }}>

  {/* PROFILE HEADER */}
  <div className="pro-enter" style={{
          padding: 32, background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, display: 'flex', alignItems: 'center', gap: 24,
          flexWrap: 'wrap', position: 'relative', overflow: 'hidden', marginBottom: 28,
        }}>
          {/* Top accent line */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), #69f0ae, transparent)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1, minWidth: 280 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: isDemo
                  ? 'linear-gradient(135deg, var(--text-muted), rgba(255,255,255,.1))'
                  : 'linear-gradient(135deg, var(--accent), #69f0ae)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem', fontWeight: 900, color: 'var(--bg-deep)',
                boxShadow: isDemo
                  ? '0 0 0 3px var(--bg-card), 0 0 0 5px rgba(255,255,255,.1)'
                  : '0 0 0 3px var(--bg-card), 0 0 0 5px rgba(0,230,118,.3)',
                fontFamily: 'var(--font-display)',
                transition: 'all .3s',
              }}>{initials}</div>
              <div style={{
                position: 'absolute', bottom: 0, right: 0, width: 24, height: 24,
                borderRadius: '50%', border: '2px solid var(--bg-card)',
                background: isDemo ? 'var(--text-muted)' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.6rem', color: 'var(--bg-deep)', fontWeight: 800,
              }}>{isDemo ? '?' : '✓'}</div>
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                {profile.displayName}
                {profile.role === 'admin' && (
                  <span style={{
                    fontSize: '.64rem', padding: '2px 8px', borderRadius: 6,
                    background: 'rgba(239,68,68,.12)', color: '#ef4444', fontWeight: 700,
                  }}>ADMIN</span>
                )}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.86rem', color: 'var(--text-muted)', marginTop: 4 }}>
                <Mail size={14} /> {profile.email}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
                {memberSince && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.78rem', color: 'var(--text-muted)' }}>
                    <Calendar size={13} /> {memberSince}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.78rem', color: earnedBadges.length > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                  <Star size={13} fill={earnedBadges.length > 0 ? 'var(--gold)' : 'none'} /> {earnedBadges.length}/{BADGE_DEFS.length}
                </span>
              </div>
            </div>
          </div>

          {/* Ring + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
            <AccuracyRing value={accuracyNum} size={110} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!isDemo && (
                <button className="zoka-btn" style={{
                  padding: '8px 14px', borderRadius: 8, background: 'rgba(255,255,255,.04)',
                  border: '1px solid var(--border)', color: 'var(--text-primary)',
                  fontWeight: 600, fontSize: '.78rem', display: 'flex', alignItems: 'center',
                  gap: 6, whiteSpace: 'nowrap',
                }}>
                  <Edit3 size={14} /> Edit
                </button>
              )}
              {!isDemo && (
                <button onClick={handleLogout} className="zoka-btn" style={{
                  padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,.06)',
                  border: '1px solid rgba(239,68,68,.12)', color: '#ef4444',
                  fontWeight: 600, fontSize: '.78rem', display: 'flex', alignItems: 'center',
                  gap: 6, whiteSpace: 'nowrap',
                }}>
                  <LogOut size={14} /> Sign Out
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══ STATS GRID ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
          <AnimatedStat value={profile.points} label="Points" color="var(--accent)" delay={0} icon={<Trophy size={16} />} />
          <AnimatedStat value={accuracyNum} label="Accuracy" color="var(--gold)" suffix="%" decimals={1} delay={80} icon={<Target size={16} />} />
          <AnimatedStat value={profile.predictions} label="Predictions" color="#60a5fa" delay={160} icon={<Calendar size={16} />} />
          <AnimatedStat value={profile.correctScore} label="Exact Scores" color="#f97116" delay={240} icon={<Flame size={16} />} />
        </div>

        {/* ═══ BREAKDOWN BAR ═══ */}
        <div style={{
          padding: '18px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 14, marginBottom: 28,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: '.82rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} /> Score Breakdown
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {hasData ? `${totalCorrect} correct from ${profile.predictions}` : 'No predictions yet'}
            </span>
          </div>

          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 3, background: 'rgba(255,255,255,.03)' }}>
            {hasData ? (
              <>
                {profile.correctScore > 0 && (
                  <div className="pro-bar-grow" style={{
                    flex: profile.correctScore, background: 'var(--accent)',
                    borderRadius: 5, animationDelay: '0.3s',
                  }} title={`Exact: ${profile.correctScore}`} />
                )}
                {profile.correctResult > 0 && (
                  <div className="pro-bar-grow" style={{
                    flex: profile.correctResult, background: 'var(--gold)',
                    borderRadius: 5, animationDelay: '0.45s',
                  }} title={`Result: ${profile.correctResult}`} />
                )}
                {missedCount > 0 && (
                  <div className="pro-bar-grow" style={{
                    flex: missedCount, background: 'rgba(255,255,255,.06)',
                    borderRadius: 5, animationDelay: '0.6s',
                  }} />
                )}
              </>
            ) : (
              <div style={{ flex: 1, background: 'rgba(255,255,255,.03)', borderRadius: 5 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: '.72rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent)' }} />Exact (3pts)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--gold)' }} />Result (1pt)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,.06)' }} />Missed
            </span>
          </div>
        </div>

        {/* ═══ BADGES ═══ */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem',
              fontWeight: 800, color: 'var(--text-primary)', margin: 0,
            }}>
              <Shield size={20} style={{ color: 'var(--gold)' }} /> Badges
            </h3>
            <span style={{
              fontSize: '.78rem', fontWeight: 600, color: 'var(--text-muted)',
              padding: '3px 10px', background: 'rgba(255,255,255,.04)', borderRadius: 10,
            }}>{earnedBadges.length}/{BADGE_DEFS.length}</span>
          </div>

          {earnedBadges.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em',
              }}>Earned</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {earnedBadges.map((badge, i) => (
                  <BadgeCard key={badge.id} badge={badge} earned delay={i * 60} />
                ))}
              </div>
            </div>
          )}

          {lockedBadges.length > 0 && (
            <div>
              <div style={{
                fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em',
              }}>Locked</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8 }}>
                {lockedBadges.map((badge, i) => (
                  <BadgeCard key={badge.id} badge={badge} earned={false} delay={(earnedBadges.length + i) * 60} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ CTA ═══ */}
        <div className="pro-enter" style={{
          textAlign: 'center', padding: '48px 24px',
          background: isDemo
            ? 'linear-gradient(135deg, rgba(0,230,118,.06) 0%, rgba(96,165,250,.04) 100%)'
            : 'linear-gradient(135deg, rgba(0,230,118,.06) 0%, transparent 100%)',
          border: `1px solid ${isDemo ? 'rgba(0,230,118,.12)' : 'rgba(0,230,118,.08)'}`,
          borderRadius: 16, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'relative' }}>
            {isDemo ? (
              <>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.6rem', fontWeight: 900 }}>Start Predicting</h2>
                <p style={{
                  color: 'var(--text-muted)', fontSize: '.92rem', maxWidth: 420,
                  margin: '0 auto 24px', lineHeight: 1.6,
                }}>
                  Sign in to track your predictions, earn badges, and climb the leaderboard.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="zoka-btn"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '12px 32px', borderRadius: 10, background: 'var(--accent)',
                    color: 'var(--bg-deep)', fontWeight: 700, fontSize: '.9rem',
                    border: 'none', boxShadow: '0 4px 18px rgba(0,230,118,.2)',
                  }}
                >
                  Sign In <ArrowRight size={18} />
                </button>
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 10px', fontSize: '1.6rem', fontWeight: 900 }}>
                  {hasData ? 'Keep the Streak Going' : 'Make Your First Pick'}
                </h2>
                <p style={{
                  color: 'var(--text-muted)', fontSize: '.92rem', maxWidth: 420,
                  margin: '0 auto 24px', lineHeight: 1.6,
                }}>
                  {hasData
                    ? "Predict today's matches and climb the global leaderboard."
                    : "Browse today's fixtures and make your first prediction to start earning badges."
                  }
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate('/fixtures')}
                    className="zoka-btn"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '12px 28px', borderRadius: 10, background: 'var(--accent)',
                      color: 'var(--bg-deep)', fontWeight: 700, fontSize: '.9rem',
                      border: 'none', boxShadow: '0 4px 18px rgba(0,230,118,.2)',
                    }}
                  >
                    <Zap size={18} /> {hasData ? "Today's Picks" : 'Browse Fixtures'}
                  </button>
                  {hasData && (
                    <button
                      onClick={() => navigate('/leaderboard')}
                      className="zoka-btn"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '12px 28px', borderRadius: 10, background: 'transparent',
                        border: '1px solid var(--border)', color: 'var(--text-primary)',
                        fontWeight: 600, fontSize: '.9rem',
                      }}
                    >
                      <Trophy size={18} /> Leaderboard
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}