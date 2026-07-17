// ═══════════════════════════════════════════════════════════════
// FILE: src/pages/Predictions.jsx
// v20.2 — Smart Live Merging, Instant Results, Admin Auto-Resolver
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback, useRef, Fragment, useTransition, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock, CheckCircle2, TrendingUp, Target, BarChart3,
  Star, Save, Trophy, CalendarDays, Lock,
  LogIn, ChevronDown, ChevronRight, ChevronUp, Minus, X, ArrowRight,
  ChevronLeft, Plus, ArrowLeft, RotateCcw, CircleX, CircleCheck,
  ThumbsUp, ThumbsDown, Pencil, Filter
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { eventBus, EVENT } from '../utils/eventBus';
import { calcPoints, CACHE_KEY, SPORT, isLiveStatus, isFinishedStatus, isScheduledStatus } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote, resolveMatchForAllUsers } from '../hooks/useMatchData';
import { fetchFixtures } from '../utils/api';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════ */
const FUTURE_DAYS = 3;
const LOCK_BEFORE_MINUTES = 60; // Lock predictions 1 hour before kickoff
const ZOKA_VISIBLE_COUNT = 5;

const SMOOTH = 'cubic-bezier(0.22, 1, 0.36, 1)';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const dateOffset = (offset = 0) => getLocalDateStr(offset);

const dateLabel = (d) => {
  const t = todayStr(), tm = getLocalDateStr(1), ys = getLocalDateStr(-1);
  if (d === t) return 'Today';
  if (d === tm) return 'Tomorrow';
  if (d === ys) return 'Yesterday';
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const dateDayName = (d) => ['S','M','T','W','T','F','S'][new Date(d + 'T12:00:00').getDay()];
const dateDayNum = (d) => d.slice(8);
const dateMonth = (d) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(d.slice(5,7)) - 1];

const QUICK_PICKS = [
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 },
  { h: 1, a: 1 }, { h: 2, a: 0 }, { h: 0, a: 1 },
  { h: 3, a: 1 }, { h: 1, a: 2 },
];

/** Check if match is locked (1hr before kickoff, live, or finished) */
function isMatchLocked(pred, now) {
  if (isFinishedStatus(pred.status, SPORT.FOOTBALL)) return { locked: true, reason: 'finished' };
  if (isLiveStatus(pred.status, SPORT.FOOTBALL) || pred.isLive) return { locked: true, reason: 'live' };
  
  const kickoffStr = pred.kickoff || pred.date;
  if (kickoffStr) {
    const kickoffTime = new Date(kickoffStr);
    if (!isNaN(kickoffTime.getTime())) {
      const diffMs = kickoffTime.getTime() - (now || Date.now());
      const diffMins = diffMs / 60000;
      if (diffMins <= LOCK_BEFORE_MINUTES) {
        return { locked: true, reason: diffMins <= 0 ? 'started' : 'closing' };
      }
      return { locked: false, minutesLeft: Math.floor(diffMins) };
    }
  }
  return { locked: false };
}

