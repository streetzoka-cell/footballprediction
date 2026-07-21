// ═══════════════════════════════════════════════════════════════════
// FILE: src/pages/Home.jsx
// ZOKA PRO — Mobile Perfect, Zero Mocks, Genius Loader, Date Filtered
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Zap, Users, Target, Trophy, CalendarDays, Flame,
  ChevronDown, WifiOff, LogIn, Star, CheckCircle, CheckCircle2,
  Clock, Lock, Crown, Activity, Medal, BarChart3, XCircle,
  ArrowUpRight, Sun, Moon, CloudSun, Timer, Gamepad2,
  TrendingUp as TrendIcon, ChevronRight, Newspaper, Radar
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { todayStr as getTodayStr, getLocalDateFromUtc, formatTime } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';
import { db } from '../utils/firebase';
import { collection, query, limit, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════
   CUSTOM HOOKS
   ═══════════════════════════════════════ */
function useNews() {
  const [posts, setPosts] = useState([]);
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'news_posts'), orderBy('createdAt', 'desc'), limit(8));
    const unsub = onSnapshot(q, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("News fetch error:", err));
    return () => unsub();
  }, [db]);
  return posts;
}

function useTotalUsers() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'users'), limit(1)))
      .then(s => { if (!s.empty) setCount(s.docs[0].data().totalUsers || null); })
      .catch(() => {});
  }, [db]);
  return count;
}

/* ═══════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════ */
const Sunset = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 10V2" /><path d="m4.93 10.93 1.41 1.41" /><path d="M2 18h2" /><path d="M20 18h2" /><path d="m19.07 10.93-1.41 1.41" /><path d="M22 22H2" />
    <path d="m16 6-4 4-4-4" /><path d="M16 18a4 4 0 0 0-8 0" />
  </svg>
);

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 5) return { text: 'Burning the midnight oil', icon: <Moon size={16} />, emoji: '🦉' };
  if (h < 12) return { text: 'Good morning', icon: <Sun size={16} />, emoji: '☀️' };
  if (h < 17) return { text: 'Good afternoon', icon: <CloudSun size={16} />, emoji: '🌤️' };
  if (h < 21) return { text: 'Good evening', icon: <Sunset size={16} />, emoji: '🌅' };
  return { text: 'Good night', icon: <Moon size={16} />, emoji: '🦉' };
};

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').substring(0, 60);

// ★ FIX: Extract date string to filter out old matches from backup API
function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  if (m.matchDate) return m.matchDate;
  return '';
}

