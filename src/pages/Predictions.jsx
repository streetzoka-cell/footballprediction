// FILE: src/pages/Predictions.jsx
// 
// READ-ONLY CLIENT — All scoring is handled by Admin.jsx
// This file just displays results from prediction_results
// and reads cumulative stats from user_points_total
//
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle, TrendingUp, Target, BarChart3,
  Star, Zap, Save, Trophy, CalendarDays, Loader, Lock,
  LogIn, Crown, Users, ChevronDown, ChevronUp, Timer,
  Medal, Flame, AlertTriangle, Sparkles, CircleCheck,
  CircleX, Hourglass, ThumbsUp, ThumbsDown, Pencil,
  Filter, Layers, History, Check, X
} from 'lucide-react';
import { db } from '../utils/firebase';
import {
  doc, setDoc, collection, query, where, deleteDoc,
  Timestamp, onSnapshot, getDoc
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import SEO from "../components/SEO";

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().split('T')[0];

function parseKickoff(kickoff, dateStr) {
  if (!kickoff) return null;
  let d = new Date(kickoff);
  if (!isNaN(d.getTime())) return d;
  if (/^\d{1,2}:\d{2}/.test(kickoff)) {
    d = new Date(`${dateStr || todayStr()}T${kickoff}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// Kept for leaderboard on-the-fly computation
function calcPoints(predH, predA, actualH, actualA) {
  if (actualH == null || actualA == null) return { points: 0, type: 'pending' };
  if (predH === actualH && predA === actualA) return { points: 10, type: 'exact' };
  const pR = predH > predA ? 'H' : predH < predA ? 'A' : 'D';
  const aR = actualH > actualA ? 'H' : actualH < actualA ? 'A' : 'D';
  if (pR === aR) return { points: 3, type: 'result' };
  return { points: 0, type: 'miss' };
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - (ts?.toMillis?.() || ts);
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

async function savePrediction(uid, displayName, pred, h, a) {
  await setDoc(doc(db, 'user_predictions', `${uid}_${pred.id}`), {
    userId: uid, displayName: displayName || 'Anonymous',
    matchId: pred.matchId, predId: pred.id,
    homeScore: h, awayScore: a,
    matchDate: pred.matchDate || todayStr(),
    homeTeam: pred.homeTeam?.name || 'Home',
    awayTeam: pred.awayTeam?.name || 'Away',
    homeLogo: pred.homeTeam?.logo || null,
    awayLogo: pred.awayTeam?.logo || null,
    league: pred.league?.name || '',
    kickoff: pred.kickoff || null,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
  }, { merge: true });
}

async function saveZokaVote(uid, matchId, vote) {
  await setDoc(doc(db, 'zoka_votes', `${uid}_${matchId}`), {
    userId: uid, matchId, vote, date: todayStr(), createdAt: Timestamp.now(),
  }, { merge: true });
}

async function removeZokaVote(uid, matchId) {
  await deleteDoc(doc(db, 'zoka_votes', `${uid}_${matchId}`));
}

// Group history by date
function groupByDate(items) {
  const groups = {};
  items.forEach(item => {
    const d = item.matchDate || 'unknown';
    if (!groups[d]) groups[d] = [];
    groups[d].push(item);
  });
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

/* ═══════════════════════════════════════════════════════════════
   QUICK-PICK SCORELINES
   ═══════════════════════════════════════════════════════════════ */
const QUICK_PICKS = [
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 },
  { h: 1, a: 1 }, { h: 2, a: 0 }, { h: 0, a: 1 },
  { h: 3, a: 1 }, { h: 1, a: 2 },
];

/* ═══════════════════════════════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════════════════════════════ */
function AnimNum({ value, duration = 500, delay = 0 }) {
  const [d, setD] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const t = typeof value === 'number' ? value : 0;
    if (t === 0) { setD(0); return; }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      setD(Math.round((1 - Math.pow(1 - p, 3)) * t));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{d}</>;
}

/* ═══════════════════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('pred-v11')) return;
  const s = document.createElement('style');
  s.id = 'pred-v11';
  s.textContent = `
    @keyframes pUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pSc{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
    @keyframes pSd{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pSr{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
    @keyframes pBar{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes pSh{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes pPu{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes pUr{0%,100%{color:#ef4444}50%{color:#fca5a5}}
    @keyframes pCe{0%{transform:scale(0) rotate(-20deg)}50%{transform:scale(1.2) rotate(5deg)}100%{transform:scale(1) rotate(0)}}
    @keyframes pCo{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes pSi{0%{left:-100%}100%{left:200%}}
    @keyframes pCrGl{0%,100%{box-shadow:0 0 12px rgba(251,191,36,.15)}50%{box-shadow:0 0 28px rgba(251,191,36,.35)}}
    @keyframes pVPop{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    @keyframes pConfetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-60px) rotate(360deg);opacity:0}}
    @keyframes pToast{0%{opacity:0;transform:translateY(8px) scale(.95)}10%{opacity:1;transform:translateY(0) scale(1)}85%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-6px) scale(.95)}}
    @keyframes pToggleIn{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}
    @keyframes pStreak{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
    .p-up{animation:pUp .5s cubic-bezier(.22,1,.36,1) both}
    .p-sc{animation:pSc .4s cubic-bezier(.22,1,.36,1) both}
    .p-sd{animation:pSd .35s cubic-bezier(.22,1,.36,1) both}
    .p-sr{animation:pSr .4s cubic-bezier(.22,1,.36,1) both}
    .p-bl{transform-origin:left center;animation:pBar .7s cubic-bezier(.22,1,.36,1) both}
    .p-ur{animation:pUr 1s ease-in-out infinite}
    .p-ce{animation:pCe .5s cubic-bezier(.22,1,.36,1) both}
    .p-co{animation:pCo .3s cubic-bezier(.22,1,.36,1) both}
    .p-vpop{animation:pVPop .3s cubic-bezier(.22,1,.36,1) both}
    .sk-p{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:pSh 1.5s ease-in-out infinite}
    .hsb::-webkit-scrollbar{display:none}.hsb{scrollbar-width:none}
    .zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zb:hover{transform:translateY(-2px);filter:brightness(1.06)}
    .zb:active{transform:translateY(0) scale(.97)}
    .zb:disabled{opacity:.3;pointer-events:none;filter:none;transform:none}
    .mc{transition:all .25s cubic-bezier(.22,1,.36,1);border-radius:14px;overflow:hidden;margin-bottom:10px;background:var(--bg-card);border:1px solid var(--border)}
    .mc:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)}
    .pi{width:50px;padding:8px 4px;border-radius:8px;background:var(--bg-surface);border:1.5px solid rgba(0,230,118,.2);color:var(--text-primary);text-align:center;font-weight:800;font-size:1.05rem;outline:none;font-variant-numeric:tabular-nums;transition:all .2s}
    .pi:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.12)}
    .pi::placeholder{color:var(--text-muted);opacity:.3;font-weight:600}
    .pi.hv{border-color:var(--accent);background:rgba(0,230,118,.04)}
    .shn{position:relative;overflow:hidden}
    .shn::after{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);animation:pSi 3s ease-in-out infinite}
    .rr{display:grid;grid-template-columns:40px 1fr 70px 60px 60px 70px;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;margin-bottom:5px;font-size:.78rem;transition:background .15s}
    .rr:hover{background:rgba(255,255,255,.02)}
    .rr.me{background:rgba(0,230,118,.05);border:1px solid rgba(0,230,118,.12)}
    .sc-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:16px}
    .pred-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 20px;border-radius:10px;font-weight:900;font-family:var(--font-display);font-size:1.1rem;font-variant-numeric:tabular-nums;cursor:default;transition:all .2s cubic-bezier(.22,1,.36,1);border:1.5px solid rgba(0,230,118,.25);background:rgba(0,230,118,.08);color:var(--accent)}
    .pred-btn.editable{cursor:pointer}
    .pred-btn.editable:hover{background:rgba(0,230,118,.14);transform:scale(1.04);box-shadow:0 0 16px rgba(0,230,118,.15)}
    .pred-btn.locked{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--text-secondary)}
    .vote-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:.7rem;font-weight:700;border:1px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .18s cubic-bezier(.22,1,.36,1)}
    .vote-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .vote-btn.agree-active{border-color:rgba(0,230,118,.3);background:rgba(0,230,118,.1);color:var(--accent)}
    .vote-btn.disagree-active{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#ef4444}
    .vote-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
    .vote-bar-fill{height:100%;border-radius:2px;transition:width .5s cubic-bezier(.22,1,.36,1)}
    .qp-btn{padding:6px 12px;border-radius:7px;font-size:.76rem;font-weight:800;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1px solid var(--border);background:rgba(255,255,255,.03);color:var(--text-secondary);cursor:pointer;transition:all .15s cubic-bezier(.22,1,.36,1)}
    .qp-btn:hover{border-color:rgba(0,230,118,.3);background:rgba(0,230,118,.08);color:var(--accent);transform:translateY(-1px)}
    .qp-btn:active{transform:scale(.95)}
    .qp-btn.selected{border-color:var(--accent);background:rgba(0,230,118,.12);color:var(--accent)}
    .tog-btn{width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;cursor:pointer;outline:none;transition:all .18s ease;text-align:left;background:var(--bg-card);border:1px solid var(--border)}
    .tog-btn:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1)}
    .tog-body{overflow:hidden;transition:max-height .4s cubic-bezier(.22,1,.36,1),opacity .3s ease,margin .3s ease}
    .tog-body.open{max-height:3000px;opacity:1;margin-top:8px}
    .tog-body.closed{max-height:0;opacity:0;margin-top:0}
    .tog-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:6px;font-size:.62rem;font-weight:800}
    .filter-btn{padding:6px 14px;border-radius:8px;font-size:.7rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all .15s ease;white-space:nowrap}
    .filter-btn:hover{background:rgba(255,255,255,.04);color:var(--text-primary)}
    .filter-btn.active{background:rgba(0,230,118,.08);border-color:rgba(0,230,118,.2);color:var(--accent)}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;animation:pToast 2.5s cubic-bezier(.22,1,.36,1) both;pointer-events:none}
    .streak-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.62rem;font-weight:800;background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(239,68,68,.08));border:1px solid rgba(249,115,22,.2);color:#f97316;animation:pStreak 2s ease-in-out infinite}
    @media(max-width:700px){
      .rr{grid-template-columns:34px 1fr 60px 50px;gap:6px;padding:9px 10px;font-size:.74rem}
      .rr .hm{display:none}
      .pred-btn{padding:6px 14px;font-size:.95rem}
      .qp-grid{grid-template-columns:repeat(4,1fr)!important}
    }
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   COUNTDOWN
   ═══════════════════════════════════════════════════════════════ */
