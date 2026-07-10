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
   STYLES — MOBILE-FIRST, BOLD, FOOTBALL VIBE
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('pred-mob-v12')) return;
  const s = document.createElement('style');
  s.id = 'pred-mob-v12';
  s.textContent = `
    /* ── Keyframes ── */
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
    @keyframes pVPop{0%{transform:scale(.8);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
    @keyframes pToast{0%{opacity:0;transform:translateY(8px) scale(.95)}10%{opacity:1;transform:translateY(0) scale(1)}85%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-6px) scale(.95)}}
    @keyframes pStreak{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}
    @keyframes pCardIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes pGlow{0%,100%{box-shadow:0 0 12px rgba(0,230,118,.1)}50%{box-shadow:0 0 24px rgba(0,230,118,.2)}}

    .p-up{animation:pUp .5s cubic-bezier(.22,1,.36,1) both}
    .p-sc{animation:pSc .4s cubic-bezier(.22,1,.36,1) both}
    .p-sd{animation:pSd .35s cubic-bezier(.22,1,.36,1) both}
    .p-sr{animation:pSr .4s cubic-bezier(.22,1,.36,1) both}
    .p-bl{transform-origin:left center;animation:pBar .7s cubic-bezier(.22,1,.36,1) both}
    .p-ur{animation:pUr 1s ease-in-out infinite}
    .p-ce{animation:pCe .5s cubic-bezier(.22,1,.36,1) both}
    .p-co{animation:pCo .3s cubic-bezier(.22,1,.36,1) both}
    .p-vpop{animation:pVPop .3s cubic-bezier(.22,1,.36,1) both}
    .p-card{animation:pCardIn .4s cubic-bezier(.22,1,.36,1) both}

    .sk-p{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:pSh 1.5s ease-in-out infinite}
    .hsb::-webkit-scrollbar{display:none}.hsb{scrollbar-width:none}

    .zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
    .zb:hover{transform:translateY(-2px);filter:brightness(1.06)}
    .zb:active{transform:translateY(0) scale(.97)}
    .zb:disabled{opacity:.3;pointer-events:none;filter:none;transform:none}

    /* ── Match card ── */
    .mc{transition:all .25s cubic-bezier(.22,1,.36,1);border-radius:16px;overflow:hidden;margin-bottom:12px;background:var(--bg-card);border:1px solid var(--border)}
    .mc:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.2)}

    /* ── Score prediction inputs — BIGGER ── */
    .pi{width:56px;height:50px;padding:0;border-radius:12px;background:var(--bg-surface);border:2px solid rgba(0,230,118,.2);color:var(--text-primary);text-align:center;font-weight:900;font-size:1.15rem;outline:none;font-variant-numeric:tabular-nums;transition:all .2s;-webkit-appearance:none;appearance:none}
    .pi:focus{border-color:var(--accent);box-shadow:0 0 0 4px rgba(0,230,118,.12)}
    .pi::placeholder{color:var(--text-muted);opacity:.35;font-weight:700;font-size:.95rem}
    .pi.hv{border-color:var(--accent);background:rgba(0,230,118,.04)}

    .shn{position:relative;overflow:hidden}
    .shn::after{content:'';position:absolute;top:0;left:-100%;width:60%;height:100%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);animation:pSi 3s ease-in-out infinite}

    /* ── Leaderboard rows — DESKTOP grid ── */
    .rr{display:grid;grid-template-columns:40px 1fr 72px 64px 64px 72px;align-items:center;gap:8px;padding:11px 16px;border-radius:12px;margin-bottom:6px;font-size:.88rem;font-weight:600;transition:background .15s}
    .rr:hover{background:rgba(255,255,255,.02)}
    .rr.me{background:rgba(0,230,118,.05);border:1.5px solid rgba(0,230,118,.15)}

    .sc-card{background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:20px;margin-bottom:16px}

    /* ── Prediction buttons — BIGGER ── */
    .pred-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 22px;border-radius:12px;font-weight:900;font-family:var(--font-display);font-size:1.15rem;font-variant-numeric:tabular-nums;cursor:default;transition:all .2s cubic-bezier(.22,1,.36,1);border:2px solid rgba(0,230,118,.25);background:rgba(0,230,118,.08);color:var(--accent)}
    .pred-btn.editable{cursor:pointer}
    .pred-btn.editable:hover{background:rgba(0,230,118,.14);transform:scale(1.04);box-shadow:0 0 20px rgba(0,230,118,.15)}
    .pred-btn.locked{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:var(--text-secondary)}

    /* ── Vote buttons — BIGGER ── */
    .vote-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:10px;font-size:.82rem;font-weight:800;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .18s cubic-bezier(.22,1,.36,1);min-height:40px;-webkit-tap-highlight-color:transparent}
    .vote-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
    .vote-btn:active{transform:scale(.95)}
    .vote-btn.agree-active{border-color:rgba(0,230,118,.3);background:rgba(0,230,118,.1);color:var(--accent)}
    .vote-btn.disagree-active{border-color:rgba(239,68,68,.25);background:rgba(239,68,68,.08);color:#ef4444}

    .vote-bar{height:5px;border-radius:3px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
    .vote-bar-fill{height:100%;border-radius:3px;transition:width .5s cubic-bezier(.22,1,.36,1)}

    /* ── Quick pick buttons — BIGGER ── */
    .qp-btn{padding:10px 14px;border-radius:10px;font-size:.88rem;font-weight:900;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1.5px solid var(--border);background:rgba(255,255,255,.03);color:var(--text-secondary);cursor:pointer;transition:all .15s cubic-bezier(.22,1,.36,1);min-height:44px;-webkit-tap-highlight-color:transparent}
    .qp-btn:hover{border-color:rgba(0,230,118,.3);background:rgba(0,230,118,.08);color:var(--accent);transform:translateY(-1px)}
    .qp-btn:active{transform:scale(.95)}
    .qp-btn.selected{border-color:var(--accent);background:rgba(0,230,118,.12);color:var(--accent)}

    /* ── Toggle buttons — BIGGER ── */
    .tog-btn{width:100%;display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-radius:14px;cursor:pointer;outline:none;transition:all .18s ease;text-align:left;background:var(--bg-card);border:1.5px solid var(--border);min-height:56px;-webkit-tap-highlight-color:transparent}
    .tog-btn:hover{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1)}
    .tog-body{overflow:hidden;transition:max-height .4s cubic-bezier(.22,1,.36,1),opacity .3s ease,margin .3s ease}
    .tog-body.open{max-height:5000px;opacity:1;margin-top:10px}
    .tog-body.closed{max-height:0;opacity:0;margin-top:0}
    .tog-badge{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 8px;border-radius:8px;font-size:.72rem;font-weight:900}

    /* ── Filter buttons — BIGGER ── */
    .filter-btn{padding:10px 18px;border-radius:12px;font-size:.85rem;font-weight:800;border:1.5px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all .15s ease;white-space:nowrap;min-height:44px;-webkit-tap-highlight-color:transparent}
    .filter-btn:hover{background:rgba(255,255,255,.04);color:var(--text-primary)}
    .filter-btn.active{background:rgba(0,230,118,.08);border-color:rgba(0,230,118,.2);color:var(--accent)}

    .toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;animation:pToast 2.5s cubic-bezier(.22,1,.36,1) both;pointer-events:none}
    .streak-badge{display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:8px;font-size:.78rem;font-weight:900;background:linear-gradient(135deg,rgba(249,115,22,.12),rgba(239,68,68,.08));border:1.5px solid rgba(249,115,22,.25);color:#f97316;animation:pStreak 2s ease-in-out infinite}

    /* ── Result badge — BIGGER ── */
    .res-badge{display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:.82rem;font-weight:900;letter-spacing:.02em;white-space:nowrap}
    .pts-badge{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:8px;font-size:.78rem;font-weight:900}

    /* ═══════════════════════════════════════════════════════════
       MOBILE BREAKPOINTS
       ═══════════════════════════════════════════════════════════ */
    @media(max-width:700px){
      /* Leaderboard: vertical card layout */
      .rr{
        grid-template-columns:32px 1fr auto!important;
        gap:8px;
        padding:14px 14px;
        font-size:.9rem;
        border-radius:14px;
        margin-bottom:8px;
      }
      .rr .hm{display:none!important}
      .rr-me-info{
        grid-column:1/-1;
        display:flex;gap:12px;flex-wrap:wrap;
        margin-top:4px;padding-top:8px;
        border-top:1px solid var(--border);
      }

      .pred-btn{padding:8px 16px;font-size:1rem}
      .qp-grid{grid-template-columns:repeat(4,1fr)!important;gap:6px!important}

      /* Toggle buttons */
      .tog-btn{padding:14px 16px;min-height:52px}
      .tog-badge{min-width:22px;height:22px;font-size:.7rem}

      /* Filter buttons scroll */
      .filter-scroll{gap:8px!important}
      .filter-btn{padding:9px 16px;font-size:.82rem;min-height:42px}

      /* Stats grid */
      .stats-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important}
    }

    @media(max-width:420px){
      .qp-grid{grid-template-columns:repeat(4,1fr)!important;gap:4px!important}
      .qp-btn{padding:8px 8px;font-size:.82rem;min-height:40px}
      .stats-grid{grid-template-columns:repeat(2,1fr)!important;gap:6px!important}
      .pred-btn{padding:8px 14px;font-size:.95rem}
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
    <span className={diff < 1800000 ? 'p-ur' : ''} style={{ fontSize: '.88rem', fontWeight: 900, fontFamily: 'var(--font-display)', color: diff < 1800000 ? '#ef4444' : 'var(--gold)', fontVariantNumeric: 'tabular-nums', letterSpacing: '.03em' }}>
      {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SKELETON
   ═══════════════════════════════════════════════════════════════ */
function Skeleton() {
  return (
    <div className="mc" style={{ padding: 20 }}>
      <div className="sk-p" style={{ height: 12, width: '28%', borderRadius: 6, marginBottom: 18 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="sk-p" style={{ width: 36, height: 36, borderRadius: 10 }} />
        <div className="sk-p" style={{ height: 15, width: '30%', borderRadius: 6 }} />
        <div style={{ flex: 1 }} />
        <div className="sk-p" style={{ height: 32, width: 72, borderRadius: 10 }} />
        <div style={{ flex: 1 }} />
        <div className="sk-p" style={{ height: 15, width: '30%', borderRadius: 6 }} />
        <div className="sk-p" style={{ width: 36, height: 36, borderRadius: 10 }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RESULT BADGE — BOLD, CLEAR
   ═══════════════════════════════════════════════════════════════ */
function ResultBadge({ result }) {
  if (!result || result.type === 'pending') return null;
  const c = {
    exact: { bg: 'rgba(0,230,118,.14)', bd: 'rgba(0,230,118,.3)', cl: 'var(--accent)', lbl: 'EXACT SCORE', icon: <CircleCheck size={13} /> },
    result: { bg: 'rgba(245,197,66,.1)', bd: 'rgba(245,197,66,.25)', cl: 'var(--gold)', lbl: 'CORRECT RESULT', icon: <TrendingUp size={13} /> },
    miss: { bg: 'rgba(239,68,68,.08)', bd: 'rgba(239,68,68,.18)', cl: '#ef4444', lbl: 'MISS', icon: <CircleX size={13} /> },
  }[result.type];
  if (!c) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={`res-badge ${result.type === 'exact' ? 'p-ce' : ''}`} style={{ background: c.bg, border: `1.5px solid ${c.bd}`, color: c.cl }}>
        {c.icon} {c.lbl}
      </span>
      {result.points > 0 && (
        <span className="pts-badge" style={{ background: 'rgba(168,85,247,.1)', border: '1.5px solid rgba(168,85,247,.2)', color: '#a855f7' }}>
          <Zap size={12} /> +{result.points}
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <div className="vote-bar"><div className="vote-bar-fill" style={{ width: `${Math.round((agree/total)*100)}%`, background: 'var(--accent)' }} /></div>
      <span style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round((agree/total)*100)}%</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOGGLE SECTION — BIGGER TOUCH TARGETS
   ═══════════════════════════════════════════════════════════════ */
function ToggleSection({ id, icon, iconBg, iconColor, title, badge, badgeBg, badgeColor, defaultOpen, children, style }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="p-up" style={style}>
      <button className="tog-btn" onClick={() => setOpen(!open)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0 }}>{icon}</div>
          <span style={{ fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>{title}</span>
          {badge != null && (
            <span className="tog-badge" style={{ background: badgeBg, color: badgeColor }}>{badge}</span>
          )}
        </div>
        {open ? <ChevronUp size={18} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />}
      </button>
      <div className={`tog-body ${open ? 'open' : 'closed'}`}>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SAVE TOAST — BOLDER
   ═══════════════════════════════════════════════════════════════ */
function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 14, background: 'rgba(0,230,118,.12)', border: '1.5px solid rgba(0,230,118,.3)', backdropFilter: 'blur(12px)' }}>
        <CircleCheck size={18} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--accent)' }}>Locked in <strong>{score}</strong></span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LOGIN PROMPT MODAL — BIGGER
   ═══════════════════════════════════════════════════════════════ */
function LoginPromptModal({ onClose }) {
  const navigate = useNavigate();
  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,.6)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',padding:24 }}>
      <div onClick={e => e.stopPropagation()} className="p-sc" style={{ background:'var(--bg-card)',border:'1.5px solid var(--border)',borderRadius:20,padding:'32px 28px',maxWidth:380,width:'100%',textAlign:'center' }}>
        <div style={{ width:60,height:60,borderRadius:16,background:'rgba(0,230,118,.1)',border:'1.5px solid rgba(0,230,118,.15)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',color:'var(--accent)' }}>
          <LogIn size={28} />
        </div>
        <div style={{ fontSize:'1.15rem',fontWeight:900,color:'var(--text-primary)',marginBottom:8 }}>Login Required</div>
        <div style={{ fontSize:'.92rem',color:'var(--text-muted)',marginBottom:24,lineHeight:1.6,fontWeight:600 }}>
          You need to be logged in to make predictions and compete on the leaderboard.
        </div>
        <div style={{ display:'flex',gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:'14px 0',borderRadius:12,border:'1.5px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontWeight:800,fontSize:'.92rem',cursor:'pointer',minHeight:50 }}>
            Cancel
          </button>
          <button onClick={() => { onClose(); navigate('/login'); }} className="zb" style={{ flex:1,padding:'14px 0',borderRadius:12,border:'none',background:'var(--accent)',color:'var(--bg-deep)',fontWeight:900,fontSize:'.92rem',minHeight:50 }}>
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
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

  const [totalPoints, setTotalPoints] = useState(null);
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

  useEffect(() => {
    if (!uid || !db) return;
    const unsub = onSnapshot(doc(db, 'user_points_total', uid), snap => setTotalPoints(snap.exists() ? snap.data() : null), () => {});
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid || !db || !showHistory) return;
    setHistoryLoading(true);
    const q = query(collection(db, 'prediction_results'), where('userId', '==', uid));
    const unsub = onSnapshot(q, snap => {
      const results = snap.docs.map(d => d.data());
      results.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0));
      setHistory(results); setHistoryLoading(false);
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
      const exact = totalPoints.exactCount || 0;
      const result = totalPoints.resultCount || 0;
      const miss = totalPoints.missCount || 0;
      const points = totalPoints.totalPoints || 0;
      const resolved = exact + result + miss;
      return { predicted: Object.keys(userPredMap).length, total: activePreds.length, exact, result, miss, points, resolved, accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0 };
    }
    const my = Object.values(userPredMap);
    let exact = 0, result = 0, miss = 0, points = 0, resolved = 0;
    my.forEach(p => { const a = scoreMap.get(String(p.matchId)); if (!a) return; resolved++; const r = calcPoints(p.homeScore, p.awayScore, a.h, a.a); points += r.points; if (r.type === 'exact') exact++; else if (r.type === 'result') result++; else miss++; });
    return { predicted: my.length, total: activePreds.length, exact, result, miss, points, resolved, accuracy: resolved > 0 ? Math.round(((exact + result) / resolved) * 100) : 0 };
  }, [userPredMap, scoreMap, activePreds, totalPoints]);

  const streak = useMemo(() => {
    const resolved = userResults.sort((a, b) => (b.resolvedAt?.seconds || 0) - (a.resolvedAt?.seconds || 0)).map(r => r.resultType !== 'miss' ? 1 : 0);
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

  /* ═══════════════════════════════════════════════════════════
     RENDER: MATCH CARD (MOBILE-OPTIMIZED)
     ═══════════════════════════════════════════════════════════ */
  const renderMatchCard = (pred, idx) => {
    const isEditing = editingId === pred.id;
    const existing = userPredMap[pred.id];
    const isFinished = pred.status === 'finished';
    const actual = scoreMap.get(String(pred.matchId));
    const userRes = userResultMap[String(pred.matchId)];
    const isLocked = isFinished || (globalDeadline && now > new Date(parseKickoff(pred.kickoff, pred.matchDate || todayStr())?.getTime() - 3600000)?.getTime());
    const popular = getPopular(pred.id);
    const predCount = predCounts[pred.id] || 0;
    const kickoffTime = parseKickoff(pred.kickoff, pred.matchDate || todayStr());

    return (
      <div key={pred.id} className={`mc p-card ${isFinished ? 'shn' : ''}`} style={{ animationDelay: `${idx * 40}ms` }}>
        {/* Top row: League + Status */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 0', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
            {pred.league?.emblem && <img src={pred.league.emblem} alt="" style={{ width:20, height:20, borderRadius:5, objectFit:'contain', flexShrink:0 }} />}
            <span style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {pred.league?.name || ''}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
            {isFinished ? (
              <span style={{ fontSize:'.82rem', fontWeight:900, color:'var(--accent)', background:'rgba(0,230,118,.08)', padding:'4px 14px', borderRadius:8, border:'1px solid rgba(0,230,118,.15)' }}>FT</span>
            ) : isLocked ? (
              <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.82rem', fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,.06)', padding:'4px 12px', borderRadius:8, border:'1px solid rgba(239,68,68,.12)' }}>
                <Lock size={12} /> Locked
              </span>
            ) : kickoffTime && kickoffTime > new Date() ? (
              <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:'.82rem', fontWeight:800, color:'var(--gold)', background:'rgba(245,197,66,.06)', padding:'4px 12px', borderRadius:8, border:'1px solid rgba(245,197,66,.12)' }}>
                <Clock size={12} /> {pred.kickoff}
              </span>
            ) : null}
          </div>
        </div>

        {/* Teams + Score */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px' }}>
          {/* Home */}
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
            {pred.homeLogo ? <img src={pred.homeLogo} alt="" style={{ width:32, height:32, borderRadius:8, objectFit:'contain', flexShrink:0 }} /> : <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'.8rem' }}>⚽</div>}
            <span style={{ fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {pred.homeTeam?.shortName || pred.homeTeam?.name || 'TBD'}
            </span>
          </div>

          {/* Score / Edit */}
          {isEditing ? (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="text" inputMode="numeric" maxLength={2} className={`pi ${editH !== '' ? 'hv' : ''}`} value={editH} onChange={e => setEditH(e.target.value.replace(/[^0-9]/g, '').slice(0,2))} placeholder="H" autoFocus />
              <span style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text-muted)' }}>–</span>
              <input type="text" inputMode="numeric" maxLength={2} className={`pi ${editA !== '' ? 'hv' : ''}`} value={editA} onChange={e => setEditA(e.target.value.replace(/[^0-9]/g, '').slice(0,2))} placeholder="A" />
            </div>
          ) : existing ? (
            <span className={`pred-btn ${isLocked ? 'locked' : 'editable'}`} onClick={() => !isLocked && startEdit(pred)}>
              {existing.homeScore}-{existing.awayScore}
              {!isLocked && <Pencil size={14} />}
            </span>
          ) : isFinished && actual ? (
            <span style={{ fontSize:'1.2rem', fontWeight:900, fontFamily:'var(--font-display)', color:'var(--accent)', background:'rgba(0,230,118,.08)', padding:'8px 20px', borderRadius:12, border:'1px solid rgba(0,230,118,.15)', fontVariantNumeric:'tabular-nums' }}>
              {actual.h}-{actual.a}
            </span>
          ) : (
            <button onClick={() => startEdit(pred)} className="zb" style={{ padding:'10px 20px', borderRadius:12, background:'rgba(0,230,118,.06)', border:'1.5px solid rgba(0,230,118,.2)', color:'var(--accent)', fontWeight:800, fontSize:'.92rem', display:'flex', alignItems:'center', gap:8, minHeight:48 }}>
              <Target size={16} /> Predict
            </button>
          )}

          {/* Away */}
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:10, minWidth:0, justifyContent:'flex-end' }}>
            <span style={{ fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' }}>
              {pred.awayTeam?.shortName || pred.awayTeam?.name || 'TBD'}
            </span>
            {pred.awayLogo ? <img src={pred.awayLogo} alt="" style={{ width:32, height:32, borderRadius:8, objectFit:'contain', flexShrink:0 }} /> : <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:'.8rem' }}>⚽</div>}
          </div>
        </div>

        {/* Edit actions */}
        {isEditing && (
          <div style={{ padding:'0 16px 6px', animation:'pCo .25s ease both' }}>
            {/* Quick picks */}
            <div className="qp-grid" style={{ display:'grid', gridTemplateColumns:'repeat(8,1fr)', gap:6, marginBottom:12 }}>
              {QUICK_PICKS.map((qp, i) => (
                <button key={i} type="button" className={`qp-btn ${editH === String(qp.h) && editA === String(qp.a) ? 'selected' : ''}`} onClick={() => quickPick(qp.h, qp.a)}>
                  {qp.h}-{qp.a}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => handleSave(pred)} disabled={saving || editH === '' || editA === ''} className="zb" style={{ flex:1, padding:'12px', borderRadius:12, background:'linear-gradient(135deg,#00e676,#00c853)', color:'var(--bg-deep)', fontWeight:900, fontSize:'.92rem', border:'none', display:'flex', alignItems:'center', justifyContent:'center', gap:8, minHeight:50, boxShadow:'0 4px 16px rgba(0,230,118,.2)' }}>
                {saving ? <Loader size={16} style={{ animation:'pSh .8s linear infinite' }} /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Lock In'}
              </button>
              <button onClick={() => setEditingId(null)} className="zb" style={{ padding:'12px 16px', borderRadius:12, background:'rgba(255,255,255,.04)', border:'1.5px solid var(--border)', color:'var(--text-muted)', fontWeight:800, fontSize:'.88rem', minHeight:50 }}>
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Bottom: Result badge + Prediction count + Popular */}
        <div style={{ padding:'0 16px 14px', display:'flex', flexDirection:'column', gap:8 }}>
          {userRes && userRes.resultType && userRes.resultType !== 'pending' && (
            <ResultBadge result={{ type: userRes.resultType, points: userRes.points }} />
          )}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
            <span style={{ fontSize:'.78rem', fontWeight:700, color:'var(--text-muted)', display:'flex', alignItems:'center', gap:5 }}>
              <Users size={13} /> {predCount} prediction{predCount !== 1 ? 's' : ''}
            </span>
            {popular && popular.total > 0 && (
              <span style={{ fontSize:'.78rem', fontWeight:700, color:'var(--gold)', display:'flex', alignItems:'center', gap:5 }}>
                <Flame size={13} /> Popular: {popular.score} ({popular.count})
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER: ZOKA PICK ROW
     ═══════════════════════════════════════════════════════════ */
  const renderZokaRow = (pick, i) => {
    const actual = scoreMap.get(String(pick.matchId));
    const res = pick.adminPick
      ? (userResultMap[String(pick.matchId)] || calcPoints(pick.adminPick.home, pick.adminPick.away, actual?.h, actual?.a))
      : null;
    const vs = zokaVoteStats[String(pick.matchId)] || { agree: 0, disagree: 0, total: 0 };
    const myVote = userZokaVotes[String(pick.matchId)];
    const isFin = pick.status === 'finished';

    return (
      <div key={i} className="p-card" style={{
        padding:'14px 16px', borderRadius:14,
        background:'var(--bg-card)',
        border: res?.type === 'exact' ? '1.5px solid rgba(0,230,118,.25)' : res?.type === 'result' ? '1.5px solid rgba(245,197,66,.2)' : '1px solid var(--border)',
        marginBottom:8, animationDelay:`${i * 35}ms`,
      }}>
        {/* Teams + Scores row */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
          <span style={{ fontSize:'.72rem', fontWeight:900, color:'var(--text-muted)', width:18, textAlign:'center', fontFamily:'var(--font-display)' }}>{i + 1}</span>
          {pick.homeLogo && <img src={pick.homeLogo} alt="" style={{ width:22, height:22, borderRadius:5, objectFit:'contain', flexShrink:0 }} />}
          <span style={{ flex:1, fontSize:'.88rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pick.homeTeam?.shortName || pick.homeTeam?.name}</span>

          {/* Zoka score */}
          <span style={{ fontSize:'1.05rem', fontWeight:900, fontFamily:'var(--font-display)', color:'var(--gold)', background:'rgba(245,197,66,.08)', padding:'5px 12px', borderRadius:8, border:'1px solid rgba(245,197,66,.15)', fontVariantNumeric:'tabular-nums' }}>
            {pick.adminPick?.home ?? '?'}-{pick.adminPick?.away ?? '?'}
          </span>

          {/* Actual score */}
          <span style={{ fontSize:'.95rem', fontWeight:800, color: actual ? 'var(--accent)' : 'var(--text-muted)', fontFamily:'var(--font-display)', fontVariantNumeric:'tabular-nums', minWidth:40, textAlign:'center' }}>
            {actual ? `${actual.h}-${actual.a}` : '–'}
          </span>

          <span style={{ flex:1, fontSize:'.88rem', fontWeight:800, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textAlign:'right' }}>{pick.awayTeam?.shortName || pick.awayTeam?.name}</span>
          {pick.awayLogo && <img src={pick.awayLogo} alt="" style={{ width:22, height:22, borderRadius:5, objectFit:'contain', flexShrink:0 }} />}
        </div>

        {/* Result badge */}
        {res && res.type !== 'pending' && <div style={{ marginBottom:10 }}><ResultBadge result={res} /></div>}

        {/* Vote bar + buttons */}
        {vs.total > 0 && (
          <div style={{ marginBottom:8 }}><VoteBar agree={vs.agree} disagree={vs.disagree} /></div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => handleZokaVote(String(pick.matchId), 'agree')} disabled={votingId === String(pick.matchId)} className={`vote-btn ${myVote === 'agree' ? 'agree-active' : ''}`} style={{ flex:1 }}>
            <ThumbsUp size={14} /> Agree {vs.agree > 0 && `(${vs.agree})`}
          </button>
          <button onClick={() => handleZokaVote(String(pick.matchId), 'disagree')} disabled={votingId === String(pick.matchId)} className={`vote-btn ${myVote === 'disagree' ? 'disagree-active' : ''}`} style={{ flex:1 }}>
            <ThumbsDown size={14} /> Disagree {vs.disagree > 0 && `(${vs.disagree})`}
          </button>
        </div>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER: LEADERBOARD ROW (MOBILE CARD)
     ═══════════════════════════════════════════════════════════ */
  const renderLbRow = (u, i) => {
    const isMe = u.uid === uid;
    return (
      <div key={u.uid} className={`rr p-sr ${isMe ? 'me' : ''}`} style={{
        background: isMe ? 'rgba(0,230,118,.05)' : i % 2 === 0 ? 'var(--bg-surface)' : 'transparent',
        animationDelay: `${i * 25}ms`,
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          {u.rank === 1 ? <Crown size={15} style={{ color:'#fbbf24' }} /> : u.rank <= 3 ? <Medal size={14} style={{ color: u.rank === 2 ? '#94a3b8' : '#d97706' }} /> : <span style={{ fontWeight:800, color:'var(--text-muted)', fontFamily:'var(--font-display)', fontSize:'.82rem' }}>{u.rank}</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
          <div style={{ width:28, height:28, borderRadius:8, background: isMe ? 'rgba(0,230,118,.12)' : 'rgba(255,255,255,.04)', border: isMe ? '1.5px solid rgba(0,230,118,.2)' : '1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.72rem', fontWeight:900, color: isMe ? 'var(--accent)' : 'var(--text-muted)', flexShrink:0 }}>{(u.name || '?').charAt(0).toUpperCase()}</div>
          <span style={{ fontWeight: isMe ? 900 : 700, color: isMe ? 'var(--accent)' : 'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'.88rem' }}>
            {u.name}{isMe && <span style={{ fontSize:'.65rem', color:'var(--accent)', marginLeft:5, fontWeight:800 }}>YOU</span>}
          </span>
        </div>
        <span className="hm" style={{ fontWeight:900, color:'#a855f7', fontFamily:'var(--font-display)', fontSize:'.95rem' }}>{u.points}</span>
        <span style={{ fontWeight:800, color:'var(--accent)', fontFamily:'var(--font-display)' }}>{u.exact}</span>
        {/* Mobile info row */}
        <div className="rr-me-info" style={{ display:'none' }}>
          <span style={{ fontSize:'.82rem', fontWeight:700, color:'var(--gold)' }}>{u.result} results</span>
          <span style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text-muted)' }}>{u.accuracy}% acc</span>
          <span style={{ fontSize:'.82rem', fontWeight:900, color:'#a855f7' }}>{u.points} pts</span>
        </div>
        <span className="hm" style={{ fontWeight:800, color:'var(--gold)', fontFamily:'var(--font-display)' }}>{u.result}</span>
        <span className="hm" style={{ fontWeight:700, color:'var(--text-muted)', fontSize:'.82rem' }}>{u.accuracy}%</span>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh',minHeight:'100dvh', background:'var(--bg-deep)' }}>
      <SEO title="Today's Predictions" description="Make your football score predictions for today's matches." keywords="football predictions, score predictions, Zoka Picks" url="https://zokascore.com/predictions" />

      {showLoginModal && <LoginPromptModal onClose={() => setShowLoginModal(false)} />}
      <SaveToast show={toast} score={toast} />

      {/* ── STICKY HEADER ── */}
      <div style={{ position:'sticky',top:0,zIndex:100,background:'rgba(10,10,10,.94)',backdropFilter:'blur(20px)',borderBottom:'1.5px solid var(--border)' }}>
        <div style={{ maxWidth:840,margin:'0 auto',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}>
            <div style={{ display:'flex',alignItems:'center',gap:7,cursor:'pointer' }} onClick={() => navigate('/')}>
              <div style={{ width:32,height:32,borderRadius:9,background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--bg-deep)' }}><Target size={16} /></div>
              <span style={{ fontSize:'.92rem',fontWeight:900,color:'var(--text-primary)',whiteSpace:'nowrap' }}>ZOKASCORE</span>
            </div>
            <div style={{ flex:1 }} />
            {lastUpdate && (
              <span style={{ fontSize:'.72rem',color:'var(--text-muted)',fontWeight:600,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4 }}>
                <span style={{ width:6,height:6,borderRadius:'50%',background:'var(--accent)',display:'inline-block' }} /> {timeAgo(lastUpdate)}
              </span>
            )}
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8,flexShrink:0 }}>
            {globalDeadline && !isGlobalLocked && !allFinished && (
              <div className="p-sd" style={{ display:'flex',alignItems:'center',gap:6,padding:'6px 14px',borderRadius:10,background:'rgba(245,197,66,.06)',border:'1.5px solid rgba(245,197,66,.12)' }}>
                <Timer size={13} style={{ color:'var(--gold)' }} /><Countdown deadline={globalDeadline.getTime()} />
              </div>
            )}
            {isGlobalLocked && !allFinished && (
              <div style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:10,background:'rgba(239,68,68,.06)',border:'1.5px solid rgba(239,68,68,.12)' }}>
                <Lock size={12} style={{ color:'#ef4444' }} /><span style={{ fontSize:'.82rem',fontWeight:900,color:'#ef4444' }}>LOCKED</span>
              </div>
            )}
            {allFinished && (
              <div style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:10,background:'rgba(0,230,118,.06)',border:'1.5px solid rgba(0,230,118,.12)' }}>
                <Trophy size={12} style={{ color:'var(--accent)' }} /><span style={{ fontSize:'.82rem',fontWeight:900,color:'var(--accent)' }}>RESULTS</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:840,margin:'0 auto',padding:'20px 16px 120px' }}>

        {/* ═══ TITLE ═══ */}
        <div className="p-up" style={{ marginBottom:20 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:6,flexWrap:'wrap' }}>
            <h1 style={{ fontSize:'1.6rem',fontWeight:900,color:'var(--text-primary)',margin:0,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:10 }}>
              <Star size={22} style={{ color:'var(--gold)' }} /> Today's Predictions
            </h1>
            {streak >= 2 && <span className="streak-badge"><Flame size={13} /> {streak} streak</span>}
          </div>
          <p style={{ fontSize:'.88rem',color:'var(--text-muted)',margin:0,fontWeight:600,lineHeight:1.5 }}>
            {isLoggedIn ? '10 pts exact · 3 pts result · No deletions · Edit until 1hr before kickoff · Results auto-scored' : "View matches and Zoka Picks. Log in to predict and climb the leaderboard."}
          </p>
        </div>

        {/* ═══ TOP PLAYER ═══ */}
        {topPlayer && (
          <ToggleSection id="top" icon={<Crown size={16} />} iconBg="rgba(245,197,66,.12)" iconColor="#fbbf24" title="Top Predictor" badge={`${topPlayer.points} pts`} badgeBg="rgba(245,197,66,.12)" badgeColor="#fbbf24" defaultOpen={true} style={{ marginBottom:14,animationDelay:'50ms' }}>
            <div style={{ display:'flex',alignItems:'center',gap:14,padding:'16px 18px',background:'linear-gradient(135deg,rgba(251,191,36,.06),rgba(251,191,36,.01))',border:'1.5px solid rgba(251,197,66,.15)',borderRadius:12 }}>
              <div style={{ width:50,height:50,borderRadius:14,background:'linear-gradient(135deg,#fbbf24,#f59e0b)',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a1a1a',flexShrink:0,boxShadow:'0 4px 16px rgba(245,197,66,.2)' }}><Crown size={24} /></div>
              <div style={{ flex:1,minWidth:0 }}>
                <div style={{ fontSize:'.72rem',fontWeight:800,color:'var(--gold)',textTransform:'uppercase',letterSpacing:'.08em' }}>Leading Today</div>
                <div style={{ fontSize:'1.1rem',fontWeight:900,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:2 }}>
                  {topPlayer.name}{topPlayer.uid === uid && <span style={{ fontSize:'.65rem',color:'var(--gold)',marginLeft:6,fontWeight:800 }}>YOU!</span>}
                </div>
                <div style={{ fontSize:'.78rem',color:'var(--text-muted)',fontWeight:600,marginTop:2 }}>{topPlayer.exact} exact · {topPlayer.result} results · {topPlayer.accuracy}% acc</div>
              </div>
              <div style={{ textAlign:'right',flexShrink:0 }}>
                <div style={{ fontSize:'1.7rem',fontWeight:900,color:'#fbbf24',fontFamily:'var(--font-display)',lineHeight:1 }}><AnimNum value={topPlayer.points} delay={200} /></div>
                <div style={{ fontSize:'.62rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginTop:2 }}>Points</div>
              </div>
            </div>
          </ToggleSection>
        )}

        {/* ═══ USER STATS ═══ */}
        {isLoggedIn && (
          <ToggleSection id="stats" icon={<BarChart3 size={16} />} iconBg="rgba(168,85,247,.12)" iconColor="#a855f7" title="My Stats" badge={`${userStats.predicted}/${userStats.total}`} badgeBg="rgba(168,85,247,.1)" badgeColor="#a855f7" defaultOpen={true} style={{ marginBottom:14,animationDelay:'80ms' }}>
            <div className="stats-grid" style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8,marginBottom:12 }}>
              {[
                { label:'Points',value:userStats.points,color:'#a855f7',bg:'rgba(168,85,247,.1)',Icon:Zap },
                { label:'Exact',value:userStats.exact,color:'var(--accent)',bg:'rgba(0,230,118,.1)',Icon:CircleCheck },
                { label:'Result',value:userStats.result,color:'var(--gold)',bg:'rgba(245,197,66,.1)',Icon:TrendingUp },
                { label:'Accuracy',value:`${userStats.accuracy}%`,color:'#60a5fa',bg:'rgba(59,130,246,.1)',Icon:Target },
                { label:'Rank',value:myRank ? `#${myRank.rank}` : '—',color:myRank?.rank<=3?'var(--gold)':'var(--text-primary)',bg:myRank?.rank<=3?'rgba(245,197,66,.1)':'rgba(255,255,255,.03)',Icon:Trophy },
              ].map((s,i) => (
                <div key={s.label} className="p-sc" style={{ animationDelay:`${i*40}ms`,background:'var(--bg-surface)',border:'1.5px solid var(--border)',borderRadius:12,padding:'14px',display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:36,height:36,borderRadius:10,background:s.bg,display:'flex',alignItems:'center',justifyContent:'center',color:s.color,flexShrink:0 }}><s.Icon size={16} /></div>
                  <div>
                    <div style={{ fontSize:'1.1rem',fontWeight:900,color:s.color,fontFamily:'var(--font-display)',lineHeight:1 }}>
                      <AnimNum value={typeof s.value==='number'?s.value:0} delay={i*60+100} />
                      {typeof s.value==='string'&&(s.value.startsWith('#')||s.value==='—')?s.value:''}
                    </div>
                    <div style={{ fontSize:'.65rem',color:'var(--text-muted)',textTransform:'uppercase',fontWeight:700,letterSpacing:'.06em',marginTop:3 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
            {userStats.total > 0 && (
              <div style={{ height:6,borderRadius:3,background:'rgba(255,255,255,.04)',overflow:'hidden' }}>
                <div className="p-bl" style={{ height:'100%',borderRadius:3,background:userStats.predicted===userStats.total?'linear-gradient(90deg,var(--accent),#00c853)':'rgba(0,230,118,.5)',width:`${(userStats.predicted/userStats.total)*100}%` }} />
              </div>
            )}
          </ToggleSection>
        )}

        {/* ═══ LEADERBOARD ═══ */}
        {leaderboard.length > 0 && (
          <ToggleSection id="lb" icon={<Trophy size={16} />} iconBg="rgba(168,85,247,.12)" iconColor="#a855f7" title="Rankings" badge={leaderboard.length} badgeBg="rgba(168,85,247,.1)" badgeColor="#a855f7" defaultOpen={false} style={{ marginBottom:14,animationDelay:'120ms' }}>
            <div className="sc-card" style={{ borderColor:'rgba(168,85,247,.1)',background:'linear-gradient(135deg,rgba(168,85,247,.03),transparent)',padding:'16px 14px' }}>
              {myRank && (
                <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,padding:'10px 14px',borderRadius:10,background:'rgba(0,230,118,.06)',border:'1.5px solid rgba(0,230,118,.15)' }}>
                  <span style={{ fontSize:'.88rem',fontWeight:800,color:'var(--accent)' }}>Your rank: <strong>#{myRank.rank}</strong> · {myRank.points} pts · {myRank.accuracy}% acc</span>
                </div>
              )}
              <div className="rr" style={{ color:'var(--text-muted)',fontWeight:800,fontSize:'.72rem',textTransform:'uppercase',letterSpacing:'.06em',background:'transparent',marginBottom:6,borderRadius:'10px 10px 0 0',borderBottom:'1.5px solid var(--border)' }}>
                <span>#</span><span>Player</span><span className="hm">Pts</span><span>Exact</span><span className="hm">Result</span><span className="hm">Acc%</span>
              </div>
              {leaderboard.slice(0,30).map((u,i) => renderLbRow(u,i))}
            </div>
          </ToggleSection>
        )}

        {/* ═══ ZOKA PICKS ═══ */}
        {zokaPicks?.matches?.length > 0 && (
          <ToggleSection id="zoka" icon={<Sparkles size={16} />} iconBg="rgba(245,197,66,.12)" iconColor="var(--gold)" title="Zoka Picks" badge={zokaPicks.matches.length} badgeBg="rgba(245,197,66,.1)" badgeColor="var(--gold)" defaultOpen={true} style={{ marginBottom:14,animationDelay:'100ms' }}>
            <div style={{ display:'flex',flexDirection:'column',gap:0 }}>
              {zokaPicks.matches.map((pick,i) => renderZokaRow(pick,i))}
            </div>
          </ToggleSection>
        )}

        {/* ═══ FILTER BUTTONS ═══ */}
        <div className="hsb filter-scroll" style={{ display:'flex',gap:8,marginBottom:18,overflowX:'auto',paddingBottom:4 }}>
          {[
            { key:'all',label:'All',count:filterCounts.all },
            { key:'predicted',label:'My Picks',count:filterCounts.predicted },
            { key:'unpredicted',label:'Open',count:filterCounts.unpredicted },
            { key:'finished',label:'Finished',count:filterCounts.finished },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`filter-btn ${filter===f.key?'active':''}`}>
              {f.label} ({f.count})
            </button>
          ))}
          {isLoggedIn && (
            <button onClick={() => setShowHistory(!showHistory)} className={`filter-btn ${filter==='history'?'active':''}`} style={showHistory ? { borderColor:'rgba(168,85,247,.2)',background:'rgba(168,85,247,.08)',color:'#a855f7' } : {}}>
              <History size={14} /> History
            </button>
          )}
        </div>

        {/* ═══ MATCH CARDS ═══ */}
        {loading ? (
          <div style={{ display:'flex',flexDirection:'column',gap:12 }}>{[0,1,2].map(i => <Skeleton key={i} />)}</div>
        ) : error ? (
          <div style={{ padding:'48px 24px',textAlign:'center',border:'2px dashed var(--border)',borderRadius:16,background:'var(--bg-surface)' }}>
            <AlertTriangle size={40} style={{ color:'var(--text-muted)',marginBottom:14,opacity:.5 }} />
            <div style={{ fontSize:'1rem',fontWeight:800,color:'var(--text-muted)',marginBottom:6 }}>Failed to load predictions</div>
            <div style={{ fontSize:'.88rem',fontWeight:600,color:'var(--text-muted)',opacity:.6 }}>Check your connection and try again</div>
          </div>
        ) : filteredPreds.length === 0 ? (
          <div style={{ padding:'48px 24px',textAlign:'center',border:'2px dashed var(--border)',borderRadius:16,background:'var(--bg-surface)' }}>
            <Target size={40} style={{ color:'var(--text-muted)',marginBottom:14,opacity:.5 }} />
            <div style={{ fontSize:'1rem',fontWeight:800,color:'var(--text-muted)',marginBottom:6 }}>
              {filter === 'predicted' ? 'No predictions yet' : filter === 'unpredicted' ? 'All matches predicted!' : filter === 'finished' ? 'No finished matches' : 'No matches available'}
            </div>
            <div style={{ fontSize:'.88rem',fontWeight:600,color:'var(--text-muted)',opacity:.6 }}>
              {filter === 'predicted' ? 'Tap "Predict" on a match above to get started' : filter === 'unpredicted' ? 'Great job! Wait for results.' : 'Check back later for today\'s fixtures.'}
            </div>
          </div>
        ) : (
          filteredPreds.map((pred,i) => renderMatchCard(pred,i))
        )}

        {/* ═══ HISTORY ═══ */}
        {showHistory && (
          <div className="p-up" style={{ marginTop:24 }}>
            <h3 style={{ fontSize:'1.15rem',fontWeight:900,color:'var(--text-primary)',margin:'0 0 16px',display:'flex',alignItems:'center',gap:10 }}>
              <History size={18} style={{ color:'#a855f7' }} /> Prediction History
            </h3>
            {historyLoading ? (
              <div style={{ padding:'40px',textAlign:'center' }}><Loader size={24} style={{ animation:'pSh .8s linear infinite',color:'var(--text-muted)' }} /></div>
            ) : history.length === 0 ? (
              <div style={{ padding:'40px 24px',textAlign:'center',border:'2px dashed var(--border)',borderRadius:16,background:'var(--bg-surface)' }}>
                <div style={{ fontSize:'.95rem',fontWeight:800,color:'var(--text-muted)',marginBottom:6 }}>No prediction history yet</div>
                <div style={{ fontSize:'.85rem',fontWeight:600,color:'var(--text-muted)',opacity:.6 }}>Results will appear here after matches finish</div>
              </div>
            ) : (
              groupByDate(history).map(([date, items]) => (
                <div key={date} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:'.85rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10,padding:'0 4px',display:'flex',alignItems:'center',gap:8 }}>
                    <CalendarDays size={14} /> {date} <span style={{ fontWeight:600,opacity:.6 }}>({items.length} results)</span>
                  </div>
                  {items.map((r,i) => (
                    <div key={i} className="p-card" style={{
                      padding:'14px 16px',borderRadius:14,marginBottom:8,background:'var(--bg-card)',
                      border: r.resultType==='exact' ? '1.5px solid rgba(0,230,118,.2)' : r.resultType==='result' ? '1.5px solid rgba(245,197,66,.15)' : '1px solid var(--border)',
                      animationDelay:`${i*30}ms`,
                    }}>
                      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8 }}>
                        <div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0 }}>
                          {r.homeLogo && <img src={r.homeLogo} alt="" style={{ width:22,height:22,borderRadius:5,objectFit:'contain',flexShrink:0 }} />}
                          <span style={{ fontSize:'.88rem',fontWeight:800,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.homeTeam}</span>
                        </div>
                        <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                          <span style={{ fontSize:'.78rem',fontWeight:700,color:'var(--text-muted)' }}>You: <strong style={{ color:'var(--gold)' }}>{r.predictedHome}-{r.predictedAway}</strong></span>
                          <span style={{ fontSize:'.78rem',fontWeight:700,color:'var(--text-muted)' }}>Actual: <strong style={{ color:'var(--accent)' }}>{r.actualHome}-{r.actualAway}</strong></span>
                        </div>
                        <div style={{ display:'flex',alignItems:'center',gap:8,flex:1,minWidth:0,justifyContent:'flex-end' }}>
                          <span style={{ fontSize:'.88rem',fontWeight:800,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',textAlign:'right' }}>{r.awayTeam}</span>
                          {r.awayLogo && <img src={r.awayLogo} alt="" style={{ width:22,height:22,borderRadius:5,objectFit:'contain',flexShrink:0 }} />}
                        </div>
                      </div>
                      <ResultBadge result={{ type:r.resultType,points:r.points }} />
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}