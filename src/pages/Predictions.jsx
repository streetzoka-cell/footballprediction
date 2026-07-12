// ═════════════════════════════════════════════════════════════════
// FILE: src/pages/Predictions.jsx
// v18.0 — COMPLETE — Multi-date featured/zoka + Admin-aligned cards
// ═════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle, CheckCircle2, TrendingUp, Target, BarChart3,
  Star, Zap, Save, Trophy, CalendarDays, Loader, Lock,
  LogIn, Crown, Users, ChevronDown, ChevronUp, Timer,
  Medal, Flame, AlertTriangle, Sparkles, CircleCheck,
  CircleX, Hourglass, ThumbsUp, ThumbsDown, Pencil,
  Filter, Layers, History, Check, X, ArrowRight,
  Eye, Award, ChevronLeft, ChevronRight, Minus,
  Shield, Flag, Percent, Hash, Activity, RotateCcw,
  Copy, CheckCheck, CircleDot, Play, Pause, ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dataLayer, todayStr } from '../utils/dataLayer';
import { eventBus, EVENT } from '../utils/eventBus';
import { calcPoints, CACHE_KEY, PATHS } from '../utils/constants';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
const FUTURE_DAYS = 3;

const dateOffset = (offset = 0) => {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
};
const dateLabel = (d) => {
  const t = todayStr(), tm = dateOffset(1), ys = dateOffset(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};
const fmtDateShort = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDateLong = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function parseKickoff(ko, dateStr) {
  if (!ko) return null;
  let d = new Date(ko);
  if (!isNaN(d.getTime())) return d;
  if (/^\d{1,2}:\d{2}/.test(ko)) {
    d = new Date(`${dateStr || todayStr()}T${ko}:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

const QUICK_PICKS = [
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 },
  { h: 1, a: 1 }, { h: 2, a: 0 }, { h: 0, a: 1 },
  { h: 3, a: 1 }, { h: 1, a: 2 },
];

/* ═══════════════════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════════════════ */
function AnimNum({ value, duration = 400, delay = 0 }) {
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

/* ═══════════════════════════════════════════════════
   DATE DIVIDER
   ═══════════════════════════════════════════════════ */
function DateDivider({ date, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', fontSize: '.72rem', fontWeight: 800, color: accent || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
      <CalendarDays size={12} style={{ opacity: .7 }} />
      <span>{dateLabel(date)}</span>
      <span style={{ opacity: .4, fontWeight: 600, fontSize: '.65rem' }}>{date}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('pred-v18')) return;
  const s = document.createElement('style');
  s.id = 'pred-v18';
  s.textContent = `
@keyframes pUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes pSc{from{opacity:0;transform:scale(.93)}to{opacity:1;transform:scale(1)}}
@keyframes pCo{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes pSh{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes pToast{0%{opacity:0;transform:translateY(8px) scale(.95)}10%{opacity:1;transform:translateY(0) scale(1)}85%{opacity:1}100%{opacity:0;transform:translateY(-6px) scale(.95)}}
@keyframes pCard{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes pGlow{0%,100%{box-shadow:0 0 12px rgba(0,230,118,.08)}50%{box-shadow:0 0 24px rgba(0,230,118,.18)}}
@keyframes pPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.5)}}
@keyframes pRankIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes pShine{0%{left:-100%}100%{left:200%}}
@keyframes card-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes live-glow{0%,100%{border-color:rgba(239,68,68,.12);box-shadow:0 0 3px rgba(239,68,68,.01)}50%{border-color:rgba(239,68,68,.35);box-shadow:0 0 14px rgba(239,68,68,.06)}}
@keyframes zoka-glow{0%,100%{border-color:rgba(245,197,66,.18);box-shadow:0 0 3px rgba(245,197,66,.01)}50%{border-color:rgba(245,197,66,.35);box-shadow:0 0 12px rgba(245,197,66,.06)}}
@keyframes edit-pulse{0%,100%{border-color:rgba(0,230,118,.25)}50%{border-color:rgba(0,230,118,.5)}}

.p-up{animation:pUp .45s cubic-bezier(.22,1,.36,1) both}
.p-sc{animation:pSc .35s cubic-bezier(.22,1,.36,1) both}
.p-co{animation:pCo .25s cubic-bezier(.22,1,.36,1) both}
.p-card{animation:pCard .35s cubic-bezier(.22,1,.36,1) both}
.p-glow{animation:pGlow 2s ease-in-out infinite}
.p-rank{animation:pRankIn .5s cubic-bezier(.22,1,.36,1) both}

.sk-p{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:pSh 1.5s ease-in-out infinite}
.hsb::-webkit-scrollbar{display:none}.hsb{scrollbar-width:none}

.zb{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent}
.zb:hover{transform:translateY(-1px);filter:brightness(1.06)}
.zb:active{transform:translateY(0) scale(.97)}
.zb:disabled{opacity:.28;pointer-events:none;filter:none;transform:none}

.am{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:8px;transition:all .15s;animation:card-in .3s cubic-bezier(.22,1,.36,1) both}
.am:hover{background:rgba(255,255,255,.015)}
.am.zs{background:linear-gradient(135deg,rgba(245,197,66,.05),rgba(245,197,66,.012));border-color:rgba(245,197,66,.22)}
.am.zs:hover{background:linear-gradient(135deg,rgba(245,197,66,.07),rgba(245,197,66,.02));border-color:rgba(245,197,66,.32)}
.am.lg{animation:live-glow 2s ease-in-out infinite}
.am.ok{border-color:rgba(0,230,118,.22)}
.am.editing{border-color:rgba(0,230,118,.35);animation:edit-pulse 2s ease-in-out infinite}
.am.zglow{animation:zoka-glow 2.5s ease-in-out infinite}
.am.card-in{animation:card-in .3s cubic-bezier(.22,1,.36,1) both}
.am.locked{border-color:rgba(96,165,250,.22)}
.am.missed{opacity:.45}

.amh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.aml{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
.aml img{width:18px;height:18px;border-radius:4px;object-fit:contain;flex-shrink:0}
.aml span{font-size:.72rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.as{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:6px;font-size:.63rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}

.atm{display:flex;align-items:center;gap:8px}
.ate{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
.ate.aw{flex-direction:row-reverse;text-align:right}
.ate img{width:26px;height:26px;border-radius:6px;object-fit:contain;flex-shrink:0}
.ate span{font-size:.86rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.asb{display:flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;min-width:80px;justify-content:center;background:rgba(255,255,255,.03);border:1px solid var(--border)}
.asb.lv{background:rgba(239,68,68,.07);border-color:rgba(239,68,68,.18)}
.asb.ft{background:rgba(0,230,118,.05);border-color:rgba(0,230,118,.12)}
.asn{font-size:1.1rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.asn.r{color:#ef4444}.asn.g{color:var(--accent)}.asn.gd{color:var(--gold,#f5c542)}.asn.bl{color:#60a5fa}
.asep{color:var(--text-muted);font-size:.8rem;font-weight:700;opacity:.3}
.avs{font-size:.68rem;font-weight:800;color:var(--text-muted);opacity:.2;letter-spacing:.08em}

.aa{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}

.ab{padding:9px 14px;border-radius:9px;font-size:.78rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;min-height:40px;font-family:inherit;-webkit-tap-highlight-color:transparent}
.ab:active{transform:scale(.97)}.ab:disabled{opacity:.28;pointer-events:none;transform:none}
.ab-p{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 10px rgba(16,185,129,.18)}
.ab-p:hover{filter:brightness(1.08);transform:translateY(-1px)}
.ab-gh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary)}
.ab-gh:hover{background:rgba(255,255,255,.05);border-color:var(--border-hover)}
.ab-sm{padding:7px 11px;font-size:.7rem;min-height:34px;border-radius:8px}
.ab-ol{background:transparent;border:1px solid var(--border);color:var(--text-muted)}
.ab-ol.on{border-color:var(--gold);color:var(--gold);background:rgba(245,197,66,.06)}
.ab-bl{background:transparent;border:1px solid rgba(96,165,250,.25);color:#60a5fa}
.ab-bl:hover{background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.4)}

.abdg{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:6px;font-size:.68rem;font-weight:800;white-space:nowrap}
.abdg.ex{background:rgba(0,230,118,.1);color:var(--accent);border:1px solid rgba(0,230,118,.22)}
.abdg.rs{background:rgba(245,197,66,.08);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.18)}
.abdg.ms{background:rgba(239,68,68,.07);color:#ef4444;border:1px solid rgba(239,68,68,.15)}
.abdg.pn{background:rgba(255,255,255,.03);color:var(--text-muted);border:1px solid var(--border)}
.abdg.gd{background:rgba(245,197,66,.08);color:var(--gold);border:1px solid rgba(245,197,66,.2)}
.abdg.bl{background:rgba(96,165,250,.08);color:#60a5fa;border:1px solid rgba(96,165,250,.22)}
.abdg.pr{background:rgba(168,85,247,.08);color:#a855f7;border:1px solid rgba(168,85,247,.18)}

.ld{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pPulse 1.2s ease-in-out infinite;box-shadow:0 0 6px rgba(239,68,68,.5);flex-shrink:0}

.pi{width:48px;height:42px;padding:0;border-radius:9px;background:var(--bg-surface);border:2px solid rgba(0,230,118,.25);color:var(--text-primary);text-align:center;font-weight:900;font-size:1.05rem;outline:none;font-variant-numeric:tabular-nums;transition:all .2s;-webkit-appearance:none;appearance:none;font-family:var(--font-display,monospace)}
.pi:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,230,118,.1)}
.pi::placeholder{color:var(--text-muted);opacity:.3;font-weight:700}
.pi.hv{border-color:var(--accent);background:rgba(0,230,118,.04)}

.qp-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.qp-btn{padding:7px 6px;border-radius:8px;font-size:.78rem;font-weight:900;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .12s;min-height:36px;-webkit-tap-highlight-color:transparent;text-align:center}
.qp-btn:hover{border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.06);color:var(--accent)}
.qp-btn:active{transform:scale(.94)}
.qp-btn.sel{border-color:var(--accent);background:rgba(0,230,118,.1);color:var(--accent)}

.vote-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:9px;font-size:.75rem;font-weight:800;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .15s;min-height:36px;-webkit-tap-highlight-color:transparent;flex:1;justify-content:center}
.vote-btn:hover{transform:translateY(-1px)}
.vote-btn:active{transform:scale(.95)}
.vote-btn.agree-on{border-color:rgba(0,230,118,.28);background:rgba(0,230,118,.08);color:var(--accent)}
.vote-btn.disagree-on{border-color:rgba(239,68,68,.22);background:rgba(239,68,68,.06);color:#ef4444}
.vote-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.vote-bar-fill{height:100%;border-radius:2px;transition:width .4s cubic-bezier(.22,1,.36,1)}

.stat-card{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px 10px;text-align:center;flex:1;min-width:0}
.stat-num{font-size:1.3rem;font-weight:900;font-family:var(--font-display);line-height:1}
.stat-lbl{font-size:.6rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}

.section-hd{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.section-hd span{font-size:.9rem;font-weight:900;color:var(--text-primary)}
.section-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:6px;font-size:.68rem;font-weight:900}

.date-nav{display:flex;gap:6px;overflow-x:auto;padding:0 0 12px;scrollbar-width:none}
.date-nav::-webkit-scrollbar{display:none}
.date-btn{flex-shrink:0;padding:8px 14px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent}
.date-btn:hover{color:var(--text-primary);border-color:var(--border-hover,#334155)}
.date-btn.on{background:var(--accent,#10b981);color:#fff;border-color:var(--accent);box-shadow:0 2px 10px rgba(16,185,129,.18)}
.date-btn.has-data{border-color:rgba(0,230,118,.2)}

.filter-bar{display:flex;gap:4px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none}
.filter-bar::-webkit-scrollbar{display:none}
.fbtn{flex-shrink:0;padding:7px 14px;border-radius:9px;font-size:.75rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all .12s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent}
.fbtn:hover{background:rgba(255,255,255,.03);color:var(--text-primary)}
.fbtn.on{background:rgba(0,230,118,.07);border-color:rgba(0,230,118,.18);color:var(--accent)}

.rank-card{background:linear-gradient(135deg,rgba(0,230,118,.04),rgba(0,230,118,.01));border:1.5px solid rgba(0,230,118,.15);border-radius:16px;padding:20px;text-align:center;position:relative;overflow:hidden}
.rank-card::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,230,118,.06),transparent);animation:pShine 4s ease-in-out infinite}

.result-row{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:11px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:6px}

.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;animation:pToast 2.5s cubic-bezier(.22,1,.36,1) both;pointer-events:none}

.overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;padding:0}
.overlay-box{background:var(--bg-card);border:1px solid var(--border);border-radius:20px 20px 0 0;padding:0;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;animation:pUp .35s cubic-bezier(.22,1,.36,1) both;scrollbar-width:none}
.overlay-box::-webkit-scrollbar{display:none}
.overlay-handle{width:36px;height:4px;border-radius:2px;background:var(--border);margin:10px auto 0}

.empty-state{padding:36px 20px;text-align:center;border:2px dashed var(--border);border-radius:14px;background:var(--bg-surface)}
.empty-state p{color:var(--text-muted);font-size:.82rem;margin:0;font-weight:600}
.empty-state .hint{font-size:.7rem;color:var(--text-muted);opacity:.4;margin-top:3px}

.zoka-section{background:linear-gradient(135deg,rgba(245,197,66,.04) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.12);border-radius:16px;padding:18px;margin-bottom:18px;overflow:hidden}
.zoka-header-icon{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(245,197,66,.15),rgba(245,197,66,.05));border:1.5px solid rgba(245,197,66,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0}

.toggle-more-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 18px;margin-top:10px;border-radius:12px;font-size:.85rem;font-weight:800;background:rgba(255,255,255,.02);border:1.5px dashed var(--border);color:var(--text-muted);cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);min-height:48px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font-family:inherit}
.toggle-more-btn:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12);color:var(--text-primary)}
.toggle-more-btn:active{transform:scale(.98)}
.toggle-more-btn svg{transition:transform .3s cubic-bezier(.22,1,.36,1)}
.toggle-more-btn.expanded svg{transform:rotate(180deg)}

.back-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.back-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}

@media(max-width:640px){
  .stat-num{font-size:1.1rem}.stat-lbl{font-size:.55rem}.stat-card{padding:10px 6px}
  .qp-grid{grid-template-columns:repeat(4,1fr)!important;gap:4px!important}
  .qp-btn{padding:6px 4px;font-size:.72rem;min-height:34px}
  .overlay-box{max-height:90vh}
  .asb{min-width:68px;padding:6px 10px}.asn{font-size:.95rem}.ate span{font-size:.78rem}.ate img{width:22px;height:22px}
}
@media(max-width:380px){
  .stat-card{padding:8px 4px}.stat-num{font-size:.95rem}
  .qp-grid{grid-template-columns:repeat(4,1fr)!important;gap:3px!important}
  .qp-btn{padding:5px 3px;font-size:.68rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */
function Skeleton() {
  return <div className="am" style={{ padding: 18 }}><div className="sk-p" style={{ height: 10, width: '25%', borderRadius: 5, marginBottom: 16 }} /><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div className="sk-p" style={{ width: 32, height: 32, borderRadius: 8 }} /><div className="sk-p" style={{ height: 14, width: '28%', borderRadius: 5 }} /><div style={{ flex: 1 }} /><div className="sk-p" style={{ height: 28, width: 64, borderRadius: 8 }} /><div style={{ flex: 1 }} /><div className="sk-p" style={{ height: 14, width: '28%', borderRadius: 5 }} /><div className="sk-p" style={{ width: 32, height: 32, borderRadius: 8 }} /></div></div>;
}

function ResultBadge({ result }) {
  if (!result || result.type === 'pending') return null;
  if (result.type === 'exact') return <span className="abdg ex"><CheckCircle2 size={9} /> EXACT +{result.points || 10}</span>;
  if (result.type === 'result') return <span className="abdg rs"><TrendingUp size={9} /> RESULT +{result.points || 3}</span>;
  return <span className="abdg ms"><CircleX size={9} /> MISS</span>;
}

function VoteBar({ agree, disagree }) {
  const total = agree + disagree;
  if (total === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div className="vote-bar"><div className="vote-bar-fill" style={{ width: `${Math.round((agree / total) * 100)}%`, background: 'var(--accent)' }} /></div>
      <span style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round((agree / total) * 100)}%</span>
    </div>
  );
}

function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 22px', borderRadius: 13, background: 'rgba(0,230,118,.1)', border: '1.5px solid rgba(0,230,118,.28)', backdropFilter: 'blur(12px)' }}>
        <CircleCheck size={17} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--accent)' }}>Locked in <strong>{score}</strong></span>
      </div>
    </div>
  );
}

