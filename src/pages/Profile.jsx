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
const calculateAccuracy = (exact, result, totalResolved) => {
  if (!totalResolved || totalResolved < 1) return 0;
  return Math.min(100, Math.round(((exact + result) / totalResolved) * 100));
};

const AnimatedStat = ({ value, label, color, suffix = '', decimals = 0, delay = 0, icon }) => {
  const [val, setVal] = useState(0);
  const [ref, visible] = useInView(0.5);

  useEffect(() => {
    if (!visible) return;
    const safeValue = Number(value ?? 0);
    let start = null;
    const duration = 1400;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = eased * safeValue;
      setVal(decimals > 0 ? cur.toFixed(decimals) : Math.floor(cur).toLocaleString());
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [visible, value, decimals]);

  return (
    <div ref={ref} className="pro-stat-card anim-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <div className="pro-stat-glow" style={{ background: `radial-gradient(ellipse, ${color}15 0%, transparent 70%)` }} />
      {icon && <div className="pro-stat-icon" style={{ background: `${color}15`, color }}>{icon}</div>}
      <div className="pro-stat-val" style={{ color }}>{val}{suffix}</div>
      <div className="pro-stat-lbl">{label}</div>
    </div>
  );
};

const AccuracyRing = ({ value, size = 116 }) => {
  const [ref, visible] = useInView(0.5);
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? 'var(--primary)' : value >= 50 ? 'var(--gold)' : 'var(--danger)';

  return (
    <div ref={ref} className="pro-ring anim-pop" style={{ width: size, height: size, opacity: visible ? 1 : 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={visible ? offset : circ} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1) .3s', filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="pro-ring-inner">
        <span className="pro-ring-text" style={{ color }}>{value}%</span>
        <span className="pro-ring-lbl">Accuracy</span>
      </div>
    </div>
  );
};

const BadgeCard = ({ badge, earned, delay = 0 }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`pro-badge anim-fade-up ${earned ? 'unlock' : 'locked'}`}
      style={{
        animationDelay: `${delay}ms`,
        transform: hovered && earned ? 'translateY(-3px)' : 'translateY(0)',
        borderColor: hovered && earned ? `${badge.color}40` : 'rgba(255,255,255,0.08)',
        boxShadow: hovered && earned ? `0 8px 20px ${badge.color}20` : 'none',
        background: hovered && earned ? `${badge.color}10` : 'rgba(15,23,42,0.5)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="pro-badge-icon" style={{ background: `${badge.color}${earned ? '25' : '10'}`, boxShadow: earned ? `0 0 12px ${badge.color}30` : 'none' }}>
        {badge.icon}
      </span>
      <div className="pro-badge-info">
        <span className="pro-badge-name">{badge.name}</span>
        <span className="pro-badge-desc">{badge.description || 'Keep playing to unlock!'}</span>
      </div>
      {!earned && <Lock size={14} className="pro-badge-lock" />}
    </div>
  );
};

const ProfileSkeleton = () => (
  <div className="pro-page">
    <div className="pro-wrap">
      <div className="skeleton" style={{ height: 180, borderRadius: 16, marginBottom: 24 }} />
      <div className="pro-stats-grid">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
      </div>
    </div>
  </div>
);

export default function Profile() {
  const { currentUser, userProfile, signOut, authLoading } = useAuth();
  const navigate = useNavigate();
  const isDemo = !authLoading && !currentUser;

  const isAdmin = userProfile?.isAdmin || userProfile?.role === 'admin' || userProfile?.role === 'staff';

  const { data: userPredictions = {} } = useUserPredictions(currentUser?.uid, todayStr());
  const { data: activePredictions = [] } = useActivePredictions(todayStr());
  const { data: userPoints = null } = useUserPoints();
  const { data: liveFixtures = [] } = useLiveMatches();

  const liveStats = useMemo(() => calculateUserStats(Object.values(userPredictions), activePredictions, liveFixtures), [userPredictions, activePredictions, liveFixtures]);

  const baseProfile = useMemo(() => userProfile || {
    displayName: 'Guest', email: 'Sign in to get started',
    points: 0, predictions: 0, correctScore: 0, correctResult: 0, role: 'user',
  }, [userProfile]);

  const dbPoints = useMemo(() => userPoints || {}, [userPoints]);

  const profile = useMemo(() => {
    return {
      ...baseProfile,
      ...dbPoints,
      points: (dbPoints.totalPoints || 0) + liveStats.pts,
      predictions: (dbPoints.predictionsCount || 0) + liveStats.pred,
      correctScore: (dbPoints.exactCount || 0) + liveStats.ex,
      correctResult: (dbPoints.resultCount || 0) + liveStats.rs,
      missCount: (dbPoints.missCount || 0), 
      streak: liveStats.streak, 
      beatZoka: false, 
      bestRank: dbPoints.bestRank || 0,
    };
  }, [baseProfile, dbPoints, liveStats]);

  if (authLoading) return <ProfileSkeleton />;

  const exact = getExact(profile);
  const result = getResult(profile);
  const miss = profile.missCount || 0;
  const totalResolved = exact + result + miss; 
  const total = getPredictions(profile);
  const points = getPoints(profile);
  const accuracyNum = calculateAccuracy(exact, result, totalResolved);
  
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

  const profileSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "mainEntity": {
      "@type": "Person",
      "name": profile.displayName,
      "description": `ZOKASCORE Predictor with ${points} points and ${accuracyNum}% accuracy.`
    }
  };

  return (
    <div className="pro-page">
      <SEO
        title="My Profile & Account | ZOKASCORE"
        description="Manage your ZOKASCORE account, update your profile, track your prediction history, monitor your performance, and view your leaderboard progress."
        keywords="ZOKASCORE profile, user account, account settings, prediction history, leaderboard progress, football predictions"
        robots="noindex,nofollow"
        structuredData={profileSchema}
      />

      <div className="pro-wrap">
        <div className="pro-header-card">
          <div className="pro-header-top-line" />
          <div className="pro-header-content">
            <div className="pro-header-left">
              <div className="pro-avatar-wrap">
                <div className="pro-avatar" style={{
                  background: isDemo ? 'linear-gradient(135deg, #64748b, #334155)' : 'linear-gradient(135deg, var(--primary), var(--primary-dim))',
                  boxShadow: isDemo ? '0 0 0 3px var(--bg-deep), 0 0 0 6px rgba(255,255,255,.1)' : '0 0 0 3px var(--bg-deep), 0 0 0 6px rgba(var(--primary-rgb),.3)'
                }}>
                  {initials}
                </div>
                <div className="pro-avatar-badge" style={{ background: isDemo ? '#64748b' : 'var(--primary)' }}>
                  {isDemo ? '?' : '✓'}
                </div>
              </div>

              <div className="pro-header-info">
                <h2 className="pro-name">
                  {profile.displayName}
                  {isAdmin && <span className="pro-admin-badge">ADMIN</span>}
                </h2>
                <div className="pro-email"><Mail size={14} /> {profile.email}</div>
                <div className="pro-meta">
                  {memberSince && <span><Calendar size={13} /> {memberSince}</span>}
                  <span><Star size={13} fill={earnedBadges.length > 0 ? 'currentColor' : 'none'} /> {earnedBadges.length}/{ACHIEVEMENTS.length} Badges</span>
                </div>
              </div>
            </div>

            <div className="pro-header-right">
              <AccuracyRing value={accuracyNum} size={110} />
              <div className="pro-header-actions">
                {!isDemo && (
                  <button className="btn btn-secondary btn-sm"><Edit3 size={15} /> Edit</button>
                )}
                {!isDemo && (
                  <button onClick={handleLogout} className="btn btn-danger btn-sm"><LogOut size={15} /> Sign Out</button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="pro-season-grid">
          <div className="pro-season-card active">
            <div className="pro-season-head">
              <h3>🎉 Fun Season</h3>
              <span className="pro-tag active">ACTIVE</span>
            </div>
            <p>Compete daily, build your rank, and practice before real rewards begin.</p>
          </div>
          <div className="pro-season-card soon">
            <div className="pro-season-head">
              <h3>🏆 Real Season</h3>
              <span className="pro-tag soon">SOON</span>
            </div>
            <p>Cash prizes, ZOKA Jerseys, and the Golden Crown await the G.O.A.T.</p>
          </div>
        </div>

        <div className="pro-stats-grid">
          <AnimatedStat value={points} label="Points" color="var(--primary)" delay={0} icon={<Trophy size={18} />} />
          <AnimatedStat value={accuracyNum} label="Accuracy" color="var(--gold)" suffix="%" decimals={1} delay={80} icon={<Target size={18} />} />
          <AnimatedStat value={total} label="Predictions" color="var(--accent)" delay={160} icon={<Calendar size={18} />} />
          <AnimatedStat value={profile.streak || 0} label="Day Streak" color="var(--danger)" delay={240} icon={<Flame size={18} />} />
        </div>

        <div className="pro-section">
          <div className="pro-section-head">
            <h3><Shield size={22} style={{ color: 'var(--gold)' }} /> Achievements</h3>
            <span className="pro-section-count">{earnedBadges.length}/{ACHIEVEMENTS.length}</span>
          </div>

          {earnedBadges.length > 0 && (
            <div className="pro-badge-group">
              <div className="pro-badge-group-lbl">Earned</div>
              <div className="pro-badge-grid">
                {earnedBadges.map((badge, i) => <BadgeCard key={badge.id} badge={badge} earned delay={i * 60} />)}
              </div>
            </div>
          )}

          {lockedBadges.length > 0 && (
            <div className="pro-badge-group">
              <div className="pro-badge-group-lbl">Locked</div>
              <div className="pro-badge-grid">
                {lockedBadges.map((badge, i) => <BadgeCard key={badge.id} badge={badge} earned={false} delay={(earnedBadges.length + i) * 60} />)}
              </div>
            </div>
          )}
        </div>

        <div className={`pro-cta ${isDemo ? 'demo' : ''}`}>
          <div className="pro-cta-bg" />
          <div className="pro-cta-content">
            {isDemo ? (
              <>
                <h2>Start Predicting</h2>
                <p>Sign in to track your predictions, earn badges, and climb the leaderboard.</p>
                <button onClick={() => navigate('/login')} className="btn btn-primary">
                  Sign In <ArrowRight size={18} />
                </button>
              </>
            ) : (
              <>
                <h2>{total > 0 ? 'Keep the Streak Going' : 'Make Your First Pick'}</h2>
                <p>
                  {total > 0 ? "Predict today's matches and climb the global leaderboard." : "Browse today's fixtures and make your first prediction to start earning badges."}
                </p>
                <div className="pro-cta-actions">
                  <button onClick={() => navigate('/fixtures')} className="btn btn-primary">
                    <Zap size={18} /> {total > 0 ? "Today's Picks" : 'Browse Fixtures'}
                  </button>
                  {total > 0 && (
                    <button onClick={() => navigate('/leaderboard')} className="btn btn-secondary">
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