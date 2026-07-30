import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, Target, Trophy, Flame, Calendar, Edit3, Shield, 
  Mail, Star, ArrowRight, Zap, Lock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUserPredictions, useActivePredictions, useUserPoints } from '../hooks/useUserData';
import { useLiveMatches } from '../hooks/useFixtures';
import { ACHIEVEMENTS } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from '../components/SEO';
import { calculateUserStats } from '../engine/predictionEngine';

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
  }, [threshold]);
  return [ref, visible];
};

const getPredictions = (p) => p?.predictions || p?.predictionsCount || 0;
const getExact = (p) => p?.correctScore || p?.exactCount || 0;
const getResult = (p) => p?.correctResult || p?.resultCount || 0;
const getPoints = (p) => p?.points || p?.totalPoints || 0;
const calculateAccuracy = (exact, result, total) => {
  if (!total || total < 1) return 0;
  return Math.min(100, Math.round(((exact + result) / total) * 100));
};

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
      padding: '22px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, textAlign: 'center', position: 'relative', overflow: 'hidden',
      animationDelay: `${delay}ms`,
    }}>
      <div style={{
        position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
        width: '90%', height: '100%', background: `radial-gradient(ellipse, ${color}10 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      {icon && (
        <div style={{
          width: 38, height: 38, borderRadius: 11, background: `${color}15`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color, marginBottom: 10,
        }}>{icon}</div>
      )}
      <div className="pro-stat-val" style={{
        fontFamily: 'var(--font-display)', fontSize: '2.1rem', fontWeight: 900, lineHeight: 1,
        color, marginBottom: 6, position: 'relative',
      }}>{val}{suffix}</div>
      <div style={{
        fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.06em', position: 'relative',
      }}>{label}</div>
    </div>
  );
};

const AccuracyRing = ({ value, size = 116 }) => {
  const [ref, visible] = useInView(0.5);
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? 'var(--accent)' : value >= 50 ? 'var(--gold)' : '#f97116';

  return (
    <div ref={ref} className="pro-pop pro-ring" style={{
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
        <span className="pro-ring-text" style={{ fontFamily: 'var(--font-display)', fontSize: '1.7rem', fontWeight: 900, color, lineHeight: 1 }}>{value}%</span>
        <span style={{ fontSize: '.64rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>Accuracy</span>
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
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
        background: hovered && earned ? `${badge.color}12` : 'var(--bg-card)',
        border: `1.5px solid ${hovered && earned ? `${badge.color}30` : 'var(--border)'}`,
        borderRadius: 22, transition: 'all .2s',
        boxShadow: hovered && earned ? `0 4px 18px ${badge.color}18` : 'none',
        position: 'relative', overflow: 'hidden',
        minHeight: 52,
      }}>
        <span style={{
          width: 34, height: 34, borderRadius: '50%',
          background: `${badge.color}${earned ? '20' : '08'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '.9rem', flexShrink: 0,
          boxShadow: earned ? `0 0 14px ${badge.color}22` : 'none',
          transition: 'box-shadow .3s',
        }}>{badge.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '.86rem', fontWeight: 700, color: earned ? 'var(--text-primary)' : 'var(--text-muted)', display: 'block' }}>{badge.name}</span>
        </div>
        {!earned && <Lock size={13} style={{ color: 'var(--text-muted)', opacity: .4, flexShrink: 0 }} />}
      </div>
    </div>
  );
};

