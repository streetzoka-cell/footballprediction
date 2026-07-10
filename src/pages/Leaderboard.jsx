// FILE: src/pages/Leaderboard.jsx
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Search, Trophy, TrendingUp, Target, BarChart3,
  X, Crown, Flame, AlertCircle, ShieldAlert, Users,
  Calendar, Medal, Star, Loader, ChevronDown, Award
} from 'lucide-react';

import {
  useUniversalResolver,
  useDailyLeaderboard,
  useHistoricalLeaderboard,
} from '../hooks/useMatchData';
import { useAuth } from '../context/AuthContext';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   STYLES — Unified zoka_ prefix, mobile-first, bold
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('lb-zoka-v6')) return;
  const s = document.createElement('style');
  s.id = 'lb-zoka-v6';
  s.textContent = `
    /* ── Keyframes (zoka_ prefix, consistent with Login) ── */
    @keyframes zoka_fadeUp{from{opacity:0;transform:translateY(20px)}
body{overflow-x:hidden;width:100%;max-width:100vw}to{opacity:1;transform:translateY(0)}}
    @keyframes zoka_slideRow{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes zoka_popIn{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
    @keyframes zoka_crownFloat{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-6px) rotate(5deg)}}
    @keyframes zoka_barFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes zoka_glow{0%,100%{box-shadow:0 0 12px rgba(0,230,118,.15)}50%{box-shadow:0 0 24px rgba(0,230,118,.3)}}
    @keyframes zoka_shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes zoka_podiumGrow{from{transform:scaleY(0);transform-origin:bottom}to{transform:scaleY(1);transform-origin:bottom}}
    @keyframes zoka_fadeIn{from{opacity:0}to{opacity:1}}
    @keyframes zoka_goldPulse{0%,100%{text-shadow:0 0 8px rgba(245,197,66,.3)}50%{text-shadow:0 0 20px rgba(245,197,66,.6)}}
    @keyframes zoka_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes zoka_shine{0%{left:-100%}100%{left:200%}}

    /* ── Utility classes ── */
    .lb-up{animation:zoka_fadeUp .5s cubic-bezier(.22,1,.36,1) both}
    .lb-sr{animation:zoka_slideRow .4s cubic-bezier(.22,1,.36,1) both}
    .lb-pop{animation:zoka_popIn .4s cubic-bezier(.22,1,.36,1) both}
    .lb-crown{animation:zoka_crownFloat 3s ease-in-out infinite}
    .lb-bar{transform-origin:left center;animation:zoka_barFill .8s cubic-bezier(.22,1,.36,1) both}
    .lb-glow{animation:zoka_glow 2s ease-in-out infinite}
    .lb-shim{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:zoka_shimmer 1.5s ease-in-out infinite;border-radius:10px}
    .lb-fade{animation:zoka_fadeIn .3s ease-out both}
    .lb-gold{animation:zoka_goldPulse 2s ease-in-out infinite}

    /* ── Button system (matches Login .zoka-btn) ── */
    .zoka-btn{
      transition:all .18s cubic-bezier(.22,1,.36,1);
      cursor:pointer;outline:none;
      -webkit-tap-highlight-color:transparent;
    }
    .zoka-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .zoka-btn:active{transform:translateY(0) scale(.97);filter:brightness(.95)}
    .zoka-btn:disabled{opacity:.35;pointer-events:none;filter:none;transform:none}

    /* ── Card hover ── */
    .zoka-card{transition:all .22s cubic-bezier(.22,1,.36,1)}
    .zoka-card:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.2)}

    /* ── Tabs ── */
    .lb-tab{
      position:relative;padding:13px 22px;font-weight:700;font-size:.84rem;
      color:var(--text-muted);background:transparent;border:none;cursor:pointer;
      transition:all .2s;border-radius:12px 12px 0 0;white-space:nowrap;
      display:flex;align-items:center;gap:7px;min-height:50px;
      -webkit-tap-highlight-color:transparent;
    }
    .lb-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.02)}
    .lb-tab.act{color:var(--gold);background:rgba(245,197,66,.06)}
    .lb-tab.act::after{
      content:'';position:absolute;bottom:0;left:18px;right:18px;
      height:3px;background:var(--gold);border-radius:3px 3px 0 0;
      box-shadow:0 0 10px rgba(245,197,66,.4);
    }
    .lb-tab.goat.act{
      color:#000;background:linear-gradient(135deg,#fbbf24,#f59e0b);font-weight:800;
    }
    .lb-tab.goat.act::after{background:rgba(0,0,0,.2);box-shadow:none}

    /* ── Search input ── */
    .lb-search{
      width:100%;padding:14px 44px 14px 46px;border-radius:14px;
      background:var(--bg-card);border:2px solid var(--border);
      color:var(--text-primary);font-size:.88rem;font-weight:600;
      outline:none;transition:all .2s;min-height:54px;
      -webkit-appearance:none;appearance:none;
    }
    .lb-search:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(0,230,118,.1)}
    .lb-search::placeholder{color:var(--text-muted);opacity:.45}

    /* Remove autofill styling interference */
    .lb-search:-webkit-autofill,
    .lb-search:-webkit-autofill:hover,
    .lb-search:-webkit-autofill:focus{
      -webkit-box-shadow:0 0 0 1000px var(--bg-card) inset;
      -webkit-text-fill-color:var(--text-primary);
      transition:background-color 5000s ease-in-out 0s;
    }

    /* ── Scrollbar hide ── */
    .lb-scroll::-webkit-scrollbar{display:none}
    .lb-scroll{scrollbar-width:none}

    /* ═══════════════════════════════════════════════════════════
       MOBILE BREAKPOINTS
       ═══════════════════════════════════════════════════════════ */
    @media(max-width:768px){
      .lb-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
      .lb-table{min-width:560px}
      .lb-podium{gap:8px!important;padding:0 8px!important}
      .lb-podium-user{max-width:120px!important}
      .lb-stats-grid{grid-template-columns:repeat(2,1fr)!important}
      .lb-tab{padding:12px 18px;font-size:.82rem;min-height:48px}
    }

    @media(max-width:420px){
      .lb-tab{padding:11px 14px;font-size:.78rem;gap:6px;min-height:46px}
      .lb-search{padding:12px 40px 12px 42px;font-size:.84rem;min-height:50px}
      .lb-stats-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
      .lb-podium-user{max-width:100px!important}
    }
  
    @media(prefers-reduced-motion:reduce){
      *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
      .carousel-track,.carousel-card,.carousel-header-dots span{animation:none!important}
      .toggle-hidden-items{transition:none!important}
    }
`;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════════ */
const AVATAR_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899','#64748b','#78716c'];
const PODIUM_CFG = [
  { h:140, border:'var(--gold)', bg:'linear-gradient(180deg,rgba(245,197,66,.18) 0%,rgba(245,197,66,.04) 100%)', text:'var(--gold)', avatar:80, font:'1.4rem', shadow:'0 0 30px rgba(245,197,66,.2)', order:2 },
  { h:100, border:'#94a3b8', bg:'linear-gradient(180deg,rgba(148,163,184,.12) 0%,rgba(148,163,184,.03) 100%)', text:'#94a3b8', avatar:64, font:'1.1rem', shadow:'0 0 20px rgba(148,163,184,.1)', order:1 },
  { h:80, border:'#b45309', bg:'linear-gradient(180deg,rgba(180,83,9,.12) 0%,rgba(180,83,9,.03) 100%)', text:'#d97706', avatar:56, font:'.95rem', shadow:'0 0 16px rgba(180,83,9,.1)', order:3 },
];

