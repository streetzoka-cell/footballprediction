// ═════════════════════════════════════════════════════════════════
// FILE: src/pages/Predictions.jsx
// v19.1 — Fully Aligned & Fixed
// ═════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback, useRef, Fragment, useTransition, useDeferredValue, startTransition } from 'react';
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
  Copy, CheckCheck, CircleDot, Play, Pause, ArrowLeft,
  Plus
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { calcPoints, CACHE_KEY, PATHS, SPORT, isLiveStatus, isFinishedStatus } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote } from '../hooks/useMatchData';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
const FUTURE_DAYS = 3;
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';

const dateOffset = (offset = 0) => getLocalDateStr(offset);

const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today'; if (d === tm) return 'Tomorrow'; if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[dt.getDay()]} ${d.slice(5)}`;
};

const dateDayName = (d) => {
  const dt = new Date(d + 'T12:00:00');
  return ['S','M','T','W','T','F','S'][dt.getDay()];
};

const dateDayNum = (d) => d.slice(8);

const dateMonth = (d) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(d.slice(5,7)) - 1];
};

const fmtDateLong = (d) => {
  if (!d) return '';
  const parts = d.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 10px', fontSize: '.7rem', fontWeight: 800, color: accent || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', animation: 'v19-fade-up .3s ' + SMOOTH + ' both' }}>
      <CalendarDays size={11} style={{ opacity: .6 }} />
      <span>{dateLabel(date)}</span>
      <span style={{ opacity: .35, fontWeight: 600, fontSize: '.6rem' }}>{date}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)', borderRadius: 1 }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   DATE STRIP
   ═══════════════════════════════════════════════════ */