function normalizeMatch(raw) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  return {
    id, status,
    dateStr: extractMatchDate(raw), // ★ FIX: Add dateStr for strict filtering
    isLive: raw.isLive || isLiveStatus(status, SPORT.FOOTBALL),
    isFinished: raw.isFinished || isFinishedStatus(status, SPORT.FOOTBALL),
    homeTeam: { name: raw.homeTeam?.name || 'TBD', shortName: raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD' },
    awayTeam: { name: raw.awayTeam?.name || 'TBD', shortName: raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD' },
    homeScore: raw.homeScore ?? null,
    awayScore: raw.awayScore ?? null,
    league: { name: raw.league?.name || raw.competition?.name || 'Other' },
    minute: raw.minute || raw.elapsed || null,
    kickoff: raw.kickoff || 'TBD'
  };
}

/* ═══════════════════════════════════════
   STYLES (Mobile Perfect, No Stretch, Genius Loader)
   ═══════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('home-zoka-mobile-perfect-css')) return;
  const s = document.createElement('style');
  s.id = 'home-zoka-mobile-perfect-css';
  s.textContent = `
    @keyframes zFadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes zPulse{0%,100%{opacity:1}50%{opacity:.4}}
    @keyframes zShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes zCta{0%,100%{box-shadow:0 4px 20px rgba(16,185,129,.15)}50%{box-shadow:0 4px 32px rgba(16,185,129,.3)}}
    @keyframes zNewsMarquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-50%); } }
    @keyframes zGoldShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes zRadarSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes zCardSlideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }

    .zoka-home{min-height:100vh;background:#05070a;overflow-x:hidden;-webkit-tap-highlight-color:transparent}
    .zoka-home-wrap{max-width:680px;margin:0 auto;padding:0 16px;position:relative}

    .z-hero{padding:36px 0 24px;position:relative;text-align:center;animation:zFadeUp .4s cubic-bezier(.22,1,.36,1) both}
    .z-title{font-size:2.6rem;font-weight:900;letter-spacing:-.04em;margin:0;line-height:1;background:linear-gradient(135deg,#ffffff,#94a3b8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .z-title span{background:linear-gradient(90deg, #10b981, #34d399, #10b981);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .z-sub{font-size:.85rem;font-weight:600;color:#64748b;margin:8px 0 0;display:flex;align-items:center;justify-content:center;gap:6px}
    .z-title-line{height:3px;width:80px;margin:16px auto 0;background:linear-gradient(90deg,#10b981,#34d399);border-radius:2px;transform-origin:center;animation:zFadeUp .8s cubic-bezier(.22,1,.36,1) both}

    .z-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0 24px}
    .z-chip{background:#0a0d14;border:1px solid #151b26;border-radius:14px;padding:12px 8px;text-align:center;transition:all .2s;position:relative;overflow:hidden}
    .z-chip:hover{border-color:rgba(16,185,129,.2);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
    .z-chip .val{font-size:1.2rem;font-weight:800;font-family:var(--font-display,system-ui);color:#fff;line-height:1;letter-spacing:-.02em}
    .z-chip .lbl{font-size:.58rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
    .z-chip .bar{height:3px;border-radius:2px;background:rgba(255,255,255,.04);margin-top:6px;overflow:hidden}
    .z-chip .bar-fill{height:100%;border-radius:2px}

    .z-sec{margin-bottom:28px}
    .z-sech{display:flex;align-items:center;gap:10px;margin-bottom:14px}
    .z-sech h2{margin:0;font-size:.95rem;font-weight:800;color:#f8fafc;white-space:nowrap;letter-spacing:-.01em}
    .z-sech-line{flex:1;height:1px;background:#151b26;border-radius:1px;min-width:10px}
    .z-sech-badge{font-size:.6rem;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}

    .z-strip-header{display:flex;align-items:center;gap:8px;margin-bottom:10px}
    .z-strip-title{font-size:.75rem;font-weight:800;display:flex;align-items:center;gap:5px;letter-spacing:.02em;white-space:nowrap}
    .z-strip-link{font-size:.65rem;font-weight:700;color:#64748b;text-decoration:none;display:flex;align-items:center;gap:3px;transition:color .15s;flex-shrink:0}
    .z-strip-link:hover{color:#10b981}
    
    .z-livestrip{display:flex;gap:10px;overflow-x:auto;padding:0 0 8px;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
    .z-livestrip::-webkit-scrollbar{display:none}
    
    /* ★ GENIUS LOADER ★ */
    .z-live-loader{min-width:180px;max-width:220px;flex-shrink:0;height:90px;background:linear-gradient(145deg, rgba(16,185,129,0.04), rgba(10,13,20,0.8));border:1px solid rgba(16,185,129,0.15);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;scroll-snap-align:start;position:relative;overflow:hidden}
    .z-loader-radar{width:28px;height:28px;border-radius:50%;border:2px solid rgba(16,185,129,.15);border-top-color:#10b981;animation:zRadarSpin 1s linear infinite}
    .z-loader-text{font-size:.62rem;font-weight:700;color:#10b981;display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.03em}
    .z-ldot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:zPulse 1.2s infinite;box-shadow:0 0 8px rgba(239,68,68,.6);flex-shrink:0}
    
    .z-livemini{min-width:180px;max-width:220px;flex:0 0 auto;padding:12px 14px;background:#0a0d14;border:1px solid #151b26;border-radius:14px;scroll-snap-align:start;transition:transform .15s,border-color .15s;animation:zCardSlideIn .4s cubic-bezier(.22,1,.36,1) both}
    .z-livemini:hover{transform:translateY(-2px);border-color:rgba(16,185,129,.2)}
    .z-lm-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px}
    .z-lm-league{font-size:.62rem;font-weight:700;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;text-transform:uppercase;letter-spacing:.03em}
    .z-lm-status{display:flex;align-items:center;gap:3px;background:rgba(239,68,68,.1);padding:2px 6px;border-radius:4px;flex-shrink:0}
    .z-lm-row{display:flex;align-items:center;gap:4px;margin-bottom:2px}
    .z-lm-name{flex:1;font-size:.72rem;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .z-lm-score{font-size:.85rem;font-weight:900;font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;flex-shrink:0}

    .z-mc{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:14px;background:#0a0d14;border:1px solid #151b26;margin-bottom:8px;transition:all .15s}
    .z-mc:hover{background:#0d1118;border-color:#1f2937}
    .z-mc.live{border-color:rgba(239,68,68,.3);box-shadow:0 0 12px rgba(239,68,68,.05)}
    .z-mc.ft{border-color:rgba(16,185,129,.2)}
    .z-mc.zoka{background:linear-gradient(135deg,rgba(251,191,36,.04),rgba(251,191,36,.01));border:1px solid rgba(251,191,36,.2);position:relative;overflow:hidden}
    .z-mc.zoka::before{content:'';position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(251,191,36,.05),transparent);animation:zShimmer 3s infinite}
    .z-mc.dim{opacity:.45}

    .z-mh{display:flex;align-items:center;justify-content:space-between;gap:6px}
    .z-ml{display:flex;align-items:center;gap:6px;min-width:0;flex:1}
    .z-ml img{width:14px;height:14px;border-radius:3px;object-fit:contain;flex-shrink:0}
    .z-ml span{font-size:.65rem;font-weight:700;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em}
    .z-st{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:.58rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;flex-shrink:0}

    .z-tm{display:flex;align-items:center;gap:8px}
    .z-te{flex:1;display:flex;align-items:center;gap:8px;min-width:0}
    .z-te.aw{flex-direction:row-reverse;text-align:right}
    .z-te img{width:24px;height:24px;border-radius:6px;object-fit:contain;flex-shrink:0}
    .z-te span{font-size:.8rem;font-weight:700;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}

    .z-sb{display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:10px;min-width:72px;justify-content:center;background:rgba(255,255,255,.02);border:1px solid #151b26;flex-shrink:0}
    .z-sb.lv{background:rgba(239,68,68,.06);border-color:rgba(239,68,68,.3);box-shadow:0 0 8px rgba(239,68,68,.05)}
    .z-sb.ft{background:rgba(16,185,129,.04);border-color:rgba(16,185,129,.2)}
    .z-sb.zk{background:rgba(251,191,36,.06);border-color:rgba(251,191,36,.3);box-shadow:0 0 8px rgba(251,191,36,.05)}
    .z-sn{font-size:.95rem;font-weight:900;font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;color:#f8fafc}
    .z-sn.r{color:#ef4444}.z-sn.g{color:#10b981}.z-sn.gd{color:#fbbf24}
    .z-sep{color:#475569;font-size:.75rem;font-weight:800;opacity:.5}
    .z-vs{font-size:.6rem;font-weight:800;color:#475569;opacity:.4;letter-spacing:.08em}

    .z-ma{display:flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    .z-btn{padding:7px 12px;border-radius:8px;font-size:.72rem;font-weight:800;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .15s;min-height:34px;font-family:inherit;-webkit-tap-highlight-color:transparent;text-decoration:none;color:inherit}
    .z-btn:active{transform:scale(.97)}
    .z-btn-p{background:linear-gradient(135deg,#10b981,#059669);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.25)}
    .z-btn-p:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 4px 12px rgba(16,185,129,.3)}
    .z-btn-gh{background:rgba(255,255,255,.03);border:1px solid #151b26;color:#94a3b8}
    .z-btn-gh:hover{border-color:#334155;color:#f8fafc}
    .z-btn-ol{background:transparent;border:1px solid #151b26;color:#64748b}
    .z-btn-ol:hover{border-color:#10b981;color:#10b981}
    .z-btn-ol.on{border-color:#10b981;color:#10b981;background:rgba(16,185,129,.05)}

    .bdg{display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:6px;font-size:.62rem;font-weight:800;white-space:nowrap;text-transform:uppercase;letter-spacing:.03em}
    .bdg.ex{background:rgba(16,185,129,.08);color:#10b981;border:1px solid rgba(16,185,129,.25)}
    .bdg.rs{background:rgba(251,191,36,.06);color:#fbbf24;border:1px solid rgba(251,191,36,.25)}
    .bdg.ms{background:rgba(239,68,68,.06);color:#ef4444;border:1px solid rgba(239,68,68,.2)}
    .bdg.pn{background:rgba(255,255,255,.03);color:#64748b;border:1px solid #151b26}
    .bdg.gd{background:rgba(251,191,36,.06);color:#fbbf24;border:1px solid rgba(251,191,36,.25)}

    .z-explore{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .z-ecard{display:flex;flex-direction:column;gap:10px;padding:16px;background:#0a0d14;border:1px solid #151b26;border-radius:16px;text-decoration:none;color:inherit;position:relative;overflow:hidden;transition:all .2s;-webkit-tap-highlight-color:transparent;outline:none;min-width:0}
    .z-ecard:hover{border-color:rgba(16,185,129,.2);transform:translateY(-2px);box-shadow:0 4px 16px rgba(0,0,0,.3)}
    .z-ecard:active{transform:scale(.98)}
    .z-ecard-accent{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}
    .z-ecard-title{font-size:.85rem;font-weight:700;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .z-ecard-sub{font-size:.65rem;color:#64748b;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    .z-lbrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;background:#0a0d14;border:1px solid #151b26;margin-bottom:6px;transition:background .15s}
    .z-lbrow:hover{background:#0d1118}
    .z-lbrow.me{background:rgba(16,185,129,.04);border-color:rgba(16,185,129,.2)}
    .z-lb-rank{width:30px;text-align:center;font-weight:800;font-family:var(--font-display,system-ui);color:#64748b;flex-shrink:0}
    .z-lb-avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:.66rem;font-weight:800;color:#fff;flex-shrink:0}
    .z-lb-info{flex:1;min-width:0}
    .z-lb-name{font-size:.78rem;font-weight:700;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .z-lb-sub{font-size:.62rem;color:#64748b;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .z-lb-pts{font-size:.85rem;font-weight:800;color:#10b981;font-family:var(--font-display,system-ui);flex-shrink:0}

    .z-toggle{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px;margin-top:8px;border-radius:12px;font-size:.78rem;font-weight:700;background:rgba(255,255,255,.02);border:1px dashed #151b26;color:#64748b;cursor:pointer;transition:all .2s;font-family:inherit;-webkit-tap-highlight-color:transparent}
    .z-toggle:hover{background:rgba(16,185,129,.03);border-color:rgba(16,185,129,.3);color:#10b981}
    .z-toggle:active{transform:scale(.98)}
    .z-toggle svg{transition:transform .25s}
    .z-toggle.open svg{transform:rotate(180deg)}

    .z-skel{background:linear-gradient(90deg,#0a0d14 25%,rgba(255,255,255,.03) 50%,#0a0d14 75%);background-size:200% 100%;animation:zShimmer 1.5s ease-in-out infinite;border-radius:12px}
    .z-offline{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;background:rgba(239,68,68,.06);border-bottom:1px solid rgba(239,68,68,.15);font-size:.78rem;font-weight:700;color:#ef4444}

    .z-cta{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px 24px;border-radius:16px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:900;font-size:.9rem;border:none;box-shadow:0 4px 20px rgba(16,185,129,.25);cursor:pointer;transition:all .2s;font-family:inherit;animation:zCta 3s ease-in-out infinite;-webkit-tap-highlight-color:transparent;text-decoration:none}
    .z-cta:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(16,185,129,.35)}
    .z-cta:active{transform:scale(.98)}

    .z-zoka-wrap{background:linear-gradient(135deg,rgba(251,191,36,.03) 0%,transparent 50%);border:1px solid rgba(251,191,36,.2);border-radius:16px;padding:16px;margin-bottom:8px;position:relative;overflow:hidden}
    .z-zoka-wrap::after{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent,rgba(251,191,36,.03),transparent);animation:zShimmer 4s infinite linear;pointer-events:none}

    .z-news-marquee-wrap { margin: 20px 0 24px; overflow: hidden; position: relative; mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent); }
    .z-news-marquee { display: flex; gap: 14px; animation: zNewsMarquee 40s linear infinite; width: max-content; padding: 4px 0; }
    .z-news-marquee:hover { animation-play-state: paused; }
    .z-newsmini { display: flex; flex-direction: column; min-width: 200px; max-width: 220px; height: 150px; background: #0a0d14; border: 1px solid #151b26; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; transition: transform .2s, border-color .2s; position: relative; flex-shrink: 0; }
    .z-newsmini:hover { transform: translateY(-2px); border-color: rgba(16,185,129,0.3); box-shadow:0 4px 20px rgba(0,0,0,0.3); }
    .z-news-img { width: 100%; height: 80px; object-fit: cover; background: #0d1118; }
    .z-news-img-ph { width: 100%; height: 80px; display: flex; align-items:center; justify-content: center; background: linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02)); color: #10b981; }
    .z-news-body { padding: 8px 10px; flex: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; min-width:0; }
    .z-news-cat { font-size: 0.55rem; font-weight: 800; text-transform: uppercase; color: #10b981; letter-spacing: 0.05em; }
    .z-news-title { margin: 0; font-size: 0.68rem; font-weight: 700; color: #f8fafc; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }

    .z-podium { display: flex; align-items: flex-end; justify-content: center; gap: 8px; padding: 8px 0 0; }
    .z-pod-u { flex: 1; max-width: 120px; display: flex; flex-direction: column; align-items: center; min-width: 0; }
    .z-pod-info { display: flex; flex-direction: column; align-items: center; margin-bottom: 6px; }
    .z-pod-avatar { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-family: var(--font-display,system-ui); }
    .z-pod-name { font-size: .72rem; font-weight: 700; color: #f8fafc; margin-top: 4px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; }
    .z-pod-pts { font-size: .64rem; font-weight: 800; font-family: var(--font-display,system-ui); }
    .z-pod-bar { width: 100%; border-radius: 10px 10px 0 0; border-bottom: none; display: flex; align-items: center; justify-content: center; }
    .z-pod-num { font-size: 1.1rem; font-weight: 900; font-family: var(--font-display,system-ui); }
    .gold-text{background:linear-gradient(90deg, #fbbf24, #fde68a, #fbbf24);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:zGoldShimmer 3s linear infinite}

    @media(max-width:640px){
      .z-stats{grid-template-columns:repeat(2,1fr);gap:10px}
      .z-chip .val{font-size:1rem}
      .z-te span{font-size:.75rem}.z-sn{font-size:.85rem}
      .z-sb{min-width:64px;padding:4px 8px}
      .z-title{font-size:2.2rem}
    }
    @media(max-width:380px){
      .z-stats{gap:8px}.z-chip{padding:10px 6px}.z-chip .val{font-size:.9rem}
      .z-ecard{padding:14px}
    }
    @media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════
   ANIMATED NUMBER
   ═══════════════════════════════════════ */
function AnimNum({ value, duration = 600, delay = 0, suffix = '' }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);
  useEffect(() => {
    const target = value || 0;
    if (target === 0) { setDisplay(0); return; }
    const start = performance.now() + delay;
    const run = (now) => {
      if (now < start) { raf.current = requestAnimationFrame(run); return; }
      const p = Math.min((now - start) / duration, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(run);
    };
    raf.current = requestAnimationFrame(run);
    return () => { if (raf) cancelAnimationFrame(raf.current); };
  }, [value, duration, delay]);
  return <>{display.toLocaleString()}{suffix}</>;
}

/* ═══════════════════════════════════════
   ACCURACY RING
   ═══════════════════════════════════════ */
function AccuracyRing({ value, size = 44, stroke = 4, color = '#10b981' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value)) / 100;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#151b26" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
        strokeLinecap="round" style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
    </svg>
  );
}

/* ═══════════════════════════════════════
   ZOKA RESULT BADGE
   ═══════════════════════════════════════ */
function ZokaBadge({ pick }) {
  if (!pick?.adminPick || pick.status !== 'finished') return null;
  const { home: h, away: a } = pick.adminPick;
  const ph = pick.homeScore, pa = pick.awayScore;
  if (ph == null || pa == null) return <span className="bdg pn">Pending</span>;
  if (h === ph && a === pa) return <span className="bdg ex"><CheckCircle2 size={8} /> Exact</span>;
  if ((h > a ? 'H' : h < a ? 'A' : 'D') === (ph > pa ? 'H' : ph < pa ? 'A' : 'D')) return <span className="bdg rs"><TrendIcon size={8} /> Result</span>;
  return <span className="bdg ms"><XCircle size={8} /> Miss</span>;
}

/* ═══════════════════════════════════════
   MINI PODIUM
   ═══════════════════════════════════════ */
function MiniPodium({ entries }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;
  const order = [1, 0, 2];
  const cfg = [
    { h: 84, border: '#fbbf24', bg: 'rgba(251,191,36,.06)', color: '#fbbf24', sz: 50, fs: '.9rem', glitter: true },
    { h: 60, border: '#94a3b8', bg: 'rgba(148,163,184,.04)', color: '#94a3b8', sz: 40, fs: '.75rem', glitter: false },
    { h: 48, border: '#b45309', bg: 'rgba(180,83,9,.04)', color: '#d97706', sz: 34, fs: '.68rem', glitter: false },
  ];
  return (
    <div className="z-podium">
      {order.map(pos => {
        const u = top3[pos];
        if (!u) return <div key={pos} style={{ flex: 1, maxWidth: 120 }} />;
        const c = cfg[pos];
        return (
          <div key={u.uid} className="z-pod-u">
            <div className="z-pod-info">
              {pos === 0 && <Crown size={16} style={{ color: '#fbbf24', marginBottom: -2 }} />}
              <div className="z-pod-avatar" style={{ width: c.sz, height: c.sz, background: `${c.border}15`, border: `2px solid ${c.border}`, fontSize: c.fs, color: c.color }}>
                {(u.displayName || '??').slice(0, 2).toUpperCase()}
              </div>
              <div className="z-pod-name">{u.displayName}</div>
              <div className={`z-pod-pts ${c.glitter ? 'gold-text' : ''}`} style={{ color: c.color }}>{u.points} pts</div>
            </div>
            <div className="z-pod-bar" style={{ height: c.h, background: c.bg, border: `1px solid ${c.border}22` }}>
              <span className={`z-pod-num ${c.glitter ? 'gold-text' : ''}`} style={{ color: c.color }}>#{pos + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════
   LIVE MINI CARD & GENIUS LOADER
   ═══════════════════════════════════════ */
const LiveStripLoader = () => (
  <div className="z-live-loader">
    <div className="z-loader-radar"></div>
    <div className="z-loader-text">
      <Radar size={12} /> Scanning Pitches...
    </div>
  </div>
);

const LiveMini = ({ match, index }) => {
  const min = match.elapsed || match.minute;
  const isLive = match.isLive || isLiveStatus(match.status, SPORT.FOOTBALL);
  const hasScore = match.homeScore != null && match.awayScore != null;
  
  return (
    <div className="z-livemini" style={{ animationDelay: `${index * 50}ms`, borderColor: isLive ? 'rgba(239,68,68,.2)' : '#151b26' }}>
      <div className="z-lm-top">
        <span className="z-lm-league">{match.league?.name}</span>
        {isLive && min ? (
          <div className="z-lm-status">
            <span className="z-ldot" style={{ width: 4, height: 4 }} />
            <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-display,system-ui)' }}>{min}'</span>
          </div>
        ) : (
          <div style={{ fontSize: '.62rem', fontWeight: 700, color: '#64748b' }}>{match.kickoff || 'VS'}</div>
        )}
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.homeTeam?.shortName || match.homeTeam?.name}</span>
        <span className="z-lm-score" style={{ color: isLive ? '#ef4444' : '#f8fafc' }}>{hasScore ? match.homeScore : '-'}</span>
      </div>
      <div className="z-lm-row">
        <span className="z-lm-name">{match.awayTeam?.shortName || match.awayTeam?.name}</span>
        <span className="z-lm-score" style={{ color: isLive ? '#ef4444' : '#f8fafc' }}>{hasScore ? match.awayScore : '-'}</span>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   FEATURED ROW
   ═══════════════════════════════════════ */
const FeaturedRow = ({ pred, userPred, userResult, index, isLoggedIn }) => {
  const isFin = isFinishedStatus(pred.status, SPORT.FOOTBALL) || !!pred.isFinished;
  const isLive = isLiveStatus(pred.status, SPORT.FOOTBALL) || !!pred.isLive;
  const isHT = pred.status === 'ht' || pred.status === 'HT';
  const hasScore = pred.homeScore != null && pred.awayScore != null;
  const isPredicted = !!userPred;
  const isResolved = !!userResult?.resultType && userResult.resultType !== 'pending';
  const isExact = isResolved && userResult.resultType === 'exact';
  const isHit = isResolved && userResult.resultType === 'result';

  let border = '#151b26';
  if (isExact) border = '#10b981';
  else if (isHit) border = '#fbbf24';
  else if (isResolved && !isExact && !isHit) border = '#ef4444';
  else if (isLive || isHT) border = '#ef4444';
  else if (isFin) border = 'rgba(16,185,129,.2)';
  else if (isPredicted) border = '#10b981';

  let sLabel = pred.kickoff || 'VS', sColor = '#64748b', sBg = 'rgba(255,255,255,.03)';
  if (isLive) { sLabel = pred.minute != null ? `${pred.minute}'` : 'LIVE'; sColor = '#ef4444'; sBg = 'rgba(239,68,68,.1)'; }
  else if (isHT) { sLabel = 'HT'; sColor = '#fbbf24'; sBg = 'rgba(251,191,36,.1)'; }
  else if (isFin) { sLabel = 'FT'; sColor = '#10b981'; sBg = 'rgba(16,185,129,.08)'; }

  const cls = `z-mc${isLive ? ' live' : ''}${isFin ? ' ft' : ''}${isFin && !isResolved && !isPredicted ? ' dim' : ''}`;
  const mid = pred.id || pred.matchId;

  return (
    <div className={cls} style={{ borderLeft: `3px solid ${border}` }}>
      <div className="z-mh">
        <div className="z-ml">
          {pred.league?.emblem && <img src={pred.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.league?.name || 'Featured'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {isLive && <span className="z-ldot" />}
          <span className="z-st" style={{ color: sColor, background: sBg }}>{sLabel}</span>
        </div>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pred.homeLogo && <img src={pred.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.homeTeam?.shortName || pred.homeTeam?.name || 'Home'}</span>
        </div>
        <div className={`z-sb${isLive ? ' lv' : ''}${isFin ? ' ft' : ''}`}>
          {hasScore ? (
            <>
              <span className={`z-sn${isLive ? ' r' : ' g'}`}>{pred.homeScore}</span>
              <span className="z-sep">–</span>
              <span className={`z-sn${isLive ? ' r' : ' g'}`}>{pred.awayScore}</span>
            </>
          ) : (
            <span className="z-vs">VS</span>
          )}
        </div>
        <div className="z-te aw">
          {pred.awayLogo && <img src={pred.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pred.awayTeam?.shortName || pred.awayTeam?.name || 'Away'}</span>
        </div>
      </div>
      <div className="z-ma">
        {isResolved ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span className={`bdg ${isExact ? 'ex' : isHit ? 'rs' : 'ms'}`}>
              {isExact ? <><CheckCircle2 size={8} /> Exact +10</> : isHit ? <><TrendIcon size={8} /> Result +3</> : <><XCircle size={8} /> Miss</>}
            </span>
            {isPredicted && <span style={{ fontSize: '.62rem', fontWeight: 600, color: '#64748b' }}>You: {userPred.homeScore}–{userPred.awayScore}</span>}
          </div>
        ) : isPredicted ? (
          <Link to="/predictions" className="z-btn z-btn-ol on" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}><CheckCircle size={10} /> Locked</Link>
        ) : isLoggedIn ? (
          <Link to={`/predictions?match=${mid}`} className="z-btn z-btn-p" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}><Target size={10} /> Predict</Link>
        ) : (
          <Link to="/login" className="z-btn z-btn-gh" style={{ minHeight: 32, fontSize: '.66rem', padding: '4px 10px' }}><Lock size={10} /> Login</Link>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   ZOKA ROW
   ═══════════════════════════════════════ */
const ZokaRow = ({ pick, index }) => {
  const isFin = isFinishedStatus(pick.status, SPORT.FOOTBALL);
  const koRaw = pick.kickoff || '';
  const ko = koRaw 
    ? new Date(koRaw.includes('T') ? koRaw : `${pick.matchDate || getTodayStr()}T${koRaw}:00`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : 'TBD';
  const predH = pick.adminPick?.home, predA = pick.adminPick?.away;

  return (
    <div className="z-mc zoka">
      <div className="z-mh">
        <div className="z-ml">
          {pick.league?.emblem && <img src={pick.league.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.league?.name || 'Zoka'}</span>
        </div>
        <span className="z-st" style={{ color: isFin ? '#10b981' : '#64748b', background: isFin ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.03)' }}>{isFin ? 'FT' : ko || 'TBD'}</span>
      </div>
      <div className="z-tm">
        <div className="z-te">
          {pick.homeLogo && <img src={pick.homeLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.homeTeam?.shortName || pick.homeTeam?.name || '?'}</span>
        </div>
        <div className={`z-sb${isFin ? ' ft' : ' zk'}`}>
          {isFin && pick.homeScore != null
            ? <><span className="z-sn g">{pick.homeScore}</span><span className="z-sep">–</span><span className="z-sn g">{pick.awayScore}</span></>
            : <span className="z-sn gd">{predH ?? '?'}–{predA ?? '?'}</span>}
        </div>
        <div className="z-te aw">
          {pick.awayLogo && <img src={pick.awayLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{pick.awayTeam?.shortName || pick.awayTeam?.name || '?'}</span>
        </div>
      </div>
      <div className="z-ma">
        {isFin ? <ZokaBadge pick={pick} /> : <span className="bdg gd"><Star size={8} fill="currentColor" /> Prediction</span>}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════ */
export default function Home() {
  useEffect(() => { injectStyles(); }, []);

  const { currentUser, userProfile } = useAuth();
  const isLoggedIn = !!currentUser;
  const uid = currentUser?.uid;
  const mounted = useRef(true);
  const greeting = useMemo(() => getGreeting(), []);

  const appData = useAppData();
  const {
    activePredictions,
    zokaPicks,
    dailyEntries,
    dailyStats,
    userPredictions,
    predictionResults,
    userStats,
    loading: ctxLoading,
    ensureUserData,
  } = appData;

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [fxLoading, setFxLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  
  const [ui, setUI] = useState({ showFeat: false, showZoka: false, showLB: false });
  const toggleUI = (key) => setUI(prev => ({ ...prev, [key]: !prev[key] }));
  
  const totalUsers = useTotalUsers();
  const newsPosts = useNews();

  const { fixtures: backupRaw } = useFootballData();

  useEffect(() => {
    if (uid) ensureUserData(uid);
  }, [uid, ensureUserData]);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    let mnt = true;
    (async () => {
      try {
        const data = await fetchFixtures(getTodayStr());
        if (mnt && data) {
          const l = data?.matches || [];
          setPrimaryFixtures(l.map(m => normalizeMatch(m)).filter(Boolean));
        }
      } catch {} finally { if (mnt) setFxLoading(false); }
    })();
    
    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!mnt || !lm) return;
      setPrimaryFixtures(prev => {
        const liveMap = new Map(lm.map(m => [String(m.id), m]));
        return prev.map(f => {
          const liveMatch = liveMap.get(String(f.id));
          if (liveMatch) {
            return normalizeMatch({ ...f, ...liveMatch });
          }
          return f;
        });
      });
    });
    
    return () => { mnt = false; if (unsub) unsub(); };
  }, []);

  // ★ FIX: Strictly filter backup data by today's date to prevent stale/yesterday's matches from showing
  const allFixtures = useMemo(() => {
    const today = getTodayStr();
    
    let list = primaryFixtures.length > 0 
      ? primaryFixtures 
      : (backupRaw || []).map(m => normalizeMatch(m)).filter(m => m && m.dateStr === today);

    const uniqueIds = new Set();
    return list.filter(m => { 
      const idStr = String(m.id); 
      if (uniqueIds.has(idStr)) return false; 
      uniqueIds.add(idStr); 
      return true; 
    });
  }, [primaryFixtures, backupRaw]);

  const liveMatches = useMemo(() => allFixtures.filter(f => f.isLive || isLiveStatus(f.status, SPORT.FOOTBALL)), [allFixtures]);
  
  // ★ Genius Logic: If loading, show loader. If live matches exist, show them. Otherwise, show top upcoming. No mocks.
  const stripMatches = liveMatches.length > 0 ? liveMatches : allFixtures.slice(0, 10);

  const zokaFlat = useMemo(() => (zokaPicks?.matches || []).map(m => ({ ...m, _d: getTodayStr() })), [zokaPicks]);
  const zokaVis = ui.showZoka ? zokaFlat : zokaFlat.slice(0, 4);
  const zokaHidden = Math.max(0, zokaFlat.length - 4);

  const featFlat = useMemo(() => (activePredictions || []).map(m => ({ ...m, _d: getTodayStr() })), [activePredictions]);
  const featVis = ui.showFeat ? featFlat : featFlat.slice(0, 5);
  const featHidden = Math.max(0, featFlat.length - 5);

  const lbVis = ui.showLB ? (dailyEntries || []) : (dailyEntries || []).slice(0, 5);
  const lbHidden = Math.max(0, (dailyEntries || []).length - 5);

  const userPredMap = useMemo(() => {
    const m = {};
    Object.values(userPredictions || {}).forEach(p => { m[p.predId || p.matchId] = p; });
    return m;
  }, [userPredictions]);

  const resultMap = useMemo(() => {
    const m = {};
    (predictionResults?.results || []).forEach(r => { m[String(r.matchId)] = r; });
    return m;
  }, [predictionResults]);

  const myPredicted = useMemo(() => (activePredictions || []).filter(p => userPredMap[p.id || p.matchId]).length, [activePredictions, userPredMap]);

  useEffect(() => { return () => { mounted.current = false; }; }, []);

  return (
    <div className="zoka-home">
      <SEO title="Football Predictions, Fixtures & Live Scores — ZOKA" description="Get football predictions, match analysis, fixtures, live scores, and football statistics from leagues around the world." keywords="football predictions, live scores, fixtures, ZOKA" path="/" />

      {offline && <div className="z-offline"><WifiOff size={14} /> You're offline — showing cached data</div>}

      <div className="zoka-home-wrap">
        {/* HERO */}
        <section className="z-hero">
          <h1 className="z-title">ZOKA<span>SCORE</span></h1>
          <p className="z-sub">
            {greeting.emoji} {greeting.text}{userProfile?.displayName ? `, ${userProfile.displayName.split(' ')[0]}` : ''}! {greeting.icon}
          </p>
          <div className="z-title-line" />
        </section>

        {/* MATCH STRIP (Genius Loader / No Mocks) */}
        <div style={{ margin: '16px 0 0' }}>
          <div className="z-strip-header">
            {liveMatches.length > 0 ? (
              <>
                <span className="z-ldot" />
                <span className="z-strip-title" style={{ color: '#ef4444' }}>{liveMatches.length} LIVE</span>
              </>
            ) : (
              <span className="z-strip-title" style={{ color: '#64748b' }}>TODAY'S MATCHES</span>
            )}
            <div className="z-sech-line" />
            <Link to="/fixtures" className="z-strip-link">View all <ChevronRight size={11} /></Link>
          </div>
          <div className="z-livestrip">
            {fxLoading ? (
              <>
                <LiveStripLoader />
                <LiveStripLoader />
                <LiveStripLoader />
              </>
            ) : stripMatches.length > 0 ? (
              stripMatches.map((m, i) => <LiveMini key={m.id || i} match={m} index={i} />)
            ) : (
              <div className="z-live-loader" style={{ width: '100%', maxWidth: 'none', height: '80px' }}>
                <div className="z-loader-text" style={{ color: '#64748b' }}>No matches scheduled today</div>
              </div>
            )}
          </div>
        </div>

        {/* LATEST NEWS MARQUEE */}
        {newsPosts.length > 0 && (
          <div className="z-news-marquee-wrap">
            <div className="z-strip-header">
              <Newspaper size={14} style={{ color: '#10b981' }} />
              <span className="z-strip-title">LATEST NEWS</span>
              <div className="z-sech-line" />
              <Link to="/highlights" className="z-strip-link">Hub <ChevronRight size={11} /></Link>
            </div>
            <div className="z-news-marquee">
              {[...newsPosts, ...newsPosts].map((post, i) => (
                <Link to={`/highlights/${slugify(post.title)}-${post.id}`} key={`${post.id}-${i}`} className="z-newsmini">
                  {post.imageUrl ? (
                    <img src={post.imageUrl} alt={post.title} className="z-news-img" />
                  ) : (
                    <div className="z-news-img-ph"><Newspaper size={18} /></div>
                  )}
                  <div className="z-news-body">
                    <span className="z-news-cat">{post.category}</span>
                    <h4 className="z-news-title">{post.title}</h4>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* STATS STRIP */}
        <div className="z-stats">
          <div className="z-chip">
            <div className="val"><AnimNum value={totalUsers || dailyStats?.players || 0} delay={200} /></div>
            <div className="lbl">Users</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, ((dailyStats?.players || 0) || (totalUsers || 0)) / 5)}%`, background: '#60a5fa' }} /></div>
          </div>
          <div className="z-chip">
            <div className="val"><AnimNum value={dailyStats?.preds || 0} delay={280} /></div>
            <div className="lbl">Predictions</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (dailyStats?.preds || 0) / 10)}%`, background: '#10b981' }} /></div>
          </div>
          <div className="z-chip" style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', right: 8, top: 8 }}><AccuracyRing value={dailyStats?.avg ? parseFloat(dailyStats.avg) : 0} size={36} stroke={3} color={(dailyStats?.avg ? parseFloat(dailyStats.avg) : 0) >= 50 ? '#10b981' : (dailyStats?.avg ? parseFloat(dailyStats.avg) : 0) >= 25 ? '#fbbf24' : '#ef4444'} /></div>
            <div className="val" style={{ fontSize: '.95rem' }}><AnimNum value={dailyStats?.avg ? Math.round(parseFloat(dailyStats.avg)) : 0} delay={360} suffix="%" /></div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="z-chip">
            <div className="val" style={{ color: isLoggedIn ? '#10b981' : '#64748b' }}>
              {isLoggedIn ? <AnimNum value={userStats?.todayPoints || 0} delay={440} /> : '—'}
            </div>
            <div className="lbl">My Points</div>
            {isLoggedIn && <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(100, (userStats?.todayPoints || 0) / 5)}%`, background: '#10b981' }} /></div>}
          </div>
        </div>

        {/* ZOKA PICKS */}
        {!ctxLoading && zokaFlat.length > 0 && (
          <div className="z-sec">
            <div className="z-sech">
              <Star size={14} style={{ color: '#fbbf24' }} />
              <h2 className="gold-text">Zoka Picks</h2>
              <span className="z-sech-badge" style={{ background: 'rgba(251,191,36,.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,.25)' }}>{zokaFlat.length}</span>
              <div className="z-sech-line" />
            </div>
            <div className="z-zoka-wrap">
              {zokaVis.map((p, i) => <ZokaRow key={p.matchId || i} pick={p} index={i} />)}
            </div>
            {zokaHidden > 0 && (
              <button className={`z-toggle${ui.showZoka ? ' open' : ''}`} onClick={() => toggleUI('showZoka')}>
                {ui.showZoka ? 'Show less' : `Show ${zokaHidden} more`} <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}

        {/* FEATURED MATCHES */}
        <div className="z-sec">
          <div className="z-sech">
            <Target size={14} style={{ color: '#10b981' }} />
            <h2>Featured — Compete</h2>
            <span className="z-sech-badge" style={{ background: 'rgba(16,185,129,.08)', color: '#10b981', border: '1px solid rgba(16,185,129,.25)' }}>{featFlat.length}</span>
            {isLoggedIn && <span style={{ fontSize: '.62rem', fontWeight: 700, color: '#64748b' }}>{myPredicted}/{featFlat.length} predicted</span>}
            <div className="z-sech-line" />
          </div>
          {ctxLoading ? (
            <div>{Array.from({ length: 4 }).map((_, i) => <div key={i} className="z-skel" style={{ height: 90, marginBottom: 8 }} />)}</div>
          ) : featVis.length > 0 ? (
            featVis.map((p, i) => <FeaturedRow key={p.id || String(p.matchId) || i} pred={p} userPred={userPredMap[p.id || p.matchId]} userResult={resultMap[String(p.matchId || p.id)]} index={i} isLoggedIn={isLoggedIn} />)
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: '#64748b', fontSize: '.8rem', fontWeight: 600 }}>
              No featured matches right now
              <div style={{ fontSize: '.68rem', opacity: .5, marginTop: 4 }}>Check back later or go to Predictions</div>
            </div>
          )}
          {featHidden > 0 && (
            <button className={`z-toggle${ui.showFeat ? ' open' : ''}`} onClick={() => toggleUI('showFeat')}>
              {ui.showFeat ? 'Show less' : `Show ${featHidden} more`} <ChevronDown size={13} />
            </button>
          )}
        </div>

        {/* LEADERBOARD */}
        <div className="z-sec">
          <div className="z-sech">
            <Trophy size={14} style={{ color: '#10b981' }} />
            <h2>Daily Leaderboard</h2>
            <div className="z-sech-line" />
            <Link to="/leaderboard" className="z-strip-link">Full <ArrowUpRight size={11} /></Link>
          </div>
          {ctxLoading ? (
            <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="z-skel" style={{ height: 48, marginBottom: 6 }} />)}</div>
          ) : (dailyEntries || []).length > 0 ? (
            <>
              <MiniPodium entries={dailyEntries || []} />
              <div style={{ marginTop: 12 }}>
                {lbVis.slice(3).map((u, i) => {
                  const isMe = isLoggedIn && u.uid === uid;
                  const rank = u.rank || (i + 4);
                  const color = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'][(rank - 1) % 8];
                  return (
                    <div key={u.uid} className={`z-lbrow${isMe ? ' me' : ''}`}>
                      <span className="z-lb-rank" style={{ color: rank <= 10 ? '#10b981' : '#64748b' }}>#{rank}</span>
                      <div className="z-lb-avatar" style={{ background: color }}>{(u.displayName || '??').slice(0, 2).toUpperCase()}</div>
                      <div className="z-lb-info">
                        <div className="z-lb-name">{u.displayName}</div>
                        <div className="z-lb-sub">{u.exact || 0} exact · {u.result || 0} results</div>
                      </div>
                      <span className="z-lb-pts">{u.points || 0}</span>
                    </div>
                  );
                })}
              </div>
              {lbHidden > 0 && (
                <button className={`z-toggle${ui.showLB ? ' open' : ''}`} onClick={() => toggleUI('showLB')}>
                  {ui.showLB ? 'Show less' : `Show ${lbHidden} more`} <ChevronDown size={13} />
                </button>
              )}
            </>
          ) : (
            <div className="z-skel" style={{ height: 150, borderRadius: 14 }} />
          )}
        </div>

        {/* LEAGUE TABLES */}
        <div className="z-sec">
          <div className="z-sech">
            <Trophy size={14} style={{ color: '#10b981' }} />
            <h2>League Tables</h2>
            <div className="z-sech-line" />
          </div>
          <div className="z-explore">
            <Link to="/mastergames?tab=standings&comp=PL" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#3b82f6' }} />
              <Trophy size={20} style={{ color: '#3b82f6' }} />
              <div>
                <div className="z-ecard-title">Premier League</div>
                <div className="z-ecard-sub">Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=PD" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#f97316' }} />
              <Trophy size={20} style={{ color: '#f97316' }} />
              <div>
                <div className="z-ecard-title">La Liga</div>
                <div className="z-ecard-sub">Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=SA" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#22c55e' }} />
              <Trophy size={20} style={{ color: '#22c55e' }} />
              <div>
                <div className="z-ecard-title">Serie A</div>
                <div className="z-ecard-sub">Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=BL1" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#ef4444' }} />
              <Trophy size={20} style={{ color: '#ef4444' }} />
              <div>
                <div className="z-ecard-title">Bundesliga</div>
                <div className="z-ecard-sub">Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames?tab=standings&comp=FL1" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#8b5cf6' }} />
              <Trophy size={20} style={{ color: '#8b5cf6' }} />
              <div>
                <div className="z-ecard-title">Ligue 1</div>
                <div className="z-ecard-sub">Table & Standings</div>
              </div>
            </Link>
            <Link to="/mastergames" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#10b981' }} />
              <Activity size={20} style={{ color: '#10b981' }} />
              <div>
                <div className="z-ecard-title">All Leagues</div>
                <div className="z-ecard-sub">Fixtures & Live Scores</div>
              </div>
            </Link>
          </div>
        </div>

        {/* EXPLORE GRID */}
        <div className="z-sec">
          <div className="z-sech">
            <Gamepad2 size={14} style={{ color: '#10b981' }} />
            <h2>Explore</h2>
            <div className="z-sech-line" />
          </div>
          <div className="z-explore">
            <Link to="/highlights" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#f59e0b' }} />
              <Newspaper size={20} style={{ color: '#f59e0b' }} />
              <div>
                <div className="z-ecard-title">News Hub</div>
                <div className="z-ecard-sub">Official updates & articles</div>
              </div>
            </Link>
            <Link to="/livestream" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#06b6d4' }} />
              <Zap size={20} style={{ color: '#06b6d4' }} />
              <div>
                <div className="z-ecard-title">Live Stream</div>
                <div className="z-ecard-sub">Watch matches live</div>
              </div>
            </Link>
            <Link to="/basketball" className="z-ecard">
              <div className="z-ecard-accent" style={{ background: '#3b82f6' }} />
              <BarChart3 size={20} style={{ color: '#3b82f6' }} />
              <div>
                <div className="z-ecard-title">Basketball</div>
                <div className="z-ecard-sub">Hoops action & scores</div>
              </div>
            </Link>
          </div>
        </div>

        {/* CTA */}
        {!isLoggedIn && (
          <div className="z-sec">
            <Link to="/login" className="z-cta"><LogIn size={16} /> Sign In to Predict & Win</Link>
          </div>
        )}
      </div>
    </div>
  );
}