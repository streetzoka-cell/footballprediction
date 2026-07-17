// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/Predictions.jsx
// v21.1 — Fixed initialization order + Glass UI + Viral Share & Earn
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Clock, CheckCircle2, TrendingUp, Target, BarChart3,
  Star, Save, Trophy, Lock, LogIn, ChevronDown, ChevronRight,
  ChevronUp, ChevronLeft, Minus, X, ArrowRight, ArrowLeft,
  Plus, CircleX, CircleCheck, ThumbsUp, ThumbsDown,
  Pencil, Share2, Zap
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { dataLayer } from '../utils/dataLayer';
import { todayStr, getLocalDateStr } from '../utils/dates';
import { calcPoints, SPORT, isLiveStatus, isFinishedStatus } from '../utils/constants';
import { savePrediction as savePredictionAction, saveZokaVote, removeZokaVote, resolveMatchForAllUsers } from '../hooks/useMatchData';
import { fetchFixtures } from '../utils/api';
import { db } from '../utils/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════ */
const FUTURE_DAYS = 3;
const LOCK_BEFORE_MINUTES = 60;
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
  { h: 1, a: 0 }, { h: 2, a: 1 }, { h: 0, a: 0 }, { h: 1, a: 1 },
  { h: 2, a: 0 }, { h: 0, a: 1 }, { h: 3, a: 1 }, { h: 1, a: 2 },
];

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
        return { locked: true, reason: diffMins <= 0 ? 'started' : 'closing', minutesLeft: Math.floor(diffMins) };
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
  try { return new Date(kickoff).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  catch { return '--:--'; }
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
   STYLES
   ═══════════════════════════════════════════════════ */
const injectCSS = () => {
  if (document.getElementById('pred-v21')) return;
  const s = document.createElement('style');
  s.id = 'pred-v21';
  s.textContent = `
@keyframes v21-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes v21-pop{0%{transform:scale(.92);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
@keyframes v21-shimmer{0%{background-position:-300% 0}100%{background-position:300% 0}}
@keyframes v21-toast{0%{opacity:0;transform:translateX(-50%) translateY(12px)}10%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
@keyframes v21-pulse-live{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(2)}}
@keyframes v21-zoka-glow{0%,100%{border-color:rgba(245,197,66,.12)}50%{border-color:rgba(245,197,66,.28)}}
@keyframes v21-edit-ring{0%,100%{border-color:rgba(0,230,118,.2)}50%{border-color:rgba(0,230,118,.4)}}
@keyframes v21-date-glow{0%,100%{box-shadow:0 0 8px rgba(0,230,118,.12)}50%{box-shadow:0 0 16px rgba(0,230,118,.25)}}
@keyframes v21-overlay{from{opacity:0}to{opacity:1}}
@keyframes v21-box-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes v21-shine{0%{left:-100%}100%{left:200%}}

.v21-page{min-height:100vh;background:radial-gradient(circle at top right,#1e293b,#0a0f1a);padding-bottom:100px;color:#f8fafc;font-weight:600;overflow-x:hidden}
.v21-wrap{max-width:640px;margin:0 auto;padding:0 16px;position:relative;z-index:1}

.v21-hdr{position:sticky;top:0;z-index:100;padding:12px 0;backdrop-filter:blur(20px) saturate(1.8);-webkit-backdrop-filter:blur(20px) saturate(1.8);background:rgba(10,15,26,.78);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px}
.v21-hdr-title{display:flex;flex-direction:column;gap:2px}
.v21-hdr-title h1{margin:0;font-size:1.25em;font-weight:900;letter-spacing:-.02em;display:flex;align-items:baseline;gap:2px}
.v21-hdr-title .sub{font-size:.7em;color:#cbd5e1;font-weight:700}
.v21-hdr-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 12px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#cbd5e1;font-size:.74rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit;-webkit-tap-highlight-color:transparent}
.v21-hdr-btn:hover{color:#fff;border-color:rgba(255,255,255,0.16)}

.v21-dsk{position:sticky;top:60px;z-index:99;padding:10px 0 12px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);background:rgba(10,15,26,.78);border-bottom:1px solid rgba(255,255,255,0.06);margin:0 -16px;padding-left:16px;padding-right:16px}
.v21-ds{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;padding:2px 0}
.v21-ds::-webkit-scrollbar{display:none}
.v21-dc{flex-shrink:0;scroll-snap-align:center;position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 11px;border-radius:10px;border:1px solid transparent;background:transparent;color:#94a3b8;cursor:pointer;transition:all .18s;font-family:inherit;min-width:46px;-webkit-tap-highlight-color:transparent}
.v21-dc:hover{color:#fff;background:rgba(255,255,255,.03);border-color:rgba(255,255,255,0.08)}
.v21-dc .dn{font-size:.56rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;opacity:.6}
.v21-dc .dd{font-size:.92rem;font-weight:900;line-height:1}
.v21-dc .dm{font-size:.48rem;font-weight:700;opacity:.4}
.v21-dc.on{background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(16,185,129,.04));color:#10b981;border-color:rgba(16,185,129,.25)}
.v21-dc.on .dn{opacity:1;color:#10b981}
.v21-dc.on .dd{transform:scale(1.1);transition:transform .18s ${SPRING}}
.v21-dc.today:not(.on){border-color:rgba(245,197,66,.18);color:#f5c542}
.v21-dc.today.on{animation:v21-date-glow 2.5s ease-in-out infinite}
.v21-dc.past{opacity:.45}
.v21-dmore{flex-shrink:0;display:flex;align-items:center;gap:4px;padding:7px 10px;border-radius:10px;border:1px dashed rgba(255,255,255,0.08);background:transparent;color:#94a3b8;font-size:.6rem;font-weight:700;cursor:pointer;transition:all .18s;font-family:inherit;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.v21-dmore:hover{border-color:#10b981;color:#10b981}

.v21-banner{background:linear-gradient(135deg,rgba(16,185,129,0.1),rgba(59,130,246,0.05));border:1px solid rgba(16,185,129,0.2);border-radius:16px;padding:18px;margin:16px 0;display:flex;flex-direction:column;gap:14px;animation:v21-fade-up .4s ease both;backdrop-filter:blur(8px)}
.v21-banner.login-banner{background:linear-gradient(135deg,rgba(59,130,246,0.06),rgba(168,85,247,0.04));border-color:rgba(59,130,246,0.18)}
.v21-banner-text{font-size:.82em;font-weight:700;color:#fff;line-height:1.4;display:flex;align-items:center;gap:8px}
.v21-banner-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:900;font-size:.85em;border:none;cursor:pointer;transition:transform .2s;box-shadow:0 4px 16px rgba(16,185,129,0.3);text-decoration:none}
.v21-banner-btn:hover{transform:translateY(-2px)}
.v21-banner-btn.blue{background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 4px 16px rgba(59,130,246,0.3)}
.v21-banner-btn.secondary{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;box-shadow:none;margin-top:16px}

.v21-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;animation:v21-fade-up .4s ${SMOOTH} both}
.v21-stat{background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:10px 4px;text-align:center}
.v21-stat .n{font-size:1.1em;font-weight:900;font-family:var(--font-display,system-ui);line-height:1}
.v21-stat .l{font-size:.5em;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

.v21-progress{margin-bottom:10px}
.v21-progress-bar{height:4px;border-radius:2px;background:rgba(255,255,255,0.04);overflow:hidden}
.v21-progress-fill{height:100%;border-radius:2px;transition:width .5s ${SMOOTH};background:linear-gradient(90deg,#10b981,#34d399)}
.v21-progress-labels{display:flex;justify-content:space-between;font-size:.6rem;font-weight:700;color:#94a3b8;margin-top:3px}

.v21-rank{background:linear-gradient(135deg,rgba(16,185,129,.04),rgba(16,185,129,.01));border:1.5px solid rgba(16,185,129,.15);border-radius:14px;padding:14px;position:relative;overflow:hidden;animation:v21-pop .4s ${SPRING} both}
.v21-rank::before{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(16,185,129,.05),transparent);animation:v21-shine 4s ease-in-out infinite}
.v21-rank-inner{position:relative;z-index:1;display:flex;align-items:center;gap:12px}
.v21-rank-btn{margin-left:auto;display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;background:rgba(245,197,66,.06);border:1.5px solid rgba(245,197,66,.16);color:#f5c542;font-weight:800;font-size:.72rem;cursor:pointer;transition:all .15s;font-family:inherit;text-decoration:none}
.v21-rank-btn:hover{background:rgba(245,197,66,.1);border-color:rgba(245,197,66,.28)}

.v21-filter{display:flex;gap:4px;overflow-x:auto;padding:0 0 12px;scrollbar-width:none;margin-bottom:2px}
.v21-filter::-webkit-scrollbar{display:none}
.v21-fbtn{flex-shrink:0;padding:6px 12px;border-radius:8px;font-size:.7rem;font-weight:700;border:1px solid rgba(255,255,255,0.08);background:transparent;color:#94a3b8;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:inherit}
.v21-fbtn:hover{background:rgba(255,255,255,.03);color:#fff}
.v21-fbtn.on{background:rgba(16,185,129,.07);border-color:rgba(16,185,129,.2);color:#10b981}

.v21-zoka{background:linear-gradient(135deg,rgba(245,197,66,.03) 0%,transparent 60%);border:1.5px solid rgba(245,197,66,.1);border-radius:14px;padding:14px;margin-bottom:16px;overflow:hidden;animation:v21-fade-up .4s ${SMOOTH} both}
.v21-zoka-hd{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.v21-zoka-icon{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,rgba(245,197,66,.12),rgba(245,197,66,.04));border:1.5px solid rgba(245,197,66,.22);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.v21-zoka-more{width:100%;padding:10px;border-radius:10px;border:1.5px dashed rgba(245,197,66,.2);background:transparent;color:#f5c542;font-weight:800;font-size:.76rem;cursor:pointer;transition:all .15s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px}
.v21-zoka-more:hover{background:rgba(245,197,66,.04);border-color:rgba(245,197,66,.35)}

.v21-mc{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:14px;background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);margin-bottom:8px;transition:all .25s cubic-bezier(.22,1,.36,1);animation:v21-fade-up .3s ${SMOOTH} both;position:relative;overflow:hidden}
.v21-mc:hover{background:rgba(30,41,59,0.5)}
.v21-mc.zoka{background:linear-gradient(135deg,rgba(245,197,66,.03),rgba(245,197,66,.005));border-color:rgba(245,197,66,.12)}
.v21-mc.zoka.pending{animation:v21-zoka-glow 2.5s ease-in-out infinite}
.v21-mc.live{border-color:rgba(239,68,68,.3);animation:v21-pulse-live 2.5s ease-in-out infinite}
.v21-mc.finished{opacity:.85}
.v21-mc.editing{border-color:rgba(16,185,129,.3);animation:v21-edit-ring 2s ease-in-out infinite}
.v21-mc.locked{border-color:rgba(96,165,250,.15)}
.v21-mc.missed{opacity:.5}

.v21-mh{display:flex;align-items:center;justify-content:space-between;gap:8px}
.v21-ml{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
.v21-ml img{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
.v21-ml span{font-size:.62rem;font-weight:700;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v21-st{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:.58rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;flex-shrink:0}

.v21-tm{display:flex;align-items:center;gap:6px}
.v21-te{flex:1;display:flex;align-items:center;gap:7px;min-width:0}
.v21-te.aw{flex-direction:row-reverse;text-align:right}
.v21-te img{width:22px;height:22px;border-radius:6px;object-fit:contain;flex-shrink:0;background:rgba(255,255,255,.03);padding:2px}
.v21-te span{font-size:.8rem;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.v21-sb{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:8px;min-width:70px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,0.06)}
.v21-sb.live{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.15)}
.v21-sb.ft{background:rgba(16,185,129,.04);border-color:rgba(16,185,129,.1)}
.v21-sn{font-size:1rem;font-weight:900;font-family:var(--font-display,monospace);font-variant-numeric:tabular-nums;color:#fff}
.v21-sp{color:#64748b;font-size:.7rem;font-weight:700;opacity:.25}
.v21-vs{font-size:.62rem;font-weight:800;color:#64748b;opacity:.4;letter-spacing:.1em}

.v21-ma{display:flex;align-items:center;gap:5px;justify-content:flex-end;flex-wrap:wrap}

.v21-lock-timer{display:inline-flex;align-items:center;gap:4px;font-size:.6rem;font-weight:700;color:#60a5fa;padding:2px 7px;border-radius:5px;background:rgba(96,165,250,.08);border:1px solid rgba(96,165,250,.15)}

.v21-b{padding:7px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;min-height:34px;font-family:inherit;-webkit-tap-highlight-color:transparent;text-decoration:none}
.v21-b:active{transform:scale(.96)}.v21-b:disabled{opacity:.25;pointer-events:none}
.v21-bp{background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 10px rgba(16,185,129,.2)}
.v21-bp:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(16,185,129,.25)}
.v21-bgh{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,0.1);color:#fff}
.v21-bgh:hover{background:rgba(255,255,255,.06)}
.v21-bsm{padding:5px 10px;font-size:.66rem;min-height:30px;border-radius:7px;gap:4px}
.v21-bbl{background:transparent;border:1px solid rgba(96,165,250,.2);color:#60a5fa}
.v21-bbl:hover{background:rgba(96,165,250,.06);border-color:rgba(96,165,250,.35)}
.v21-bshare{background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.2);color:#a855f7}
.v21-bshare:hover{background:rgba(168,85,247,.12);border-color:rgba(168,85,247,.35)}

.v21-bdg{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:.6rem;font-weight:800;white-space:nowrap}
.v21-bdg.ex{background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3)}
.v21-bdg.rs{background:rgba(245,197,66,.06);color:#f59e0b;border:1px solid rgba(245,197,66,.15)}
.v21-bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.12)}
.v21-bdg.pn{background:rgba(255,255,255,.02);color:#94a3b8;border:1px solid rgba(255,255,255,0.06)}
.v21-bdg.bl{background:rgba(96,165,250,.06);color:#60a5fa;border:1px solid rgba(96,165,250,.18)}

.v21-si-wrap{display:flex;align-items:center;gap:8px}
.v21-step{width:32px;height:32px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s;padding:0}
.v21-step:hover{border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.1);color:#10b981}
.v21-step:active{transform:scale(.9)}
.v21-si{width:44px;height:36px;padding:0;border-radius:9px;background:rgba(15,23,42,0.6);border:1.5px solid rgba(16,185,129,.2);text-align:center;font-weight:900;font-size:1rem;outline:none;font-variant-numeric:tabular-nums;transition:all .15s;-webkit-appearance:none;font-family:var(--font-display,monospace);color:#fff}
.v21-si:focus{box-shadow:0 0 0 2px rgba(16,185,129,.1);border-color:rgba(16,185,129,.4)}
.v21-si::placeholder{color:#64748b;opacity:.4}

.v21-qp{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.v21-qp-btn{padding:6px 3px;border-radius:7px;font-size:.72rem;font-weight:900;font-family:var(--font-display);font-variant-numeric:tabular-nums;border:1.5px solid rgba(255,255,255,0.06);background:rgba(255,255,255,.02);color:#94a3b8;cursor:pointer;transition:all .12s;min-height:30px;text-align:center}
.v21-qp-btn:hover{border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.06);color:#10b981}
.v21-qp-btn:active{transform:scale(.93)}
.v21-qp-btn.sel{border-color:#10b981;background:rgba(16,185,129,.1);color:#10b981}

.v21-vote{display:inline-flex;align-items:center;gap:3px;padding:5px 10px;border-radius:7px;font-size:.68rem;font-weight:800;border:1.5px solid rgba(255,255,255,0.08);background:rgba(255,255,255,.02);color:#94a3b8;cursor:pointer;transition:all .15s;min-height:30px;flex:1;justify-content:center}
.v21-vote:active{transform:scale(.95)}
.v21-vote.agree-on{border-color:rgba(16,185,129,.25);background:rgba(16,185,129,.07);color:#10b981}
.v21-vote.disagree-on{border-color:rgba(239,68,68,.2);background:rgba(239,68,68,.05);color:#ef4444}
.v21-vote-bar{height:3px;border-radius:2px;background:rgba(255,255,255,.04);overflow:hidden;flex:1}
.v21-vote-fill{height:100%;border-radius:2px;transition:width .4s ${SMOOTH};background:#10b981}

.v21-skel{background:linear-gradient(90deg,rgba(30,41,59,0.2) 25%,rgba(255,255,255,0.05) 50%,rgba(30,41,59,0.2) 75%);background-size:200% 100%;animation:v21-shimmer 1.5s ease-in-out infinite;border-radius:14px;height:100px;margin-bottom:8px}

.v21-empty{padding:32px 20px;text-align:center;border:2px dashed rgba(255,255,255,0.08);border-radius:14px;background:rgba(255,255,255,0.02)}
.v21-empty p{color:#cbd5e1;font-size:.8rem;margin:0;font-weight:700}

.v21-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:9999;animation:v21-toast 2.5s ${SMOOTH} both;pointer-events:none}
.v21-toast-copy{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:12px 24px;border-radius:12px;font-weight:800;font-size:.8em;z-index:1000;box-shadow:0 10px 30px rgba(0,0,0,0.3)}

.v21-overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:v21-overlay .2s ease;padding:16px}
.v21-overlay-box{background:rgba(15,23,42,0.95);border:1px solid rgba(255,255,255,0.08);border-radius:16px;max-width:560px;width:100%;max-height:85vh;overflow-y:auto;animation:v21-box-up .3s ${SPRING} both;scrollbar-width:none}
.v21-overlay-box::-webkit-scrollbar{display:none}
.v21-overlay-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.1);margin:10px auto 0}
.v21-res-row{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);margin-bottom:5px}

.v21-sec{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.v21-sec span{font-size:.85rem;font-weight:900;color:#fff}
.v21-sec-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(16,185,129,.08);border:1.5px solid rgba(16,185,129,.18);color:#10b981}
.v21-sec-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:5px;font-size:.62rem;font-weight:900;background:rgba(16,185,129,.08);color:#10b981;border:1px solid rgba(16,185,129,.18)}

@media(max-width:640px){
  .v21-stats{grid-template-columns:repeat(4,1fr)}.v21-stat .n{font-size:1rem}.v21-stat{padding:10px 4px}
  .v21-qp{grid-template-columns:repeat(4,1fr)!important;gap:3px!important}.v21-qp-btn{padding:5px 2px;font-size:.68rem;min-height:28px}
  .v21-sb{min-width:60px;padding:4px 8px}.v21-sn{font-size:.88rem}.v21-te span{font-size:.74rem}.v21-te img{width:20px;height:20px}
  .v21-dc{padding:6px 9px;min-width:40px}.v21-dc .dd{font-size:.82rem}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════
   SMALL COMPONENTS
   ═══════════════════════════════════════════════════ */
function Skeleton() { return <div className="v21-skel" />; }

function ResultBadge({ result, isCalculating }) {
  if (isCalculating) return <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>;
  if (!result || result.resultType === 'pending') return <span className="v21-bdg pn"><Clock size={8} /> Pending</span>;
  if (result.resultType === 'exact') return <span className="v21-bdg ex"><CheckCircle2 size={8} /> Hit +{result.points || 10}</span>;
  if (result.resultType === 'result') return <span className="v21-bdg rs"><TrendingUp size={8} /> Won +{result.points || 3}</span>;
  return <span className="v21-bdg ms"><CircleX size={8} /> Missed</span>;
}

function SaveToast({ show, score }) {
  if (!show) return null;
  return (
    <div className="v21-toast">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, background: 'rgba(16,185,129,.1)', border: '1.5px solid rgba(16,185,129,.25)', backdropFilter: 'blur(12px)' }}>
        <CircleCheck size={15} style={{ color: '#10b981' }} />
        <span style={{ fontSize: '.82rem', fontWeight: 800, color: '#10b981' }}>{score}</span>
      </div>
    </div>
  );
}

function LoginModal({ onClose, nav }) {
  return (
    <div onClick={onClose} className="v21-overlay" style={{ zIndex: 9999 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'rgba(15,23,42,0.95)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '24px 20px', maxWidth: 340, width: '100%', textAlign: 'center', animation: 'v21-pop .3s ' + SPRING + ' both' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16,185,129,.08)', border: '1.5px solid rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#10b981' }}><LogIn size={22} /></div>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#fff', marginBottom: 6 }}>Login Required</div>
        <div style={{ fontSize: '.8rem', color: '#94a3b8', marginBottom: 18, lineHeight: 1.5 }}>Sign in to make predictions and compete on the leaderboard.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="v21-b v21-bgh" style={{ flex: 1, minHeight: 44 }}>Cancel</button>
          <button onClick={() => { onClose(); nav('/login'); }} className="v21-b v21-bp" style={{ flex: 1, minHeight: 44 }}>Log In</button>
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
    <div className="v21-ds" ref={stripRef}>
      {visibleDates.map(d => {
        const isToday = d === today;
        const isPast = d < today;
        const isActive = d === date;
        const hasData = hasDataMap?.[d];
        return (
          <button key={d} data-date={d} className={`v21-dc${isActive ? ' on' : ''}${isToday ? ' today' : ''}${isPast && !isActive ? ' past' : ''}`} onClick={() => onChange(d)}>
            <span className="dn">{dateDayName(d)}</span>
            <span className="dd">{dateDayNum(d)}</span>
            <span className="dm">{dateMonth(d)}</span>
            {hasData && !isActive && <span style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: '50%', background: '#10b981', opacity: .5 }} />}
          </button>
        );
      })}
      {!expanded && dates.length > 8 && (
        <button className="v21-dmore" onClick={() => setExpanded(true)}><ChevronRight size={10} /> More</button>
      )}
      {expanded && (
        <button className="v21-dmore" onClick={() => setExpanded(false)}><ChevronLeft size={10} /> Less</button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   SCORE STEPPER (Glass UI)
   ═══════════════════════════════════════════════════ */
function ScoreStepper({ value, onChange }) {
  const num = value === '' || value == null ? null : parseInt(value, 10);
  const display = num != null && !isNaN(num) ? num : '';
  return (
    <div className="v21-si-wrap">
      <button className="v21-step" onClick={() => onChange(String(Math.max(0, (num || 0) - 1)))}><Minus size={12} /></button>
      <input className="v21-si" value={display} onChange={e => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))} placeholder="?" maxLength={2} />
      <button className="v21-step" onClick={() => onChange(String(Math.min(99, (num || 0) + 1)))}><Plus size={12} /></button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ZOKA PICK CARD
   ═══════════════════════════════════════════════════ */
function ZokaPickCard({ pick, index, voteStats, userVote, onVote, votingId, onShare }) {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
  const isLive = isLiveStatus(pick.status, SPORT.FOOTBALL);

  const res = useMemo(() => {
    if (pick.adminPick && isFin && pick.homeScore != null) {
      const r = calcPoints(pick.adminPick.home, pick.adminPick.away, pick.homeScore, pick.awayScore);
      return { ...r, resultType: r.type };
    }
    return null;
  }, [pick.adminPick, isFin, pick.homeScore, pick.awayScore]);

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
  if (res?.resultType === 'exact') leftColor = '#10b981';
  else if (res?.resultType === 'result') leftColor = '#f5c542';
  else if (res?.resultType === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(16,185,129,.2)';

  const cardCls = `v21-mc zoka${!isFin && !isLive ? ' pending' : ''}${isLive ? ' live' : ''}${isFin ? ' finished' : ''}`;

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 30}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka Pick'}</span>
        </div>
        <span className="v21-st" style={{ color: isFin ? '#10b981' : isLive ? '#ef4444' : '#94a3b8', background: isFin ? 'rgba(16,185,129,.08)' : isLive ? 'rgba(239,68,68,.1)' : 'rgba(255,255,255,.04)' }}>
          {isFin ? 'FT' : isLive ? (pick.minute || 'LIVE') : kickoff}
        </span>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        {isFin && pick.homeScore != null ? (
          <div className="v21-sb ft">
            <span className="v21-sn" style={{ color: '#10b981' }}>{pick.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#10b981' }}>{pick.awayScore}</span>
          </div>
        ) : isLive && pick.homeScore != null ? (
          <div className="v21-sb live">
            <span className="v21-sn" style={{ color: '#ef4444' }}>{pick.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#ef4444' }}>{pick.awayScore}</span>
          </div>
        ) : (
          <div className="v21-sb">
            <span className="v21-sn" style={{ color: '#f5c542' }}>{pick.adminPick?.home ?? '?'}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#f5c542' }}>{pick.adminPick?.away ?? '?'}</span>
          </div>
        )}
        <div className="v21-te aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="v21-ma" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
          {isFin && res && res.resultType !== 'pending' && <ResultBadge result={res} />}
          {isFin && (!res || res.resultType === 'pending') && <span className="v21-bdg pn"><Clock size={8} /> Calc...</span>}
          {!isFin && !isLive && vs.total > 0 && (
            <>
              <button className={`v21-vote${myV === 'agree' ? ' agree-on' : ''}`} onClick={() => onVote(mid, 'agree')} disabled={isVoting}>
                <ThumbsUp size={11} /> {vs.agree || 0}
              </button>
              <div className="v21-vote-bar">
                <div className="v21-vote-fill" style={{ width: `${vs.total > 0 ? Math.round((vs.agree / vs.total) * 100) : 0}%` }} />
              </div>
              <button className={`v21-vote${myV === 'disagree' ? ' disagree-on' : ''}`} onClick={() => onVote(mid, 'disagree')} disabled={isVoting}>
                <ThumbsDown size={11} /> {vs.disagree || 0}
              </button>
            </>
          )}
        </div>
        <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pick, true)}>
          <Share2 size={10} /> Share
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   PREDICTION CARD
   ═══════════════════════════════════════════════════ */
function PredCard({ pred, index, userPred, result, isEditing, editH, editA, onEdit, onSave, onCancel, onQuickPick, onEditH, onEditA, loggedIn, onLogin, saving, now, onShare }) {
  const mid = pred.id || String(pred.matchId);
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL);
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL);
  const hasPred = !!userPred;

  const localResult = useMemo(() => {
    if (isFin && hasPred && pred.homeScore != null) {
      const r = calcPoints(userPred.homeScore, userPred.awayScore, pred.homeScore, pred.awayScore);
      return { ...r, resultType: r.type };
    }
    return null;
  }, [isFin, hasPred, pred.homeScore, pred.awayScore, userPred]);

  const effectiveResult = result || localResult;
  const isResolved = !!effectiveResult && effectiveResult.resultType !== 'pending';

  const lockInfo = isMatchLocked(pred, now);
  const isLocked = lockInfo.locked;

  const homeLogo = pred.homeLogo || pred.homeTeam?.logo || pred.homeTeam?.crest;
  const awayLogo = pred.awayLogo || pred.awayTeam?.logo || pred.awayTeam?.crest;
  const homeName = typeof pred.homeTeam === 'object' ? (pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home') : (pred.homeTeam || 'Home');
  const awayName = typeof pred.awayTeam === 'object' ? (pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away') : (pred.awayTeam || 'Away');
  const kickoff = parseKickoffTime(pred.kickoff || pred.date);

  let leftColor = 'rgba(255,255,255,0.06)';
  if (isResolved && effectiveResult?.resultType === 'exact') leftColor = '#10b981';
  else if (isResolved && effectiveResult?.resultType === 'result') leftColor = '#f5c542';
  else if (isResolved && effectiveResult?.resultType === 'miss') leftColor = '#ef4444';
  else if (isFin) leftColor = 'rgba(16,185,129,.2)';
  else if (isLive) leftColor = 'rgba(239,68,68,.3)';
  else if (hasPred) leftColor = '#60a5fa';
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90) leftColor = 'rgba(245,197,66,.3)';

  let cardCls = 'v21-mc';
  if (isEditing) cardCls += ' editing';
  else if (isLive) cardCls += ' live';
  else if (isFin) cardCls += ' finished';
  else if (isLocked && !hasPred) cardCls += ' locked';
  else if (isFin && !hasPred) cardCls += ' missed';

  let statusLabel = kickoff;
  let statusColor = '#94a3b8';
  let statusBg = 'rgba(255,255,255,.04)';
  if (isEditing) { statusLabel = 'EDITING'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.08)'; }
  else if (isLive) { statusLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; statusColor = '#ef4444'; statusBg = 'rgba(239,68,68,.1)'; }
  else if (isFin) { statusLabel = 'FT'; statusColor = '#10b981'; statusBg = 'rgba(16,185,129,.08)'; }
  else if (lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 60) { statusColor = '#f59e0b'; statusBg = 'rgba(245,158,11,.08)'; }

  return (
    <div className={cardCls} style={{ borderLeft: `3px solid ${leftColor}`, animationDelay: `${index * 20}ms` }}>
      <div className="v21-mh">
        <div className="v21-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Match'}</span>
        </div>
        <span className="v21-st" style={{ color: statusColor, background: statusBg }}>{statusLabel}</span>
      </div>
      <div className="v21-tm">
        <div className="v21-te">
          {homeLogo && <img src={homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{homeName}</span>
        </div>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ScoreStepper value={editH} onChange={onEditH} />
            <span style={{ color: '#64748b', fontWeight: 700, fontSize: '.7rem', opacity: .3 }}>–</span>
            <ScoreStepper value={editA} onChange={onEditA} />
          </div>
        ) : hasPred ? (
          <div className={`v21-sb${isFin ? ' ft' : ''}`} style={!isFin ? { borderColor: 'rgba(96,165,250,.2)', background: 'rgba(96,165,250,.05)' } : {}}>
            <span className="v21-sn" style={{ color: isFin ? '#10b981' : '#60a5fa' }}>{userPred.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: isFin ? '#10b981' : '#60a5fa' }}>{userPred.awayScore}</span>
          </div>
        ) : isFin && pred.homeScore != null ? (
          <div className="v21-sb ft">
            <span className="v21-sn" style={{ color: '#10b981' }}>{pred.homeScore}</span>
            <span className="v21-sp">–</span>
            <span className="v21-sn" style={{ color: '#10b981' }}>{pred.awayScore}</span>
          </div>
        ) : (
          <div className="v21-sb"><span className="v21-vs">VS</span></div>
        )}
        <div className="v21-te aw">
          {awayLogo && <img src={awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{awayName}</span>
        </div>
      </div>
      <div className="v21-ma" style={{ gap: 6, flexWrap: 'wrap' }}>
        {isEditing && (
          <div className="v21-qp" style={{ width: '100%' }}>
            {QUICK_PICKS.map((qp, qi) => (
              <button key={qi} className={`v21-qp-btn${editH === String(qp.h) && editA === String(qp.a) ? ' sel' : ''}`} onClick={() => onQuickPick(qp.h, qp.a)}>{qp.h}–{qp.a}</button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' }}>
          {isEditing ? (
            <>
              <button className="v21-b v21-bp v21-bsm" onClick={() => onSave(pred)} disabled={saving || !editH || !editA}><Save size={10} /> Save</button>
              <button className="v21-b v21-bgh v21-bsm" onClick={onCancel}><X size={10} /> Cancel</button>
            </>
          ) : isResolved ? (
            <>
              <ResultBadge result={effectiveResult} />
              <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pred, false)}><Share2 size={10} /> Share</button>
            </>
          ) : isFin && !hasPred ? (
            <span className="v21-bdg ms"><CircleX size={8} /> Missed</span>
          ) : isLocked && !isFin ? (
            <span className="v21-bdg pn"><Lock size={8} /> {lockInfo.reason === 'live' ? 'Live' : lockInfo.reason === 'closing' ? `${formatMinutesLeft(lockInfo.minutesLeft)} left` : 'Started'}</span>
          ) : hasPred ? (
            <>
              <span className="v21-bdg bl"><CheckCircle2 size={8} /> Saved</span>
              {!isLocked && <button className="v21-b v21-bbl v21-bsm" onClick={() => onEdit(pred)}><Pencil size={9} /> Edit</button>}
              <button className="v21-b v21-bshare v21-bsm" onClick={() => onShare(pred, false)}><Share2 size={10} /> Share</button>
            </>
          ) : lockInfo.minutesLeft != null && lockInfo.minutesLeft <= 90 ? (
            <span className="v21-lock-timer"><Clock size={9} /> {formatMinutesLeft(lockInfo.minutesLeft)}</span>
          ) : loggedIn ? (
            <button className="v21-b v21-bp v21-bsm" onClick={() => onEdit(pred)}><Target size={10} /> Predict</button>
          ) : (
            <button className="v21-b v21-bgh v21-bsm" onClick={onLogin}><LogIn size={10} /> Login</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RESULTS OVERLAY (Centered Modal)
   ═══════════════════════════════════════════════════ */
function ResultsOverlay({ date, preds, userPredsObj, results, onClose, nav }) {
  const overlayBoxRef = useRef(null);
  useEffect(() => { if (overlayBoxRef.current) overlayBoxRef.current.scrollTop = 0; }, []);

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
    let res = resMap.get(String(p.matchId));
    if ((!res || res.resultType === 'pending') && isFinishedStatus(p.status, SPORT.FOOTBALL) && p.homeScore != null) {
      const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
      res = { ...r, resultType: r.type };
    }
    if (!res || res.resultType === 'pending') { pending++; return; }
    if (res.resultType === 'exact') { exact++; totalPts += (res.points || 10); }
    else if (res.resultType === 'result') { result++; totalPts += (res.points || 3); }
    else miss++;
  });
  const allResolved = predicted > 0 && pending === 0;
  const accuracy = predicted > 0 ? Math.round(((exact + result) / predicted) * 100) : 0;

  return (
    <div className="v21-overlay" onClick={onClose}>
      <div className="v21-overlay-box" ref={overlayBoxRef} onClick={e => e.stopPropagation()}>
        <div className="v21-overlay-handle" />
        <div style={{ padding: '16px 18px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: '.95rem', fontWeight: 900, color: '#fff' }}>My Results</div>
              <div style={{ fontSize: '.68rem', color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>{dateLabel(date)}</div>
            </div>
            <button className="v21-b v21-bgh v21-bsm" onClick={onClose}><X size={14} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
            <div className="v21-stat"><div className="n" style={{ color: '#a855f7' }}><AnimNum value={totalPts} /></div><div className="l">Points</div></div>
            <div className="v21-stat"><div className="n" style={{ color: '#10b981' }}><AnimNum value={exact} /></div><div className="l">Exact</div></div>
            <div className="v21-stat"><div className="n" style={{ color: '#f5c542' }}><AnimNum value={result} /></div><div className="l">Result</div></div>
          </div>
          {predicted > 0 && (
            <div className="v21-progress" style={{ marginBottom: 12 }}>
              <div className="v21-progress-bar"><div className="v21-progress-fill" style={{ width: `${((predicted - pending) / predicted) * 100}%`, background: allResolved ? '#10b981' : 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
              <div className="v21-progress-labels"><span>{predicted} predicted</span><span>{allResolved ? '✓ Complete' : `${pending} pending`}</span></div>
            </div>
          )}
          {preds.map((p, i) => {
            const up = upMap.get(p.id) || upMap.get(String(p.matchId));
            if (!up) return null;
            let res = resMap.get(String(p.matchId));
            if ((!res || res.resultType === 'pending') && isFinishedStatus(p.status, SPORT.FOOTBALL) && p.homeScore != null) {
              const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
              res = { ...r, resultType: r.type };
            }
            const rType = res?.resultType;
            return (
              <div key={p.id} className="v21-res-row" style={{ animationDelay: `${i * 20}ms`, borderLeft: rType === 'exact' ? '3px solid #10b981' : rType === 'result' ? '3px solid #f5c542' : rType === 'miss' ? '3px solid #ef4444' : '3px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof p.homeTeam === 'object' ? p.homeTeam?.shortName || p.homeTeam?.name : p.homeTeam} vs {typeof p.awayTeam === 'object' ? p.awayTeam?.shortName || p.awayTeam?.name : p.awayTeam}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: '#60a5fa', fontSize: '.78rem', background: 'rgba(96,165,250,.06)', padding: '2px 6px', borderRadius: 5 }}>{up.homeScore}-{up.awayScore}</span>
                  {rType && rType !== 'pending' && <span className={`v21-bdg ${rType === 'exact' ? 'ex' : rType === 'result' ? 'rs' : 'ms'}`}>+{res.points || 0}</span>}
                </div>
              </div>
            );
          })}
          {predicted === 0 && (
            <div className="v21-empty" style={{ marginTop: 8 }}>
              <Target size={20} style={{ color: '#94a3b8', display: 'block', margin: '0 auto 6px' }} />
              <p>No predictions for this day</p>
            </div>
          )}
          {allResolved && (
            <div className="v21-rank" style={{ marginTop: 14, textAlign: 'center' }}>
              <Trophy size={22} style={{ color: '#10b981', marginBottom: 6 }} />
              <div style={{ fontSize: '.88rem', fontWeight: 900, color: '#fff', marginBottom: 3 }}>All Results In!</div>
              <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 600, marginBottom: 12 }}>You scored <strong style={{ color: '#a855f7' }}>{totalPts} pts</strong> · {accuracy}% accuracy</div>
              <button className="v21-b v21-bp" onClick={() => { onClose(); nav('/leaderboard'); }}>View Leaderboard <ArrowRight size={13} /></button>
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
  const location = useLocation();
  const uid = currentUser?.uid;
  const loggedIn = !!uid;
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Anonymous';
  const isAdmin = userProfile?.role === 'admin';

  const appData = useAppData();
  const {
    activePredictions: featuredPreds,
    zokaPicks,
    zokaVoteStats,
    userPredictions: ctxUserPreds,
    predictionResults: ctxPredResults,
    dailyEntries,
    userStats,
    loading: ctxLoading,
  } = appData;

  const [selDate, setSelDate] = useState(todayStr());
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [copyToast, setCopyToast] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [zokaExpanded, setZokaExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editH, setEditH] = useState('');
  const [editA, setEditA] = useState('');
  const [saving, setSaving] = useState(false);
  const [votingId, setVotingId] = useState(null);

  const [nonTodayData, setNonTodayData] = useState({ featured: null, zoka: null, userPreds: {}, results: [], votes: {} });
  const [nonTodayLoading, setNonTodayLoading] = useState(false);
  const mountedRef = useRef(true);
  const [liveFixtures, setLiveFixtures] = useState([]);

  const isToday = selDate === todayStr();

  /* ═══ DERIVED DATA (Moved up to fix initialization order) ═══ */
  const currentFeatured = isToday ? (featuredPreds || []) : (nonTodayData.featured || []);
  const currentZoka = isToday ? (zokaPicks?.matches || []) : (nonTodayData.zoka || []);
  const currentUserPreds = isToday ? (ctxUserPreds || {}) : (nonTodayData.userPreds || {});
  const currentResults = isToday ? (ctxPredResults?.results || []) : (nonTodayData.results || []);
  const currentVotes = isToday ? (appData.currentUserVotes || {}) : (nonTodayData.votes || {});
  const currentVoteStats = isToday ? (zokaVoteStats || {}) : (nonTodayData.voteStats || {});
  const currentLoading = isToday ? ctxLoading : nonTodayLoading;

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

  // Maps need to be initialized BEFORE handleShare
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

  // Stats need to be initialized BEFORE handleBannerShare
  const myDayStats = useMemo(() => {
    let pts = 0, ex = 0, rs = 0, mi = 0, pn = 0, pred = 0;
    mergedFeatured.forEach(p => {
      const up = userPredMap.get(p.id) || userPredMap.get(String(p.matchId));
      if (!up) return;
      pred++;
      let res = resultMap.get(String(p.matchId));
      if ((!res || res.resultType === 'pending') && isFinishedStatus(p.status, SPORT.FOOTBALL) && p.homeScore != null) {
        const r = calcPoints(up.homeScore, up.awayScore, p.homeScore, p.awayScore);
        res = { ...r, resultType: r.type };
      }
      if (!res || res.resultType === 'pending') { pn++; return; }
      if (res.resultType === 'exact') { ex++; pts += (res.points || 10); }
      else if (res.resultType === 'result') { rs++; pts += (res.points || 3); }
      else mi++;
    });
    return { pts, ex, rs, mi, pn, pred, allResolved: pred > 0 && pn === 0, accuracy: pred > 0 ? Math.round(((ex + rs) / pred) * 100) : 0 };
  }, [mergedFeatured, userPredMap, resultMap]);

  /* ═══ SHARE & EARN LOGIC ═══ */
  const handleShare = useCallback(async (pred, isZoka = false) => {
    if (!uid) { setShowLogin(true); return; }
    const baseUrl = window.location.origin;
    const matchId = pred.matchId || pred.id;
    const shareUrl = `${baseUrl}/predictions?match=${matchId}&ref=${uid}`;

    let homeName = 'Home', awayName = 'Away', scoreText = '';
    if (typeof pred.homeTeam === 'object') {
      homeName = pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home';
      awayName = pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away';
    } else {
      homeName = pred.homeTeam || 'Home';
      awayName = pred.awayTeam || 'Away';
    }
    if (isZoka) {
      scoreText = `${pred.adminPick?.home ?? '?'}-${pred.adminPick?.away ?? '?'}`;
    } else {
      const up = userPredMap.get(pred.id) || userPredMap.get(String(pred.matchId));
      if (up) scoreText = `${up.homeScore}-${up.awayScore}`;
    }

    const shareText = `My prediction for ${homeName} vs ${awayName} is ${scoreText || 'a draw'}! Think you can do better? Join me on ZokaScore: ${shareUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: 'ZokaScore Prediction', text: shareText, url: shareUrl });
        setToast('Shared! Earn points when friends visit.');
      } catch (err) { if (err.name !== 'AbortError') console.error('Share failed', err); }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 3000);
      } catch (e) { setToast('Copy failed. Please copy manually.'); }
    }
  }, [uid, setShowLogin, userPredMap]);

  // ★ VIRAL BANNER SHARE (overall stats)
  const handleBannerShare = useCallback(async () => {
    const total = userStats?.predicted || myDayStats.pred || 0;
    const correct = (userStats?.exact || myDayStats.ex || 0) + (userStats?.result || myDayStats.rs || 0);
    const points = userStats?.points || myDayStats.pts || 0;

    let shareText;
    if (total > 0) {
      shareText = `🔥 I predicted ${correct}/${total} matches and scored ${points} points! Think you can beat me?\n\nJoin me on ZOKASCORE: https://zokascore.xyz`;
    } else {
      shareText = `I'm predicting football matches live on ZOKASCORE! Think you can beat me?\n\nJoin now: https://zokascore.xyz`;
    }

    if (navigator.share) {
      try { await navigator.share({ title: 'ZOKASCORE', text: shareText, url: 'https://zokascore.xyz' }); }
      catch (err) { /* cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 3000);
      } catch (e) {}
    }
  }, [userStats, myDayStats]);

  // ★ REFERRAL VISIT TRACKING
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const referrer = params.get('ref');
    if (referrer) {
      let deviceId = localStorage.getItem('zk_device_id');
      if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
        localStorage.setItem('zk_device_id', deviceId);
      }
      const visitKey = `zk_ref_${referrer}_${deviceId}`;
      if (!localStorage.getItem(visitKey)) {
        localStorage.setItem(visitKey, '1');
        if (db) {
          setDoc(doc(db, 'referral_visits', visitKey), {
            referrerUid: referrer,
            visitorDeviceId: deviceId,
            visitorUid: uid || null,
            visitedAt: serverTimestamp(),
            status: 'pending'
          }).catch(e => console.error("Referral track err:", e));
        }
      }
    }
  }, [location.search, uid]);

  /* ═══ EFFECTS ═══ */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
    const interval = setInterval(loadLive, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isToday]);

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

  // ★ ADMIN AUTO-RESOLVER
  useEffect(() => {
    if (!isAdmin || !isToday || !liveFixtures.length) return;
    const toResolve = mergedFeatured.filter(p => {
      const fx = liveFixtures.find(f => String(f.id) === String(p.matchId));
      return fx && fx.isFinished && fx.homeScore != null && fx.awayScore != null;
    });
    toResolve.forEach(pred => {
      const fx = liveFixtures.find(f => String(f.id) === String(pred.matchId));
      const dbPred = currentFeatured.find(p => String(p.matchId) === String(pred.matchId));
      if (dbPred && dbPred.status !== 'finished') {
        console.log(`[AutoResolve] Admin triggering resolution for ${pred.matchId}`);
        resolveMatchForAllUsers(pred.matchId, fx.homeScore, fx.awayScore, pred.matchDate || todayStr());
      }
    });
  }, [isAdmin, isToday, liveFixtures, mergedFeatured, currentFeatured]);

  /* ═══ OTHER MEMOS ═══ */
  const dateList = useMemo(() => {
    const arr = [];
    for (let i = -14; i <= FUTURE_DAYS; i++) arr.push(dateOffset(i));
    return arr;
  }, []);

  const hasDataMap = useMemo(() => {
    const m = {};
    if (currentFeatured.length > 0) m[selDate] = true;
    if (currentZoka.length > 0) m[selDate] = true;
    return m;
  }, [currentFeatured, currentZoka, selDate]);

  const visibleZoka = useMemo(() => {
    if (mergedZoka.length <= ZOKA_VISIBLE_COUNT) return mergedZoka;
    return zokaExpanded ? mergedZoka : mergedZoka.slice(0, ZOKA_VISIBLE_COUNT);
  }, [mergedZoka, zokaExpanded]);
  const hiddenZokaCount = mergedZoka.length - ZOKA_VISIBLE_COUNT;

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

  const myRank = useMemo(() => {
    if (!uid || !dailyEntries) return null;
    return dailyEntries.find(u => u.uid === uid) || null;
  }, [dailyEntries, uid]);

  /* ═══ HANDLERS ═══ */
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
    <div className="v21-page">
      <SEO
        title="Predict Matches & Win | ZOKASCORE"
        description="Predict football matches, climb the leaderboard, and challenge your friends. Expert tips and live scoring."
        keywords="football predictions, betting tips, match predictions, soccer tips"
        path="/predictions"
        robots="index,follow"
      />

      {/* Copy Toast */}
      {copyToast && (
        <div className="v21-toast-copy">Copied to clipboard!</div>
      )}

      {/* Header */}
      <div className="v21-hdr">
        <button className="v21-hdr-btn" onClick={() => nav('/')}><ArrowLeft size={12} /> Home</button>
        <div className="v21-hdr-title">
          <h1>
            <span style={{ color: '#fff' }}>MATCH</span>
            <span style={{ color: '#10b981' }}>PREDICT</span>
          </h1>
          <div className="sub">Predict · Compete · Win</div>
        </div>
        <button className="v21-hdr-btn" onClick={() => setShowResults(true)}><BarChart3 size={12} /> Results</button>
      </div>

      {/* Date Strip */}
      <div className="v21-dsk">
        <div className="v21-wrap" style={{ padding: 0 }}>
          <DateStrip date={selDate} onChange={handleDateChange} dates={dateList} hasDataMap={hasDataMap} />
        </div>
      </div>

      <div className="v21-wrap">
        {/* Glass Stats Banner — Logged in users */}
        {loggedIn && (
          <div style={{ marginBottom: 16, animation: 'v21-fade-up .4s ' + SMOOTH + ' both' }}>
            <div className="v21-stats">
              <div className="v21-stat"><div className="n" style={{ color: '#fbbf24' }}><AnimNum value={myDayStats.pts} /></div><div className="l">Points</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#10b981' }}><AnimNum value={myDayStats.ex} /></div><div className="l">Exact</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#f5c542' }}><AnimNum value={myDayStats.rs} /></div><div className="l">Results</div></div>
              <div className="v21-stat"><div className="n" style={{ color: '#a855f7' }}>{myRank ? `#${myRank.rank}` : '—'}</div><div className="l">Rank</div></div>
            </div>
            {myDayStats.pred > 0 && (
              <div className="v21-progress" style={{ marginBottom: 10 }}>
                <div className="v21-progress-bar"><div className="v21-progress-fill" style={{ width: `${((myDayStats.pred - myDayStats.pn) / myDayStats.pred) * 100}%`, background: myDayStats.allResolved ? '#10b981' : 'linear-gradient(90deg,#10b981,#34d399)' }} /></div>
                <div className="v21-progress-labels"><span>{myDayStats.pred} predicted · {myDayStats.accuracy}% accuracy</span><span>{myDayStats.allResolved ? '✓ Complete' : `${myDayStats.pn} pending`}</span></div>
              </div>
            )}
            {myRank && (
              <div className="v21-rank" style={{ marginTop: 10 }}>
                <div className="v21-rank-inner">
                  <Trophy size={18} style={{ color: '#f5c542' }} />
                  <div>
                    <div style={{ fontSize: '.76rem', fontWeight: 700, color: '#fff' }}>Rank #{myRank.rank}</div>
                    <div style={{ fontSize: '.62rem', color: '#94a3b8', fontWeight: 600 }}>{myRank.points} pts · {myRank.accuracy}% accuracy</div>
                  </div>
                  <button className="v21-rank-btn" onClick={() => nav('/leaderboard')}>Board <ChevronRight size={10} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Viral Share Banner — for logged in users with predictions */}
        {loggedIn && myDayStats.pred > 0 && (
          <div className="v21-banner">
            <div className="v21-banner-text">
              <Trophy size={18} style={{ color: '#fbbf24', flexShrink: 0 }} />
              You've predicted {myDayStats.pred} matches today! Challenge your friends to beat your score.
            </div>
            <button className="v21-banner-btn" onClick={handleBannerShare}>
              <Share2 size={18} /> Share & Challenge Friends
            </button>
          </div>
        )}

        {/* Login Banner for guests */}
        {!loggedIn && (
          <div className="v21-banner login-banner">
            <div className="v21-banner-text">
              <Lock size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
              Sign in to lock in your predictions and climb the global leaderboard.
            </div>
            <Link to="/login" className="v21-banner-btn blue">
              <Zap size={18} /> Sign In to Predict
            </Link>
          </div>
        )}

        {/* Filters */}
        <div className="v21-filter">
          {[
            { key: 'all', label: 'All', count: filterCounts.all },
            { key: 'predicted', label: 'Predicted', count: filterCounts.predicted },
            { key: 'unpredicted', label: 'Open', count: filterCounts.unpredicted },
            { key: 'finished', label: 'Finished', count: filterCounts.finished },
          ].map(f => (
            <button key={f.key} className={`v21-fbtn${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Zoka Picks Section */}
        {mergedZoka.length > 0 && (
          <div className="v21-zoka">
            <div className="v21-zoka-hd">
              <div className="v21-zoka-icon"><Star size={14} style={{ color: '#f5c542' }} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 900, color: '#fff' }}>Zoka Picks</div>
                <div style={{ fontSize: '.6rem', fontWeight: 600, color: '#94a3b8', marginTop: 1 }}>
                  {mergedZoka.length} picks · Not for competition
                </div>
              </div>
            </div>
            {visibleZoka.map((pick, i) => (
              <ZokaPickCard key={pick.matchId || i} pick={pick} index={i} voteStats={currentVoteStats} userVote={currentVotes} onVote={handleVote} votingId={votingId} onShare={handleShare} />
            ))}
            {hiddenZokaCount > 0 && !zokaExpanded && (
              <button className="v21-zoka-more" onClick={() => setZokaExpanded(true)}>
                <ChevronDown size={14} /> Show {hiddenZokaCount} More
              </button>
            )}
            {zokaExpanded && hiddenZokaCount > 0 && (
              <button className="v21-zoka-more" onClick={() => setZokaExpanded(false)}>
                <ChevronUp size={14} /> Show Less
              </button>
            )}
          </div>
        )}

        {/* Featured Matches */}
        <div style={{ animation: 'v21-fade-up .3s ' + SMOOTH + ' both' }}>
          <div className="v21-sec">
            <div className="v21-sec-icon"><Target size={13} /></div>
            <span>Featured — Compete</span>
            <span className="v21-sec-badge">{filteredPreds.length}</span>
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
                onShare={handleShare}
              />
            ))
          ) : (
            <div className="v21-empty">
              <Target size={20} style={{ color: '#94a3b8', display: 'block', margin: '0 auto 6px' }} />
              <p>{filter === 'predicted' ? 'No predictions yet' : filter === 'finished' ? 'No finished matches' : filter === 'unpredicted' ? 'All predicted!' : 'No featured matches'}</p>
              <p className="h" style={{ fontSize: '.66rem', color: '#64748b', marginTop: 4 }}>{filter === 'all' ? 'Check back later' : 'Try another filter'}</p>
            </div>
          )}
        </div>

        {/* All results complete celebration */}
        {myDayStats.allResolved && myDayStats.pred > 0 && (
          <div className="v21-rank" style={{ marginTop: 16, textAlign: 'center' }}>
            <Trophy size={24} style={{ color: '#10b981', marginBottom: 8 }} />
            <div style={{ fontSize: '.9rem', fontWeight: 900, color: '#fff', marginBottom: 3 }}>All Results In!</div>
            <div style={{ fontSize: '.76rem', color: '#94a3b8', fontWeight: 600, marginBottom: 12 }}>
              You scored <strong style={{ color: '#a855f7' }}>{myDayStats.pts} pts</strong> · {myDayStats.accuracy}% accuracy
            </div>
            <button className="v21-b v21-bp" onClick={() => nav('/leaderboard')}>View Leaderboard <ArrowRight size={13} /></button>
          </div>
        )}

        {/* Secondary Share Button at bottom */}
        {loggedIn && myDayStats.pred > 0 && (
          <button className="v21-banner-btn secondary" style={{ marginTop: '20px' }} onClick={handleBannerShare}>
            <Share2 size={18} /> Share My Score Again
          </button>
        )}
      </div>

      <SaveToast show={!!toast} score={toast} />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} nav={nav} />}
      {showResults && (
        <ResultsOverlay date={selDate} preds={mergedFeatured} userPredsObj={currentUserPreds} results={currentResults} onClose={() => setShowResults(false)} nav={nav} />
      )}
    </div>
  );
}