function DateStrip({ date, onChange, dates, hasDataMap }) {
  const stripRef = useRef(null);
  const today = todayStr();
  const [expanded, setExpanded] = useState(false);

  const visibleDates = useMemo(() => {
    if (expanded) return dates;
    const todayIdx = dates.indexOf(today);
    const start = Math.max(0, todayIdx - 1);
    return dates.slice(start, start + 9);
  }, [dates, expanded, today]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    requestAnimationFrame(() => {
      const el = strip.querySelector(`[data-date="${date}"]`);
      if (el) {
        const stripRect = strip.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const offset = elRect.left - stripRect.left - stripRect.width / 2 + elRect.width / 2;
        strip.scrollBy({ left: offset, behavior: 'smooth' });
      }
    });
  }, [date]);

  return (
    <div className="v19-ds" ref={stripRef}>
      {visibleDates.map(d => {
        const isToday = d === today;
        const isPast = d < today;
        const isActive = d === date;
        const hasData = hasDataMap?.[d];
        return (
          <button
            key={d}
            data-date={d}
            className={`v19-dc${isActive ? ' on' : ''}${isToday ? ' today' : ''}${isPast && !isActive ? ' past' : ''}`}
            onClick={() => startTransition(() => onChange(d))}
          >
            <span className="dn">{dateDayName(d)}</span>
            <span className="dd">{dateDayNum(d)}</span>
            <span className="dm">{dateMonth(d)}</span>
            {hasData && !isActive && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', opacity: .6 }} />}
          </button>
        );
      })}
      {!expanded && (
        <button className="v19-dmore" onClick={() => setExpanded(true)}>
          <ChevronRight size={11} /> More
        </button>
      )}
      {expanded && (
        <button className="v19-dmore" onClick={() => setExpanded(false)}>
          <ChevronLeft size={11} /> Less
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SCORE STEPPER
   ═══════════════════════════════════════════════════ */
function ScoreStepper({ value, onChange, accent = 'green' }) {
  const numVal = value === '' || value == null ? null : parseInt(value, 10);
  const displayVal = numVal != null && !isNaN(numVal) ? numVal : '';
  const color = accent === 'gold' ? 'var(--gold)' : 'var(--accent)';
  const borderColor = accent === 'gold' ? 'rgba(245,197,66,.2)' : 'rgba(0,230,118,.2)';
  const focusBorder = accent === 'gold' ? 'var(--gold)' : 'var(--accent)';
  const bgHover = accent === 'gold' ? 'rgba(245,197,66,.04)' : 'rgba(0,230,118,.04)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <button className="v19-step-btn" onClick={() => {
        const v = numVal == null || isNaN(numVal) ? 0 : Math.max(0, numVal - 1);
        onChange(String(v));
      }}><Minus size={9} /></button>
      <input className="v19-si" style={{
        borderColor: displayVal !== '' ? focusBorder : borderColor,
        color,
        background: displayVal !== '' ? bgHover : 'var(--bg-surface)'
      }} value={displayVal} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="?" maxLength={2} />
      <button className="v19-step-btn" onClick={() => {
        const v = numVal == null || isNaN(numVal) ? 0 : Math.min(99, numVal + 1);
        onChange(String(v));
      }}><Plus size={9} /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STYLES
   ═══════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('pred-v19')) return;
  const s = document.createElement('style');
  s.id = 'pred-v19';
  s.textContent = `
/* ─── Keyframes ─── */
@keyframes v19-fade-up{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v19-fade-in{from{opacity:0}to{opacity:1}}
@keyframes v19-scale-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes v19-pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.03)}100%{transform:scale(1);opacity:1}}
@keyframes v19-stagger{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes v19-shimmer{0%{background-position:-300% 0}100%{background-position:300% 0}}
@keyframes v19-toast{0%{opacity:0;transform:translateX(-50%) translateY(16px) scale(.92)}10%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}85%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.95)}}
@keyframes v19-pulse-live{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(2)}}
@keyframes v19-live-glow{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0),inset 0 0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 20px -4px rgba(239,68,68,.15),inset 0 0 20px -8px rgba(239,68,68,.05)}}
@keyframes v19-zoka-glow{0%,100%{border-color:rgba(245,197,66,.15);box-shadow:0 0 3px rgba(245,197,66,.01)}50%{border-color:rgba(245,197,66,.32);box-shadow:0 0 14px rgba(245,197,66,.06)}}
@keyframes v19-edit-ring{0%,100%{border-color:rgba(0,230,118,.2)}50%{border-color:rgba(0,230,118,.45)}}
@keyframes v19-save-flash{0%{box-shadow:0 0 0 0 rgba(0,230,118,.4)}50%{box-shadow:0 0 20px 2px rgba(0,230,118,.15)}100%{box-shadow:0 0 0 0 rgba(0,230,118,0)}}
@keyframes v19-date-glow{0%,100%{box-shadow:0 0 8px rgba(0,230,118,.15)}50%{box-shadow:0 0 18px rgba(0,230,118,.3)}}
@keyframes v19-overlay{from{opacity:0}to{opacity:1}}
@keyframes v19-box-up{from{opacity:0;transform:translateY(30px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes v19-shine{0%{left:-100%}100%{left:200%}}
@keyframes v19-count-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes v19-spin{to{transform:rotate(360deg)}}

/* ─── Page ─── */
.v19-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:90px;position:relative;overflow-x:hidden}
.v19-page::before{content:'';position:fixed;top:-40%;left:-20%;width:140%;height:80%;background:radial-gradient(ellipse at 50% 0%,rgba(0,230,118,.015) 0%,transparent 60%);pointer-events:none;z-index:0}
.v19-wrap{max-width:680px;margin:0 auto;padding:0 18px;position:relative;z-index:1}

/* ─── Sticky Header ─── */
.v19-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border)}
.v19-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.v19-hdr-title{display:flex;align-items:center;gap:6px;font-size:.88rem;font-weight:900;color:var(--text-primary)}
.v19-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent}
.v19-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover);background:rgba(255,255,255,.03)}
.v19-hdr-btn:active{transform:scale(.97)}

/* ─── Date Strip ─── */
.v19-dsk{position:sticky;top:48px;z-index:99;padding:10px 0 12px;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 88%, transparent);border-bottom:1px solid var(--border);margin:0 -18px;padding-left:18px;padding-right:18px}
.v19-ds{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;padding:2px 0}
.v19-ds::-webkit-scrollbar{display:none}
.v19-dc{flex-shrink:0;scroll-snap-align:center;position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 11px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--text-muted);cursor:pointer;transition:all .18s ${SMOOTH};font-family:inherit;min-width:48px;-webkit-tap-highlight-color:transparent}
.v19-dc:hover{color:var(--text-primary);background:rgba(255,255,255,.03);border-color:var(--border)}
.v19-dc .dn{font-size:.58rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.6;transition:opacity .18s}
.v19-dc .dd{font-size:.95rem;font-weight:900;line-height:1;font-variant-numeric:tabular-nums;transition:transform .18s ${SPRING}}
.v19-dc .dm{font-size:.5rem;font-weight:700;opacity:.4;transition:opacity .18s}
.v19-dc.on{background:linear-gradient(135deg,rgba(0,230,118,.1),rgba(0,230,118,.04));color:var(--accent);border-color:rgba(0,230,118,.25)}
.v19-dc.on .dn{opacity:1;color:var(--accent)}
.v19-dc.on .dd{transform:scale(1.1)}
.v19-dc.on .dm{opacity:.7;color:var(--accent)}
.v19-dc.today:not(.on){border-color:rgba(245,197,66,.18);color:var(--gold,#f5c542)}
.v19-dc.today:not(.on) .dn{opacity:1;color:var(--gold,#f5c542)}
.v19-dc.today.on{animation:v19-date-glow 2.5s ease-in-out infinite}
.v19-dc.past{opacity:.5}
.v19-dc.past.on{opacity:1}
.v19-dmore{flex-shrink:0;display:flex;align-items:center;gap:4px;padding:7px 10px;border-radius:10px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:.62rem;font-weight:700;cursor:pointer;transition:all .18s;font-family:inherit;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.v19-dmore:hover{border-color:var(--accent);color:var(--accent);background:rgba(0,230,118,.03)}

/* ─── Filter Bar ─── */
.v19-filter{display:flex;gap:4px;overflow-x:auto;padding:0 0 10px;scrollbar-width:none}
.v19-filter::-webkit-scrollbar{display:none}
.v19-fbtn{flex-shrink:0;padding:6px 13px;border-radius:8px;font-size:.72rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all .15s ${SMOOTH};white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v19-fbtn:hover{background:rgba(255,255,255,.03);color:var(--text-primary)}
.v19-fbtn.on{background:rgba(0,230,118,.07);border-color:rgba(0,230,118,.2);color:var(--accent);box-shadow:0 0 10px rgba(0,230,118,.06)}

/* ─── Stats Grid ─── */
.v19-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;animation:v19-fade-up .4s ${SMOOTH} both}
.v19-stat{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:14px 8px;text-align:center;transition:transform .15s ${SMOOTH},box-shadow .15s;position:relative;overflow:hidden}
.v19-stat::before{content:'';position:absolute;inset:0;opacity:0;transition:opacity .15s}
.v19-stat:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.2)}
.v19-stat .n{font-size:1.35rem;font-weight:900;font-family:var(--font-display);line-height:1;animation:v19-count-up .4s ${SMOOTH} both}
.v19-stat .l{font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-top:5px}

/* ─── Progress Bar ─── */
.v19-progress{margin-bottom:10px}
.v19-progress-bar{height:5px;border-radius:3px;background:var(--bg-surface);overflow:hidden}
.v19-progress-fill{height:100%;border-radius:3px;transition:width .5s ${SMOOTH}}
.v19-progress-labels{display:flex;justify-content:space-between;font-size:.63rem;font-weight:700;color:var(--text-muted);margin-top:3px}

/* ─── Rank Card ─── */
.v19-rank{background:linear-gradient(135deg,rgba(0,230,118,.04),rgba(0,230,118,.01));border:1.5px solid rgba(0,230,118,.15);border-radius:16px;padding:16px;position:relative;overflow:hidden;animation:v19-pop .4s ${SPRING} both}
.v19-rank::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,230,118,.06),transparent);animation:v19-shine 4s ease-in-out infinite}
.v19-rank-inner{position:relative;z-index:1;display:flex;align-items:center;gap:12px}
.v19-rank-btn{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:7px 14px;border-radius:9px;background:rgba(245,197,66,.06);border:1.5px solid rgba(245,197,66,.16);color:var(--gold,#f5c542);font-weight:800;font-size:.76rem;cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}
.v19-rank-btn:hover{background:rgba(245,197,66,.1);border-color:rgba(245,197,66,.28);transform:translateY(-1px)}
.v19-rank-btn:active{transform:scale(.97)}

/* ─── Section Header ─── */
.v19-sec-hd{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.v19-sec-hd span{font-size:.88rem;font-weight:900;color:var(--text-primary)}
.v19-sec-icon{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.v19-sec-badge{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 7px;border-radius:6px;font-size:.66rem;font-weight:900}

/* ─── League Group ─── */
.v19-lgh{display:flex;align-items:center;gap:7px;padding:8px 12px;cursor:pointer;transition:background .15s;border-radius:10px 10px 0 0;user-select:none;-webkit-tap-highlight-color:transparent;border:1px solid var(--border);border-bottom:none;background:var(--bg-card)}
.v19-lgh:hover{background:rgba(255,255,255,.02)}
.v19-lgh img{width:15px;height:15px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v19-lgh span{font-size:.7rem;font-weight:800;color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v19-lgh .cnt{font-size:.58rem;font-weight:700;color:var(--text-muted);opacity:.5;background:rgba(255,255,255,.04);padding:2px 7px;border-radius:5px}
.v19-lgh .chev{color:var(--text-muted);opacity:.4;transition:transform .2s ${SMOOTH}}
.v19-lgh .chev.open{transform:rotate(180deg)}
.v19-lgc{overflow:hidden;transition:max-height .3s ${SMOOTH},opacity .25s}
.v19-lgc.shut{max-height:0!important;opacity:0;pointer-events:none}

/* ─── Match Card ─── */
.v19-mc{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:0 0 12px 12px;background:var(--bg-surface);border:1px solid var(--border);border-top:none;margin-bottom:1px;transition:all .15s}
.v19-mc:hover{background:rgba(255,255,255,.012)}
.v19-mc.zs{background:linear-gradient(135deg,rgba(245,197,66,.04),rgba(245,197,66,.01));border-color:rgba(245,197,66,.15);border-top-color:rgba(245,197,66,.15)}
.v19-mc.zs:hover{background:linear-gradient(135deg,rgba(245,197,66,.06),rgba(245,197,66,.015))}
.v19-mc.lg{animation:v19-live-glow 2.5s ease-in-out infinite;border-color:rgba(239,68,68,.12)}
.v19-mc.ok{border-color:rgba(0,230,118,.15)}
.v19-mc.editing{border-color:rgba(0,230,118,.3);animation:v19-edit-ring 2.5s ease-in-out infinite}
.v19-mc.zglow{animation:v19-zoka-glow 2.5s ease-in-out infinite}
.v19-mc.locked{border-color:rgba(96,165,250,.18)}
.v19-mc.missed{opacity:.45}
.v19-mc.standalone{border-radius:12px;border-top:1px solid var(--border)}

.v19-mh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.v19-ml{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.v19-ml img{width:15px;height:15px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v19-ml span{font-size:.64rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v19-st{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-size:.6rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0}
.v19-ld{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:v19-pulse-live 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.6);flex-shrink:0}

.v19-tm{display:flex;align-items:center;gap:6px}
.v19-te{flex:1;display:flex;align-items:center;gap:7px;min-width:0}
.v19-te.aw{flex-direction:row-reverse;text-align:right}
.v19-te img{width:24px;height:24px;border-radius:6px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,.03);padding:2px}
.v19-te span{font-size:.82rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v19-kt{font-size:.56rem;font-weight:700;color:var(--text-muted);opacity:.5;margin-top:1px}

.v19-sb{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;min-width:76px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid var(--border);transition:all .15s}
.v19-sb.lv{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.15)}
.v19-sb.ft{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.1)}
.v19-sn{font-size:1.05rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.v19-sn.r{color:#ef4444}.v19-sn.g{color:var(--accent)}.v19-sn.gd{color:var(--gold,#f5c542)}.v19-sn.bl{color:#60a5fa}
.v19-sp{color:var(--text-muted);font-size:.75rem;font-weight:700;opacity:.25}
.v19-vs{font-size:.65rem;font-weight:800;color:var(--text-muted);opacity:.15;letter-spacing:.1em}

.v19-ma{display:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:wrap;margin-top:2px}
.v19-ma.col{flex-direction:column;align-items:stretch}

/* ─── Buttons ─── */
.v19-b{padding:8px 13px;border-radius:9px;font-size:.76rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s ${SMOOTH};min-height:38px;font-family:inherit;-webkit-tap-highlight-color:transparent;position:relative;overflow:hidden}
.v19-b:active{transform:scale(.96)}.v19-b:disabled{opacity:.25;pointer-events:none;transform:none}
.v19-b::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.08),transparent);opacity:0;transition:opacity .15s}
.v19-b:hover::after{opacity:1}
.v19-bp{background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 12px rgba(16,185,129,.2)}
.v19-bp:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(16,185,129,.25)}
.v19-bgh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary)}
.v19-bgh:hover{background:rgba(255,255,255,.06);border-color:var(--border-hover)}
.v19-bsm{padding:6px 10px;font-size:.68rem;min-height:32px;border-radius:7px;gap:4px}
.v19-bbl{background:transparent;border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.v19-bbl:hover{background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.35)}

/* ─── Badges ─── */
.v19-bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;font-size:.63rem;font-weight:800;white-space:nowrap}
.v19-bdg.ex{background:rgba(0,230,118,.08);color:var(--accent);border:1px solid rgba(0,230,118,.18)}
.v19-bdg.rs{background:rgba(245,197,66,.06);color:var(--gold,#f5c542);border:1px solid rgba(245,197,66,.15)}
.v19-bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.12)}
.v19-bdg.pn{background:rgba(255,255,255,.02);color:var(--text-muted);border:1px solid var(--border)}
.v19-bdg.gd{background:rgba(245,197,66,.06);color:var(--gold);border:1px solid rgba(245,197,66,.18)}
.v19-bdg.bl{background:rgba(96,165,250,.06);color:#60a5fa;border:1px solid rgba(96,165,250,.18)}
.v19-bdg.pr{background:rgba(168,85,247,.06);color:#a855f7;border:1px solid rgba(168,85,247,.15)}

/* ─── Score Input ─── */
.v19-si{width:42px;height:36px;padding:0;border-radius:7px;background:var(--bg-card);border:1.5px solid rgba(0,230,118,.2);text-align:center;font-weight:900;font-size:.95rem;outline:none;font-variant-numeric:tabular-nums;transition:all .15s;-webkit-appearance:none;appearance:none;font-family:var(--font-display,monospace);color:var(--text-primary)}
.v19-si:focus{box-shadow:0 0 0 2px rgba(0,230,118,.1)}
.v19-si::placeholder{color:var(--text-muted);opacity:.2;font-weight:700}

/* ─── Stepper Buttons ─── */
.v19-step-btn{width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s;font-size:.7rem;-webkit-tap-highlight-color:transparent;padding:0}
.v19-step-btn:hover{border-color:var(--accent);color:var(--accent);background:rgba(0,230,118,.05)}
.v19-step-btn:active{transform:scale(.9)}

/* ─── Quick Picks ─── */
.v19-qp{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.v19-qp-btn{padding:6px 4px;border-radius:7px;font-size:.76rem;font-weight:900;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .12s;min-height:34px;-webkit-tap-highlight-color:transparent;text-align:center}
.v19-qp-btn:hover{border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.06);color:var(--accent);transform:translateY(-1px)}
.v19-qp-btn:active{transform:scale(.93)}
.v19-qp-btn.sel{border-color:var(--accent);background:rgba(0,230,118,.1);color:var(--accent);box-shadow:0 0 10px rgba(0,230,118,.08)}

/* ─── Vote ─── */
.v19-vote-btn{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .15s;min-height:34px;-webkit-tap-highlight-color:transparent;flex:1;justify-content:center}
.v19-vote-btn:hover{transform:translateY(-1px)}.v19-vote-btn:active{transform:scale(.95)}
.v19-vote-btn.agree-on{border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.07);color:var(--accent)}
.v19-vote-btn.disagree-on{border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.05);color:#ef4444}
.v19-vote-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.v19-vote-bar-fill{height:100%;border-radius:2px;transition:width .4s ${SMOOTH};background:var(--accent)}

/* ─── Zoka Section ─── */
.v19-zoka{background:linear-gradient(135deg,rgba(245,197,66,.03) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.1);border-radius:16px;padding:16px;margin-bottom:18px;overflow:hidden;animation:v19-fade-up .4s ${SMOOTH} both}
.v19-zoka-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.v19-zoka-icon{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(245,197,66,.12),rgba(245,197,66,.04));border:1.5px solid rgba(245,197,66,.22);display:flex;align-items:center;justify-content:center;flex-shrink:0}

/* ─── Skeleton ─── */
.v19-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:300% 100%;animation:v19-shimmer 1.2s ease-in-out infinite;border-radius:12px;margin-bottom:6px}

/* ─── Empty ─── */
.v19-empty{padding:36px 20px;text-align:center;border:2px dashed var(--border);border-radius:14px;background:var(--bg-surface)}
.v19-empty p{color:var(--text-muted);font-size:.82rem;margin:0;font-weight:600}
.v19-empty .h{font-size:.68rem;color:var(--text-muted);opacity:.4;margin-top:4px}

/* ─── Toast ─── */
.v19-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;animation:v19-toast 2.5s ${SMOOTH} both;pointer-events:none}

/* ─── Overlay ─── */
.v19-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;padding:0;animation:v19-overlay .2s ease}
.v19-overlay-box{background:var(--bg-card);border:1px solid var(--border);border-radius:20px 20px 0 0;padding:0;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;animation:v19-box-up .35s ${SPRING} both;scrollbar-width:none}
.v19-overlay-box::-webkit-scrollbar{display:none}
.v19-overlay-handle{width:36px;height:4px;border-radius:2px;background:var(--border);margin:10px auto 0}
.v19-overlay-close{width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;flex-shrink:0}
.v19-overlay-close:hover{background:rgba(255,255,255,.05);color:var(--text-primary)}

/* ─── Result Row (overlay) ─── */
.v19-res-row{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:11px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:6px;animation:v19-stagger .3s ${SMOOTH} both}

/* ─── Content Transition ─── */
.v19-content{animation:v19-fade-up .3s ${SMOOTH} both}

/* ─── All Resolved Banner ─── */
.v19-resolved{margin-top:20px;animation:v19-pop .5s ${SPRING} both}
.v19-resolved-btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:12px;background:var(--accent);color:var(--bg-deep);font-weight:900;font-size:.88rem;border:none;box-shadow:0 4px 16px rgba(0,230,118,.2);cursor:pointer;transition:all .15s ${SMOOTH};font-family:inherit;-webkit-tap-highlight-color:transparent}
.v19-resolved-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,230,118,.25)}
.v19-resolved-btn:active{transform:scale(.97)}

/* ─── Responsive ─── */
@media(max-width:640px){
  .v19-stats{grid-template-columns:repeat(3,1fr)}.v19-stat .n{font-size:1.15rem}.v19-stat .l{font-size:.52rem}.v19-stat{padding:10px 6px}
  .v19-qp{grid-template-columns:repeat(4,1fr)!important;gap:3px!important}.v19-qp-btn{padding:5px 3px;font-size:.7rem;min-height:32px}
  .v19-sb{min-width:66px;padding:5px 9px}.v19-sn{font-size:.92rem}.v19-te span{font-size:.76rem}.v19-te img{width:20px;height:20px}
  .v19-dc{padding:6px 9px;min-width:42px}.v19-dc .dd{font-size:.85rem}
  .v19-overlay-box{max-height:90vh}
}
@media(max-width:380px){
  .v19-stats{grid-template-columns:repeat(2,1fr)}.v19-stat{padding:8px 4px}.v19-stat .n{font-size:.95rem}
  .v19-qp{grid-template-columns:repeat(4,1fr)!important;gap:2px!important}.v19-qp-btn{padding:4px 2px;font-size:.66rem}
  .v19-mc{padding:10px 11px}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */
function Skeleton() {
  return <div className="v19-skel" style={{ height: 100, padding: 18 }}><div className="v19-skel" style={{ height: 8, width: '25%', borderRadius: 4, marginBottom: 16, animationDelay: '50ms' }} /><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div className="v19-skel" style={{ width: 28, height: 28, borderRadius: 7, animationDelay: '80ms' }} /><div className="v19-skel" style={{ height: 12, width: '28%', borderRadius: 4, animationDelay: '100ms' }} /><div style={{ flex: 1 }} /><div className="v19-skel" style={{ height: 26, width: 60, borderRadius: 7, animationDelay: '120ms' }} /><div style={{ flex: 1 }} /><div className="v19-skel" style={{ height: 12, width: '28%', borderRadius: 4, animationDelay: '140ms' }} /><div className="v19-skel" style={{ width: 28, height: 28, borderRadius: 7, animationDelay: '160ms' }} /></div></div>;
}

function ResultBadge({ result }) {
  if (!result) return null;
  const rType = result.resultType || result.type; // ★ FIX
  if (!rType || rType === 'pending') return null;
  if (rType === 'exact') return <span className="v19-bdg ex"><CheckCircle2 size={8} /> EXACT +{result.points || 10}</span>;
  if (rType === 'result') return <span className="v19-bdg rs"><TrendingUp size={8} /> RESULT +{result.points || 3}</span>;
  return <span className="v19-bdg ms"><CircleX size={8} /> MISS</span>;
}

function VoteBar({ agree, disagree }) {
  const total = agree + disagree;
  if (total === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
      <div className="v19-vote-bar"><div className="v19-vote-bar-fill" style={{ width: `${Math.round((agree / total) * 100)}%` }} /></div>
      <span style={{ fontSize: '.65rem', fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round((agree / total) * 100)}%</span>
    </div>
  );
}

function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="v19-toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 13, background: 'rgba(0,230,118,.1)', border: '1.5px solid rgba(0,230,118,.25)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,.3)' }}>
        <CircleCheck size={16} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--accent)' }}>Locked in <strong>{score}</strong></span>
      </div>
    </div>
  );
}

function LoginModal({ onClose }) {
  const nav = useNavigate();
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'v19-overlay .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 18, padding: '28px 24px', maxWidth: 360, width: '100%', textAlign: 'center', animation: 'v19-pop .35s ' + SPRING + ' both' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: 'var(--accent)' }}><LogIn size={24} /></div>
        <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5, fontWeight: 600 }}>Sign in to make predictions and compete on the leaderboard.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px 0', borderRadius: 11, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 800, fontSize: '.85rem', cursor: 'pointer', minHeight: 48, fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={() => { onClose(); nav('/login'); }} style={{ flex: 1, padding: '12px 0', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--bg-deep)', fontWeight: 900, fontSize: '.85rem', minHeight: 48, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 12px rgba(16,185,129,.2)' }}>Log In</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ZOKA CARD
   ═══════════════════════════════════════════════════ */
function ZokaPredCard({ pick, index, scoreMap, voteStats, userVote, onVote, votingId }) {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
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

  let leftBorder = 'rgba(245,197,66,.15)';
  if (res?.type === 'exact') leftBorder = 'var(--accent)';
  else if (res?.type === 'result') leftBorder = 'var(--gold)';
  else if (res?.type === 'miss') leftBorder = '#ef4444';

  const cardCls = `v19-mc zs${!isFin ? ' zglow' : ''}${isFin ? ' ok' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftBorder}`, animation: `v19-stagger .3s ${SMOOTH} ${index * 25}ms both` }}>
      <div className="v19-mh">
        <div className="v19-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka Pick'}</span>
        </div>
        <span className="v19-st" style={{ color: isFin ? 'var(--accent)' : 'var(--text-muted)', background: isFin ? 'rgba(0,230,118,.08)' : 'rgba(255,255,255,.04)' }}>
          {isFin ? 'FT' : kickoff}
        </span>
      </div>
      <div className="v19-tm">
        <div className="v19-te">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || '?'}</span>
        </div>
        <div className={`v19-sb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(245,197,66,.22)', background: 'rgba(245,197,66,.06)' } : {}}>
          {isFin && actual ? (
            <><span className="v19-sn g">{actual.h}</span><span className="v19-sp">–</span><span className="v19-sn g">{actual.a}</span></>
          ) : (
            <span className="v19-sn gd">{pick.adminPick?.home ?? '?'}–{pick.adminPick?.away ?? '?'}</span>
          )}
        </div>
        <div className="v19-te aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || '?'}</span>
        </div>
      </div>
      <div className="v19-ma col" style={{ gap: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {res && res.type !== 'pending' && <ResultBadge result={res} />}
          {isFin && actual && <span className="v19-bdg gd"><Star size={8} fill="currentColor" /> Pred: {pick.adminPick?.home ?? '?'}–{pick.adminPick?.away ?? '?'}</span>}
          {!isFin && <span className="v19-bdg gd"><Star size={8} fill="currentColor" /> Prediction</span>}
        </div>
        {vs.total > 0 && <VoteBar agree={vs.agree} disagree={vs.disagree} />}
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={() => onVote(mid, 'agree')} disabled={isVoting} className={`v19-vote-btn${myV === 'agree' ? ' agree-on' : ''}`}><ThumbsUp size={12} /> Agree {vs.agree > 0 && `(${vs.agree})`}</button>
          <button onClick={() => onVote(mid, 'disagree')} disabled={isVoting} className={`v19-vote-btn${myV === 'disagree' ? ' disagree-on' : ''}`}><ThumbsDown size={12} /> Disagree {vs.disagree > 0 && `(${vs.disagree})`}</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PREDICTION CARD
   ═══════════════════════════════════════════════════ */
function PredCard({ pred, index, userPred, result, isEditing, editH, editA, isMatchLocked, isGlobalLocked, zokaPick, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving, standalone = true }) {
  const isFinished = isFinishedStatus(pred.status, SPORT.FOOTBALL);
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || !!pred.isLive;
  const hasPred = !!userPred;
  
  // ★ FIX: Use resultType (saved by backend) with fallback to type (for local calc)
  const rType = result?.resultType || result?.type;
  const isResolved = rType && rType !== 'pending';

  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
  const awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
  const kickoff = pred.kickoff || 'TBD';
  const kickoffTime = kickoff.includes('T') ? kickoff.split('T')[1]?.split(':').slice(0, 2).join(':') || '' : kickoff.split(':').slice(0, 2).join(':') || '';

  let leftBorder = 'var(--border)';
  let cardExtra = '';
  if (isEditing) { leftBorder = 'var(--accent)'; cardExtra = ' editing'; }
  else if (isResolved && rType === 'exact') leftBorder = 'var(--accent)';
  else if (isResolved && rType === 'result') leftBorder = 'var(--gold)';
  else if (isResolved && rType === 'miss') leftBorder = '#ef4444';
  else if (isLive) leftBorder = '#ef4444';
  else if (isFinished) leftBorder = 'rgba(0,230,118,.25)';
  else if (hasPred) leftBorder = '#60a5fa';
  if (!hasPred && isFinished) cardExtra = ' missed';
  else if (hasPred && !isFinished && !isEditing) cardExtra = ' locked';

  let statusLabel = kickoffTime || 'VS', statusColor = 'var(--text-muted)', statusBg = 'rgba(255,255,255,.04)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isFinished) { statusLabel = 'FT'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (isMatchLocked && !isEditing) { statusLabel = 'LOCKED'; statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.08)'; }

  const cardCls = `v19-mc${cardExtra}${isLive ? ' lg' : ''}${isFinished ? ' ok' : ''}${standalone ? ' standalone' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftBorder}`, animation: `v19-stagger .3s ${SMOOTH} ${index * 25}ms both` }}>
      <div className="v19-mh">
        <div className="v19-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Match'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {isLive && <span className="v19-ld" />}
          <span className="v19-st" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
        </div>
      </div>
      <div className="v19-tm">
        <div className="v19-te">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
            {!isLive && !isFinished && kickoffTime && <span className="v19-kt">{kickoffTime}</span>}
          </div>
          <span>{homeName}</span>
        </div>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ScoreStepper value={editH} onChange={onEditH} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.7rem', opacity: .3 }}>–</span>
            <ScoreStepper value={editA} onChange={onEditA} />
          </div>
        ) : hasPred ? (
          <div className={`v19-sb${isFinished ? ' ft' : ''}`} style={!isFinished ? { borderColor: 'rgba(96,165,250,.2)', background: 'rgba(96,165,250,.05)' } : {}}>
            <span className={`v19-sn${isFinished ? ' g' : ' bl'}`}>{userPred.homeScore}</span>
            <span className="v19-sp">–</span>
            <span className={`v19-sn${isFinished ? ' g' : ' bl'}`}>{userPred.awayScore}</span>
          </div>
        ) : isFinished && pred.homeScore != null ? (
          <div className="v19-sb ft"><span className="v19-sn g">{pred.homeScore}</span><span className="v19-sp">–</span><span className="v19-sn g">{pred.awayScore}</span></div>
        ) : (
          <div className="v19-sb"><span className="v19-vs">VS</span></div>
        )}
        <div className="v19-te aw">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
            {!isLive && !isFinished && kickoffTime && <span className="v19-kt">{kickoffTime}</span>}
          </div>
          <span>{awayName}</span>
        </div>
      </div>
      <div className="v19-ma col" style={{ gap: 7 }}>
        {isEditing && (
          <div className="v19-qp">
            {QUICK_PICKS.map((qp, qi) => (
              <button key={qi} className={`v19-qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`} onClick={() => onQuickPick(qp.h, qp.a)}>{qp.h}–{qp.a}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {isEditing ? (
            <>
              <button className="v19-b v19-bp v19-bsm" onClick={() => onSave(pred)} disabled={saving || !editH || !editA}><Save size={11} /> Save</button>
              <button className="v19-b v19-bgh v19-bsm" onClick={onCancel}><X size={11} /> Cancel</button>
            </>
          ) : isResolved ? (
            <>
              <ResultBadge result={result} />
              <span className="v19-bdg bl"><Target size={8} /> You: {userPred.homeScore}–{userPred.awayScore}</span>
            </>
          ) : isFinished && !hasPred ? (
            <span className="v19-bdg ms"><CircleX size={8} /> Missed</span>
          ) : isFinished && hasPred ? (
            <span className="v19-bdg pn"><Lock size={8} /> Locked</span>
          ) : hasPred ? (
            <>
              <span className="v19-bdg bl"><CheckCircle size={8} /> Locked</span>
              {!isMatchLocked && !isGlobalLocked && <button className="v19-b v19-bbl v19-bsm" onClick={() => onEdit(pred)}><Pencil size={10} /> Edit</button>}
            </>
          ) : isMatchLocked || isGlobalLocked ? (
            <span className="v19-bdg pn"><Lock size={8} /> Locked</span>
          ) : loggedIn ? (
            <button className="v19-b v19-bp v19-bsm" onClick={() => onEdit(pred)}><Target size={11} /> Predict</button>
          ) : (
            <button className="v19-b v19-bgh v19-bsm" onClick={onLogin}><LogIn size={11} /> Login</button>
          )}
        </div>
        {zokaPick && !isEditing && (
          <span className="v19-bdg gd"><Star size={8} fill="currentColor" /> Zoka: {zokaPick.adminPick?.home ?? '?'}–{zokaPick.adminPick?.away ?? '?'}</span>
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
    <div className="v19-overlay" onClick={onClose}>
      <div className="v19-overlay-box" onClick={e => e.stopPropagation()}>
        <div className="v19-overlay-handle" />
        <div style={{ padding: '16px 20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)' }}>My Results</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{fmtDateLong(date)}</div>
            </div>
            <button className="v19-overlay-close" onClick={onClose}><X size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, marginBottom: 14 }}>
            <div className="v19-stat"><div className="n" style={{ color: '#a855f7', animationDelay: '50ms' }}><AnimNum value={totalPts} /></div><div className="l">Points</div></div>
            <div className="v19-stat"><div className="n" style={{ color: 'var(--accent)', animationDelay: '80ms' }}><AnimNum value={exact} /></div><div className="l">Exact</div></div>
            <div className="v19-stat"><div className="n" style={{ color: 'var(--gold)', animationDelay: '110ms' }}><AnimNum value={result} /></div><div className="l">Result</div></div>
            <div className="v19-stat"><div className="n" style={{ color: '#ef4444', animationDelay: '140ms' }}><AnimNum value={miss} /></div><div className="l">Miss</div></div>
            <div className="v19-stat"><div className="n" style={{ color: 'var(--text-muted)', animationDelay: '170ms' }}>{pending}</div><div className="l">Pending</div></div>
            <div className="v19-stat"><div className="n" style={{ color: 'var(--accent)', animationDelay: '200ms' }}>{accuracy}%</div><div className="l">Accuracy</div></div>
          </div>
          {predicted > 0 && (
            <div className="v19-progress" style={{ marginBottom: 14 }}>
              <div className="v19-progress-labels"><span>{predicted} predicted</span><span>{allResolved ? '✓ All resolved' : `${pending} pending`}</span></div>
              <div className="v19-progress-bar"><div className="v19-progress-fill" style={{ width: `${predicted > 0 ? Math.round(((predicted - pending) / predicted) * 100) : 0}%`, background: allResolved ? 'var(--accent)' : 'linear-gradient(90deg,var(--accent),#34d399)' }} /></div>
            </div>
          )}
          {preds.map((p, i) => {
            const up = upMap.get(p.id) || upMap.get(String(p.matchId));
            if (!up) return null;
            const res = resMap.get(String(p.matchId));
            const isFinished = isFinishedStatus(p.status, SPORT.FOOTBALL);
            const resCalc = res?.resultType ? res : (isFinished ? calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore) : null);
            const rType = resCalc?.resultType || resCalc?.type;
            return (
              <div key={p.id} className="v19-res-row" style={{ animationDelay: `${i * 25}ms`, borderLeft: rType === 'exact' ? '3px solid var(--accent)' : rType === 'result' ? '3px solid var(--gold)' : rType === 'miss' ? '3px solid #ef4444' : '3px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.homeTeam?.shortName || p.homeTeam?.name} vs {p.awayTeam?.shortName || p.awayTeam?.name}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 1 }}>{p.league?.name || ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: '#60a5fa', fontSize: '.82rem', background: 'rgba(96,165,250,.06)', padding: '2px 7px', borderRadius: 6 }}>{up.homeScore}-{up.awayScore}</span>
                  {isFinished && p.homeScore != null && <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>→</span>}
                  {isFinished && p.homeScore != null && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-primary)', fontSize: '.82rem' }}>{p.homeScore}-{p.awayScore}</span>}
                  {resCalc && rType !== 'pending' && <span className={`v19-bdg ${rType === 'exact' ? 'pr' : rType === 'result' ? 'rs' : 'ms'}`}>+{resCalc.points}</span>}
                </div>
              </div>
            );
          })}
          {predicted === 0 && (
            <div className="v19-empty" style={{ marginTop: 8 }}>
              <Target size={22} style={{ color: 'var(--text-muted)', marginBottom: 6, display: 'block', margin: '0 auto 6px' }} />
              <p>No predictions for this day</p>
            </div>
          )}
          {allResolved && (
            <div className="v19-rank v19-resolved" style={{ marginTop: 16 }}>
              <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                <Trophy size={26} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                <div style={{ fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>All Results In!</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>You scored <strong style={{ color: '#a855f7' }}>{totalPts} points</strong> with {accuracy}% accuracy</div>
                <button className="v19-resolved-btn" onClick={() => { onClose(); nav('/leaderboard'); }}>View Leaderboard <ArrowRight size={14} /></button>
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

  const hasDataMap = useMemo(() => {
    const m = {};
    allFeatured.forEach(g => { if (g.matches.length > 0) m[g.date] = true; });
    allZoka.forEach(g => { if (g.matches.length > 0) m[g.date] = true; });
    return m;
  }, [allFeatured, allZoka]);

  const scoreMap = useMemo(() => {
    const m = new Map();
    allFeaturedFlat.forEach(p => {
      if (isFinishedStatus(p.status, SPORT.FOOTBALL) && p.homeScore != null) m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
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
      .filter(p => !isFinishedStatus(p.status, SPORT.FOOTBALL))
      .map(p => parseKickoff(p.kickoff, p.matchDate || selDate))
      .filter(Boolean)
      .sort((a, b) => a - b);
    return times.length > 0 ? new Date(times[0].getTime() - 3600000) : null;
  }, [selDateFeatured, selDate]);

  const isGlobalLocked = globalDeadline ? now > globalDeadline.getTime() : false;

  const isMatchLocked = useCallback((pred) => {
    if (isFinishedStatus(pred.status, SPORT.FOOTBALL)) return true;
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

  const deferredFilter = useDeferredValue(filter);

  const filteredPreds = useMemo(() => {
    if (deferredFilter === 'predicted') return allFeaturedFlat.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId)));
    if (deferredFilter === 'unpredicted') return allFeaturedFlat.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL));
    if (deferredFilter === 'finished') return allFeaturedFlat.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL));
    return allFeaturedFlat;
  }, [allFeaturedFlat, userPredMap, deferredFilter]);

  const filterCounts = useMemo(() => ({
    all: allFeaturedFlat.length,
    predicted: allFeaturedFlat.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId))).length,
    unpredicted: allFeaturedFlat.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL)).length,
    finished: allFeaturedFlat.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL)).length,
  }), [allFeaturedFlat, userPredMap]);

  // Group filtered preds by league for multi-date view
  const groupedByLeague = useMemo(() => {
    if (allFeatured.length <= 1) return null;
    const groups = new Map();
    filteredPreds.forEach(m => {
      const c = m.league;
      const id = String(c?.id || c?.code || 'x');
      if (!groups.has(id)) groups.set(id, { league: c, matches: [] });
      groups.get(id).matches.push(m);
    });
    return [...groups.values()];
  }, [filteredPreds, allFeatured.length]);

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
            // ★ FIXED: Fetch predictions for ALL visible dates, not just selDate
            const allPredsData = await Promise.all(fetchDates.map(d => dataLayer.fetchUserPredictions(uid, d).catch(() => ({}))));
            if (mounted.current) {
              const map = {};
              allPredsData.forEach(preds => {
                Object.values(preds || {}).forEach(p => {
                  if (p.predId) map[p.predId] = p;
                  if (p.matchId) map[String(p.matchId)] = p;
                });
              });
              setUserPreds(map);
            }
          } catch { /* ignore */ }

          try {
            // ★ FIXED: Fetch results for ALL visible dates
            const allResultsData = await Promise.all(fetchDates.map(d => dataLayer.fetchPredictionResults(uid, d).catch(() => ({ results: [] }))));
            if (mounted.current) {
              const allResults = allResultsData.flatMap(r => r?.results || []);
              setPredResults(allResults);
            }
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
      if (payload.uid !== uid) return;
      // ★ FIXED: Fetch the specific date that was saved, regardless of what selDate is
      dataLayer.fetchUserPredictions(uid, payload.dateStr).then(data => {
        if (!mounted.current || !data) return;
        setUserPreds(prev => {
          const updated = { ...prev };
          Object.values(data).forEach(p => {
            if (p.predId) updated[p.predId] = p;
            if (p.matchId) updated[String(p.matchId)] = p;
          });
          return updated;
        });
      }).catch(err => {
        console.warn('[Predictions] Re-fetch after save failed:', err.message);
      });
    }));
    
    unsubs.push(eventBus.on(EVENT.MATCH_RESOLVED, async (payload) => {
      if (!loggedIn || !uid) return;
      if (!payload.affectedUsers?.includes(uid)) return;
      try {
        const targetDate = payload.dateStr || selDate;
        const [results, lb, pts] = await Promise.all([
          dataLayer.fetchPredictionResults(uid, targetDate),
          dataLayer.fetchDailyLeaderboard(targetDate),
          dataLayer.fetchUserPoints(uid),
        ]);
        if (!mounted.current) return;
        if (results?.results) setPredResults(prev => [...prev, ...results.results]);
        if (lb) setDailyLB(lb);
        if (pts) setUserPoints(pts);
      } catch (e) {
        console.warn('[Predictions] Refresh after resolve failed:', e.message);
      }
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
      const matchId = String(pred.matchId || mid);
      const matchDate = pred._dateStr || pred.matchDate || selDate;

      await savePredictionAction(uid, displayName, { ...pred, id: mid, matchId, matchDate }, h, a);

      const newPred = {
        id: matchId,
        predId: matchId,
        matchId: matchId,
        userId: uid,
        displayName: displayName,
        homeScore: h,
        awayScore: a,
        matchDate: matchDate,
        homeTeam: pred.homeTeam,
        awayTeam: pred.awayTeam,
        homeLogo: pred.homeLogo || pred.homeTeam?.crest || null,
        awayLogo: pred.awayLogo || pred.awayTeam?.crest || null,
        league: pred.league,
        kickoff: pred.kickoff,
      };

      setUserPreds(prev => {
        const updated = { ...prev };
        updated[matchId] = newPred;
        if (mid !== matchId) updated[mid] = newPred;
        updated[newPred.predId] = newPred;
        return updated;
      });

      dataLayer.invalidate(CACHE_KEY.userPredictions(uid, matchDate));

      setEditingId(null);
      setEditH('');
      setEditA('');
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

  const handleDateChange = (d) => {
    startTransition(() => {
      setSelDate(d);
      setFilter('all');
    });
  };

  const handleFilterChange = (f) => {
    startTransition(() => setFilter(f));
  };

  const renderPredCard = useCallback((pred, i) => {
    const mid = pred.id || String(pred.matchId);
    const isEditing = editingId === mid;
    const up = userPredMap.get(mid) || userPredMap.get(String(pred.matchId));
    const res = resultMap.get(String(pred.matchId));
    const zoka = zokaMatchMap.get(String(pred.matchId));
    return (
      <PredCard
        key={mid || i} pred={pred} index={i} userPred={up} result={res}
        isEditing={isEditing} editH={editH} editA={editA}
        isMatchLocked={isMatchLocked(pred)} isGlobalLocked={isGlobalLocked}
        zokaPick={zoka} standalone={false}
        onEdit={startEdit} onSave={savePrediction} onCancel={cancelEdit}
        onQuickPick={quickPick} onEditH={setEditH} onEditA={setEditA}
        loggedIn={loggedIn} onLogin={() => setShowLogin(true)} saving={saving}
      />
    );
  }, [editingId, editH, editA, userPredMap, resultMap, zokaMatchMap, isMatchLocked, isGlobalLocked, loggedIn, saving]);

  return (
    <div className="v19-page">
      <SEO title="Predictions — ZokaPredict" description="Make your score predictions for featured matches and compete on the daily leaderboard." />

      <div className="v19-hdr">
        <div className="v19-wrap">
          <div className="v19-hdr-inner">
            <button className="v19-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={13} /> Home</button>
            <div className="v19-hdr-title"><Target size={14} /> Predictions</div>
            <button className="v19-hdr-btn" onClick={() => setShowResults(true)}><BarChart3 size={13} /> Results</button>
          </div>
        </div>
      </div>

      <div className="v19-dsk">
        <div className="v19-wrap">
          <DateStrip date={selDate} onChange={handleDateChange} dates={dateList} hasDataMap={hasDataMap} />
        </div>
      </div>

      <div className="v19-wrap">
        {loggedIn && (
          <div style={{ marginBottom: 18, animation: 'v19-fade-up .4s ' + SMOOTH + ' both' }}>
            <div className="v19-stats">
              <div className="v19-stat"><div className="n" style={{ color: '#a855f7', animationDelay: '50ms' }}><AnimNum value={myDayStats.pts} /></div><div className="l">Points</div></div>
              <div className="v19-stat"><div className="n" style={{ color: 'var(--accent)', animationDelay: '80ms' }}><AnimNum value={myDayStats.ex} /></div><div className="l">Exact</div></div>
              <div className="v19-stat"><div className="n" style={{ color: 'var(--gold)', animationDelay: '110ms' }}><AnimNum value={myDayStats.rs} /></div><div className="l">Result</div></div>
              <div className="v19-stat"><div className="n" style={{ color: '#ef4444', animationDelay: '140ms' }}><AnimNum value={myDayStats.mi} /></div><div className="l">Miss</div></div>
              <div className="v19-stat"><div className="n" style={{ animationDelay: '170ms' }}>{myDayStats.accuracy}%</div><div className="l">Accuracy</div></div>
              <div className="v19-stat"><div className="n" style={{ animationDelay: '200ms' }}>{myDayStats.pred}/{allFeaturedFlat.length}</div><div className="l">Predicted</div></div>
            </div>
            {myDayStats.pred > 0 && (
              <div className="v19-progress">
                <div className="v19-progress-bar"><div className="v19-progress-fill" style={{ width: `${(myDayStats.pred - myDayStats.pn) / myDayStats.pred * 100}%`, background: myDayStats.allResolved ? 'var(--accent)' : 'linear-gradient(90deg,var(--accent),#34d399)' }} /></div>
                <div className="v19-progress-labels"><span>{myDayStats.pred} predicted</span><span>{myDayStats.allResolved ? '✓ All resolved' : `${myDayStats.pn} pending`}</span></div>
              </div>
            )}
            {myRank && (
              <div className="v19-rank" style={{ marginTop: 10 }}>
                <div className="v19-rank-inner">
                  <Trophy size={20} style={{ color: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rank #{myRank.rank}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>{myRank.points} pts · {myRank.accuracy}%</div>
                  </div>
                  <button className="v19-rank-btn" onClick={() => nav('/leaderboard')}>Full Board <ChevronRight size={11} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="v19-filter" style={{ marginBottom: 14 }}>
          {[
            { key: 'all', label: 'All', count: filterCounts.all },
            { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
            { key: 'unpredicted', label: 'Open', count: filterCounts.unpredicted },
            { key: 'finished', label: 'Finished', count: filterCounts.finished },
          ].map(f => (
            <button key={f.key} className={`v19-fbtn${filter === f.key ? ' on' : ''}`} onClick={() => handleFilterChange(f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {allZokaFlat.length > 0 && (
          <div className="v19-zoka">
            <div className="v19-zoka-hd">
              <div className="v19-zoka-icon"><Star size={15} style={{ color: 'var(--gold)' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: 0, fontSize: '.9rem', fontWeight: 900, color: 'var(--text-primary)' }}>Zoka Picks</h2>
                <p style={{ margin: '2px 0 0', fontSize: '.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>{allZokaFlat.length} prediction{allZokaFlat.length !== 1 ? 's' : ''} · Not for competition</p>
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
        )}

        <div className="v19-content">
          <div className="v19-sec-hd">
            <div className="v19-sec-icon" style={{ background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.18)', color: 'var(--accent)' }}><Target size={14} /></div>
            <span>Featured — Compete</span>
            <span className="v19-sec-badge" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.18)' }}>{filteredPreds.length}</span>
          </div>

          {loading ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} style={{ animationDelay: `${i * 60}ms` }} />)}</div>
          ) : loadError ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: 'var(--text-muted)', fontWeight: 700, marginBottom: 12 }}>Failed to load</p>
              <button className="v19-b v19-bgh" onClick={() => setLoadedDates(new Set())} style={{ padding: '10px 20px' }}><RotateCcw size={13} /> Retry</button>
            </div>
          ) : filteredPreds.length > 0 ? (
            <>
              {filteredPreds.map((pred, i) => {
                const showDate = i === 0 || pred._dateStr !== filteredPreds[i - 1]?._dateStr;
                return (
                  <Fragment key={pred.id || String(pred.matchId) || i}>
                    {showDate && allFeatured.length > 1 && <DateDivider date={pred._dateStr} accent="var(--accent)" />}
                    {renderPredCard(pred, i)}
                  </Fragment>
                );
              })}
            </>
          ) : (
            <div className="v19-empty">
              <Target size={22} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />
              <p>{filter === 'predicted' ? 'No predictions yet' : filter === 'finished' ? 'No finished matches' : filter === 'unpredicted' ? 'All matches predicted!' : 'No featured matches for this date'}</p>
              <p className="h">{filter === 'all' ? 'Admin needs to add featured matches' : 'Try a different filter'}</p>
            </div>
          )}
        </div>

        {myDayStats.allResolved && myDayStats.pred > 0 && (
          <div className="v19-rank v19-resolved">
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <Trophy size={26} style={{ color: 'var(--accent)', marginBottom: 8 }} />
              <div style={{ fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 4 }}>All Results In!</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>You scored <strong style={{ color: '#a855f7' }}>{myDayStats.pts} points</strong> with {myDayStats.accuracy}% accuracy</div>
              <button className="v19-resolved-btn" onClick={() => nav('/leaderboard')}>View Leaderboard <ArrowRight size={14} /></button>
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