const TABS = [
  { key:'daily', label:'Daily', Icon:Calendar },
  { key:'weekly', label:'Weekly', Icon:TrendingUp },
  { key:'monthly', label:'Monthly', Icon:BarChart3 },
  { key:'goat', label:'G.O.A.T', Icon:Crown, isGoat:true },
];

/* ═══════════════════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
function AccuracyBar({ value, delay }) {
  const fill = value >= 70 ? 'var(--accent)' : value >= 45 ? 'var(--gold)' : '#ef4444';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:110 }}>
      <div style={{ flex:1, height:5, borderRadius:3, background:'rgba(255,255,255,.04)', overflow:'hidden' }}>
        <div className="lb-bar" style={{ height:'100%', borderRadius:3, background:`linear-gradient(90deg,${fill},${fill}88)`, width:`${value}%`, animationDelay:`${delay||0}ms` }} />
      </div>
      <span style={{ fontSize:'.72rem', fontWeight:700, color:fill, minWidth:32, textAlign:'right', fontFamily:'var(--font-display)' }}>{value}%</span>
    </div>
  );
}

function StatCard({ icon, label, value, color, bgColor, delay }) {
  return (
    <div className="zoka-card lb-pop" style={{ padding:'18px 20px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, display:'flex', alignItems:'center', gap:14, animationDelay:`${delay||0}ms` }}>
      <div style={{ width:44, height:44, borderRadius:12, background:bgColor, display:'flex', alignItems:'center', justifyContent:'center', color, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.35rem', fontWeight:900, lineHeight:1, color:'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize:'.7rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.04em', marginTop:3 }}>{label}</div>
      </div>
    </div>
  );
}

function PodiumUser({ user, position, delay }) {
  const cfg = PODIUM_CFG[position];
  return (
    <div className="lb-pop lb-podium-user" style={{ display:'flex', flexDirection:'column', alignItems:'center', order:cfg.order, animationDelay:`${(delay||0)+200}ms`, flex:1, maxWidth:160 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', marginBottom:10, position:'relative' }}>
        {position === 0 && <div className="lb-crown" style={{ color:'var(--gold)', marginBottom:-4, filter:'drop-shadow(0 0 8px rgba(245,197,66,.4))' }}><Crown size={24} /></div>}
        <div style={{ width:cfg.avatar, height:cfg.avatar, borderRadius:'50%', background:`linear-gradient(135deg,${cfg.border}33,${cfg.border}11)`, border:`3px solid ${cfg.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:cfg.font, fontWeight:900, color:cfg.text, boxShadow:cfg.shadow, fontFamily:'var(--font-display)' }}>
          {(user.displayName||'??').slice(0,2).toUpperCase()}
        </div>
        <div style={{ marginTop:8, fontSize:'.84rem', fontWeight:700, color:'var(--text-primary)', textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>{user.displayName}</div>
        <div style={{ fontSize:'.7rem', color:'var(--text-muted)', fontWeight:600 }}>{user.points} pts · {user.accuracy}%</div>
      </div>
      <div style={{ width:'100%', height:cfg.h, background:cfg.bg, borderRadius:'14px 14px 0 0', border:'1px solid rgba(255,255,255,.04)', borderBottom:'none', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', paddingBottom:12, position:'relative', overflow:'hidden', animation:`zoka_podiumGrow .6s cubic-bezier(.22,1,.36,1) ${(delay||0)+400}ms both` }}>
        <div style={{ fontSize:'1.8rem', fontWeight:900, fontFamily:'var(--font-display)', color:cfg.text, lineHeight:1 }}>#{position+1}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr><td colSpan={6} style={{ padding:0, borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 18px' }}>
        <div className="lb-shim" style={{ width:30, height:14, borderRadius:4 }} />
        <div style={{ display:'flex', alignItems:'center', gap:10, flex:1 }}>
          <div className="lb-shim" style={{ width:36, height:36, borderRadius:10 }} />
          <div className="lb-shim" style={{ width:100, height:14, borderRadius:4 }} />
        </div>
        <div className="lb-shim" style={{ width:80, height:10, borderRadius:4 }} />
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
  const [shownCount, setShownCount] = useState(10);

  /* ── Data from useMatchData (single source of truth) ── */
  useUniversalResolver();

  const daily = useDailyLeaderboard();
  const historical = useHistoricalLeaderboard(tab === 'daily' ? 'weekly' : tab);

  /* ── Select active data based on tab ── */
  const activeLB = tab === 'daily' ? daily.entries : historical.entries;
  const loading = tab === 'daily' ? daily.loading : historical.loading;
  const error = tab === 'daily' ? null : historical.error;
  const isLive = tab === 'daily' ? daily.isLive : false;
  const stats = tab === 'daily' ? daily.stats : historical.stats;

  const top3 = useMemo(() => activeLB.slice(0, 3), [activeLB]);
  const rest = useMemo(() => activeLB.slice(3), [activeLB]);

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

  /* Reset on tab switch */
  useEffect(() => { setShownCount(10); setSearch(''); }, [tab]);

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh',overflow:'hidden', minHeight:'100dvh',overflow:'hidden', background:'var(--bg-deep)' }}>
      <SEO
        title="Leaderboard"
        description="ZOKASCORE prediction leaderboard. See top predictors ranked by daily, weekly, monthly, and all-time performance."
        keywords="football prediction leaderboard, top predictors, prediction rankings, ZOKASCORE rankings"
        url="https://zokascore.com/leaderboard"
      />

      {/* Sticky Header */}
      <div style={{ position:'sticky', top:0, zIndex:100, background:'rgba(10,10,10,.9)', backdropFilter:'blur(20px)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ maxWidth:920, margin:'0 auto', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={() => window.location.href = '/'}>
            <div style={{ width:30, height:30, borderRadius:9, background:'linear-gradient(145deg,#00e676,#00c853)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:'.76rem', color:'var(--bg-deep)', fontFamily:'var(--font-display)', boxShadow:'0 2px 10px rgba(0,230,118,.25)' }}>Z</div>
            <span style={{ fontSize:'.9rem', fontWeight:800, color:'var(--text-primary)' }}>zokascore<span style={{ color:'var(--accent)' }}>.xyz</span></span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'.84rem', fontWeight:700, color:'var(--gold)' }}>
            <Trophy size={16} /> Ranks
            {isLive && !error && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} className="lb-glow" />}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:920, margin:'0 auto', padding:'28px 20px 100px' }}>
        {/* Title */}
        <div className="lb-up" style={{ marginBottom:30, textAlign:'center' }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:56, height:56, borderRadius:16, background:'rgba(245,197,66,.1)', border:'1px solid rgba(245,197,66,.15)', marginBottom:14 }}>
            <Trophy size={28} style={{ color:'var(--gold)' }} />
          </div>
          <h1 style={{ fontSize:'1.85rem', fontWeight:900, color:'var(--text-primary)', margin:0, letterSpacing:'-.02em' }}>Leaderboard</h1>
          <p style={{ fontSize:'.9rem', color:'var(--text-muted)', marginTop:6, fontWeight:600 }}>
            {tab === 'goat' ? 'Greatest of All Time — Historical Top 100' : `${tab.charAt(0).toUpperCase()+tab.slice(1)} top predictors`}
          </p>
        </div>

        {/* My Rank Card */}
        {myEntry && (
          <div className="lb-up" style={{
            marginBottom:26, padding:'18px 22px', borderRadius:16,
            background:'linear-gradient(135deg,rgba(168,85,247,.06),rgba(0,230,118,.04))',
            border:myEntry.rank <= 3 ? '1.5px solid rgba(245,197,66,.2)' : '1.5px solid rgba(168,85,247,.12)',
            display:'flex', alignItems:'center', gap:16,
          }}>
            <div style={{ width:52, height:52, borderRadius:14, background:myEntry.rank <= 3 ? 'rgba(245,197,66,.12)' : 'rgba(168,85,247,.1)', border:myEntry.rank <= 3 ? '1.5px solid rgba(245,197,66,.2)' : '1.5px solid rgba(168,85,247,.15)', display:'flex', alignItems:'center', justifyContent:'center', color:myEntry.rank <= 3 ? 'var(--gold)' : '#a855f7' }}>
              {myEntry.rank <= 3 ? <Crown size={24} /> : <span style={{ fontSize:'1.15rem', fontWeight:900, fontFamily:'var(--font-display)' }}>#{myEntry.rank}</span>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'.88rem', fontWeight:700, color:'var(--text-primary)' }}>Your {tab.charAt(0).toUpperCase()+tab.slice(1)} Rank</div>
              <div style={{ fontSize:'.7rem', color:'var(--text-muted)', marginTop:3 }}>{myEntry.points} pts · {myEntry.exact} exact · {myEntry.accuracy}%</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'1.6rem', fontWeight:900, color:'#a855f7', fontFamily:'var(--font-display)' }}>{myEntry.points}</div>
              <div style={{ fontSize:'.58rem', color:'var(--text-muted)', textTransform:'uppercase', fontWeight:600, letterSpacing:'.04em' }}>Points</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="lb-up" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, padding:44, background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, textAlign:'center', marginBottom:26 }}>
            {error === 'permissions' ? (
              <>
                <ShieldAlert size={38} style={{ color:'#f59e0b' }} />
                <div style={{ fontWeight:700, color:'var(--text-primary)', fontSize:'1.08rem' }}>Permissions Required</div>
                <div style={{ fontSize:'.86rem', color:'var(--text-muted)', maxWidth:420, lineHeight:1.6 }}>
                  Allow read access to <code style={{ background:'rgba(255,255,255,.06)', padding:'3px 8px', borderRadius:6, fontSize:'.82rem' }}>user_predictions</code>, <code style={{ background:'rgba(255,255,255,.06)', padding:'3px 8px', borderRadius:6, fontSize:'.82rem' }}>active_predictions</code>, <code style={{ background:'rgba(255,255,255,.06)', padding:'3px 8px', borderRadius:6, fontSize:'.82rem' }}>prediction_results</code>, and <code style={{ background:'rgba(255,255,255,.06)', padding:'3px 8px', borderRadius:6, fontSize:'.82rem' }}>user_points_total</code>.
                </div>
              </>
            ) : (
              <>
                <AlertCircle size={38} style={{ color:'#ef4444' }} />
                <div style={{ fontWeight:700, color:'var(--text-primary)' }}>Failed to load</div>
                <div style={{ fontSize:'.84rem', color:'var(--text-muted)', maxWidth:300 }}>{error}</div>
              </>
            )}
          </div>
        )}

        {!error && (
          <>
            {/* Tabs */}
            <div className="lb-scroll lb-fade" key={`tabs-${tab}`} style={{ display:'flex', gap:4, borderBottom:'1px solid var(--border)', marginBottom:34, overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`lb-tab ${tab === t.key ? 'act' : ''} ${t.isGoat ? 'goat' : ''}`}>
                  <t.Icon size={15} /> {t.label}
                  {t.key === 'daily' && isLive && <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', display:'inline-block' }} className="lb-glow" />}
                </button>
              ))}
            </div>

            {/* Stats Grid */}
            <div className="lb-stats-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:12, marginBottom:44 }}>
              <StatCard icon={<Flame size={20} />} label="Top Score" value={activeLB[0] ? `${activeLB[0].points} pts` : '–'} color="var(--gold)" bgColor="rgba(245,197,66,.08)" delay={0} />
              <StatCard icon={<Users size={20} />} label="Players" value={stats.players} color="#60a5fa" bgColor="rgba(59,130,246,.08)" delay={80} />
              <StatCard icon={<BarChart3 size={20} />} label="Avg Accuracy" value={`${stats.avg}%`} color="var(--accent)" bgColor="rgba(0,230,118,.06)" delay={160} />
              <StatCard icon={<Target size={20} />} label="Exact Scores" value={stats.exact} color="#f97316" bgColor="rgba(249,115,22,.08)" delay={240} />
            </div>

            {/* Podium (Daily Only) */}
            {tab === 'daily' && (
              loading ? (
                <div style={{ display:'flex', justifyContent:'center', gap:16, marginBottom:52, padding:'40px 0' }}>
                  {[1,2,3].map(i => <div key={i} className="lb-shim" style={{ width:140, height:200, borderRadius:16 }} />)}
                </div>
              ) : filteredTop3.length >= 3 ? (
                <div className="lb-podium" style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:12, marginBottom:52, padding:'0 20px' }}>
                  {filteredTop3.map((user,i) => <PodiumUser key={user.uid} user={user} position={i} delay={i*120} />)}
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:44, color:'var(--text-muted)', marginBottom:52, fontSize:'.9rem', fontWeight:600 }}>
                  {activeLB.length === 0 ? 'No predictions yet.' : 'Need at least 3 players.'}
                </div>
              )
            )}

            {/* G.O.A.T Top 3 Badges */}
            {tab !== 'daily' && filteredTop3.length >= 1 && (
              <div className="lb-up" style={{ display:'flex', justifyContent:'center', gap:16, marginBottom:34 }}>
                {filteredTop3.slice(0,3).map((u,i) => {
                  const colors = ['var(--gold)','#94a3b8','#d97706'];
                  return (
                    <div key={u.uid} className="lb-pop" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, animationDelay:`${i*100}ms` }}>
                      <div style={{ position:'relative' }}>
                        {i === 0 && <Crown size={20} style={{ color:'var(--gold)', position:'absolute', top:-18, left:'50%', transform:'translateX(-50%)' }} />}
                        <div style={{ width:58, height:58, borderRadius:'50%', background:`linear-gradient(135deg,${colors[i]}33,${colors[i]}11)`, border:`2px solid ${colors[i]}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.15rem', fontWeight:900, color:colors[i], boxShadow:`0 0 22px ${colors[i]}22` }}>
                          {u.displayName.slice(0,2).toUpperCase()}
                        </div>
                      </div>
                      <span style={{ fontSize:'.84rem', fontWeight:700, color:'var(--text-primary)' }}>{u.displayName}</span>
                      <span style={{ fontSize:'.74rem', fontWeight:800, color:colors[i], fontFamily:'var(--font-display)' }}>{u.points} pts</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Search */}
            <div style={{ maxWidth:440, margin:'0 auto 26px', position:'relative' }}>
              <Search size={18} style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:searchFocused ? 'var(--accent)' : 'var(--text-muted)', transition:'color .2s', pointerEvents:'none', zIndex:1 }} />
              <input ref={searchRef} type="text" placeholder="Search players..." value={search} onChange={e => setSearch(e.target.value)} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} className="lb-search" />
              {search && <button className="zoka-btn" onClick={handleClear} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,.06)', border:'none', borderRadius:8, width:30, height:30, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)' }}><X size={14} /></button>}
            </div>
            {search.trim() && <div style={{ marginBottom:18, fontSize:'.84rem', color:'var(--text-muted)', textAlign:'center', fontWeight:600 }}>{filtered.length} result{filtered.length !== 1 ? 's' : ''} found</div>}

            {/* Table */}
            <div className="lb-table-wrap" style={{ borderRadius:16, border:'1px solid var(--border)', background:'var(--bg-card)' }}>
              <table className="lb-table" style={{ width:'100%', borderCollapse:'collapse', fontSize:'.86rem' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Rank','Player','Accuracy','Points','Predictions','Exact'].map(h => (
                      <th key={h} style={{ padding:'14px 18px', textAlign:h === 'Exact' ? 'right' : 'left', fontWeight:700, color:'var(--text-muted)', fontSize:'.7rem', textTransform:'uppercase', letterSpacing:'.06em', background:'rgba(255,255,255,.02)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length:10 }).map((_,i) => <SkeletonRow key={i} />)
                  ) : filteredRest.length === 0 && search.trim() ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:44, color:'var(--text-muted)', fontSize:'.9rem', fontWeight:600 }}>No players found matching "{search}"</td></tr>
                  ) : filteredRest.length === 0 && !search.trim() ? (
                    <tr><td colSpan={6} style={{ textAlign:'center', padding:44, color:'var(--text-muted)', fontSize:'.9rem', fontWeight:600 }}>{activeLB.length === 0 ? 'No predictions yet.' : 'Top players shown above.'}</td></tr>
                  ) : (
                    filteredRest.slice(0, shownCount - 3).map((user,i) => {
                      const rank = i + 4;
                      const isMe = currentUser?.uid === user.uid;
                      const exactColor = user.exact >= 15 ? 'var(--accent)' : user.exact >= 10 ? 'var(--gold)' : 'var(--text-primary)';
                      const avColor = AVATAR_COLORS[(i+3) % AVATAR_COLORS.length];
                      const delay = Math.min(i * 40, 400);

                      return (
                        <tr key={user.uid} className="lb-sr" style={{ animationDelay:`${delay}ms`, background:isMe ? 'rgba(0,230,118,.04)' : 'transparent', borderBottom:'1px solid var(--border)', transition:'background .2s' }}
                          onMouseEnter={e => { if (!isMe) e.currentTarget.style.background='rgba(255,255,255,.02)'; }}
                          onMouseLeave={e => { if (!isMe) e.currentTarget.style.background='transparent'; }}>
                          <td style={{ padding:'14px 18px', fontWeight:800, fontFamily:'var(--font-display)', color:rank <= 10 ? 'var(--accent)' : 'var(--text-primary)' }}>#{rank}</td>
                          <td style={{ padding:'14px 18px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:36, height:36, borderRadius:10, background:avColor, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.74rem', fontWeight:800, color:'#fff', flexShrink:0, boxShadow:isMe ? '0 0 0 2px var(--accent)' : 'none' }}>
                                {(user.displayName||'??').slice(0,2).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:700, color:'var(--text-primary)', display:'flex', alignItems:'center', gap:8, fontSize:'.88rem' }}>
                                  {user.displayName}
                                  {isMe && <span style={{ fontSize:'.62rem', color:'var(--bg-deep)', background:'var(--accent)', padding:'3px 10px', borderRadius:10, fontWeight:800 }}>YOU</span>}
                                </div>
                                <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginTop:2 }}>{user.exact} exact · {user.result} result</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:'14px 18px' }}><AccuracyBar value={user.accuracy} delay={delay} /></td>
                          <td style={{ padding:'14px 18px', fontFamily:'var(--font-display)', fontWeight:800, fontSize:'1.05rem', color:'var(--text-primary)' }}>{user.points}</td>
                          <td style={{ padding:'14px 18px', color:'var(--text-secondary)', fontWeight:600 }}>{user.predictions}</td>
                          <td style={{ padding:'14px 18px', textAlign:'right', fontFamily:'var(--font-display)', fontWeight:800, color:exactColor }}>{user.exact}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Load More */}
            {!loading && filteredRest.length > (shownCount - 3) && (
              <div style={{ display:'flex', justifyContent:'center', marginTop:22 }}>
                <button onClick={handleLoadMore} disabled={shownCount >= 100} className="zoka-btn" style={{ padding:'12px 30px', borderRadius:12, background:'rgba(255,255,255,.04)', border:'1px solid var(--border)', color:'var(--text-primary)', fontWeight:700, fontSize:'.86rem', display:'flex', alignItems:'center', gap:8, minHeight:50 }}>
                  <ChevronDown size={16} /> Show More ({Math.min(100,filteredRest.length) - (shownCount-3)} remaining)
                </button>
              </div>
            )}
          </>
        )}

        {/* Info Box */}
        <div className="lb-up" style={{ marginTop:28, display:'flex', alignItems:'flex-start', gap:14, padding:'16px 20px', borderRadius:14, background:'rgba(59,130,246,.04)', border:'1px solid rgba(59,130,246,.1)', animationDelay:'600ms' }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'rgba(59,130,246,.1)', display:'flex', alignItems:'center', justifyContent:'center', color:'#60a5fa', flexShrink:0 }}>
            <BarChart3 size={17} />
          </div>
          <p style={{ fontSize:'.8rem', color:'var(--text-secondary)', lineHeight:1.6, margin:0 }}>
            {tab === 'daily' ? 'Live updates as matches finish.' : `Aggregated stats from ${tab === 'goat' ? 'all time' : `this ${tab}`}.`}
            Exact score = <strong style={{ color:'var(--accent)', fontWeight:700 }}>10 pts</strong>, correct result = <strong style={{ color:'var(--gold)', fontWeight:700 }}>3 pts</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}