function LoginModal({ onClose }) {
  const nav = useNavigate();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="p-sc" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 24px', maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--accent)' }}><LogIn size={26} /></div>
        <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.88rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5, fontWeight: 600 }}>Sign in to make predictions and compete on the leaderboard.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 11, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 800, fontSize: '.88rem', cursor: 'pointer', minHeight: 48 }}>Cancel</button>
          <button onClick={() => { onClose(); nav('/login'); }} className="zb" style={{ flex: 1, padding: '12px 0', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.88rem', minHeight: 48 }}>Log In</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ZOKA CARD
   ═══════════════════════════════════════════════════ */
function ZokaPredCard({ pick, index, scoreMap, voteStats, userVote, onVote, votingId }) {
  const isFin = pick.status === 'finished';
  const actual = scoreMap.get(String(pick.matchId));
  const res = pick.adminPick && actual ? calcPoints(pick.adminPick.home, pick.adminPick.away, actual.h, actual.a) : null;
  const vs = voteStats[String(pick.matchId)] || { agree: 0, disagree: 0, total: 0 };
  const myV = userVote[String(pick.matchId)];
  const mid = String(pick.matchId);
  const isVoting = votingId === mid;

  const homeLogo = pick.homeLogo || pick.homeTeam?.logo || pick.homeTeam?.crest;
  const awayLogo = pick.awayLogo || pick.awayTeam?.logo || pick.awayTeam?.crest;
  const kickoffRaw = pick.kickoff || '';
  const kickoff = kickoffRaw.includes('T')
    ? kickoffRaw.split('T')[1]?.split(':').slice(0, 2).join(':') || '--:--'
    : kickoffRaw.split(':').slice(0, 2).join(':') || '--:--';

  let leftBorder = 'rgba(245,197,66,.22)';
  if (res?.type === 'exact') leftBorder = 'var(--accent)';
  else if (res?.type === 'result') leftBorder = 'var(--gold)';
  else if (res?.type === 'miss') leftBorder = '#ef4444';

  const cardCls = `am zs card-in${!isFin ? ' zglow' : ''}${isFin ? ' ok' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftBorder}`, animationDelay: `${index * 30}ms` }}>
      <div className="amh">
        <div className="aml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka Pick'}</span>
        </div>
        <span className="as" style={{ color: isFin ? 'var(--accent)' : 'var(--text-muted)', background: isFin ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)' }}>
          {isFin ? 'FT' : kickoff}
        </span>
      </div>
      <div className="atm">
        <div className="ate">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || '?'}</span>
        </div>
        <div className={`asb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(245,197,66,.28)', background: 'rgba(245,197,66,.08)' } : {}}>
          {isFin && actual ? (
            <><span className="asn g">{actual.h}</span><span className="asep">–</span><span className="asn g">{actual.a}</span></>
          ) : (
            <span className="asn gd">{pick.adminPick?.home ?? '?'}–{pick.adminPick?.away ?? '?'}</span>
          )}
        </div>
        <div className="ate aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || '?'}</span>
        </div>
      </div>
      <div className="aa" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {res && res.type !== 'pending' && <ResultBadge result={res} />}
          {isFin && actual && <span className="abdg gd"><Star size={9} fill="currentColor" /> Pred: {pick.adminPick?.home ?? '?'}–{pick.adminPick?.away ?? '?'}</span>}
          {!isFin && <span className="abdg gd"><Star size={9} fill="currentColor" /> Prediction</span>}
        </div>
        {vs.total > 0 && <VoteBar agree={vs.agree} disagree={vs.disagree} />}
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onVote(mid, 'agree')} disabled={isVoting} className={`vote-btn${myV === 'agree' ? ' agree-on' : ''}`}><ThumbsUp size={13} /> Agree {vs.agree > 0 && `(${vs.agree})`}</button>
          <button onClick={() => onVote(mid, 'disagree')} disabled={isVoting} className={`vote-btn${myV === 'disagree' ? ' disagree-on' : ''}`}><ThumbsDown size={13} /> Disagree {vs.disagree > 0 && `(${vs.disagree})`}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PREDICTION CARD
   ═══════════════════════════════════════════════════ */
function PredCard({ pred, index, userPred, result, isEditing, editH, editA, isMatchLocked, isGlobalLocked, zokaPick, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving }) {
  const isFinished = pred.status === 'finished';
  const isLive = pred.status === 'live' || !!pred.isLive;
  const hasPred = !!userPred;
  const isResolved = result?.resultType && result.resultType !== 'pending';

  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
  const awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
  const kickoff = pred.kickoff || 'TBD';

  let leftBorder = 'var(--border)';
  let cardExtra = '';
  if (isEditing) { leftBorder = 'var(--accent)'; cardExtra = ' editing'; }
  else if (isResolved && result.type === 'exact') leftBorder = 'var(--accent)';
  else if (isResolved && result.type === 'result') leftBorder = 'var(--gold)';
  else if (isResolved && result.type === 'miss') leftBorder = '#ef4444';
  else if (isLive) leftBorder = '#ef4444';
  else if (isFinished) leftBorder = 'rgba(0,230,118,.3)';
  else if (hasPred) leftBorder = '#60a5fa';
  if (!hasPred && isFinished) cardExtra = ' missed';
  else if (hasPred && !isFinished && !isEditing) cardExtra = ' locked';

  let statusLabel = kickoff, statusColor = 'var(--text-muted)', statusBg = 'rgba(255,255,255,.04)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isFinished) { statusLabel = 'FT'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (isMatchLocked && !isEditing) { statusLabel = 'LOCKED'; statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.08)'; }

  const cardCls = `am card-in${cardExtra}${isLive ? ' lg' : ''}${isFinished ? ' ok' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftBorder}`, animationDelay: `${index * 25}ms` }}>
      <div className="amh">
        <div className="aml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Match'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isLive && <span className="ld" />}
          <span className="as" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
        </div>
      </div>
      <div className="atm">
        <div className="ate">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        {isEditing ? (
          <div className="asb" style={{ borderColor: 'rgba(0,230,118,.3)', background: 'rgba(0,230,118,.06)' }}>
            <input className={`pi${editH ? ' hv' : ''}`} value={editH} onChange={e => onEditH(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="H" maxLength={2} autoFocus />
            <span className="asep">–</span>
            <input className={`pi${editA ? ' hv' : ''}`} value={editA} onChange={e => onEditA(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="A" maxLength={2} />
          </div>
        ) : hasPred ? (
          <div className={`asb${isFinished ? ' ft' : ''}`} style={!isFinished ? { borderColor: 'rgba(96,165,250,.25)', background: 'rgba(96,165,250,.06)' } : {}}>
            <span className={`asn${isFinished ? ' g' : ' bl'}`}>{userPred.homeScore}</span>
            <span className="asep">–</span>
            <span className={`asn${isFinished ? ' g' : ' bl'}`}>{userPred.awayScore}</span>
          </div>
        ) : isFinished && pred.homeScore != null ? (
          <div className="asb ft"><span className="asn g">{pred.homeScore}</span><span className="asep">–</span><span className="asn g">{pred.awayScore}</span></div>
        ) : (
          <div className="asb"><span className="avs">VS</span></div>
        )}
        <div className="ate aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="aa" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        {isEditing && (
          <div className="qp-grid">
            {QUICK_PICKS.map((qp, qi) => (
              <button key={qi} className={`qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`} onClick={() => onQuickPick(qp.h, qp.a)}>{qp.h}–{qp.a}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {isEditing ? (
            <>
              <button className="ab ab-sm ab-p" onClick={() => onSave(pred)} disabled={saving || !editH || !editA}><Save size={12} /> Save</button>
              <button className="ab ab-sm ab-gh" onClick={onCancel}><X size={12} /> Cancel</button>
            </>
          ) : isResolved ? (
            <>
              <ResultBadge result={result} />
              <span className="abdg bl"><Target size={9} /> You: {userPred.homeScore}–{userPred.awayScore}</span>
            </>
          ) : isFinished && !hasPred ? (
            <span className="abdg ms"><CircleX size={9} /> Missed</span>
          ) : isFinished && hasPred ? (
            <span className="abdg pn"><Lock size={9} /> Locked</span>
          ) : hasPred ? (
            <>
              <span className="abdg bl"><CheckCircle size={9} /> Locked</span>
              {!isMatchLocked && !isGlobalLocked && <button className="ab ab-sm ab-bl" onClick={() => onEdit(pred)}><Pencil size={11} /> Edit</button>}
            </>
          ) : isMatchLocked || isGlobalLocked ? (
            <span className="abdg pn"><Lock size={9} /> Locked</span>
          ) : loggedIn ? (
            <button className="ab ab-sm ab-p" onClick={() => onEdit(pred)}><Target size={12} /> Predict</button>
          ) : (
            <button className="ab ab-sm ab-gh" onClick={onLogin}><LogIn size={12} /> Login</button>
          )}
        </div>
        {zokaPick && !isEditing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="abdg gd"><Star size={9} fill="currentColor" /> Zoka: {zokaPick.adminPick?.home ?? '?'}–{zokaPick.adminPick?.away ?? '?'}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RESULTS OVERLAY
   ═══════════════════════════════════════════════════ */
function ResultsOverlay({ date, preds, userPredsArr, results, onClose, nav }) {
  const upMap = useMemo(() => {
    const m = new Map();
    (userPredsArr || []).forEach(p => { m.set(p.predId || p.matchId, p); if (p.matchId) m.set(String(p.matchId), p); });
    return m;
  }, [userPredsArr]);
  const resMap = useMemo(() => {
    const m = new Map();
    (results || []).forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [results]);

  let totalPts = 0, exact = 0, result = 0, miss = 0, pending = 0, predicted = 0;
  preds.forEach(p => {
    const up = upMap.get(p.id) || upMap.get(String(p.matchId));
    if (!up) return;
    predicted++;
    const res = resMap.get(String(p.matchId));
    if (!res || res.resultType === 'pending') { pending++; return; }
    if (res.resultType === 'exact') { exact++; totalPts += (res.points || 10); }
    else if (res.resultType === 'result') { result++; totalPts += (res.points || 3); }
    else miss++;
  });
  const allResolved = predicted > 0 && pending === 0;
  const accuracy = predicted > 0 ? Math.round(((exact + result) / predicted) * 100) : 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-box" onClick={e => e.stopPropagation()}>
        <div className="overlay-handle" />
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)' }}>My Results</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{fmtDateLong(date)}</div>
            </div>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <div className="stat-card"><div className="stat-num" style={{ color: '#a855f7' }}><AnimNum value={totalPts} /></div><div className="stat-lbl">Points</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}><AnimNum value={exact} /></div><div className="stat-lbl">Exact</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--gold,#f5c542)' }}><AnimNum value={result} /></div><div className="stat-lbl">Result</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: '#ef4444' }}><AnimNum value={miss} /></div><div className="stat-lbl">Miss</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--text-muted)' }}>{pending}</div><div className="stat-lbl">Pending</div></div>
            <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent)' }}>{accuracy}%</div><div className="stat-lbl">Accuracy</div></div>
          </div>
          {predicted > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>{predicted} predicted</span><span>{allResolved ? '✓ All resolved' : `${pending} pending`}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, background: allResolved ? 'var(--accent)' : 'linear-gradient(90deg,var(--accent),#34d399)', width: `${predicted > 0 ? Math.round(((predicted - pending) / predicted) * 100) : 0}%`, transition: 'width .5s ease' }} />
              </div>
            </div>
          )}
          {preds.map((p, i) => {
            const up = upMap.get(p.id) || upMap.get(String(p.matchId));
            if (!up) return null;
            const res = resMap.get(String(p.matchId));
            const isFinished = p.status === 'finished';
            const resCalc = res?.resultType ? res : (isFinished ? calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore) : null);
            return (
              <div key={p.id} className="result-row p-card" style={{ animationDelay: `${i * 30}ms`, borderLeft: resCalc?.type === 'exact' ? '3px solid var(--accent)' : resCalc?.type === 'result' ? '3px solid var(--gold,#f5c542)' : resCalc?.type === 'miss' ? '3px solid #ef4444' : '3px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.homeTeam?.shortName || p.homeTeam?.name} vs {p.awayTeam?.shortName || p.awayTeam?.name}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.league?.name || ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: '#60a5fa', fontSize: '.85rem', background: 'rgba(96,165,250,.06)', padding: '3px 8px', borderRadius: 6 }}>{up.homeScore}-{up.awayScore}</span>
                  {isFinished && p.homeScore != null && <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>→</span>}
                  {isFinished && p.homeScore != null && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '.85rem' }}>{p.homeScore}-{p.awayScore}</span>}
                  {resCalc && resCalc.type !== 'pending' && <span className={`abdg ${resCalc.type === 'exact' ? 'pr' : resCalc.type === 'result' ? 'rs' : 'ms'}`}>+{resCalc.points}</span>}
                </div>
              </div>
            );
          })}
          {predicted === 0 && (
            <div className="empty-state" style={{ marginTop: 8 }}>
              <Target size={24} style={{ color: 'var(--text-muted)', marginBottom: 6 }} />
              <p>No predictions for this day</p>
            </div>
          )}
          {allResolved && (
            <div className="rank-card p-rank" style={{ marginTop: 16 }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <Trophy size={28} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>All Results In!</div>
                <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>You scored <strong style={{ color: '#a855f7' }}>{totalPts} points</strong> with {accuracy}% accuracy</div>
                <button className="zb" onClick={() => { onClose(); nav('/leaderboard'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.88rem', border: 'none', boxShadow: '0 4px 16px rgba(0,230,118,.2)' }}>View Leaderboard <ArrowRight size={15} /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function Predictions() {
  injectCSS();
  const { currentUser } = useAuth();
  const nav = useNavigate();
  const uid = currentUser?.uid;
  const loggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
  const mounted = useRef(true);

  const [selDate, setSelDate] = useState(todayStr());

  const [allFeatured, setAllFeatured] = useState([]);
  const [allZoka, setAllZoka] = useState([]);
  const [userPreds, setUserPreds] = useState({});
  const [predResults, setPredResults] = useState([]);
  const [userPoints, setUserPoints] = useState(null);
  const [dailyLB, setDailyLB] = useState(null);
  const [zokaVoteStats, setZokaVoteStats] = useState({});
  const [userVotes, setUserVotes] = useState({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editH, setEditH] = useState('');
  const [editA, setEditA] = useState('');
  const [votingId, setVotingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loadedDates, setLoadedDates] = useState(new Set());

  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const dateList = useMemo(() => {
    const arr = [];
    for (let i = -14; i <= FUTURE_DAYS; i++) arr.push(dateOffset(i));
    return arr;
  }, []);

  const fetchDates = useMemo(() => {
    const tod = todayStr();
    if (selDate < tod) return [selDate];
    const selD = new Date(selDate + 'T12:00:00');
    const todD = new Date(tod + 'T12:00:00');
    const diffDays = Math.round((selD - todD) / 86400000);
    return Array.from({ length: FUTURE_DAYS + 1 }, (_, i) => dateOffset(diffDays + i));
  }, [selDate]);

  const allFeaturedFlat = useMemo(() => allFeatured.flatMap(g => g.matches.map(m => ({ ...m, _dateStr: g.date }))), [allFeatured]);
  const allZokaFlat = useMemo(() => allZoka.flatMap(g => g.matches.map(m => ({ ...m, _dateStr: g.date }))), [allZoka]);

  const scoreMap = useMemo(() => {
    const m = new Map();
    allFeaturedFlat.forEach(p => {
      if (p.status === 'finished' && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
    });
    return m;
  }, [allFeaturedFlat]);

  const zokaMatchMap = useMemo(() => {
    const m = new Map();
    allZokaFlat.forEach(p => m.set(String(p.matchId), p));
    return m;
  }, [allZokaFlat]);

  const userPredMap = useMemo(() => {
    const m = new Map();
    Object.values(userPreds).forEach(p => {
      if (p.predId) m.set(p.predId, p);
      if (p.matchId) m.set(String(p.matchId), p);
    });
    return m;
  }, [userPreds]);

  const resultMap = useMemo(() => {
    const m = new Map();
    predResults.forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [predResults]);

  const selDateFeatured = useMemo(() => allFeatured.find(g => g.date === selDate)?.matches || [], [allFeatured, selDate]);

  const globalDeadline = useMemo(() => {
    const times = selDateFeatured
      .filter(p => p.status !== 'finished')
      .map(p => parseKickoff(p.kickoff, p.matchDate || selDate))
      .filter(Boolean)
      .sort((a, b) => a - b);
    return times.length > 0 ? new Date(times[0].getTime() - 3600000) : null;
  }, [selDateFeatured, selDate]);

  const isGlobalLocked = globalDeadline ? now > globalDeadline.getTime() : false;

  const isMatchLocked = useCallback((pred) => {
    if (pred.status === 'finished') return true;
    const matchDate = pred._dateStr || pred.matchDate || selDate;
    const ko = parseKickoff(pred.kickoff, matchDate);
    if (!ko) return false;
    return now > ko.getTime() - 3600000;
  }, [selDate, now]);

  const myDayStats = useMemo(() => {
    let pts = 0, ex = 0, rs = 0, mi = 0, pn = 0, pred = 0;
    selDateFeatured.forEach(p => {
      const up = userPredMap.get(p.id) || userPredMap.get(String(p.matchId));
      if (!up) return;
      pred++;
      const res = resultMap.get(String(p.matchId));
      if (!res || res.resultType === 'pending') { pn++; return; }
      if (res.resultType === 'exact') { ex++; pts += (res.points || 10); }
      else if (res.resultType === 'result') { rs++; pts += (res.points || 3); }
      else mi++;
    });
    return { pts, ex, rs, mi, pn, pred, allResolved: pred > 0 && pn === 0, accuracy: pred > 0 ? Math.round(((ex + rs) / pred) * 100) : 0 };
  }, [selDateFeatured, userPredMap, resultMap]);

  const myRank = useMemo(() => {
    if (!uid || !dailyLB?.entries) return null;
    return dailyLB.entries.find(u => u.uid === uid) || null;
  }, [dailyLB, uid]);

  const filteredPreds = useMemo(() => {
    if (filter === 'predicted') return allFeaturedFlat.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId)));
    if (filter === 'unpredicted') return allFeaturedFlat.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && p.status !== 'finished');
    if (filter === 'finished') return allFeaturedFlat.filter(p => p.status === 'finished');
    return allFeaturedFlat;
  }, [allFeaturedFlat, userPredMap, filter]);

  const filterCounts = useMemo(() => ({
    all: allFeaturedFlat.length,
    predicted: allFeaturedFlat.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId))).length,
    unpredicted: allFeaturedFlat.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && p.status !== 'finished').length,
    finished: allFeaturedFlat.filter(p => p.status === 'finished').length,
  }), [allFeaturedFlat, userPredMap]);

  /* ═══════════════════════════════════════════════════
     DATA LOADING
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    const key = fetchDates.join(',');
    if (loadedDates.has(key)) return;

    let cancelled = false;
    const run = async () => {
      try {
        const dates = fetchDates;
        const [predsResults, zokaResults] = await Promise.all([
          Promise.all(dates.map(d => dataLayer.fetchActivePredictions(d).catch(() => null))),
          Promise.all(dates.map(d => dataLayer.fetchZokaPicks(d).catch(() => null))),
        ]);

        if (cancelled || !mounted.current) return;

        const featGroups = [];
        predsResults.forEach((data, i) => {
          if (!data) return;
          const list = Array.isArray(data) ? data : [];
          if (list.length > 0) featGroups.push({ date: dates[i], matches: list });
        });
        featGroups.sort((a, b) => a.date.localeCompare(b.date));
        setAllFeatured(featGroups);

        const zokaGroups = [];
        zokaResults.forEach((data, i) => {
          if (!data) return;
          const matches = Array.isArray(data?.matches) ? data.matches : (Array.isArray(data) ? data : []);
          if (matches.length > 0) zokaGroups.push({ date: dates[i], matches });
        });
       zokaGroups.sort((a, b) => a.date.localeCompare(b.date));
setAllZoka(prev => {
  const map = new Map(prev.map(g => [g.date, g]));
  zokaGroups.forEach(g => map.set(g.date, g));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
});

        if (loggedIn && uid) {
          try {
            const predsData = await dataLayer.fetchUserPredictions(uid, selDate);
            if (predsData && mounted.current) {
              const map = {};
              Object.values(predsData).forEach(p => {
                if (p.predId) map[p.predId] = p;
                if (p.matchId) map[String(p.matchId)] = p;
              });
              setUserPreds(map);
            }
          } catch { /* ignore */ }

          try {
            const resultsData = await dataLayer.fetchPredictionResults(uid, selDate);
            if (resultsData && mounted.current) setPredResults(resultsData.results || []);
          } catch { /* ignore */ }

          try {
            const pts = await dataLayer.fetchUserPoints(uid);
            if (mounted.current) setUserPoints(pts);
          } catch { /* ignore */ }
        }

        try {
          const voteData = await dataLayer.fetchZokaVotes(selDate);
          if (voteData?.stats && mounted.current) setZokaVoteStats(voteData.stats);
        } catch { /* ignore */ }

        try {
          const stored = localStorage.getItem(`zoka_votes_${selDate}`);
          if (stored && mounted.current) setUserVotes(JSON.parse(stored));
        } catch { /* ignore */ }

        try {
          const lbData = await dataLayer.fetchDailyLeaderboard(selDate);
          if (lbData && mounted.current) setDailyLB(lbData);
        } catch { /* ignore */ }

      } catch (e) {
        console.warn('[Predictions] Load error:', e);
        if (mounted.current) setLoadError(true);
      } finally {
        if (mounted.current) {
          setLoading(false);
          setLoadedDates(prev => new Set([...prev, key]));
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [selDate, loggedIn, uid, fetchDates, loadedDates]);

  useEffect(() => {
    const unsubs = [];
    unsubs.push(eventBus.on(EVENT.ZOKA_PICKS_UPDATED, (payload) => {
      const d = payload.dateStr;
      if (!fetchDates.includes(d) || !payload.picks?.matches) return;
      setAllZoka(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(g => g.date === d);
        const matches = payload.picks.matches;
        if (idx >= 0) updated[idx] = { ...updated[idx], matches };
        else if (matches.length > 0) { updated.push({ date: d, matches }); updated.sort((a, b) => a.date.localeCompare(b.date)); }
        return updated;
      });
    }));
    unsubs.push(eventBus.on(EVENT.PREDICTIONS_UPDATED, (payload) => {
      const d = payload.dateStr;
      if (!fetchDates.includes(d) || !payload.predictions) return;
      const list = Array.isArray(payload.predictions) ? payload.predictions : [];
      setAllFeatured(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(g => g.date === d);
        if (idx >= 0) updated[idx] = { ...updated[idx], matches: list };
        else if (list.length > 0) { updated.push({ date: d, matches: list }); updated.sort((a, b) => a.date.localeCompare(b.date)); }
        return updated;
      });
    }));
    unsubs.push(eventBus.on(EVENT.USER_PREDICTION_SAVED, (payload) => {
      if (payload.uid !== uid || payload.dateStr !== selDate) return;
      dataLayer.fetchUserPredictions(uid, selDate).then(data => {
        if (!mounted.current || !data) return;
        const map = {};
        Object.values(data).forEach(p => {
          if (p.predId) map[p.predId] = p;
          if (p.matchId) map[String(p.matchId)] = p;
        });
        setUserPreds(map);
      });
    }));
    unsubs.push(eventBus.on(EVENT.MATCH_RESOLVED, () => {
      if (!loggedIn || !uid) return;
      Promise.all([
        dataLayer.fetchPredictionResults(uid, selDate),
        dataLayer.fetchDailyLeaderboard(selDate),
        dataLayer.fetchUserPoints(uid),
      ]).then(([results, lb, pts]) => {
        if (!mounted.current) return;
        if (results?.results) setPredResults(results.results);
        if (lb) setDailyLB(lb);
        if (pts) setUserPoints(pts);
      });
    }));
    unsubs.push(eventBus.on(EVENT.ZOKA_VOTE_CAST, (payload) => {
      if (payload.dateStr !== selDate) return;
      dataLayer.fetchZokaVotes(selDate).then(data => {
        if (data?.stats && mounted.current) setZokaVoteStats(data.stats);
      });
    }));
    return () => unsubs.forEach(u => u());
  }, [selDate, loggedIn, uid, fetchDates]);

  const startEdit = (pred) => {
    const mid = pred.id || String(pred.matchId);
    const existing = userPredMap.get(mid) || userPredMap.get(String(pred.matchId));
    setEditingId(mid);
    setEditH(existing ? String(existing.homeScore) : '');
    setEditA(existing ? String(existing.awayScore) : '');
  };

  const cancelEdit = () => { setEditingId(null); setEditH(''); setEditA(''); };
  const quickPick = (h, a) => { setEditH(String(h)); setEditA(String(a)); };

  const savePrediction = async (pred) => {
    if (!uid || !editingId) return;
    const mid = pred.id || String(pred.matchId);
    const h = parseInt(editH, 10);
    const a = parseInt(editA, 10);
    if (isNaN(h) || isNaN(a)) { setToast('Enter valid scores'); return; }
    setSaving(true);
    try {
      const { savePrediction: savePred } = await import('../hooks/useMatchData');
      await savePred(uid, displayName, { ...pred, id: mid, matchId: pred.matchId || mid, matchDate: pred._dateStr || pred.matchDate || selDate }, h, a);
      setUserPreds(prev => ({
        ...prev,
        [mid]: { userId: uid, displayName, matchId: pred.matchId || mid, predId: mid, homeScore: h, awayScore: a, matchDate: pred._dateStr || pred.matchDate || selDate, homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, league: pred.league },
        [String(pred.matchId)]: { userId: uid, displayName, matchId: pred.matchId || mid, predId: mid, homeScore: h, awayScore: a, matchDate: pred._dateStr || pred.matchDate || selDate, homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, league: pred.league },
      }));
      setEditingId(null); setEditH(''); setEditA('');
      setToast(`${h}-${a} locked in`);
    } catch (e) {
      console.error('[Pred] Save err:', e);
      setToast('Save failed');
    }
    setSaving(false);
  };

  const handleVote = async (matchId, vote) => {
    if (!uid) { setShowLogin(true); return; }
    setVotingId(matchId);
    try {
      const { saveZokaVote, removeZokaVote } = await import('../hooks/useMatchData');
      const oldVote = userVotes[matchId];
      if (oldVote === vote) {
        await removeZokaVote(uid, matchId, null);
        setUserVotes(prev => { const n = { ...prev }; delete n[matchId]; return n; });
      } else {
        await saveZokaVote(uid, matchId, vote);
        setUserVotes(prev => ({ ...prev, [matchId]: vote }));
      }
    } catch (e) { console.error('[Pred] Vote err:', e); }
    setVotingId(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep, #0a0f1a)', paddingBottom: 80 }}>
      <SEO title="Predictions — ZokaPredict" description="Make your score predictions for featured matches and compete on the daily leaderboard." />

      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,15,26,.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="back-btn" onClick={() => nav('/')}><ArrowLeft size={14} /> Home</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.88rem', fontWeight: 900, color: 'var(--text-primary)' }}><Target size={15} /> Predictions</div>
          <button className="back-btn" onClick={() => setShowResults(true)}><BarChart3 size={14} /> Results</button>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 18px' }}>
        {loggedIn && (
          <div className="p-up" style={{ marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 10 }}>
              <div className="stat-card p-sc" style={{ animationDelay: '50ms' }}><div className="stat-num" style={{ color: '#a855f7' }}><AnimNum value={myDayStats.pts} /></div><div className="stat-lbl">Points</div></div>
              <div className="stat-card p-sc" style={{ animationDelay: '100ms' }}><div className="stat-num" style={{ color: 'var(--accent)' }}><AnimNum value={myDayStats.ex} /></div><div className="stat-lbl">Exact</div></div>
              <div className="stat-card p-sc" style={{ animationDelay: '150ms' }}><div className="stat-num" style={{ color: 'var(--gold)' }}><AnimNum value={myDayStats.rs} /></div><div className="stat-lbl">Result</div></div>
              <div className="stat-card p-sc" style={{ animationDelay: '200ms' }}><div className="stat-num" style={{ color: '#ef4444' }}><AnimNum value={myDayStats.mi} /></div><div className="stat-lbl">Miss</div></div>
              <div className="stat-card p-sc" style={{ animationDelay: '250ms' }}><div className="stat-num">{myDayStats.accuracy}%</div><div className="stat-lbl">Accuracy</div></div>
              <div className="stat-card p-sc" style={{ animationDelay: '300ms' }}><div className="stat-num">{myDayStats.pred}/{allFeaturedFlat.length}</div><div className="stat-lbl">Predicted</div></div>
            </div>
            {myDayStats.pred > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: myDayStats.allResolved ? 'var(--accent)' : 'linear-gradient(90deg, var(--accent), #34d399)', width: `${(myDayStats.pred - myDayStats.pn) / myDayStats.pred * 100}%`, transition: 'width .5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', marginTop: 3 }}>
                  <span>{myDayStats.pred} predicted</span>
                  <span>{myDayStats.allResolved ? '✓ All resolved' : `${myDayStats.pn} pending`}</span>
                </div>
              </div>
            )}
            {myRank && (
              <div className="rank-card p-sc" style={{ marginTop: 10, animationDelay: '350ms' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Trophy size={22} style={{ color: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rank #{myRank.rank}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{myRank.points} pts · {myRank.accuracy}%</div>
                  </div>
                  <button className="zb" onClick={() => nav('/leaderboard')} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 9, background: 'rgba(245,197,66,.08)', border: '1.5px solid rgba(245,197,66,.18)', color: 'var(--gold)', fontWeight: 800, fontSize: '.78rem', textDecoration: 'none' }}>Full Board <ChevronRight size={12} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="date-nav" style={{ marginBottom: 14 }}>
          {dateList.map(d => {
            const isActive = d === selDate;
            const hasData = allFeatured.find(g => g.date === d)?.matches.length > 0;
            return (
              <button key={d} className={`date-btn${isActive ? ' on' : ''}${hasData ? ' has-data' : ''}`} onClick={() => setSelDate(d)}>
                {dateLabel(d)}
              </button>
            );
          })}
        </div>

        <div className="filter-bar" style={{ marginBottom: 14 }}>
          {[
            { key: 'all', label: 'All', count: filterCounts.all },
            { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
            { key: 'unpredicted', label: 'Open', count: filterCounts.unpredicted },
            { key: 'finished', label: 'Finished', count: filterCounts.finished },
          ].map(f => (
            <button key={f.key} className={`fbtn${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {allZokaFlat.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div className="zoka-section">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div className="zoka-header-icon"><Star size={16} style={{ color: 'var(--gold)' }} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>Zoka Picks</h2>
                  <p style={{ margin: '2px 0 0', fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>{allZokaFlat.length} prediction{allZokaFlat.length !== 1 ? 's' : ''} · Not for competition</p>
                </div>
              </div>
              {allZokaFlat.map((pick, i) => {
                const showDate = i === 0 || pick._dateStr !== allZokaFlat[i - 1]?._dateStr;
                return (
                  <Fragment key={pick.matchId || i}>
                    {showDate && allZoka.length > 1 && <DateDivider date={pick._dateStr} accent="var(--gold)" />}
                    <ZokaPredCard pick={pick} index={i} scoreMap={scoreMap} voteStats={zokaVoteStats} userVote={userVotes} onVote={handleVote} votingId={votingId} />
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="section-hd">
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}><Target size={15} /></div>
            <span>Featured — Compete</span>
            <span className="section-badge" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.18)' }}>{filteredPreds.length}</span>
          </div>

          {loading ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} />)}</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>Failed to load</p>
              <button className="zb" onClick={() => setLoadedDates(new Set())} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '.85rem' }}><RotateCcw size={13} /> Retry</button>
            </div>
          ) : filteredPreds.length > 0 ? (
            <>
              {filteredPreds.map((pred, i) => {
                const showDate = i === 0 || pred._dateStr !== filteredPreds[i - 1]?._dateStr;
                const mid = pred.id || String(pred.matchId);
                const isEditing = editingId === mid;
                const up = userPredMap.get(mid) || userPredMap.get(String(pred.matchId));
                const res = resultMap.get(String(pred.matchId));
                const zoka = zokaMatchMap.get(String(pred.matchId));
                return (
                  <Fragment key={mid || i}>
                    {showDate && allFeatured.length > 1 && <DateDivider date={pred._dateStr} accent="var(--accent)" />}
                    <PredCard
                      pred={pred} index={i} userPred={up} result={res}
                      isEditing={isEditing} editH={editH} editA={editA}
                      isMatchLocked={isMatchLocked(pred)} isGlobalLocked={isGlobalLocked}
                      zokaPick={zoka}
                      onEdit={startEdit} onSave={savePrediction} onCancel={cancelEdit}
                      onQuickPick={quickPick} onEditH={setEditH} onEditA={setEditA}
                      loggedIn={loggedIn} onLogin={() => setShowLogin(true)} saving={saving}
                    />
                  </Fragment>
                );
              })}
            </>
          ) : (
            <div className="empty-state">
              <Target size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
              <p>{filter === 'predicted' ? 'No predictions yet' : filter === 'finished' ? 'No finished matches' : filter === 'unpredicted' ? 'All matches predicted!' : 'No featured matches for this date'}</p>
              <p className="hint">{filter === 'all' ? 'Admin needs to add featured matches' : 'Try a different filter'}</p>
            </div>
          )}
        </div>

        {myDayStats.allResolved && myDayStats.pred > 0 && (
          <div className="rank-card p-rank" style={{ marginTop: 20 }}>
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <Trophy size={28} style={{ color: 'var(--accent)', marginBottom: 8 }} />
              <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>All Results In!</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 14 }}>You scored <strong style={{ color: '#a855f7' }}>{myDayStats.pts} points</strong> with {myDayStats.accuracy}% accuracy</div>
              <button className="zb" onClick={() => nav('/leaderboard')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.88rem', border: 'none', boxShadow: '0 4px 16px rgba(0,230,118,.2)' }}>View Leaderboard <ArrowRight size={15} /></button>
            </div>
          </div>
        )}
      </div>

      <SaveToast show={!!toast} score={toast} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showResults && <ResultsOverlay date={selDate} preds={selDateFeatured} userPredsArr={Object.values(userPreds)} results={predResults} onClose={() => setShowResults(false)} nav={nav} />}
    </div>
  );
}