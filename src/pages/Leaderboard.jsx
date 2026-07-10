// FILE: src/pages/Leaderboard.jsx
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Medal, Star, Loader, ChevronDown, Award
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { collection, query, where, onSnapshot, getDocs, orderBy } from 'firebase/firestore';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('lb-v5')) return;
  const s = document.createElement('style');
  s.id = 'lb-v5';
  s.textContent = `
    @keyframes lbUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes lbSr{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes lbPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
    @keyframes lbCrown{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-6px) rotate(5deg)}}
    @keyframes lbBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes lbGlow{0%,100%{box-shadow:0 0 12px rgba(0,230,118,.15)}50%{box-shadow:0 0 24px rgba(0,230,118,.3)}}
    @keyframes lbShim{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes lbPod{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
    @keyframes lbFade{from{opacity:0}to{opacity:1}}
    @keyframes lbGoldPulse{0%,100%{text-shadow:0 0 8px rgba(245,197,66,.3)}50%{text-shadow:0 0 20px rgba(245,197,66,.6)}}
    .lb-up{animation:lbUp .5s cubic-bezier(.22,1,.36,1) both}
    .lb-sr{animation:lbSr .4s cubic-bezier(.22,1,.36,1) both}
    .lb-pop{animation:lbPop .4s cubic-bezier(.22,1,.36,1) both}
    .lb-crown{animation:lbCrown 3s ease-in-out infinite}
    .lb-bar{transform-origin:left center;animation:lbBar .8s cubic-bezier(.22,1,.36,1) both}
    .lb-glow{animation:lbGlow 2s ease-in-out infinite}
    .lb-shim{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:lbShim 1.5s ease-in-out infinite}
    .lb-fade{animation:lbFade .3s ease-out both}
    .lb-gold{animation:lbGoldPulse 2s ease-in-out infinite}
    .zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zb:hover{transform:translateY(-1px);filter:brightness(1.1)}
    .zb:active{transform:translateY(0) scale(.97)}
    .zb:disabled{opacity:.4;pointer-events:none}
    .zc{transition:all .22s cubic-bezier(.22,1,.36,1)}
    .zc:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.18)}
    .tab-b{position:relative;padding:10px 20px;font-weight:700;font-size:.82rem;color:var(--text-muted);background:transparent;border:none;cursor:pointer;transition:all .2s;border-radius:10px 10px 0 0;white-space:nowrap;display:flex;align-items:center;gap:6px}
    .tab-b:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
    .tab-b.act{color:var(--gold);background:rgba(245,197,66,.06)}
    .tab-b.act::after{content:'';position:absolute;bottom:0;left:16px;right:16px;height:2.5px;background:var(--gold);border-radius:2px 2px 0 0}
    .tab-b.goat.act{color:#000;background:linear-gradient(135deg, #fbbf24, #f59e0b);font-weight:800}
    .tab-b.goat.act::after{background:rgba(0,0,0,.2)}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   HELPERS & CONFIG
   ═══════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];
const getWeekStart = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff).toISOString().split('T')[0];
};
const getMonthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
const GOAT_START = '2024-01-01';

function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#78716c'];
const PODIUM_CFG = [
  { h: 140, border: 'var(--gold)', bg: 'linear-gradient(180deg, rgba(245,197,66,.18) 0%, rgba(245,197,66,.04) 100%)', text: 'var(--gold)', avatar: 80, font: '1.4rem', shadow: '0 0 30px rgba(245,197,66,.2)', order: 2 },
  { h: 100, border: '#94a3b8', bg: 'linear-gradient(180deg, rgba(148,163,184,.12) 0%, rgba(148,163,184,.03) 100%)', text: '#94a3b8', avatar: 64, font: '1.1rem', shadow: '0 0 20px rgba(148,163,184,.1)', order: 1 },
  { h: 80, border: '#b45309', bg: 'linear-gradient(180deg, rgba(180,83,9,.12) 0%, rgba(180,83,9,.03) 100%)', text: '#d97706', avatar: 56, font: '0.95rem', shadow: '0 0 16px rgba(180,83,9,.1)', order: 3 },
];

const TABS = [
  { key: 'daily', label: 'Daily', Icon: Calendar },
  { key: 'weekly', label: 'Weekly', Icon: TrendingUp },
  { key: 'monthly', label: 'Monthly', Icon: BarChart3 },
  { key: 'goat', label: 'G.O.A.T', Icon: Crown, isGoat: true },
];

/* ═══════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function AccuracyBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.04)', overflow: 'hidden' }}>
        <div className="lb-bar" style={{ height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${fill}, ${fill}88)`, width: `${value}%`, animationDelay: `${delay || 0}ms` }} />
      </div>
      <span style={{ fontSize: '.72rem', fontWeight: 700, color: fill, minWidth: 32, textAlign: 'right', fontFamily: 'var(--font-display)' }}>{value}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, bgColor, delay }) {
  return (
    <div className="zc lb-pop" style={{ padding: '16px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14, animationDelay: `${delay || 0}ms` }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function PodiumUser({ user, position, delay }) {
  const cfg = PODIUM_CFG[position];
  return (
    <div className="lb-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', order: cfg.order, animationDelay: `${(delay || 0) + 200}ms`, flex: 1, maxWidth: 160 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 10, position: 'relative' }}>
        {position === 0 && <div className="lb-crown" style={{ color: 'var(--gold)', marginBottom: -4, filter: 'drop-shadow(0 0 8px rgba(245,197,66,.4))' }}><Crown size={24} /></div>}
        <div style={{ width: cfg.avatar, height: cfg.avatar, borderRadius: '50%', background: `linear-gradient(135deg, ${cfg.border}33, ${cfg.border}11)`, border: `3px solid ${cfg.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: cfg.font, fontWeight: 900, color: cfg.text, boxShadow: cfg.shadow, fontFamily: 'var(--font-display)' }}>
          {(user.displayName || '??').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ marginTop: 8, fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{user.displayName}</div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 500 }}>{user.points} pts · {user.accuracy}%</div>
      </div>
      <div style={{ width: '100%', height: cfg.h, background: cfg.bg, borderRadius: '12px 12px 0 0', border: '1px solid rgba(255,255,255,.04)', borderBottom: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12, position: 'relative', overflow: 'hidden', animation: `lbPod .6s cubic-bezier(.22,1,.36,1) ${(delay || 0) + 400}ms both` }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: cfg.text, lineHeight: 1 }}>#{position + 1}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr><td colSpan={6} style={{ padding: 0, borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px' }}>
        <div className="lb-shim" style={{ width: 30, height: 14, borderRadius: 4 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div className="lb-shim" style={{ width: 34, height: 34, borderRadius: 9 }} />
          <div className="lb-shim" style={{ width: 100, height: 14, borderRadius: 4 }} />
        </div>
        <div className="lb-shim" style={{ width: 80, height: 10, borderRadius: 4 }} />
      </div>
    </td></tr>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Leaderboard() {
  injectStyles();
  const { currentUser } = useAuth();
  const searchRef = useRef(null);

  const [tab, setTab] = useState('daily');
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [shownCount, setShownCount] = useState(10);

  // Data state
  const [dailyPreds, setDailyPreds] = useState([]);
  const [dailyScores, setDailyScores] = useState(new Map());
  const [historicalData, setHistoricalData] = useState(null);

  /* ── 1. Real-time Daily Listener ── */
  useEffect(() => {
    if (!db || tab !== 'daily') return;
    setLoading(true);
    setIsLive(true);

    const unsubScores = onSnapshot(
      query(collection(db, 'active_predictions'), where('matchDate', '==', todayStr())),
      snap => {
        const m = new Map();
        snap.docs.forEach(d => { const data = d.data(); if (data.status === 'finished' && data.homeScore != null) m.set(String(data.matchId), { h: data.homeScore, a: data.awayScore }); });
        setDailyScores(m);
      }, err => console.error('[LB] Scores err:', err)
    );

    const unsubPreds = onSnapshot(
      query(collection(db, 'user_predictions'), where('matchDate', '==', todayStr())),
      snap => {
        setDailyPreds(snap.docs.map(d => d.data()));
        setLoading(false);
        setError(null);
      },
      err => {
        console.error('[LB] Daily err:', err);
        if (err.code === 'permission-denied') setError('permissions');
        else setError(err.message);
        setLoading(false);
        setIsLive(false);
      }
    );

    return () => { unsubScores(); unsubPreds(); };
  }, [tab]);

  /* ── 2. Historical Fetch (Weekly/Monthly/Goat) ── */
  const fetchHistorical = useCallback(async (period) => {
    if (!db) return;
    setLoading(true);
    setError(null);
    setIsLive(false);

    try {
      // GOAT: Use pre-computed cumulative totals (fast, 1 read)
      if (period === 'goat') {
        const snap = await getDocs(collection(db, 'user_points_total'));
        setHistoricalData({ type: 'goat', data: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
        setLoading(false);
        return;
      }

      // Weekly / Monthly: Query resolved prediction results (permanent data)
      let startDate;
      if (period === 'weekly') startDate = getWeekStart();
      else startDate = getMonthStart();

      const snap = await getDocs(
        query(
          collection(db, 'prediction_results'),
          where('resolvedAt', '>=', new Date(startDate + 'T00:00:00Z'))
        )
      );

      setHistoricalData({ type: 'results', data: snap.docs.map(d => d.data()) });
      setLoading(false);
    } catch (err) {
      console.error('[LB] Historical err:', err);
      if (err.code === 'permission-denied') setError('permissions');
      else setError(err.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'weekly' || tab === 'monthly' || tab === 'goat') {
      fetchHistorical(tab);
    }
  }, [tab, fetchHistorical]);

  // Reset shown count on tab change
  useEffect(() => { setShownCount(10); setSearch(''); }, [tab]);

  /* ── 3. Compute Daily Leaderboard ── */
  const computeLeaderboard = (preds, sMap) => {
    const userMap = {};
    preds.forEach(p => {
      if (!userMap[p.userId]) {
        userMap[p.userId] = { uid: p.userId, displayName: p.displayName || 'Anonymous', points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0 };
      }
      const u = userMap[p.userId];
      u.predictions++;
      const mapKey = `${p.matchDate}_${p.matchId}`;
      const actual = sMap.get(mapKey);
      if (!actual) return;
      u.resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, actual.h, actual.a);
      u.points += r.points;
      if (r.type === 'exact') u.exact++;
      else if (r.type === 'result') u.result++;
      else u.miss++;
    });

    return Object.values(userMap)
      .filter(u => u.predictions > 0)
      .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
      .map((u, i) => ({ ...u, rank: i + 1, accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0 }));
  };

  const dailyLB = useMemo(() => computeLeaderboard(dailyPreds, dailyScores), [dailyPreds, dailyScores]);

  /* ── 4. Compute Historical Leaderboard ── */
  const historicalLB = useMemo(() => {
    if (!historicalData || !historicalData.data) return [];

    // GOAT: Pre-computed cumulative totals
    if (historicalData.type === 'goat') {
      return historicalData.data
        .filter(u => (u.predictionsCount || 0) > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints || b.exactCount - a.exactCount || b.resultCount - a.resultCount)
        .map((u, i) => ({
          uid: u.id,
          displayName: u.displayName || 'Player',
          points: u.totalPoints || 0,
          predictions: u.predictionsCount || 0,
          exact: u.exactCount || 0,
          result: u.resultCount || 0,
          miss: u.missCount || 0,
          resolved: u.predictionsCount || 0,
          rank: 0,
          accuracy: (u.predictionsCount || 0) > 0
            ? Math.round(((u.exactCount + u.resultCount) / u.predictionsCount) * 100)
            : 0,
        }))
        .map((u, i) => ({ ...u, rank: i + 1 }));
    }

    // Weekly / Monthly: Aggregate from prediction_results (points already computed per match)
    const userMap = {};
    historicalData.data.forEach(r => {
      if (!userMap[r.userId]) {
        userMap[r.userId] = {
          uid: r.userId,
          displayName: r.displayName || 'Player',
          points: 0, predictions: 0, exact: 0, result: 0, miss: 0, resolved: 0,
        };
      }
      const u = userMap[r.userId];
      u.predictions++;
      u.resolved++;
      u.points += r.points || 0;
      if (r.resultType === 'exact') u.exact++;
      else if (r.resultType === 'result') u.result++;
      else u.miss++;
    });

    return Object.values(userMap)
      .filter(u => u.predictions > 0)
      .sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result)
      .map((u, i) => ({
        ...u,
        rank: i + 1,
        accuracy: u.resolved > 0
          ? Math.round(((u.exact + u.result) / u.resolved) * 100)
          : 0,
      }));
  }, [historicalData]);

  const activeLB = tab === 'daily' ? dailyLB : historicalLB;
  const top3 = useMemo(() => activeLB.slice(0, 3), [activeLB]);
  const rest = useMemo(() => activeLB.slice(3), [activeLB]);

  const stats = useMemo(() => {
    if (!activeLB.length) return { avg: '0.0', preds: 0, exact: 0, players: 0 };
    const avg = (activeLB.reduce((s, u) => s + u.accuracy, 0) / activeLB.length).toFixed(1);
    const preds = activeLB.reduce((s, u) => s + u.predictions, 0);
    const exact = activeLB.reduce((s, u) => s + u.exact, 0);
    return { avg, preds, exact, players: activeLB.length };
  }, [activeLB]);

  const myEntry = useMemo(() => {
    if (!currentUser?.uid) return null;
    return activeLB.find(u => u.uid === currentUser.uid) || null;
  }, [activeLB, currentUser]);

  const filtered = useMemo(() => {
    if (!search.trim()) return activeLB;
    const q = search.toLowerCase();
    return activeLB.filter(u => u.displayName.toLowerCase().includes(q));
  }, [activeLB, search]);

  const filteredTop3 = useMemo(() => filtered.slice(0, 3), [filtered]);
  const filteredRest = useMemo(() => filtered.slice(3), [filtered]);

  const handleClear = useCallback(() => { setSearch(''); searchRef.current?.focus(); }, []);
  const handleLoadMore = () => setShownCount(prev => Math.min(prev + 15, 100));

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SEO
        title="Leaderboard"
        description="ZOKASCORE prediction leaderboard. See top predictors ranked by daily, weekly, monthly, and all-time performance."
        keywords="football prediction leaderboard, top predictors, prediction rankings, ZOKASCORE rankings"
        url="https://zokascore.com/leaderboard"
      />

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,10,.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => window.location.href = '/'}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '.72rem', color: 'var(--bg-deep)', fontFamily: 'var(--font-display)' }}>Z</div>
            <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>zokascore<span style={{ color: 'var(--accent)' }}>.xyz</span></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.82rem', fontWeight: 700, color: 'var(--gold)' }}>
            <Trophy size={16} /> Ranks
            {isLive && !error && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} className="lb-glow" />}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 20px 80px' }}>
        {/* Title */}
        <div className="lb-up" style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 16, background: 'rgba(245,197,66,.1)', marginBottom: 12 }}>
            <Trophy size={26} style={{ color: 'var(--gold)' }} />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>Leaderboard</h1>
          <p style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginTop: 6, fontWeight: 500 }}>
            {tab === 'goat' ? 'Greatest of All Time — Historical Top 100' : `${tab.charAt(0).toUpperCase() + tab.slice(1)} top predictors`}
          </p>
        </div>

        {/* My Rank Card */}
        {myEntry && (
          <div className="lb-up" style={{
            marginBottom: 24, padding: '16px 20px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(168,85,247,.06), rgba(0,230,118,.04))',
            border: myEntry.rank <= 3 ? '1px solid rgba(245,197,66,.2)' : '1px solid rgba(168,85,247,.12)',
            display: 'flex', alignItems: 'center', gap: 16
          }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: myEntry.rank <= 3 ? 'rgba(245,197,66,.12)' : 'rgba(168,85,247,.1)', border: myEntry.rank <= 3 ? '1px solid rgba(245,197,66,.2)' : '1px solid rgba(168,85,247,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7' }}>
              {myEntry.rank <= 3 ? <Crown size={22} /> : <span style={{ fontSize: '1.1rem', fontWeight: 900, fontFamily: 'var(--font-display)' }}>#{myEntry.rank}</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your {tab.charAt(0).toUpperCase() + tab.slice(1)} Rank</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{myEntry.points} pts · {myEntry.exact} exact · {myEntry.accuracy}%</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#a855f7', fontFamily: 'var(--font-display)' }}>{myEntry.points}</div>
              <div style={{ fontSize: '.56rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Points</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="lb-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 40, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, textAlign: 'center', marginBottom: 24 }}>
            {error === 'permissions' ? (
              <>
                <ShieldAlert size={36} style={{ color: '#f59e0b' }} />
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Permissions Required</div>
                <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
                  Allow read access to <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>user_predictions</code>, <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>active_predictions</code>, <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>prediction_results</code>, and <code style={{ background: 'rgba(255,255,255,.06)', padding: '2px 6px', borderRadius: 4 }}>user_points_total</code>.
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={36} style={{ color: '#ef4444' }} />
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Failed to load</div>
                <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', maxWidth: 300 }}>{error}</div>
              </>
            )}
          </div>
        )}

        {!error && (
          <>
            {/* Tabs */}
            <div className="lb-fade" key={`tabs-${tab}`} style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 32, overflowX: 'auto' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`tab-b ${tab === t.key ? 'act' : ''} ${t.isGoat ? 'goat' : ''}`}>
                  <t.Icon size={14} /> {t.label}
                  {t.key === 'daily' && isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} className="lb-glow" />}
                </button>
              ))}
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 40 }}>
              <StatCard icon={<Flame size={20} />} label="Top Score" value={activeLB[0] ? `${activeLB[0].points} pts` : '–'} color="var(--gold)" bgColor="rgba(245,197,66,.08)" delay={0} />
              <StatCard icon={<Users size={20} />} label="Players" value={stats.players} color="#60a5fa" bgColor="rgba(59,130,246,.08)" delay={80} />
              <StatCard icon={<BarChart3 size={20} />} label="Avg Accuracy" value={`${stats.avg}%`} color="var(--accent)" bgColor="rgba(0,230,118,.06)" delay={160} />
              <StatCard icon={<Target size={20} />} label="Exact Scores" value={stats.exact} color="#f97316" bgColor="rgba(249,115,22,.08)" delay={240} />
            </div>

            {/* Podium (Daily Only) */}
            {tab === 'daily' && (
              loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 48, padding: '40px 0' }}>
                  {[1, 2, 3].map(i => <div key={i} className="lb-shim" style={{ width: 140, height: 200, borderRadius: 14 }} />)}
                </div>
              ) : filteredTop3.length >= 3 ? (
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 48, padding: '0 20px' }}>
                  {filteredTop3.map((user, i) => <PodiumUser key={user.uid} user={user} position={i} delay={i * 120} />)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', marginBottom: 48, fontSize: '.88rem' }}>
                  {activeLB.length === 0 ? 'No predictions yet.' : 'Need at least 3 players.'}
                </div>
              )
            )}

            {/* G.O.A.T Top 3 Badges (if not daily) */}
            {tab !== 'daily' && filteredTop3.length >= 1 && (
              <div className="lb-up" style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 32 }}>
                {filteredTop3.slice(0, 3).map((u, i) => {
                  const colors = ['var(--gold)', '#94a3b8', '#d97706'];
                  return (
                    <div key={u.uid} className="lb-pop" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, animationDelay: `${i * 100}ms` }}>
                      <div style={{ position: 'relative' }}>
                        {i === 0 && <Crown size={20} style={{ color: 'var(--gold)', position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)' }} />}
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `linear-gradient(135deg, ${colors[i]}33, ${colors[i]}11)`, border: `2px solid ${colors[i]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', fontWeight: 900, color: colors[i], boxShadow: `0 0 20px ${colors[i]}22` }}>
                          {u.displayName.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{u.displayName}</span>
                      <span style={{ fontSize: '.72rem', fontWeight: 800, color: colors[i], fontFamily: 'var(--font-display)' }}>{u.points} pts</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div style={{ maxWidth: 420, margin: '0 auto 24px', position: 'relative' }}>
              <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition: 'color .2s', pointerEvents: 'none', zIndex: 1 }} />
              <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} style={{ width: '100%', padding: '12px 40px 12px 42px', borderRadius: 12, background: 'var(--bg-card)', border: `1.5px solid ${searchFocused ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-primary)', fontSize: '.86rem', fontWeight: 500, outline: 'none', transition: 'all .2s' }} />
              {search && <button className="zb" onClick={handleClear} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,.06)', border: 'none', borderRadius: 6, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><X size={13} /></button>}
            </div>
            {search.trim() && <div style={{ marginBottom: 16, fontSize: '.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''} found</div>}

            {/* Table */}
            <div style={{ overflowX: 'auto', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Rank', 'Player', 'Accuracy', 'Points', 'Predictions', 'Exact'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Exact' ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.06em', background: 'rgba(255,255,255,.02)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
                  ) : filteredRest.length === 0 && search.trim() ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.88rem' }}>No players found matching "{search}"</td></tr>
                  ) : filteredRest.length === 0 && !search.trim() ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: '.88rem' }}>{activeLB.length === 0 ? 'No predictions yet.' : 'Top players shown above.'}</td></tr>
                  ) : (
                    filteredRest.slice(0, shownCount - 3).map((user, i) => {
                      const rank = i + 4;
                      const isMe = currentUser?.uid === user.uid;
                      const exactColor = user.exact >= 15 ? 'var(--accent)' : user.exact >= 10 ? 'var(--gold)' : 'var(--text-primary)';
                      const avColor = AVATAR_COLORS[(i + 3) % AVATAR_COLORS.length];
                      const delay = Math.min(i * 40, 400);

                      return (
                        <tr key={user.uid} className="lb-sr" style={{ animationDelay: `${delay}ms`, background: isMe ? 'rgba(0,230,118,.04)' : 'transparent', borderBottom: '1px solid var(--border)', transition: 'background .2s' }}
                          onMouseEnter={e => { if (!isMe) e.currentTarget.style.background = 'rgba(255,255,255,.02)'; }}
                          onMouseLeave={e => { if (!isMe) e.currentTarget.style.background = 'transparent'; }}>
                          <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'var(--font-display)', color: rank <= 10 ? 'var(--accent)' : 'var(--text-primary)' }}>#{rank}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 9, background: avColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 800, color: '#fff', flexShrink: 0, boxShadow: isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
                                {(user.displayName || '??').slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.86rem' }}>
                                  {user.displayName}
                                  {isMe && <span style={{ fontSize: '.6rem', color: 'var(--bg-deep)', background: 'var(--accent)', padding: '2px 8px', borderRadius: 10, fontWeight: 800 }}>YOU</span>}
                                </div>
                                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 1 }}>{user.exact} exact · {user.result} result</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}><AccuracyBar value={user.accuracy} delay={delay} /></td>
                          <td style={{ padding: '12px 16px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{user.points}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontWeight: 600 }}>{user.predictions}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 800, color: exactColor }}>{user.exact}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Load More Button */}
            {!loading && filteredRest.length > (shownCount - 3) && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <button onClick={handleLoadMore} disabled={shownCount >= 100} className="zb" style={{ padding: '10px 28px', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.84rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChevronDown size={16} /> Show More ({Math.min(100, filteredRest.length) - (shownCount - 3)} remaining)
                </button>
              </div>
            )}
          </>
        )}

        {/* Info Box */}
        <div className="lb-up" style={{ marginTop: 24, display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'rgba(59,130,246,.04)', border: '1px solid rgba(59,130,246,.1)', animationDelay: '600ms' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', flexShrink: 0 }}>
            <BarChart3 size={16} />
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
            {tab === 'daily' ? 'Live updates as matches finish.' : `Aggregated stats from ${tab === 'goat' ? 'all time' : `this ${tab}`}.`}
            Exact score = <strong style={{ color: 'var(--accent)', fontWeight: 700 }}>10 pts</strong>, correct result = <strong style={{ color: 'var(--gold)', fontWeight: 700 }}>3 pts</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}