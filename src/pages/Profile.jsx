import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LogOut, Target, Trophy, Flame, Calendar, Edit3, Shield, ChevronRight, 
  Mail, Star, ArrowRight, Zap, Lock, TrendingUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { subscribeToLiveFixtures } from '../utils/api';
import { calcPoints, SPORT, isFinishedStatus } from '../utils/constants';
import { todayStr } from '../utils/dates';
import SEO from "../components/SEO";

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

const getPredictions = (p) => p?.predictions || 0;
const getExact = (p) => p?.correctScore || 0;
const getResult = (p) => p?.correctResult || 0;
const getPoints = (p) => p?.points || 0;
const calculateAccuracy = (exact, result, total) => {
  if (!total || total < 1) return 0;
  return Math.min(100, Math.round(((exact + result) / total) * 100));
};

const BADGE_DEFS = [
  { id: 'first-pred', name: 'First Step', icon: '👟', color: '#60a5fa', check: (p) => getPredictions(p) >= 1, hint: 'Make your first prediction' },
  { id: 'pred-10', name: 'Getting Started', icon: '🎯', color: 'var(--accent)', check: (p) => getPredictions(p) >= 10, hint: 'Make 10 predictions' },
  { id: 'pred-50', name: 'Dedicated', icon: '📊', color: '#8b5cf6', check: (p) => getPredictions(p) >= 50, hint: 'Reach 50 predictions' },
  { id: 'exact-1', name: 'Bullseye', icon: '🎯', color: '#f97116', check: (p) => getExact(p) >= 1, hint: 'Get 1 exact score correct' },
  { id: 'exact-10', name: 'Sharpshooter', icon: '🔥', color: '#ef4444', check: (p) => getExact(p) >= 10, hint: 'Get 10 exact scores correct' },
  { id: 'acc-50', name: '50% Club', icon: '🧠', color: 'var(--gold)', check: (p) => calculateAccuracy(getExact(p), getResult(p), getPredictions(p)) >= 50, hint: 'Reach 50% accuracy (min 10 preds)' },
  { id: 'top-100', name: 'Top 100', icon: '🏆', color: '#eab308', check: (p) => getPoints(p) > 0, hint: 'Score points on the leaderboard' },
];

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
          {!earned && hovered && (
            <span className="pro-slide-r" style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginTop: 2 }}>{badge.hint}</span>
          )}
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
  const appData = useAppData();
  const navigate = useNavigate();
  const isDemo = !authLoading && !currentUser;

  const [liveFixtures, setLiveFixtures] = useState([]);
  
  // ★ FIX: Added missing `todayStr()` argument
  useEffect(() => {
    if (isDemo) return;
    const unsub = subscribeToLiveFixtures(todayStr(), ({ matches }) => {
      setLiveFixtures(matches || []);
    });
    return () => unsub();
  }, [isDemo]);

  const liveStats = useMemo(() => {
    if (isDemo || !currentUser?.uid) return { pts: 0, ex: 0, rs: 0, mi: 0, pred: 0 };
    const uid = currentUser.uid;
    const today = todayStr();
    const userPreds = Object.values(appData.userPredictions || {}).filter(p => p.userId === uid && p.matchDate === today);
    
    const matchesMap = new Map();
    (appData.activePredictions || []).forEach(p => matchesMap.set(String(p.matchId), p));
    liveFixtures.forEach(f => {
      const matchId = String(f.id);
      const existing = matchesMap.get(matchId);
      if (existing) {
        matchesMap.set(matchId, {
          ...existing,
          status: f.status || existing.status,
          homeScore: f.homeScore ?? existing.homeScore,
          awayScore: f.awayScore ?? existing.awayScore,
          isLive: f.isLive || existing.isLive,
          isFinished: f.isFinished || existing.isFinished,
        });
      }
    });

    let pts = 0, ex = 0, rs = 0, mi = 0, pred = 0;
    userPreds.forEach(p => {
      pred++;
      const match = matchesMap.get(String(p.matchId));
      if (match && isFinishedStatus(match.status, SPORT.FOOTBALL) && match.homeScore != null) {
        const r = calcPoints(p.homeScore, p.awayScore, match.homeScore, match.awayScore);
        if (r.type !== 'pending') {
          pts += r.points;
          if (r.type === 'exact') ex++;
          else if (r.type === 'result') rs++;
          else mi++;
        }
      }
    });
    
    return { pts, ex, rs, mi, pred };
  }, [isDemo, currentUser, appData.userPredictions, appData.activePredictions, liveFixtures]);

  if (authLoading) return <ProfileSkeleton />;

  const baseProfile = userProfile || {
    displayName: 'Guest', email: 'Sign in to get started',
    points: 0, predictions: 0, correctScore: 0, correctResult: 0, role: 'user',
  };

  const profile = {
    ...baseProfile,
    points: (baseProfile.points || 0) + liveStats.pts,
    predictions: (baseProfile.predictions || 0) + liveStats.pred,
    correctScore: (baseProfile.correctScore || 0) + liveStats.ex,
    correctResult: (baseProfile.correctResult || 0) + liveStats.rs,
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

  const earnedBadges = useMemo(() => BADGE_DEFS.filter(b => b.check(profile)), [profile]);
  const lockedBadges = useMemo(() => BADGE_DEFS.filter(b => !b.check(profile)), [profile]);
  const missedCount = Math.max(0, total - exact - result);
  const totalCorrect = exact + result;
  const hasData = total > 0;

  const handleLogout = useCallback(async () => {
    try { await signOut(); } catch {}
    navigate('/');
  }, [signOut, navigate]);

  return (
    <div style={{ minHeight: '100dvh', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      <SEO
        title="My Profile & Settings | ZOKASCORE"
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
                {profile.role === 'admin' && (
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
                  <Star size={14} fill={earnedBadges.length > 0 ? 'var(--gold)' : 'none' } /> {earnedBadges.length}/{BADGE_DEFS.length}
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

        <div className="pro-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 30 }}>
          <AnimatedStat value={points} label="Points" color="var(--accent)" delay={0} icon={<Trophy size={17} />} />
          <AnimatedStat value={accuracyNum} label="Accuracy" color="var(--gold)" suffix="%" decimals={1} delay={80} icon={<Target size={17} />} />
          <AnimatedStat value={total} label="Predictions" color="#60a5fa" delay={160} icon={<Calendar size={17} />} />
          <AnimatedStat value={exact} label="Exact Scores" color="#f97116" delay={240} icon={<Flame size={17} />} />
        </div>

        <div style={{
          padding: '20px 22px', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, marginBottom: 30,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: '.86rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
              <TrendingUp size={15} /> Score Breakdown
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
              {hasData ? `${totalCorrect} correct from ${total}` : 'No predictions yet'}
            </span>
          </div>

          <div className="pro-breakdown-bar" style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 4, background: 'rgba(255,255,255,.03)' }}>
            {hasData ? (
              <>
                {exact > 0 && (
                  <div className="pro-bar" style={{ flex: exact, background: 'var(--accent)', borderRadius: 6, animationDelay: '0.3s' }} title={`Exact: ${exact}`} />
                )}
                {result > 0 && (
                  <div className="pro-bar" style={{ flex: result, background: 'var(--gold)', borderRadius: 6, animationDelay: '0.45s' }} title={`Result: ${result}`} />
                )}
                {missedCount > 0 && (
                  <div className="pro-bar" style={{ flex: missedCount, background: 'rgba(255,255,255,.06)', borderRadius: 6, animationDelay: '0.6s' }} />
                )}
              </>
            ) : (
              <div style={{ flex: 1, background: 'rgba(255,255,255,.03)', borderRadius: 6 }} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 22, marginTop: 12, fontSize: '.74rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent)' }} /> Exact (10pts)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--gold)' }} /> Result (3pts)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: 'rgba(255,255,255,.06)' }} /> Missed
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0 }}>
              <Shield size={22} style={{ color: 'var(--gold)' }} /> Badges
            </h3>
            <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 12px', background: 'rgba(255,255,255,.04)', borderRadius: 10 }}>{earnedBadges.length}/{BADGE_DEFS.length}</span>
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
                  {hasData ? 'Keep the Streak Going' : 'Make Your First Pick'}
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '.94rem', maxWidth: 440, margin: '0 auto 28px', lineHeight: 1.6 }}>
                  {hasData
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
                    <Zap size={18} /> {hasData ? "Today's Picks" : 'Browse Fixtures'}
                  </button>
                  {hasData && (
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