const ProfileSkeleton = () => (
  <div style={{ minHeight: '100dvh', overflow: 'hidden', background: 'var(--bg-deep)' }}>
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 100px' }}>
      <div style={{ padding: 34, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28 }}>
        <div className="skel-profile" style={{ width: 92, height: 92, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="skel-profile" style={{ width: 180, height: 24, marginBottom: 12 }} />
          <div className="skel-profile" style={{ width: 220, height: 16, marginBottom: 10 }} />
          <div className="skel-profile" style={{ width: 140, height: 14 }} />
        </div>
        <div className="skel-profile" style={{ width: 116, height: 116, borderRadius: '50%', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ padding: 22, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, textAlign: 'center' }}>
            <div className="skel-profile" style={{ width: 64, height: 30, margin: '0 auto 10px' }} />
            <div className="skel-profile" style={{ width: 96, height: 12, margin: '0 auto' }} />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function Profile() {
  const { currentUser, userProfile, signOut, authLoading } = useAuth();
  const navigate = useNavigate();
  const isDemo = !authLoading && !currentUser;

  // Removed redundant useEffect. Pulled directly from AuthContext.
  const isAdmin = userProfile?.isAdmin || userProfile?.role === 'admin';

  const { data: userPredictions = {} } = useUserPredictions(currentUser?.uid, todayStr());
  const { data: activePredictions = [] } = useActivePredictions(todayStr());
  const { data: userPoints = null } = useUserPoints();
  const { data: liveFixtures = [] } = useLiveMatches();

  const liveStats = useMemo(() => calculateUserStats(Object.values(userPredictions), activePredictions, liveFixtures), [userPredictions, activePredictions, liveFixtures]);

  if (authLoading) return <ProfileSkeleton />;

  const baseProfile = userProfile || {
    displayName: 'Guest', email: 'Sign in to get started',
    points: 0, predictions: 0, correctScore: 0, correctResult: 0, role: 'user',
  };

  const dbPoints = userPoints || {};
  const profile = {
    ...baseProfile,
    ...dbPoints,
    points: (dbPoints.totalPoints || 0) + liveStats.pts,
    predictions: (dbPoints.predictionsCount || 0) + liveStats.pred,
    correctScore: (dbPoints.exactCount || 0) + liveStats.ex,
    correctResult: (dbPoints.resultCount || 0) + liveStats.rs,
    streak: liveStats.streak, 
    beatZoka: false, 
    bestRank: dbPoints.bestRank || 0,
  };

  const exact = getExact(profile);
  const result = getResult(profile);
  const total = getPredictions(profile);
  const points = getPoints(profile);
  const accuracyNum = calculateAccuracy(exact, result, total);
  
  const initials = useMemo(() => (profile.displayName || 'G').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2), [profile.displayName]);
  const memberSince = useMemo(
    () => currentUser?.metadata?.creationTime
      ? new Date(currentUser.metadata.creationTime).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : null,
    [currentUser]
  );

  const earnedBadges = useMemo(() => ACHIEVEMENTS.filter(b => b.check(profile)), [profile]);
  const lockedBadges = useMemo(() => ACHIEVEMENTS.filter(b => !b.check(profile)), [profile]);

  const handleLogout = useCallback(async () => {
    try { await signOut(); } catch {}
    navigate('/');
  }, [signOut, navigate]);

  return (
    <div style={{ minHeight: '100dvh', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      <SEO
        title="My Profile & Settings"
        description="View and manage your ZOKASCORE profile. Update your account settings, track your prediction history, and review your overall leaderboard rankings here."
        keywords="user profile, account settings, ZOKASCORE profile, prediction history, user dashboard"
        robots="noindex,nofollow"
      />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 100px' }}>

        <div className="pro-enter" style={{
          padding: 34, background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 18, display: 'flex', alignItems: 'center', gap: 28,
          flexWrap: 'wrap', position: 'relative', overflow: 'hidden', marginBottom: 30,
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--accent), #34d399, transparent)' }} />

          <div className="pro-header-inner" style={{ display: 'flex', alignItems: 'center', gap: 28, flex: 1, minWidth: 280 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div className="pro-avatar" style={{
                width: 92, height: 92, borderRadius: '50%',
                background: isDemo
                  ? 'linear-gradient(135deg, var(--text-muted), rgba(255,255,255,.1))'
                  : 'linear-gradient(135deg, var(--accent), #34d399)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2.1rem', fontWeight: 900, color: 'var(--bg-deep)',
                boxShadow: isDemo
                  ? '0 0 0 3px var(--bg-card), 0 0 0 6px rgba(255,255,255,.1)'
                  : '0 0 0 3px var(--bg-card), 0 0 0 6px rgba(16,185,129,.3)',
                fontFamily: 'var(--font-display)',
                transition: 'all .3s',
              }}>{initials}</div>
              <div style={{
                position: 'absolute', bottom: 0, right: 0, width: 26, height: 26,
                borderRadius: '50%', border: '2px solid var(--bg-card)',
                background: isDemo ? 'var(--text-muted)' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.64rem', color: 'var(--bg-deep)', fontWeight: 800,
              }}>{isDemo ? '?' : '✓'}</div>
            </div>

            <div className="pro-header-info" style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{
                margin: 0, fontSize: '1.55rem', fontWeight: 900, color: 'var(--text-primary)',
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                {profile.displayName}
                {isAdmin && (
                  <span style={{
                    fontSize: '.66rem', padding: '3px 10px', borderRadius: 7,
                    background: 'rgba(239,68,68,.12)', color: '#ef4444', fontWeight: 700,
                  }}>ADMIN</span>
                )}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.88rem', color: 'var(--text-muted)', marginTop: 5, justifyContent: 'center' }}>
                <Mail size={14} /> {profile.email}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {memberSince && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    <Calendar size={14} /> {memberSince}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: earnedBadges.length > 0 ? 'var(--gold)' : 'var(--text-muted)' }}>
                  <Star size={14} fill={earnedBadges.length > 0 ? 'var(--gold)' : 'none' } /> {earnedBadges.length}/{ACHIEVEMENTS.length}
                </span>
              </div>
            </div>
          </div>

          <div className="pro-header-right" style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0 }}>
            <AccuracyRing value={accuracyNum} size={116} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!isDemo && (
                <button className="zoka-btn" style={{
                  padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,.04)',
                  border: '1.5px solid var(--border)', color: 'var(--text-primary)',
                  fontWeight: 700, fontSize: '.82rem', display: 'flex', alignItems: 'center',
                  gap: 7, whiteSpace: 'nowrap', minHeight: 44,
                }}>
                  <Edit3 size={15} /> Edit
                </button>
              )}
              {!isDemo && (
                <button onClick={handleLogout} className="zoka-btn" style={{
                  padding: '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,.06)',
                  border: '1.5px solid rgba(239,68,68,.12)', color: '#ef4444',
                  fontWeight: 700, fontSize: '.82rem', display: 'flex', alignItems: 'center',
                  gap: 7, whiteSpace: 'nowrap', minHeight: 44,
                }}>
                  <LogOut size={15} /> Sign Out
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="pro-enter" style={{
          display: 'flex', gap: 14, marginBottom: 30, flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: 280, padding: 20, background: 'linear-gradient(135deg, rgba(16,185,129,.06), transparent)', border: '1.5px solid rgba(16,185,129,.1)', borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>🎉 Fun Season</h3>
              <span style={{ fontSize: '.6rem', padding: '3px 8px', background: 'var(--accent)', color: '#000', borderRadius: 4, fontWeight: 800 }}>ACTIVE</span>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Compete daily, build your rank, and practice before real rewards begin.
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 280, padding: 20, background: 'rgba(255,255,255,.02)', border: '1.5px dashed var(--border)', borderRadius: 16, opacity: 0.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>🏆 Real Season</h3>
              <span style={{ fontSize: '.6rem', padding: '3px 8px', background: 'var(--bg-deep)', color: 'var(--text-muted)', borderRadius: 4, fontWeight: 800 }}>SOON</span>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Cash prizes, ZOKA Jerseys, and the Golden Crown await the G.O.A.T.
            </p>
          </div>
        </div>

        <div className="pro-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 30 }}>
          <AnimatedStat value={points} label="Points" color="var(--accent)" delay={0} icon={<Trophy size={17} />} />
          <AnimatedStat value={accuracyNum} label="Accuracy" color="var(--gold)" suffix="%" decimals={1} delay={80} icon={<Target size={17} />} />
          <AnimatedStat value={total} label="Predictions" color="#60a5fa" delay={160} icon={<Calendar size={17} />} />
          <AnimatedStat value={profile.streak || 0} label="Day Streak" color="#ef4444" delay={240} icon={<Flame size={17} />} />
        </div>

        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              <Shield size={22} style={{ color: 'var(--gold)' }} /> Achievements
            </h3>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 10 }}>{earnedBadges.length}/{ACHIEVEMENTS.length}</span>
          </div>

          {earnedBadges.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Earned</div>
              <div className="pro-badge-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {earnedBadges.map((badge, i) => (
                  <BadgeCard key={badge.id} badge={badge} earned delay={i * 70} />
                ))}
              </div>
            </div>
          )}

          {lockedBadges.length > 0 && (
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Locked</div>
              <div className="pro-badge-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {lockedBadges.map((badge, i) => (
                  <BadgeCard key={badge.id} badge={badge} earned={false} delay={(earnedBadges.length + i) * 70} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pro-enter" style={{
          textAlign: 'center', padding: '52px 28px',
          background: isDemo
            ? 'linear-gradient(135deg, rgba(16,185,129,.06) 0%, rgba(96,165,250,.04) 100%)'
            : 'linear-gradient(135deg, rgba(16,185,129,.06) 0%, transparent 100%)',
          border: `1.5px solid ${isDemo ? 'rgba(16,185,129,.12)' : 'rgba(16,185,129,.08)'}`,
          borderRadius: 18, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'relative' }}>
            {isDemo ? (
              <>
                <h2 className="pro-cta-title" style={{ margin: '0 0 12px', fontSize: '1.65rem', fontWeight: 900 }}>Start Predicting</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '.94rem', maxWidth: 440, margin: '0 auto 28px', lineHeight: 1.6 }}>
                  Sign in to track your predictions, earn badges, and climb the leaderboard.
                </p>
                <button onClick={() => navigate('/login')} className="zoka-btn" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '14px 36px', borderRadius: 14, background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
                  color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.94rem',
                  border: 'none', boxShadow: '0 6px 24px rgba(16,185,129,.25), inset 0 1px 0 rgba(255,255,255,.2)',
                  minHeight: 56,
                }}>
                  Sign In <ArrowRight size={18} />
                </button>
              </>
            ) : (
              <>
                <h2 className="pro-cta-title" style={{ margin: '0 0 12px', fontSize: '1.65rem', fontWeight: 900 }}>
                  {total > 0 ? 'Keep the Streak Going' : 'Make Your First Pick'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '.94rem', maxWidth: 440, margin: '0 auto 28px', lineHeight: 1.6 }}>
                  {total > 0
                    ? "Predict today's matches and climb the global leaderboard."
                    : "Browse today's fixtures and make your first prediction to start earning badges."
                  }
                </p>
                <div className="pro-cta-btns" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/fixtures')} className="zoka-btn" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '14px 30px', borderRadius: 14, background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
                    color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.94rem',
                    border: 'none', boxShadow: '0 6px 24px rgba(16,185,129,.25), inset 0 1px 0 rgba(255,255,255,.2)',
                    minHeight: 56,
                  }}>
                    <Zap size={18} /> {total > 0 ? "Today's Picks" : 'Browse Fixtures'}
                  </button>
                  {total > 0 && (
                    <button onClick={() => navigate('/leaderboard')} className="zoka-btn" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 10,
                      padding: '14px 30px', borderRadius: 14, background: 'transparent',
                      border: '1.5px solid var(--border)', color: 'var(--text-primary)',
                      fontWeight: 700, fontSize: '.94rem', minHeight: 56,
                    }}>
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