function formatMinutesLeft(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function parseKickoffTime(kickoff) {
  if (!kickoff) return '--:--';
  try {
    return new Date(kickoff).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

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
   STYLES (injected once)
   ═══════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('pred-v20')) return;
  const s = document.createElement('style');
  s.id = 'pred-v20';
  s.textContent = `
@keyframes v20-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes v20-pop{0%{transform:scale(.92);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
@keyframes v20-shimmer{0%{background-position:-300% 0}100%{background-position:300% 0}}
@keyframes v20-toast{0%{opacity:0;transform:translateX(-50%) translateY(12px)}10%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
@keyframes v20-pulse-live{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(2)}}
@keyframes v20-zoka-glow{0%,100%{border-color:rgba(245,197,66,.12)}50%{border-color:rgba(245,197,66,.28)}}
@keyframes v20-edit-ring{0%,100%{border-color:rgba(0,230,118,.2)}50%{border-color:rgba(0,230,118,.4)}}
@keyframes v20-date-glow{0%,100%{box-shadow:0 0 8px rgba(0,230,118,.12)}50%{box-shadow:0 0 16px rgba(0,230,118,.25)}}
@keyframes v20-overlay{from{opacity:0}to{opacity:1}}
@keyframes v20-box-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes v20-shine{0%{left:-100%}100%{left:200%}}

.v20-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding-bottom:90px}
.v20-wrap{max-width:640px;margin:0 auto;padding:0 16px}

/* Header */
.v20-hdr{position:sticky;top:0;z-index:100;padding:10px 0;backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);background:color-mix(in srgb,var(--bg-deep,#0a0f1a) 88%,transparent);border-bottom:1px solid var(--border)}
.v20-hdr-inner{display:flex;align-items:center;justify-content:space-between}
.v20-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v20-hdr-btn:hover{color:var(--text-primary);border-color:var(--border-hover)}
.v20-hdr-title{font-size:.88rem;font-weight:900;color:var(--text-primary);display:flex;align-items:center;gap:6px}

/* Date Strip */
.v20-dsk{position:sticky;top:48px;z-index:99;padding:10px 0 12px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:color-mix(in srgb,var(--bg-deep,#0a0f1a) 88%,transparent);border-bottom:1px solid var(--border);margin:0 -16px;padding-left:16px;padding-right:16px}
.v20-ds{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;padding:2px 0}
.v20-ds::-webkit-scrollbar{display:none}
.v20-dc{flex-shrink:0;scroll-snap-align:center;position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 11px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--text-muted);cursor:pointer;transition:all .18s;font-family:inherit;min-width:46px;-webkit-tap-highlight-color:transparent}
.v20-dc:hover{color:var(--text-primary);background:rgba(255,255,255,.03);border-color:var(--border)}
.v20-dc .dn{font-size:.56rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.6}
.v20-dc .dd{font-size:.92rem;font-weight:900;line-height:1}
.v20-dc .dm{font-size:.48rem;font-weight:700;opacity:.4}
.v20-dc.on{background:linear-gradient(135deg,rgba(0,230,118,.1),rgba(0,230,118,.04));color:var(--accent);border-color:rgba(0,230,118,.25)}
.v20-dc.on .dn{opacity:1;color:var(--accent)}
.v20-dc.on .dd{transform:scale(1.1);transition:transform .18s ${SPRING}}
.v20-dc.today:not(.on){border-color:rgba(245,197,66,.18);color:var(--gold,#f5c542)}
.v20-dc.today.on{animation:v20-date-glow 2.5s ease-in-out infinite}
.v20-dc.past{opacity:.45}
.v20-dc.past.on{opacity:1}
.v20-dmore{flex-shrink:0;display:flex;align-items:center;gap:4px;padding:7px 10px;border-radius:10px;border:1px dashed var(--border);background:transparent;color:var(--text-muted);font-size:.6rem;font-weight:700;cursor:pointer;transition:all .18s;font-family:inherit;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.v20-dmore:hover{border-color:var(--accent);color:var(--accent)}

/* Stats Grid */
.v20-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;animation:v20-fade-up .4s ${SMOOTH} both}
.v20-stat{background:var(--bg-surface);border:1px solid var(--border);border-radius:12px;padding:12px 6px;text-align:center}
.v20-stat .n{font-size:1.25rem;font-weight:900;font-family:var(--font-display);line-height:1}
.v20-stat .l{font-size:.54rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}

/* Progress */
.v20-progress{margin-bottom:10px}
.v20-progress-bar{height:4px;border-radius:2px;background:var(--bg-surface);overflow:hidden}
.v20-progress-fill{height:100%;border-radius:2px;transition:width .5s ${SMOOTH}}
.v20-progress-labels{display:flex;justify-content:space-between;font-size:.6rem;font-weight:700;color:var(--text-muted);margin-top:3px}

/* Rank Card */
.v20-rank{background:linear-gradient(135deg,rgba(0,230,118,.04),rgba(0,230,118,.01));border:1.5px solid rgba(0,230,118,.15);border-radius:14px;padding:14px;position:relative;overflow:hidden;animation:v20-pop .4s ${SPRING} both}
.v20-rank::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,230,118,.05),transparent);animation:v20-shine 4s ease-in-out infinite}
.v20-rank-inner{position:relative;z-index:1;display:flex;align-items:center;gap:12px}
.v20-rank-btn{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;background:rgba(245,197,66,.06);border:1.5px solid rgba(245,197,66,.16);color:var(--gold,#f5c542);font-weight:800;font-size:.72rem;cursor:pointer;transition:all .15s;font-family:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}
.v20-rank-btn:hover{background:rgba(245,197,66,.1);border-color:rgba(245,197,66,.28)}

/* Filter */
.v20-filter{display:flex;gap:4px;overflow-x:auto;padding:0 0 12px;scrollbar-width:none;margin-bottom:2px}
.v20-filter::-webkit-scrollbar{display:none}
.v20-fbtn{flex-shrink:0;padding:6px 12px;border-radius:8px;font-size:.7rem;font-weight:700;border:1px solid var(--border);background:transparent;color:var(--text-muted);cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v20-fbtn:hover{background:rgba(255,255,255,.03);color:var(--text-primary)}
.v20-fbtn.on{background:rgba(0,230,118,.07);border-color:rgba(0,230,118,.2);color:var(--accent)}

/* Zoka Section */
.v20-zoka{background:linear-gradient(135deg,rgba(245,197,66,.03) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.1);border-radius:14px;padding:14px;margin-bottom:16px;overflow:hidden;animation:v20-fade-up .4s ${SMOOTH} both}
.v20-zoka-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.v20-zoka-icon{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,rgba(245,197,66,.12),rgba(245,197,66,.04));border:1.5px solid rgba(245,197,66,.22);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.v20-zoka-more{width:100%;padding:10px;border-radius:10px;border:1.5px dashed rgba(245,197,66,.2);background:transparent;color:var(--gold);font-weight:800;font-size:.76rem;cursor:pointer;transition:all .15s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;-webkit-tap-highlight-color:transparent}
.v20-zoka-more:hover{background:rgba(245,197,66,.04);border-color:rgba(245,197,66,.35)}

/* Match Card */
.v20-mc{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:6px;transition:all .15s}
.v20-mc:hover{background:rgba(255,255,255,.01)}
.v20-mc.zoka{background:linear-gradient(135deg,rgba(245,197,66,.03),rgba(245,197,66,.005));border-color:rgba(245,197,66,.12)}
.v20-mc.zoka.pending{animation:v20-zoka-glow 2.5s ease-in-out infinite}
.v20-mc.live{border-color:rgba(239,68,68,.12);animation:none}
.v20-mc.live::after{content:'';position:absolute;top:8px;right:8px;width:6px;height:6px;border-radius:50%;background:#ef4444;animation:v20-pulse-live 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.6)}
.v20-mc.finished{border-color:rgba(0,230,118,.12)}
.v20-mc.editing{border-color:rgba(0,230,118,.3);animation:v20-edit-ring 2s ease-in-out infinite}
.v20-mc.locked{border-color:rgba(96,165,250,.15)}
.v20-mc.missed{opacity:.5}

.v20-mh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.v20-ml{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.v20-ml img{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v20-ml span{font-size:.62rem;font-weight:700;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v20-st{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-size:.58rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0}

.v20-tm{display:flex;align-items:center;gap:6px}
.v20-te{flex:1;display:flex;align-items:center;gap:7px;min-width:0}
.v20-te.aw{flex-direction:row-reverse;text-align:right}
.v20-te img{width:22px;height:22px;border-radius:6px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,.03);padding:2px}
.v20-te span{font-size:.8rem;font-weight:800;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v20-sb{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;min-width:70px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid var(--border)}
.v20-sb.live{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.15)}
.v20-sb.ft{background:rgba(0,230,118,.04);border-color:rgba(0,230,118,.1)}
.v20-sn{font-size:1rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:var(--text-primary)}
.v20-sp{color:var(--text-muted);font-size:.7rem;font-weight:700;opacity:.25}
.v20-vs{font-size:.62rem;font-weight:800;color:var(--text-muted);opacity:.15;letter-spacing:.1em}

.v20-ma{display:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:wrap}

/* Lock Timer */
.v20-lock-timer{display:inline-flex;align-items:center;gap:4px;font-size:.6rem;font-weight:700;color:#60a5fa;padding:2px 7px;border-radius:5px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15)}

/* Buttons */
.v20-b{padding:7px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;min-height:34px;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v20-b:active{transform:scale(.96)}.v20-b:disabled{opacity:.25;pointer-events:none}
.v20-bp{background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 10px rgba(16,185,129,.2)}
.v20-bp:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(16,185,129,.25)}
.v20-bgh{background:rgba(255,255,255,.03);border:1px solid var(--border);color:var(--text-primary)}
.v20-bgh:hover{background:rgba(255,255,255,.06)}
.v20-bsm{padding:5px 10px;font-size:.66rem;min-height:30px;border-radius:7px;gap:4px}
.v20-bbl{background:transparent;border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.v20-bbl:hover{background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.35)}

/* Badges */
.v20-bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;font-size:.6rem;font-weight:800;white-space:nowrap}
.v20-bdg.ex{background:rgba(0,230,118,.08);color:var(--accent);border:1px solid rgba(0,230,118,.18)}
.v20-bdg.rs{background:rgba(245,197,66,.06);color:var(--gold);border:1px solid rgba(245,197,66,.15)}
.v20-bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.12)}
.v20-bdg.pn{background:rgba(255,255,255,.02);color:var(--text-muted);border:1px solid var(--border)}
.v20-bdg.bl{background:rgba(96,165,250,.06);color:#60a5fa;border:1px solid rgba(96,165,250,.18)}
.v20-bdg.gd{background:rgba(245,197,66,.06);color:var(--gold);border:1px solid rgba(245,197,66,.18)}

/* Score Input */
.v20-si{width:40px;height:34px;padding:0;border-radius:7px;background:var(--bg-card);border:1.5px solid rgba(0,230,118,.2);text-align:center;font-weight:900;font-size:.9rem;outline:none;font-variant-numeric:tabular-nums;transition:all .15s;-webkit-appearance:none;font-family:var(--font-display,monospace);color:var(--text-primary)}
.v20-si:focus{box-shadow:0 0 0 2px rgba(0,230,118,.1)}
.v20-si::placeholder{color:var(--text-muted);opacity:.2}

/* Stepper */
.v20-step{width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s;padding:0}
.v20-step:hover{border-color:var(--accent);color:var(--accent);background:rgba(0,230,118,.05)}
.v20-step:active{transform:scale(.9)}

/* Quick Picks */
.v20-qp{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.v20-qp-btn{padding:5px 3px;border-radius:6px;font-size:.72rem;font-weight:900;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .12s;min-height:30px;-webkit-tap-highlight-color:transparent;text-align:center}
.v20-qp-btn:hover{border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.06);color:var(--accent)}
.v20-qp-btn:active{transform:scale(.93)}
.v20-qp-btn.sel{border-color:var(--accent);background:rgba(0,230,118,.1);color:var(--accent)}

/* Vote */
.v20-vote{display:inline-flex;align-items:center;gap:3px;padding:5px 10px;border-radius:7px;font-size:.68rem;font-weight:800;border:1.5px solid var(--border);background:rgba(255,255,255,.02);color:var(--text-muted);cursor:pointer;transition:all .15s;min-height:30px;-webkit-tap-highlight-color:transparent;flex:1;justify-content:center}
.v20-vote:active{transform:scale(.95)}
.v20-vote.agree-on{border-color:rgba(0,230,118,.25);background:rgba(0,230,118,.07);color:var(--accent)}
.v20-vote.disagree-on{border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.05);color:#ef4444}
.v20-vote-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.v20-vote-fill{height:100%;border-radius:2px;transition:width .4s ${SMOOTH};background:var(--accent)}

/* Skeleton */
.v20-skel{background:linear-gradient(90deg,var(--bg-surface) 25%,rgba(255,255,255,.03) 50%,var(--bg-surface) 75%);background-size:300% 100%;animation:v20-shimmer 1.2s ease-in-out infinite;border-radius:12px;height:100px;margin-bottom:6px}

/* Empty */
.v20-empty{padding:32px 20px;text-align:center;border:2px dashed var(--border);border-radius:14px;background:var(--bg-surface)}
.v20-empty p{color:var(--text-muted);font-size:.8rem;margin:0;font-weight:600}
.v20-empty .h{font-size:.66rem;color:var(--text-muted);opacity:.4;margin-top:4px}

/* Toast */
.v20-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;animation:v20-toast 2.5s ${SMOOTH} both;pointer-events:none}

/* Overlay */
.v20-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center;animation:v20-overlay .2s ease}
.v20-overlay-box{background:var(--bg-card);border:1px solid var(--border);border-radius:20px 20px 0 0;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;animation:v20-box-up .3s ${SPRING} both;scrollbar-width:none}
.v20-overlay-box::-webkit-scrollbar{display:none}
.v20-overlay-handle{width:36px;height:4px;border-radius:2px;background:var(--border);margin:10px auto 0}
.v20-res-row{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border);margin-bottom:5px}

/* Section */
.v20-sec{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.v20-sec span{font-size:.85rem;font-weight:900;color:var(--text-primary)}
.v20-sec-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.v20-sec-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:5px;font-size:.62rem;font-weight:900}

@media(max-width:640px){
  .v20-stats{grid-template-columns:repeat(3,1fr)}.v20-stat .n{font-size:1.1rem}.v20-stat{padding:10px 4px}
  .v20-qp{grid-template-columns:repeat(4,1fr)!important;gap:3px!important}.v20-qp-btn{padding:4px 2px;font-size:.68rem;min-height:28px}
  .v20-sb{min-width:60px;padding:4px 8px}.v20-sn{font-size:.88rem}.v20-te span{font-size:.74rem}.v20-te img{width:20px;height:20px}
  .v20-dc{padding:6px 9px;min-width:40px}.v20-dc .dd{font-size:.82rem}
}
@media(max-width:380px){
  .v20-stats{grid-template-columns:repeat(2,1fr)}.v20-stat .n{font-size:.9rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */
function Skeleton() {
  return <div className="v20-skel" />;
}

function ResultBadge({ result, isCalculating }) {
  if (isCalculating) return <span className="v20-bdg pn"><Clock size={8} /> Calculating...</span>;
  if (!result || result.resultType === 'pending') return <span className="v20-bdg pn"><Clock size={8} /> Pending</span>;
  if (result.resultType === 'exact') return <span className="v20-bdg ex"><CheckCircle2 size={8} /> Hit +{result.points || 10}</span>;
  if (result.resultType === 'result') return <span className="v20-bdg rs"><TrendingUp size={8} /> Won +{result.points || 3}</span>;
  return <span className="v20-bdg ms"><CircleX size={8} /> Missed</span>;
}

function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="v20-toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'rgba(0,230,118,.1)', border: '1.5px solid rgba(0,230,118,.25)', backdropFilter: 'blur(12px)' }}>
        <CircleCheck size={15} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--accent)' }}>Saved <strong>{score}</strong></span>
      </div>
    </div>
  );
}

function LoginModal({ onClose, nav }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'v20-overlay .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: 16, padding: '24px 20px', maxWidth: 340, width: '100%', textAlign: 'center', animation: 'v20-pop .3s ' + SPRING + ' both' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--accent)' }}><LogIn size={22} /></div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>Sign in to make predictions and compete.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="v20-b v20-bgh" style={{ flex: 1, minHeight: 44 }}>Cancel</button>
          <button onClick={() => { onClose(); nav('/login'); }} className="v20-b v20-bp" style={{ flex: 1, minHeight: 44 }}>Log In</button>
        </div>
      </div>
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
    return dates.slice(start, start + 8);
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
    <div className="v20-ds" ref={stripRef}>
      {visibleDates.map(d => {
        const isToday = d === today;
        const isPast = d < today;
        const isActive = d === date;
        const hasData = hasDataMap?.[d];
        return (
          <button
            key={d}
            data-date={d}
            className={`v20-dc${isActive ? ' on' : ''}${isToday ? ' today' : ''}${isPast && !isActive ? ' past' : ''}`}
            onClick={() => onChange(d)}
          >
            <span className="dn">{dateDayName(d)}</span>
            <span className="dd">{dateDayNum(d)}</span>
            <span className="dm">{dateMonth(d)}</span>
            {hasData && !isActive && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', opacity: .5 }} />}
          </button>
        );
      })}
      {!expanded && dates.length > 8 && (
        <button className="v20-dmore" onClick={() => setExpanded(true)}><ChevronRight size={10} /> More</button>
      )}
      {expanded && (
        <button className="v20-dmore" onClick={() => setExpanded(false)}><ChevronLeft size={10} /> Less</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SCORE STEPPER
   ═══════════════════════════════════════════════════ */
function ScoreStepper({ value, onChange }) {
  const num = value === '' || value == null ? null : parseInt(value, 10);
  const display = num != null && !isNaN(num) ? num : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <button className="v20-step" onClick={() => onChange(String(Math.max(0, (num || 0) - 1)))}><Minus size={9} /></button>
      <input
        className="v20-si"
        value={display}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
        placeholder="?"
        maxLength={2}
      />
      <button className="v20-step" onClick={() => onChange(String(Math.min(99, (num || 0) + 1)))}><Plus size={9} /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ZOKA PICK CARD
   ═══════════════════════════════════════════════════ */
function ZokaPickCard({ pick, index, voteStats, userVote, onVote, votingId }) {
  // ★ Smart check: Use pick.status and pick.homeScore directly (merged with live data)
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
  const isLive = isLiveStatus(pick.status, SPORT.FOOTBALL);
  
  // Calculate result locally based on merged score
  const res = pick.adminPick && isFin && pick.homeScore != null 
    ? calcPoints(pick.adminPick.home, pick.adminPick.away, pick.homeScore, pick.awayScore) 
    : null;
    
  const vs = voteStats[String(pick.matchId)] || { agree: 0, disagree: 0, total: 0 };
  const myV = userVote[String(pick.matchId)];
  const mid = String(pick.matchId);
  const isVoting = votingId === mid;

  const homeLogo = pick.homeLogo || pick.homeTeam?.logo || pick.homeTeam?.crest;
  const awayLogo = pick.awayLogo || pick.awayTeam?.logo || pick.awayTeam?.crest;
  const kickoff = parseKickoffTime(pick.kickoff || pick.date);
  const homeName = typeof pick.homeTeam === 'object' ? (pick.homeTeam?.shortName || pick.homeTeam?.name || 'Home') : (pick.homeTeam || 'Home');
  const awayName = typeof pick.awayTeam === 'object' ? (pick.awayTeam?.shortName || pick.awayTeam?.name || 'Away') : (pick.awayTeam || 'Away');

  let leftColor = 'rgba(245,197,66,.12)';
  if (res?.type === 'exact') leftColor = 'var(--accent)';
  else if (res?.type === 'result') leftColor = 'var(--gold)';
  else if (res?.type === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(0,230,118,.2)';

  const cardCls = `v20-mc zoka${!isFin && !isLive ? ' pending' : ''}${isLive ? ' live' : ''}${isFin ? ' finished' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, position: 'relative', animation: `v20-fade-up .3s ${SMOOTH} ${index * 20}ms both` }}>
      <div className="v20-mh">
        <div className="v20-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka Pick'}</span>
        </div>
        <span className="v20-st" style={{ color: isFin ? 'var(--accent)' : isLive ? '#ef4444' : 'var(--text-muted)', background: isFin ? 'rgba(0,230,118,.08)' : isLive ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)' }}>
          {isFin ? 'FT' : isLive ? (pick.minute || 'LIVE') : kickoff}
        </span>
      </div>
      <div className="v20-tm">
        <div className="v20-te">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        {isFin && pick.homeScore != null ? (
          <div className="v20-sb ft">
            <span className="v20-sn" style={{ color: 'var(--accent)' }}>{pick.homeScore}</span>
            <span className="v20-sp">–</span>
            <span className="v20-sn" style={{ color: 'var(--accent)' }}>{pick.awayScore}</span>
          </div>
        ) : isLive && pick.homeScore != null ? (
          <div className="v20-sb live">
            <span className="v20-sn" style={{ color: '#ef4444' }}>{pick.homeScore}</span>
            <span className="v20-sp">–</span>
            <span className="v20-sn" style={{ color: '#ef4444' }}>{pick.awayScore}</span>
          </div>
        ) : (
          <div className="v20-sb">
            <span className="v20-sn" style={{ color: 'var(--gold)' }}>{pick.adminPick?.home ?? '?'}</span>
            <span className="v20-sp">–</span>
            <span className="v20-sn" style={{ color: 'var(--gold)' }}>{pick.adminPick?.away ?? '?'}</span>
          </div>
        )}
        <div className="v20-te aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="v20-ma" style={{ gap: 6, flexWrap: 'wrap' }}>
        {/* ★ INSTANT RESULT BADGE */}
        {isFin && res && res.type !== 'pending' && <ResultBadge result={res} />}
        {isFin && (!res || res.type === 'pending') && <span className="v20-bdg pn"><Clock size={8} /> Calculating...</span>}
        
        {!isFin && !isLive && vs.total > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
            <button
              className={`v20-vote${myV === 'agree' ? ' agree-on' : ''}`}
              onClick={() => onVote(mid, 'agree')}
              disabled={isVoting}
            >
              <ThumbsUp size={11} /> {vs.agree || 0}
            </button>
            <div className="v20-vote-bar">
              <div className="v20-vote-fill" style={{ width: `${vs.total > 0 ? Math.round((vs.agree / vs.total) * 100) : 0}%` }} />
            </div>
            <button
              className={`v20-vote${myV === 'disagree' ? ' disagree-on' : ''}`}
              onClick={() => onVote(mid, 'disagree')}
              disabled={isVoting}
            >
              <ThumbsDown size={11} /> {vs.disagree || 0}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PREDICTION CARD (Featured Matches)
   ═══════════════════════════════════════════════════ */
function PredCard({ pred, index, userPred, result, isEditing, editH, editA, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving, now }) {
  const mid = pred.id || String(pred.matchId);
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL);
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL);
  const hasPred = !!userPred;
  
  // ★ FIX: If backend hasn't resolved yet, calculate locally for instant feedback using MERGED data
  const localResult = (isFin && hasPred && pred.homeScore != null) 
    ? calcPoints(userPred.homeScore, userPred.awayScore, pred.homeScore, pred.awayScore) 
    : null;
    
  // Use backend result if available, otherwise use localResult
  const effectiveResult = result || localResult;
  const isResolved = !!effectiveResult && effectiveResult.resultType !== 'pending';

  // ★ 1-HOUR LOCK CHECK
  const lockInfo = isMatchLocked(pred, now);
  const isLocked = lockInfo.locked;

  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const homeName = typeof pred.homeTeam === 'object' ? (pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home') : (pred.homeTeam || 'Home');
  const awayName = typeof pred.awayTeam === 'object' ? (pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away') : (pred.awayTeam || 'Away');
  const kickoff = parseKickoffTime(pred.kickoff || pred.date);

  let leftColor = 'var(--border)';
  if (isResolved && effectiveResult?.resultType === 'exact') leftColor = 'var(--accent)';
  else if (isResolved && effectiveResult?.resultType === 'result') leftColor = 'var(--gold)';
  else if (isResolved && effectiveResult?.resultType === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(0,230,118,.2)';
  else if (isLive) leftColor = 'rgba(239,68,68,.3)';
  else if (hasPred) leftColor = '#60a5fa';
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90) leftColor = 'rgba(245,197,66,.3)';

  let cardCls = 'v20-mc';
  if (isEditing) cardCls += ' editing';
  else if (isLive) cardCls += ' live';
  else if (isFin) cardCls += ' finished';
  else if (isLocked && !hasPred) cardCls += ' locked';
  else if (isFin && !hasPred) cardCls += ' missed';

  let statusLabel = kickoff;
  let statusColor = 'var(--text-muted)';
  let statusBg = 'rgba(255,255,255,.04)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isFin) { statusLabel = 'FT'; statusColor = 'var(--accent)'; statusBg = 'rgba(0,230,118,.08)'; }
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 60) { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.08)'; }

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, position: 'relative', animation: `v20-fade-up .3s ${SMOOTH} ${index * 20}ms both` }}>
      <div className="v20-mh">
        <div className="v20-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Match'}</span>
        </div>
        <span className="v20-st" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
      </div>
      <div className="v20-tm">
        <div className="v20-te">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ScoreStepper value={editH} onChange={onEditH} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.7rem', opacity: .3 }}>–</span>
            <ScoreStepper value={editA} onChange={onEditA} />
          </div>
        ) : hasPred ? (
          <div className={`v20-sb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(96,165,250,.2)', background: 'rgba(96,165,250,.05)' } : {}}>
            <span className={`v20-sn${isFin ? '' : ''}`} style={{ color: isFin ? 'var(--accent)' : '#60a5fa' }}>{userPred.homeScore}</span>
            <span className="v20-sp">–</span>
            <span className={`v20-sn${isFin ? '' : ''}`} style={{ color: isFin ? 'var(--accent)' : '#60a5fa' }}>{userPred.awayScore}</span>
          </div>
        ) : isFin && pred.homeScore != null ? (
          <div className="v20-sb ft">
            <span className="v20-sn" style={{ color: 'var(--accent)' }}>{pred.homeScore}</span>
            <span className="v20-sp">–</span>
            <span className="v20-sn" style={{ color: 'var(--accent)' }}>{pred.awayScore}</span>
          </div>
        ) : (
          <div className="v20-sb"><span className="v20-vs">VS</span></div>
        )}
        <div className="v20-te aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="v20-ma" style={{ gap: 6, flexWrap: 'wrap' }}>
        {isEditing && (
          <div className="v20-qp" style={{ width: '100%' }}>
            {QUICK_PICKS.map((qp, qi) => (
              <button
                key={qi}
                className={`v20-qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`}
                onClick={() => onQuickPick(qp.h, qp.a)}
              >{qp.h}–{qp.a}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          {isEditing ? (
            <>
              <button className="v20-b v20-bp v20-bsm" onClick={() => onSave(pred)} disabled={saving || !editH || !editA}><Save size={10} /> Save</button>
              <button className="v20-b v20-bgh v20-bsm" onClick={onCancel}><X size={10} /> Cancel</button>
            </>
          ) : isResolved ? (
            <ResultBadge result={effectiveResult} />
          ) : isFin && !hasPred ? (
            <span className="v20-bdg ms"><CircleX size={8} /> Missed</span>
          ) : isLocked && !isFin ? (
            <span className="v20-bdg pn"><Lock size={8} /> {lockInfo.reason === 'live' ? 'Live' : lockInfo.reason === 'closing' ? `${formatMinutesLeft(lockInfo.minutesLeft)} left` : 'Started'}</span>
          ) : hasPred ? (
            <>
              <span className="v20-bdg bl"><CheckCircle2 size={8} /> Saved</span>
              {!isLocked && <button className="v20-b v20-bbl v20-bsm" onClick={() => onEdit(pred)}><Pencil size={9} /> Edit</button>}
            </>
          ) : lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90 ? (
            <span className="v20-lock-timer"><Clock size={9} /> {formatMinutesLeft(lockInfo.minutesLeft)}</span>
          ) : loggedIn ? (
            <button className="v20-b v20-bp v20-bsm" onClick={() => onEdit(pred)}><Target size={10} /> Predict</button>
          ) : (
            <button className="v20-b v20-bgh v20-bsm" onClick={onLogin}><LogIn size={10} /> Login</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RESULTS OVERLAY
   ═══════════════════════════════════════════════════ */
function ResultsOverlay({ date, preds, userPredsObj, results, onClose, nav }) {
  const upMap = useMemo(() => {
    const m = new Map();
    Object.values(userPredsObj || {}).forEach(p => {
      if (p.predId) m.set(p.predId, p);
      if (p.matchId) m.set(String(p.matchId), p);
    });
    return m;
  }, [userPredsObj]);
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
    <div className="v20-overlay" onClick={onClose}>
      <div className="v20-overlay-box" onClick={e => e.stopPropagation()}>
        <div className="v20-overlay-handle" />
        <div style={{ padding: '16px 18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>My Results</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{dateLabel(date)}</div>
            </div>
            <button className="v20-b v20-bgh v20-bsm" onClick={onClose}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
            <div className="v20-stat"><div className="n" style={{ color: '#a855f7' }}><AnimNum value={totalPts} /></div><div className="l">Points</div></div>
            <div className="v20-stat"><div className="n" style={{ color: 'var(--accent)' }}><AnimNum value={exact} /></div><div className="l">Exact</div></div>
            <div className="v20-stat"><div className="n" style={{ color: 'var(--gold)' }}><AnimNum value={result} /></div><div className="l">Result</div></div>
          </div>
          {predicted > 0 && (
            <div className="v20-progress" style={{ marginBottom: 12 }}>
              <div className="v20-progress-bar"><div className="v20-progress-fill" style={{ width: `${((predicted - pending) / predicted) * 100}%`, background: allResolved ? 'var(--accent)' : 'linear-gradient(90deg,var(--accent),#34d399)' }} /></div>
              <div className="v20-progress-labels"><span>{predicted} predicted</span><span>{allResolved ? '✓ Complete' : `${pending} pending`}</span></div>
            </div>
          )}
          {preds.map((p, i) => {
            const up = upMap.get(p.id) || upMap.get(String(p.matchId));
            if (!up) return null;
            const res = resMap.get(String(p.matchId));
            const rType = res?.resultType;
            return (
              <div key={p.id} className="v20-res-row" style={{ animationDelay: `${i * 20}ms`, borderLeft: rType === 'exact' ? '3px solid var(--accent)' : rType === 'result' ? '3px solid var(--gold)' : rType === 'miss' ? '3px solid #ef4444' : '3px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof p.homeTeam === 'object' ? p.homeTeam?.shortName || p.homeTeam?.name : p.homeTeam} vs {typeof p.awayTeam === 'object' ? p.awayTeam?.shortName || p.awayTeam?.name : p.awayTeam}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: '#60a5fa', fontSize: '.78rem', background: 'rgba(96,165,250,.06)', padding: '2px 6px', borderRadius: 5 }}>{up.homeScore}-{up.awayScore}</span>
                  {rType && rType !== 'pending' && <span className={`v20-bdg ${rType === 'exact' ? 'ex' : rType === 'result' ? 'rs' : 'ms'}`}>+{res.points || 0}</span>}
                </div>
              </div>
            );
          })}
          {predicted === 0 && (
            <div className="v20-empty" style={{ marginTop: 8 }}>
              <Target size={20} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />
              <p>No predictions for this day</p>
            </div>
          )}
          {allResolved && (
            <div className="v20-rank" style={{ marginTop: 14, textAlign: 'center' }}>
              <Trophy size={22} style={{ color: 'var(--accent)', marginBottom: 6 }} />
              <div style={{ fontSize: '.88rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 3 }}>All Results In!</div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>You scored <strong style={{ color: '#a855f7' }}>{totalPts} pts</strong> · {accuracy}% accuracy</div>
              <button className="v20-b v20-bp" onClick={() => { onClose(); nav('/leaderboard'); }}>View Leaderboard <ArrowRight size={13} /></button>
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
  const { currentUser, userProfile } = useAuth();
  const nav = useNavigate();
  const uid = currentUser?.uid;
  const loggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
  const isAdmin = userProfile?.role === 'admin';

  // ★ Use AppDataContext for REACTIVE data (like navbar)
  const appData = useAppData();
  const {
    activePredictions: featuredPreds,
    zokaPicks,
    zokaVoteStats,
    userPredictions: ctxUserPreds,
    predictionResults: ctxPredResults,
    userPoints,
    dailyEntries,
    userStats,
    loading: ctxLoading,
  } = appData;

  const [selDate, setSelDate] = useState(todayStr());
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [zokaExpanded, setZokaExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editH, setEditH] = useState('');
  const [editA, setEditA] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingId, setVotingId] = useState(null);
  
  // Non-today date data
  const [nonTodayData, setNonTodayData] = useState({ featured: null, zoka: null, userPreds: {}, results: [], votes: {} });
  const [nonTodayLoading, setNonTodayLoading] = useState(false);
  const mountedRef = useRef(true);

  // ★ LIVE FIXTURES FOR REAL-TIME MERGING
  const [liveFixtures, setLiveFixtures] = useState([]);
  
  const isToday = selDate === todayStr();

  // Update time every second for lock timers
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ★ FETCH LIVE FIXTURES FOR TODAY (Every 15s)
  useEffect(() => {
    if (!isToday) return;
    let cancelled = false;
    const loadLive = async () => {
      try {
        const res = await fetchFixtures(todayStr());
        if (!cancelled) setLiveFixtures(res?.matches || []);
      } catch (e) {}
    };
    loadLive();
    const interval = setInterval(loadLive, 15000); // 15s polling for real-time scores
    return () => { cancelled = true; clearInterval(interval); };
  }, [isToday]);

  // Load data for non-today dates
  useEffect(() => {
    if (isToday) return;
    let cancelled = false;
    setNonTodayLoading(true);
    
    Promise.all([
      dataLayer.fetchActivePredictions(selDate).catch(() => []),
      dataLayer.fetchZokaPicks(selDate).catch(() => null),
      uid ? dataLayer.fetchUserPredictions(uid, selDate).catch(() => ({})) : Promise.resolve({}),
      uid ? dataLayer.fetchPredictionResults(uid, selDate).catch(() => ({ results: [] })) : Promise.resolve({ results: [] }),
      dataLayer.fetchZokaVotes(selDate).catch(() => ({ stats: {} })),
    ]).then(([featured, zoka, preds, results, votes]) => {
      if (cancelled || !mountedRef.current) return;
      const predMap = {};
      Object.values(preds || {}).forEach(p => {
        if (p.predId) predMap[p.predId] = p;
        if (p.matchId) predMap[String(p.matchId)] = p;
      });
      let userVotes = {};
      try { userVotes = JSON.parse(localStorage.getItem(`zoka_votes_${selDate}`) || '{}'); } catch {}
      setNonTodayData({
        featured: featured || [],
        zoka: zoka?.matches || [],
        userPreds: predMap,
        results: results?.results || [],
        votes: userVotes,
        voteStats: votes?.stats || {},
      });
      setNonTodayLoading(false);
    });

    return () => { cancelled = true; };
  }, [selDate, isToday, uid]);

  const dateList = useMemo(() => {
    const arr = [];
    for (let i = -14; i <= FUTURE_DAYS; i++) arr.push(dateOffset(i));
    return arr;
  }, []);

  // Select correct data source based on date
  const currentFeatured = isToday ? (featuredPreds || []) : (nonTodayData.featured || []);
  const currentZoka = isToday ? (zokaPicks?.matches || []) : (nonTodayData.zoka || []);
  const currentUserPreds = isToday ? (ctxUserPreds || {}) : (nonTodayData.userPreds || {});
  const currentResults = isToday ? (ctxPredResults?.results || []) : (nonTodayData.results || []);
  const currentVotes = isToday ? (appData.currentUserVotes || {}) : (nonTodayData.votes || {});
  const currentVoteStats = isToday ? (zokaVoteStats || {}) : (nonTodayData.voteStats || {});
  const currentLoading = isToday ? ctxLoading : nonTodayLoading;

  // ★ MERGE LIVE FIXTURES INTO PREDICTIONS & ZOKA PICKS FOR INSTANT FT DETECTION
  const mergedFeatured = useMemo(() => {
    if (!isToday || !liveFixtures.length) return currentFeatured;
    return currentFeatured.map(p => {
      const fx = liveFixtures.find(f => String(f.id) === String(p.matchId));
      if (fx) {
        return {
          ...p,
          status: fx.status || p.status,
          homeScore: fx.homeScore ?? p.homeScore,
          awayScore: fx.awayScore ?? p.awayScore,
          minute: fx.minute ?? p.minute,
          isLive: fx.isLive || p.isLive,
          isFinished: fx.isFinished || p.isFinished,
        };
      }
      return p;
    });
  }, [currentFeatured, liveFixtures, isToday]);

  const mergedZoka = useMemo(() => {
    if (!isToday || !liveFixtures.length) return currentZoka;
    return currentZoka.map(p => {
      const fx = liveFixtures.find(f => String(f.id) === String(p.matchId));
      if (fx) {
        return {
          ...p,
          status: fx.status || p.status,
          homeScore: fx.homeScore ?? p.homeScore,
          awayScore: fx.awayScore ?? p.awayScore,
          minute: fx.minute ?? p.minute,
        };
      }
      return p;
    });
  }, [currentZoka, liveFixtures, isToday]);

  // ★ ADMIN AUTO-RESOLVER: Automatically distribute points if a match just finished
  useEffect(() => {
    if (!isAdmin || !isToday || !liveFixtures.length) return;
    
    const toResolve = mergedFeatured.filter(p => {
      const fx = liveFixtures.find(f => String(f.id) === String(p.matchId));
      return fx && fx.isFinished && fx.homeScore != null && fx.awayScore != null;
    });

    toResolve.forEach(pred => {
      const fx = liveFixtures.find(f => String(f.id) === String(pred.matchId));
      // Check if DB hasn't already marked it as finished to avoid spamming the resolver
      const dbPred = currentFeatured.find(p => String(p.matchId) === String(pred.matchId));
      if (dbPred && dbPred.status !== 'finished') {
         console.log(`[AutoResolve] Admin triggering resolution for ${pred.matchId}`);
         resolveMatchForAllUsers(pred.matchId, fx.homeScore, fx.awayScore, pred.matchDate || todayStr());
      }
    });
  }, [isAdmin, isToday, liveFixtures, mergedFeatured, currentFeatured]);

  // Build maps
  const scoreMap = useMemo(() => {
    const m = new Map();
    mergedFeatured.forEach(p => {
      if (isFinishedStatus(p.status, SPORT.FOOTBALL) && p.homeScore != null) {
        m.set(String(p.matchId), { h: p.homeScore, a: p.awayScore });
      }
    });
    return m;
  }, [mergedFeatured]);

  const userPredMap = useMemo(() => {
    const m = new Map();
    Object.values(currentUserPreds).forEach(p => {
      if (p.predId) m.set(p.predId, p);
      if (p.matchId) m.set(String(p.matchId), p);
    });
    return m;
  }, [currentUserPreds]);

  const resultMap = useMemo(() => {
    const m = new Map();
    currentResults.forEach(r => m.set(String(r.matchId), r));
    return m;
  }, [currentResults]);

  const hasDataMap = useMemo(() => {
    const m = {};
    if (currentFeatured.length > 0) m[selDate] = true;
    if (currentZoka.length > 0) m[selDate] = true;
    return m;
  }, [currentFeatured, currentZoka, selDate]);

  // ★ Zoka picks: show top 5, then "Show More" button
  const visibleZoka = useMemo(() => {
    if (mergedZoka.length <= ZOKA_VISIBLE_COUNT) return mergedZoka;
    return zokaExpanded ? mergedZoka : mergedZoka.slice(0, ZOKA_VISIBLE_COUNT);
  }, [mergedZoka, zokaExpanded]);
  const hiddenZokaCount = mergedZoka.length - ZOKA_VISIBLE_COUNT;

  // Filter featured predictions
  const deferredFilter = useDeferredValue(filter);
  const filteredPreds = useMemo(() => {
    if (deferredFilter === 'predicted') return mergedFeatured.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId)));
    if (deferredFilter === 'unpredicted') return mergedFeatured.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL));
    if (deferredFilter === 'finished') return mergedFeatured.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL));
    return mergedFeatured;
  }, [mergedFeatured, userPredMap, deferredFilter]);

  const filterCounts = useMemo(() => ({
    all: mergedFeatured.length,
    predicted: mergedFeatured.filter(p => userPredMap.get(p.id) || userPredMap.get(String(p.matchId))).length,
    unpredicted: mergedFeatured.filter(p => !userPredMap.get(p.id) && !userPredMap.get(String(p.matchId)) && !isFinishedStatus(p.status, SPORT.FOOTBALL)).length,
    finished: mergedFeatured.filter(p => isFinishedStatus(p.status, SPORT.FOOTBALL)).length,
  }), [mergedFeatured, userPredMap]);

  // Day stats (accurate, from context for today)
  const myDayStats = useMemo(() => {
    let pts = 0, ex = 0, rs = 0, mi = 0, pn = 0, pred = 0;
    mergedFeatured.forEach(p => {
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
  }, [mergedFeatured, userPredMap, resultMap]);

  const myRank = useMemo(() => {
    if (!uid || !dailyEntries) return null;
    return dailyEntries.find(u => u.uid === uid) || null;
  }, [dailyEntries, uid]);

  // Actions
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
    const h = parseInt(editH, 10);
    const a = parseInt(editA, 10);
    if (isNaN(h) || isNaN(a)) { setToast('Enter valid scores'); return; }
    setSaving(true);
    try {
      const matchId = String(pred.matchId || editingId);
      const matchDate = pred.matchDate || selDate;
      await savePredictionAction(uid, displayName, { ...pred, id: editingId, matchId, matchDate }, h, a);
      setEditingId(null);
      setEditH('');
      setEditA('');
      setToast(`${h}-${a} saved`);
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
      const oldVote = currentVotes[matchId];
      if (oldVote === vote) {
        await removeZokaVote(uid, matchId, null);
        if (isToday) {
          const key = `zoka_votes_${selDate}`;
          const existing = JSON.parse(localStorage.getItem(key) || '{}');
          delete existing[matchId];
          localStorage.setItem(key, JSON.stringify(existing));
        }
      } else {
        await saveZokaVote(uid, matchId, vote);
      }
    } catch (e) { console.error('[Pred] Vote err:', e); }
    setVotingId(null);
  };

  const handleDateChange = (d) => {
    setSelDate(d);
    setFilter('all');
    setZokaExpanded(false);
    cancelEdit();
  };

  return (
    <div className="v20-page">
      <SEO
        title="Expert Football Predictions & Tips | ZOKASCORE"
        description="Access accurate football predictions and expert betting tips. Analyze stats and make informed decisions with our daily match predictions on ZOKASCORE."
        keywords="football predictions, betting tips, match predictions, soccer tips"
        path="/predictions"
        robots="index,follow"
      />

      <div className="v20-hdr">
        <div className="v20-wrap">
          <div className="v20-hdr-inner">
            <button className="v20-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={12} /> Home</button>
            <div className="v20-hdr-title"><Target size={13} /> Predictions</div>
            <button className="v20-hdr-btn" onClick={() => setShowResults(true)}><BarChart3 size={12} /> Results</button>
          </div>
        </div>
      </div>

      <div className="v20-dsk">
        <div className="v20-wrap">
          <DateStrip date={selDate} onChange={handleDateChange} dates={dateList} hasDataMap={hasDataMap} />
        </div>
      </div>

      <div className="v20-wrap">
        {/* ★ User Stats (reactive from context) */}
        {loggedIn && (
          <div style={{ marginBottom: 16, animation: 'v20-fade-up .4s ' + SMOOTH + ' both' }}>
            <div className="v20-stats">
              <div className="v20-stat"><div className="n" style={{ color: '#a855f7' }}><AnimNum value={myDayStats.pts} /></div><div className="l">Points</div></div>
              <div className="v20-stat"><div className="n" style={{ color: 'var(--accent)' }}><AnimNum value={myDayStats.ex} /></div><div className="l">Exact</div></div>
              <div className="v20-stat"><div className="n" style={{ color: 'var(--gold)' }}><AnimNum value={myDayStats.rs} /></div><div className="l">Result</div></div>
              <div className="v20-stat"><div className="n" style={{ color: '#ef4444' }}><AnimNum value={myDayStats.mi} /></div><div className="l">Miss</div></div>
              <div className="v20-stat"><div className="n">{myDayStats.accuracy}%</div><div className="l">Accuracy</div></div>
              <div className="v20-stat"><div className="n">{myDayStats.pred}/{mergedFeatured.length}</div><div className="l">Predicted</div></div>
            </div>
            {myDayStats.pred > 0 && (
              <div className="v20-progress">
                <div className="v20-progress-bar"><div className="v20-progress-fill" style={{ width: `${((myDayStats.pred - myDayStats.pn) / myDayStats.pred) * 100}%`, background: myDayStats.allResolved ? 'var(--accent)' : 'linear-gradient(90deg,var(--accent),#34d399)' }} /></div>
                <div className="v20-progress-labels"><span>{myDayStats.pred} predicted</span><span>{myDayStats.allResolved ? '✓ Complete' : `${myDayStats.pn} pending`}</span></div>
              </div>
            )}
            {myRank && (
              <div className="v20-rank" style={{ marginTop: 10 }}>
                <div className="v20-rank-inner">
                  <Trophy size={18} style={{ color: 'var(--gold)' }} />
                  <div>
                    <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>Rank #{myRank.rank}</div>
                    <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>{myRank.points} pts · {myRank.accuracy}%</div>
                  </div>
                  <button className="v20-rank-btn" onClick={() => nav('/leaderboard')}>Board <ChevronRight size={10} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filter */}
        <div className="v20-filter">
          {[
            { key: 'all', label: 'All', count: filterCounts.all },
            { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
            { key: 'unpredicted', label: 'Open', count: filterCounts.unpredicted },
            { key: 'finished', label: 'Finished', count: filterCounts.finished },
          ].map(f => (
            <button key={f.key} className={`v20-fbtn${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* ★ Zoka Picks — Top 5 + Show More */}
        {mergedZoka.length > 0 && (
          <div className="v20-zoka">
            <div className="v20-zoka-hd">
              <div className="v20-zoka-icon"><Star size={14} style={{ color: 'var(--gold)' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 900, color: 'var(--text-primary)' }}>Zoka Picks</div>
                <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: 1 }}>
                  {mergedZoka.length} picks · Not for competition
                </div>
              </div>
            </div>
            {visibleZoka.map((pick, i) => (
              <ZokaPickCard
                key={pick.matchId || i}
                pick={pick}
                index={i}
                voteStats={currentVoteStats}
                userVote={currentVotes}
                onVote={handleVote}
                votingId={votingId}
              />
            ))}
            {hiddenZokaCount > 0 && !zokaExpanded && (
              <button className="v20-zoka-more" onClick={() => setZokaExpanded(true)}>
                <ChevronDown size={14} /> Show {hiddenZokaCount} More
              </button>
            )}
            {zokaExpanded && hiddenZokaCount > 0 && (
              <button className="v20-zoka-more" onClick={() => setZokaExpanded(false)}>
                <ChevronUp size={14} /> Show Less
              </button>
            )}
          </div>
        )}

        {/* ★ Featured Matches */}
        <div style={{ animation: 'v20-fade-up .3s ' + SMOOTH + ' both' }}>
          <div className="v20-sec">
            <div className="v20-sec-icon" style={{ background: 'rgba(0,230,118,.08)', border: '1.5px solid rgba(0,230,118,.18)', color: 'var(--accent)' }}><Target size={13} /></div>
            <span>Featured — Compete</span>
            <span className="v20-sec-badge" style={{ background: 'rgba(0,230,118,.08)', color: 'var(--accent)', border: '1px solid rgba(0,230,118,.18)' }}>{filteredPreds.length}</span>
          </div>

          {currentLoading ? (
            <div>{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} />)}</div>
          ) : filteredPreds.length > 0 ? (
            filteredPreds.map((pred, i) => (
              <PredCard
                key={pred.id || String(pred.matchId) || i}
                pred={pred}
                index={i}
                userPred={userPredMap.get(pred.id) || userPredMap.get(String(pred.matchId))}
                result={resultMap.get(String(pred.matchId))}
                isEditing={editingId === (pred.id || String(pred.matchId))}
                editH={editH}
                editA={editA}
                onEdit={startEdit}
                onSave={savePrediction}
                onCancel={cancelEdit}
                onQuickPick={quickPick}
                onEditH={setEditH}
                onEditA={setEditA}
                loggedIn={loggedIn}
                onLogin={() => setShowLogin(true)}
                saving={saving}
                now={now}
              />
            ))
          ) : (
            <div className="v20-empty">
              <Target size={20} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />
              <p>{filter === 'predicted' ? 'No predictions yet' : filter === 'finished' ? 'No finished matches' : filter === 'unpredicted' ? 'All predicted!' : 'No featured matches'}</p>
              <p className="h">{filter === 'all' ? 'Check back later' : 'Try another filter'}</p>
            </div>
          )}
        </div>

        {/* All Resolved Banner */}
        {myDayStats.allResolved && myDayStats.pred > 0 && (
          <div className="v20-rank" style={{ marginTop: 16, textAlign: 'center' }}>
            <Trophy size={24} style={{ color: 'var(--accent)', marginBottom: 8 }} />
            <div style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: 3 }}>All Results In!</div>
            <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 12 }}>
              You scored <strong style={{ color: '#a855f7' }}>{myDayStats.pts} pts</strong> · {myDayStats.accuracy}% accuracy
            </div>
            <button className="v20-b v20-bp" onClick={() => nav('/leaderboard')}>View Leaderboard <ArrowRight size={13} /></button>
          </div>
        )}
      </div>

      <SaveToast show={!!toast} score={toast} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} nav={nav} />}
      {showResults && (
        <ResultsOverlay
          date={selDate}
          preds={mergedFeatured}
          userPredsObj={currentUserPreds}
          results={currentResults}
          onClose={() => setShowResults(false)}
          nav={nav}
        />
      )}
    </div>
  );
}