function Countdown({ deadline }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const diff = deadline - now;
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  return (
    <span className={diff < 1800000 ? 'p-ur' : ''} style={{ fontSize: '.76rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: diff < 1800000 ? '#ef4444' : 'var(--gold)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>
      {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className="mc" style={{ padding: 18 }}>
      <div className="sk-p" style={{ height: 10, width: '28%', borderRadius: 4, marginBottom: 16 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="sk-p" style={{ width: 32, height: 32, borderRadius: 8 }} />
        <div className="sk-p" style={{ height: 13, width: '30%', borderRadius: 4 }} />
        <div style={{ flex: 1 }} />
        <div className="sk-p" style={{ height: 28, width: 64, borderRadius: 8 }} />
        <div style={{ flex: 1 }} />
        <div className="sk-p" style={{ height: 13, width: '30%', borderRadius: 4 }} />
        <div className="sk-p" style={{ width: 32, height: 32, borderRadius: 8 }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RESULT BADGE
   ═══════════════════════════════════════════════════════════════ */
function ResultBadge({ result }) {
  if (!result || result.type === 'pending') return null;
  const c = {
    exact: { bg: 'rgba(0,230,118,.14)', bd: 'rgba(0,230,118,.25)', cl: 'var(--accent)', lbl: 'EXACT SCORE' },
    result: { bg: 'rgba(245,197,66,.1)', bd: 'rgba(245,197,66,.2)', cl: 'var(--gold)', lbl: 'CORRECT RESULT' },
    miss: { bg: 'rgba(239,68,68,.08)', bd: 'rgba(239,68,68,.15)', cl: '#ef4444', lbl: 'MISS' },
  }[result.type];
  if (!c) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className={result.type === 'exact' ? 'p-ce' : ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: '.66rem', fontWeight: 800, background: c.bg, border: `1px solid ${c.bd}`, color: c.cl }}>
        {result.type === 'exact' ? <CircleCheck size={11} /> : result.type === 'result' ? <TrendingUp size={11} /> : <CircleX size={11} />} {c.lbl}
      </span>
      {result.points > 0 && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, fontSize: '.66rem', fontWeight: 800, background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.18)', color: '#a855f7' }}>
          <Zap size={10} /> +{result.points}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VOTE BAR
   ═══════════════════════════════════════════════════════════════ */
function VoteBar({ agree, disagree }) {
  const total = agree + disagree;
  if (total === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div className="vote-bar"><div className="vote-bar-fill" style={{ width: `${Math.round((agree/total)*100)}%`, background: 'var(--accent)' }} /></div>
      <span style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round((agree/total)*100)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOGGLE SECTION WRAPPER
   ═══════════════════════════════════════════════════════════════ */
function ToggleSection({ id, icon, iconBg, iconColor, title, badge, badgeBg, badgeColor, defaultOpen, children, style }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="p-up" style={style}>
      <button className="tog-btn" onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>{icon}</div>
          <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</span>
          {badge != null && (
            <span className="tog-badge" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>
          )}
        </div>
        {open ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
      </button>
      <div className={`tog-body ${open ? 'open' : 'closed'}`}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SAVE TOAST
   ═══════════════════════════════════════════════════════════════ */
function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: 'rgba(0,230,118,.12)', border: '1px solid rgba(0,230,118,.25)', backdropFilter: 'blur(12px)' }}>
        <CircleCheck size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--accent)' }}>Locked in <strong>{score}</strong></span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN PROMPT MODAL
   ═══════════════════════════════════════════════════════════════ */
function LoginPromptModal({ onClose }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="p-sc"
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: '28px 24px', maxWidth: 340, width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(0,230,118,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--accent)' }}>
          <LogIn size={24} />
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
          You need to be logged in to make predictions and compete on the leaderboard.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: '.82rem', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onClose(); navigate('/login'); }}
            className="zb"
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: '.82rem',
            }}
          >
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export default function Predictions() {
  injectStyles();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const uid = currentUser?.uid;
  const isLoggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';

  const [activePreds, setActivePreds] = useState([]);
  const [zokaPicks, setZokaPicks] = useState(null);
  const [allPreds, setAllPreds] = useState([]);
  const [zokaVotes, setZokaVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editH, setEditH] = useState('');
  const [editA, setEditA] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingId, setVotingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // NOW READS FROM FIRESTORE — written by Admin.jsx
  const [totalPoints, setTotalPoints] = useState(null);

  // Individual match results — written by Admin.jsx
  const [userResults, setUserResults] = useState([]);

  const [now, setNow] = useState(Date.now());
  const [lastUpdate, setLastUpdate] = useState(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  /* ── Data fetching ── */
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'active_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      setActivePreds(list); setLastUpdate(Date.now()); setLoading(false); setError(null);
    }, (err) => { console.error(err); setError(err); setLoading(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, 'zoka_picks', todayStr()), snap => setZokaPicks(snap.exists() ? snap.data() : null), () => setZokaPicks(null));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'user_predictions'), where('matchDate', '==', todayStr()));
    const unsub = onSnapshot(q, snap => { setAllPreds(snap.docs.map(d => d.data())); setLastUpdate(Date.now()); }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'zoka_votes'), where('date', '==', todayStr()));
    const unsub = onSnapshot(q, snap => setZokaVotes(snap.docs.map(d => d.data())), () => {});
    return () => unsub();
  }, []);

  /* ── READ prediction_results (written by Admin.jsx) ── */
  useEffect(() => {
    if (!uid || !db) return;
    const q = query(collection(db, 'prediction_results'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const results = snap.docs.map(d => d.data());
      results.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
      setUserResults(results);
    }, () => {});
    return () => unsub();
  }, [uid]);

  /* ── READ cumulative points (written by Admin.jsx) ── */
  useEffect(() => {
    if (!uid || !db) return;
    const unsub = onSnapshot(
      doc(db, 'user_points_total', uid),
      snap => setTotalPoints(snap.exists() ? snap.data() : null),
      () => {}
    );
    return () => unsub();
  }, [uid]);

  /* ── Fetch prediction history (reads from prediction_results) ── */
  useEffect(() => {
    if (!uid || !db || !showHistory) return;
    setHistoryLoading(true);
    const q = query(collection(db, 'prediction_results'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const results = snap.docs.map(d => d.data());
      results.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
      setHistory(results);
      setHistoryLoading(false);
    }, () => setHistoryLoading(false));
    return () => unsub();
  }, [uid, showHistory]);

  /* ── Derived ── */
  const globalDeadline = useMemo(() => {
    const times = activePreds.filter(p => p.status !== 'finished').map(p => parseKickoff(p.kickoff, p.matchDate || todayStr())).filter(Boolean).sort((a, b) => a - b);
    return times.length > 0 ? new Date(times[0].getTime() - 3600000) : null;
  }, [activePreds]);

  const isGlobalLocked = globalDeadline ? now > globalDeadline.getTime() : false;
  const allFinished = activePreds.length > 0 && activePreds.every(p => p.status === 'finished');

  const scoreMap = useMemo(() => {
    const m = new Map();
    activePreds.forEach(p => { if (p.status === 'finished' && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore }); });
    return m;
  }, [activePreds]);

  const userPredMap = useMemo(() => {
    if (!uid) return {};
    const m = {};
    allPreds.filter(p => p.userId === uid).forEach(p => { m[p.predId] = p; });
    return m;
  }, [allPreds, uid]);

  const userResultMap = useMemo(() => {
    const m = {};
    userResults.forEach(r => { m[r.matchId] = r; });
    return m;
  }, [userResults]);

  const predCounts = useMemo(() => { const m = {}; allPreds.forEach(p => { m[p.predId] = (m[p.predId] || 0) + 1; }); return m; }, [allPreds]);
  const predDist = useMemo(() => { const m = {}; allPreds.forEach(p => { if (!m[p.predId]) m[p.predId] = {}; const k = `${p.homeScore}-${p.awayScore}`; m[p.predId][k] = (m[p.predId][k] || 0) + 1; }); return m; }, [allPreds]);
  const zokaVoteStats = useMemo(() => { const s = {}; zokaVotes.forEach(v => { if (!s[v.matchId]) s[v.matchId] = { agree: 0, disagree: 0, total: 0 }; if (v.vote === 'agree') s[v.matchId].agree++; else s[v.matchId].disagree++; s[v.matchId].total++; }); return s; }, [zokaVotes]);
  const userZokaVotes = useMemo(() => { if (!uid) return {}; const m = {}; zokaVotes.filter(v => v.userId === uid).forEach(v => { m[v.matchId] = v.vote; }); return m; }, [zokaVotes, uid]);

  const userStats = useMemo(() => {
    if (totalPoints) {
      const total = totalPoints.predictionsCount || 0;
      const exact = totalPoints.exactCount || 0;
      const result = totalPoints.resultCount || 0;
      const miss = totalPoints.missCount || 0;
      const points = totalPoints.totalPoints || 0;
      const resolved = exact + result + miss;
      return {
        predicted: Object.keys(userPredMap).length, 
        total: activePreds.length,
        exact, result, miss, points, resolved,
        accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
      };
    }
    const my = Object.values(userPredMap);
    let exact = 0, result = 0, miss = 0, points = 0, resolved = 0;
    my.forEach(p => {
      const a = scoreMap.get(String(p.matchId));
      if (!a) return; resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, a.h, a.a);
      points += r.points;
      if (r.type === 'exact') exact++; else if (r.type === 'result') result++; else miss++;
    });
    return {
      predicted: my.length, total: activePreds.length,
      exact, result, miss, points, resolved,
      accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0,
    };
  }, [userPredMap, scoreMap, activePreds, totalPoints]);

  const streak = useMemo(() => {
    const resolved = userResults
      .sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0))
      .map(r => r.resultType !== 'miss' ? 1 : 0);
    let s = 0;
    for (let i = resolved.length - 1; i >= 0; i--) { if (resolved[i]) s++; else break; }
    return s;
  }, [userResults]);

  const leaderboard = useMemo(() => {
    const um = {};
    allPreds.forEach(p => {
      if (!um[p.userId]) um[p.userId] = { uid: p.userId, name: p.displayName || 'Anonymous', exact: 0, result: 0, miss: 0, points: 0, total: 0, resolved: 0 };
      const u = um[p.userId]; u.total++;
      const a = scoreMap.get(String(p.matchId)); if (!a) return; u.resolved++;
      const r = calcPoints(p.homeScore, p.awayScore, a.h, a.a); u.points += r.points;
      if (r.type === 'exact') u.exact++; else if (r.type === 'result') u.result++; else u.miss++;
    });
    return Object.values(um).filter(u => u.total > 0).sort((a, b) => b.points - a.points || b.exact - a.exact || b.result - a.result).map((u, i) => ({ ...u, rank: i + 1, accuracy: u.resolved > 0 ? Math.round(((u.exact + u.result) / u.resolved) * 100) : 0 }));
  }, [allPreds, scoreMap]);

  const myRank = useMemo(() => { if (!uid) return null; return leaderboard.find(u => u.uid === uid) || null; }, [leaderboard, uid]);
  const topPlayer = leaderboard.length > 0 ? leaderboard[0] : null;
  const finalizedCount = activePreds.filter(p => p.status === 'finished').length;

  const filteredPreds = useMemo(() => {
    if (filter === 'history') return [];
    if (filter === 'predicted') return activePreds.filter(p => userPredMap[p.id]);
    if (filter === 'unpredicted') return activePreds.filter(p => !userPredMap[p.id] && p.status !== 'finished');
    if (filter === 'finished') return activePreds.filter(p => p.status === 'finished');
    return activePreds;
  }, [activePreds, userPredMap, filter]);

  const filterCounts = useMemo(() => ({
    all: activePreds.length,
    predicted: activePreds.filter(p => userPredMap[p.id]).length,
    unpredicted: activePreds.filter(p => !userPredMap[p.id] && p.status !== 'finished').length,
    finished: activePreds.filter(p => p.status === 'finished').length,
  }), [activePreds, userPredMap]);

  /* ── Handlers ── */
  const handleSave = async (pred) => {
    const hN = parseInt(editH), aN = parseInt(editA);
    if (isNaN(hN) || isNaN(aN) || hN < 0 || aN < 0) return;
    setSaving(true);
    try {
      await savePrediction(uid, displayName, pred, hN, aN);
      setEditingId(null); setEditH(''); setEditA('');
      setToast(`${hN}-${aN}`);
      setTimeout(() => setToast(null), 2500);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const startEdit = (pred) => {
    if (!isLoggedIn) { setShowLoginModal(true); return; }
    const ex = userPredMap[pred.id];
    setEditingId(pred.id);
    setEditH(ex ? String(ex.homeScore) : '');
    setEditA(ex ? String(ex.awayScore) : '');
  };

  const quickPick = (h, a) => { setEditH(String(h)); setEditA(String(a)); };

  const handleZokaVote = async (matchId, vote) => {
    if (!isLoggedIn) { navigate('/login'); return; }
    setVotingId(matchId);
    try { const cur = userZokaVotes[matchId]; if (cur === vote) await removeZokaVote(uid, matchId); else await saveZokaVote(uid, matchId, vote); } catch (e) { console.error(e); }
    setVotingId(null);
  };

  const getPopular = (predId) => {
    const d = predDist[predId]; if (!d) return null;
    const e = Object.entries(d).sort((a, b) => b[1] - a[1]);
    return { score: e[0][0], count: e[0][1], total: Object.values(d).reduce((s, c) => s + c, 0) };
  };

  /* ═══════════════════════════════════
     RENDER
     ═══════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)' }}>
      <SEO
        title="Today's Predictions"
        description="Make your football score predictions for today's matches. Compete with others and climb the ZOKASCORE leaderboard."
        keywords="football predictions, score predictions, predict football scores, today's predictions, Zoka Picks"
        url="https://zokascore.com/predictions"
      />

      {showLoginModal && <LoginPromptModal onClose={() => setShowLoginModal(false)} />}
      <SaveToast show={toast} score={toast} />

      {/* ── STICKY HEADER ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,10,10,.92)', backdropFilter: 'blur(18px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 840, margin: '0 auto', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => navigate('/')}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bg-deep)' }}><Target size={14} /></div>
              <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>ZOKASCORE</span>
            </div>
            <div style={{ flex: 1 }} />
            {lastUpdate && (
              <span style={{ fontSize: '.58rem', color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} /> Updated {timeAgo(lastUpdate)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {globalDeadline && !isGlobalLocked && !allFinished && (
              <div className="p-sd" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(245,197,66,.06)', border: '1px solid rgba(245,197,66,.12)' }}>
                <Timer size={11} style={{ color: 'var(--gold)' }} /><Countdown deadline={globalDeadline.getTime()} />
              </div>
            )}
            {isGlobalLocked && !allFinished && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,.06)', border: '1px solid rgba(239,68,68,.12)' }}>
                <Lock size={10} style={{ color: '#ef4444' }} /><span style={{ fontSize: '.66rem', fontWeight: 700, color: '#ef4444' }}>LOCKED</span>
              </div>
            )}
            {allFinished && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, background: 'rgba(0,230,118,.06)', border: '1px solid rgba(0,230,118,.12)' }}>
                <Trophy size={10} style={{ color: 'var(--accent)' }} /><span style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--accent)' }}>RESULTS</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 840, margin: '0 auto', padding: '20px 20px 120px' }}>

        {/* ═══ TITLE ═══ */}
        <div className="p-up" style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Star size={20} style={{ color: 'var(--gold)' }} /> Today's Predictions
            </h1>
            {streak >= 2 && (
              <span className="streak-badge"><Flame size={10} /> {streak} streak</span>
            )}
          </div>
          <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
            {isLoggedIn ? '10 pts exact · 3 pts result · No deletions · Edit until 1hr before kickoff · Results auto-scored' : "View matches and Zoka Picks. Log in to predict and climb the leaderboard."}
          </p>
        </div>

        {/* ═══ TOP PLAYER — TOGGLE ═══ */}
        {topPlayer && (
          <ToggleSection id="top" icon={<Crown size={15} />} iconBg="rgba(245,197,66,.12)" iconColor="#fbbf24" title="Top Predictor" badge={`${topPlayer.points} pts`} badgeBg="rgba(245,197,66,.12)" badgeColor="#fbbf24" defaultOpen={true} style={{ marginBottom: 14, animationDelay: '50ms' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'linear-gradient(135deg,rgba(251,191,36,.06),rgba(251,191,36,.01))', border: '1px solid rgba(251,191,36,.12)', borderRadius: 10 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1a1a', flexShrink: 0 }}><Crown size={22} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.58rem', fontWeight: 700, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Leading Today</div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {topPlayer.name}{topPlayer.uid === uid && <span style={{ fontSize: '.56rem', color: 'var(--gold)', marginLeft: 6, fontWeight: 700 }}>YOU!</span>}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 1 }}>{topPlayer.exact} exact · {topPlayer.result} results · {topPlayer.accuracy}% acc</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-display)', lineHeight: 1 }}><AnimNum value={topPlayer.points} delay={200} /></div>
                <div style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Points</div>
              </div>
            </div>
          </ToggleSection>
        )}

        {/* ═══ USER STATS — TOGGLE ═══ */}
        {isLoggedIn && (
          <ToggleSection id="stats" icon={<BarChart3 size={15} />} iconBg="rgba(168,85,247,.12)" iconColor="#a855f7" title="My Stats" badge={`${userStats.predicted}/${userStats.total}`} badgeBg="rgba(168,85,247,.1)" badgeColor="#a855f7" defaultOpen={true} style={{ marginBottom: 14, animationDelay: '80ms' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 6, marginBottom: 10 }}>
              {[
                { label: 'Points', value: userStats.points, color: '#a855f7', bg: 'rgba(168,85,247,.1)', Icon: Zap },
                { label: 'Exact', value: userStats.exact, color: 'var(--accent)', bg: 'rgba(0,230,118,.1)', Icon: CircleCheck },
                { label: 'Result', value: userStats.result, color: 'var(--gold)', bg: 'rgba(245,197,66,.1)', Icon: TrendingUp },
                { label: 'Accuracy', value: `${userStats.accuracy}%`, color: '#60a5fa', bg: 'rgba(59,130,246,.1)', Icon: Target },
                { label: 'Rank', value: myRank ? `#${myRank.rank}` : '—', color: myRank?.rank <= 3 ? 'var(--gold)' : 'var(--text-primary)', bg: myRank?.rank <= 3 ? 'rgba(245,197,66,.1)' : 'rgba(255,255,255,.03)', Icon: Trophy },
              ].map((s, i) => (
                <div key={s.label} className="p-sc" style={{ animationDelay: `${i * 40}ms`, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, flexShrink: 0 }}><s.Icon size={14} /></div>
                  <div>
                    <div style={{ fontSize: '.95rem', fontWeight: 900, color: s.color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
                      <AnimNum value={typeof s.value === 'number' ? s.value : 0} delay={i * 60 + 100} />
                      {typeof s.value === 'string' && (s.value.startsWith('#') || s.value === '—') ? s.value : ''}
                    </div>
                    <div style={{ fontSize: '.5rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.04em', marginTop: 1 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {userStats.total > 0 && (
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.04)', overflow: 'hidden' }}>
                <div className="p-bl" style={{ height: '100%', borderRadius: 2, background: userStats.predicted === userStats.total ? 'linear-gradient(90deg,var(--accent),#00c853)' : 'rgba(0,230,118,.5)', width: `${(userStats.predicted / userStats.total) * 100}%` }} />
              </div>
            )}
          </ToggleSection>
        )}

        {/* ═══ LEADERBOARD — TOGGLE ═══ */}
        {leaderboard.length > 0 && (
          <ToggleSection id="lb" icon={<Trophy size={15} />} iconBg="rgba(168,85,247,.12)" iconColor="#a855f7" title="Rankings" badge={leaderboard.length} badgeBg="rgba(168,85,247,.1)" badgeColor="#a855f7" defaultOpen={false} style={{ marginBottom: 14, animationDelay: '120ms' }}>
            <div className="sc-card" style={{ borderColor: 'rgba(168,85,247,.1)', background: 'linear-gradient(135deg,rgba(168,85,247,.03),transparent)', padding: '14px 12px' }}>
              {myRank && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,230,118,.06)', border: '1px solid rgba(0,230,118,.12)' }}>
                  <span style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--accent)' }}>Your rank: <strong>#{myRank.rank}</strong> · {myRank.points} pts · {myRank.accuracy}% acc</span>
                </div>
              )}
              <div className="rr" style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '.04em', background: 'transparent', marginBottom: 4, borderRadius: '6px 6px 0 0', borderBottom: '1px solid var(--border)' }}>
                <span>#</span><span>Player</span><span className="hm">Pts</span><span>Exact</span><span className="hm">Result</span><span className="hm">Acc%</span>
              </div>
              {leaderboard.slice(0, 30).map((u, i) => {
                const isMe = u.uid === uid;
                return (
                  <div key={u.uid} className={`rr p-sr ${isMe ? 'me' : ''}`} style={{ background: isMe ? 'rgba(0,230,118,.05)' : i % 2 === 0 ? 'var(--bg-surface)' : 'transparent', animationDelay: `${i * 25}ms` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {u.rank === 1 ? <Crown size={13} style={{ color: '#fbbf24' }} /> : u.rank <= 3 ? <Medal size={12} style={{ color: u.rank === 2 ? '#94a3b8' : '#d97706' }} /> : <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontSize: '.72rem' }}>{u.rank}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: isMe ? 'rgba(0,230,118,.12)' : 'rgba(255,255,255,.04)', border: isMe ? '1px solid rgba(0,230,118,.2)' : '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.64rem', fontWeight: 800, color: isMe ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>{(u.name || '?').charAt(0).toUpperCase()}</div>
                      <span style={{ fontWeight: isMe ? 800 : 600, color: isMe ? 'var(--accent)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.74rem' }}>{u.name}{isMe && <span style={{ fontSize: '.56rem', color: 'var(--accent)', marginLeft: 4, fontWeight: 600 }}>YOU</span>}</span>
                    </div>
                    <span className="hm" style={{ fontWeight: 900, color: '#a855f7', fontFamily: 'var(--font-display)', fontSize: '.85rem' }}>{u.points}</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>{u.exact}</span>
                    <span className="hm" style={{ fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>{u.result}</span>
                    <span className="hm" style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '.7rem' }}>{u.accuracy}%</span>
                  </div>
                );
              })}
            </div>
          </ToggleSection>
        )}

        {/* ═══ ZOKA PICKS — TOGGLE ═══ */}
        {zokaPicks?.matches?.length > 0 && (
          <ToggleSection id="zoka" icon={<Sparkles size={15} />} iconBg="rgba(245,197,66,.12)" iconColor="var(--gold)" title="Zoka Picks" badge={zokaPicks.matches.length} badgeBg="rgba(245,197,66,.1)" badgeColor="var(--gold)" defaultOpen={true} style={{ marginBottom: 14, animationDelay: '100ms' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {zokaPicks.matches.map((pick, i) => {
                const actual = scoreMap.get(String(pick.matchId));
                const res = pick.adminPick
                  ? (userResultMap[String(pick.matchId)] || calcPoints(pick.adminPick.home, pick.adminPick.away, actual?.h, actual?.a))
                  : null;
                const vs = zokaVoteStats[String(pick.matchId)] || { agree: 0, disagree: 0, total: 0 };
                const myVote = userZokaVotes[String(pick.matchId)];
                return (
                  <div key={i} className="p-sr" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card)', border: res?.type === 'exact' ? '1px solid rgba(0,230,118,.2)' : res?.type === 'result' ? '1px solid rgba(245,197,66,.15)' : '1px solid var(--border)', animationDelay: `${i * 35}ms` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: '.54rem', fontWeight: 800, color: 'var(--text-muted)', width: 12, textAlign: 'center', fontFamily: 'var(--font-display)' }}>{i + 1}</span>
                      {pick.homeLogo && <img src={pick.homeLogo} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain' }} />}
                      <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.homeTeam?.name}</span>
                      <span style={{ fontSize: '.8rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--gold)', background: 'rgba(245,197,66,.06)', padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(245,197,66,.1)', fontVariantNumeric: 'tabular-nums' }}>{pick.adminPick?.home ?? '?'}-{pick.adminPick?.away ?? '?'}</span>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'center' }}>{actual ? `${actual.h}-${actual.a}` : '–'}</span>
                      <span style={{ flex: 1, fontSize: '.72rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{pick.awayTeam?.name}</span>
                      {pick.awayLogo && <img src={pick.awayLogo} alt="" style={{ width: 16, height: 16, borderRadius: 3, objectFit: 'contain' }} />}
                      <div style={{ width: 65, textAlign: 'right' }}>
                        {res && res.type !== 'pending' && <ResultBadge result={res} />}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 19, paddingRight: 81 }}>
                      <button className={`vote-btn ${myVote === 'agree' ? 'agree-active' : ''}`} onClick={() => handleZokaVote(String(pick.matchId), 'agree')} disabled={votingId === String(pick.matchId)}><ThumbsUp size={11} />{vs.agree}</button>
                      <VoteBar agree={vs.agree} disagree={vs.disagree} />
                      <button className={`vote-btn ${myVote === 'disagree' ? 'disagree-active' : ''}`} onClick={() => handleZokaVote(String(pick.matchId), 'disagree')} disabled={votingId === String(pick.matchId)}><ThumbsDown size={11} />{vs.disagree}</button>
                      {myVote && <span className="p-vpop" style={{ fontSize: '.54rem', fontWeight: 700, color: myVote === 'agree' ? 'var(--accent)' : '#ef4444', whiteSpace: 'nowrap' }}>{myVote === 'agree' ? '✓' : '✗'}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </ToggleSection>
        )}

        {/* ═══ LOADING SKELETONS ═══ */}
        {loading && !error && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ animationDelay: `${i * 80}ms` }} />)}

        {/* ═══ ERROR STATE ═══ */}
        {error && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: 16 }} />
            <div style={{ fontSize: 14, color: '#ef4444', fontWeight: 600 }}>Failed to load predictions</div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 6 }}>Check your connection and try again</div>
          </div>
        )}

        {/* ═══ PREDICTION CARDS ═══ */}
        {!loading && !error && filteredPreds.length === 0 && filter !== 'history' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16, animation: 'bb_float 4s ease-in-out infinite', display: 'inline-block' }}>⚽</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>No games available for this filter</div>
            <div style={{ fontSize: '.72rem', color: '#334155', marginTop: 6 }}>Try "All" or "Unpredicted"</div>
          </div>
        )}

        {!loading && !error && filteredPreds.length > 0 && filter !== 'history' && (
          <div key={filter} className="p-up">
            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }} className="hsb">
              {[
                { key: 'all', label: 'All', count: filterCounts.all },
                { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
                { key: 'unpredicted', label: 'Unpredicted', count: filterCounts.unpredicted },
                { key: 'finished', label: 'Finished', count: filterCounts.finished },
              ].map(f => (
                <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {filteredPreds.map((pred, i) => {
              const actual = scoreMap.get(String(pred.matchId));
              const myPred = userPredMap[pred.id];
              const myResult = userResultMap[String(pred.matchId)]; 
              const isEditing = editingId === pred.id;
              const isLocked = pred.status === 'finished' || isGlobalLocked || (pred.kickoff && parseKickoff(pred.kickoff, pred.matchDate) && Date.now() > parseKickoff(pred.kickoff, pred.matchDate).getTime() - 3600000);

              return (
                <div key={pred.id} className="mc p-sr" style={{ animationDelay: `${i * 40}ms` }}>
                  {/* Header */}
                  <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {pred.homeLogo && <img src={pred.homeLogo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />}
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pred.homeTeam?.name}</span>
                    </div>
                    
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input className={`pi hv ${editH ? 'has-val' : ''}`} value={editH} onChange={e => setEditH(e.target.value)} placeholder="H" autoFocus maxLength={2} />
                        <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>–</span>
                        <input className={`pi hv ${editA ? 'has-val' : ''}`} value={editA} onChange={e => setEditA(e.target.value)} placeholder="A" maxLength={2} />
                        <button className="zb" onClick={() => handleSave(pred)} disabled={saving || !editH || !editA} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: '.76rem', border: 'none' }}>
                          {saving ? <Loader size={12} style={{ animation: 'asp 1s linear infinite' }} /> : <Check size={14} />}
                        </button>
                        <button className="zb" onClick={() => { setEditingId(null); }} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.15)', color: '#ef4444' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!isLocked ? (
                          <button className="pred-btn editable" onClick={() => startEdit(pred)}>
                            {myPred ? <><Pencil size={13} style={{ marginRight: 4 }} />{myPred.homeScore}-{myPred.awayScore}</> : <><Pencil size={13} style={{ marginRight: 4 }} />Predict</>}
                          </button>
                        ) : (
                          <div className="pred-btn locked">
                            {myPred ? <>{myPred.homeScore}-{myPred.awayScore}</> : <><Clock size={13} style={{ marginRight: 4}} />{pred.kickoff || '—'}</>}
                          </div>
                        )}
                        {myResult && myResult.type !== 'pending' && <ResultBadge result={myResult} />}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{pred.awayTeam?.name}</span>
                      {pred.awayLogo && <img src={pred.awayLogo} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain' }} />}
                    </div>
                  </div>

                  {/* Quick picks when editing */}
                  {isEditing && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                      {QUICK_PICKS.map((qp, qi) => (
                        <button key={`${qp.h}-${qp.a}`} className={`qp-btn ${editH === String(qp.h) && editA === String(qp.a) ? 'selected' : ''}`} onClick={() => quickPick(qp.h, qp.a)}>
                          {qp.h}-{qp.a}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Actual score row for finished matches */}
                  {actual && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px 14px' }}>
                      <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>Actual:</span>
                      <span style={{ fontSize: '.9rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{actual.h}-{actual.a}</span>
                    </div>
                  )}

                  {/* Popular pick */}
                  {!isEditing && predCounts[pred.id] > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 12px', fontSize: '.58rem', color: 'var(--text-muted)', borderTop: !actual ? '1px solid var(--border)' : 'none', paddingTop: !actual ? 12 : 0 }}>
                      <Users size={10} />
                      <span>{predCounts[pred.id]} predictions</span>
                      {getPopular(pred.id) && (
                        <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--gold)' }}>
                          Popular: {getPopular(pred.id).score} ({getPopular(pred.id).count}/{getPopular(pred.id).total})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}