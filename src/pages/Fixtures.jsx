// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/MasterGames.jsx
// ZOKA PRO — Mobile Optimized, Emerald & Gold, Lightning Fast
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, AlertTriangle, Activity, Plus, Minus, Pin, TrendingUp, ArrowRight, Flame, Camera
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';
import SEO from '../components/SEO';

// ─── Constants & Config ───
const STORAGE_KEY_FAVS = "zoka_favs";
const STORAGE_KEY_PINNED = "zoka_pinned_leagues";
const STORAGE_KEY_FONT = "zoka_fontscale";
const LIVE_REFRESH = 45000;
const TOP_5_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1']; 

const MatchStatus = Object.freeze({
  LIVE: 'LIVE', FT: 'FT', HT: 'HT', STARTED: 'STARTED',
  IN_PLAY: 'IN_PLAY', PAUSED: 'PAUSED', AET: 'AET', PEN: 'PEN',
  HALF_TIME: 'HALF_TIME', FINISHED: 'FINISHED'
});

const LIVE_STATUSES_SET = new Set([
  MatchStatus.IN_PLAY, MatchStatus.PAUSED, MatchStatus.LIVE, 
  '1H', '2H', 'ET', 'BT'
]);

const TOP_TEAMS_LIST = [
  'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham',
  'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia',
  'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
  'paris saint germain', 'psg', 'marseille', 'lyon',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta',
  'benfica', 'porto', 'sporting cp', 'ajax', 'psv eindhoven', 'feyenoord',
  'celtic', 'rangers', 'flamengo', 'palmeiras', 'corinthians', 'sao paulo',
  'boca juniors', 'river plate'
];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const sortMatches = (a, b) => {
  if (a.isLive && !b.isLive) return -1;
  if (!a.isLive && b.isLive) return 1;
  if (a.isHT && !b.isHT) return -1;
  if (!a.isHT && b.isHT) return 1;
  if (a.isFinished && !b.isFinished) return 1;
  if (!a.isFinished && b.isFinished) return -1;
  return (a.timestamp || 0) - (b.timestamp || 0);
};

const injectStyles = () => {
  if (document.getElementById('zoka-mg-sharp-css')) return;
  const s = document.createElement('style');
  s.id = 'zoka-mg-sharp-css';
  s.textContent = `
    @keyframes zFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes zSlideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    @keyframes zPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}
    @keyframes zScorePop{0%{transform:scale(1)}40%{transform:scale(1.3);color:#fbbf24;text-shadow:0 0 12px rgba(251,191,36,.6)}100%{transform:scale(1)}}
    @keyframes zGoalFlash{0%{background:rgba(251,191,36,.1)}100%{background:transparent}}
    @keyframes zLiveGlow{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,.2), 0 4px 20px rgba(0,0,0,0.3)}50%{box-shadow:0 0 12px 1px rgba(239,68,68,.3), 0 4px 20px rgba(0,0,0,0.3)}}
    @keyframes zExpand{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}
    @keyframes zToastIn{from{opacity:0;transform:translateY(-20px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes zConfetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-150px) rotate(720deg);opacity:0}}
    @keyframes zShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes zStatusIn{from{opacity:0;transform:scale(.9)}15%{opacity:1;transform:scale(1.02)}25%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.9)}}
    @keyframes zSpin{to{transform:rotate(360deg)}}
    @keyframes zDropDownIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes zGoldShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }

    .zoka-page{min-height:100vh;background:#05070a;padding:0 0 120px;position:relative;color:#f8fafc;font-weight:500;overflow-x:hidden;-webkit-tap-highlight-color:transparent}
    .zoka-wrap{max-width:680px;margin:0 auto;padding:0 12px;position:relative;z-index:1}

    .zoka-hdr{position:sticky;top:0;z-index:50;background:rgba(5,7,10,.85);backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);padding:14px 0;border-bottom:1px solid #151b26;display:flex;align-items:center;justify-content:space-between;gap:8px}
    .zoka-hdr-title{display:flex;flex-direction:column;flex:1;min-width:0}
    .zoka-hdr-title h1{margin:0;font-size:1.4em;font-weight:800;letter-spacing:-.02em;color:#fff;display:flex;align-items:center;gap:8px;text-transform:uppercase}
    .zoka-hdr-title h1 span{color:#10b981}
    .zoka-hdr-sub{font-size:.7em;color:#64748b;font-weight:600;margin-top:2px;letter-spacing:.02em}
    .zoka-hdr-actions{display:flex;align-items:center;gap:8px}
    .zoka-hdr-btn{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid #151b26;display:flex;align-items:center;justify-content:center;color:#94a3b8;cursor:pointer;transition:all .2s ease}
    .zoka-hdr-btn:hover{background:rgba(16,185,129,0.1);color:#10b981;border-color:rgba(16,185,129,.2)}
    .zoka-hdr-btn.active{color:#10b981;border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.05)}
    .zoka-spin{animation:zSpin .8s linear infinite}

    .zoka-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}
    .zoka-schip{background:linear-gradient(145deg, rgba(20,25,35,0.8), rgba(10,12,18,0.8));border:1px solid #151b26;border-radius:16px;padding:12px 8px;text-align:center;transition:transform .2s}
    .zoka-schip .val{font-size:1.6em;font-weight:800;font-family:var(--font-display,system-ui);line-height:1;letter-spacing:-.02em}
    .zoka-schip .val.live-c{color:#ef4444}.zoka-schip .val.total-c{color:#fff}.zoka-schip .val.fav-c{color:#fbbf24}
    .zoka-schip .lbl{font-size:.6em;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:6px}

    .zoka-datenav{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 auto 20px;background:rgba(255,255,255,0.03);border:1px solid #151b26;border-radius:12px;padding:4px;width:fit-content;box-shadow:0 4px 12px rgba(0,0,0,.2)}
    .zoka-nav-btn{padding:10px 18px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:.75em;font-weight:700;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .zoka-nav-btn.active{background:#10b981;color:#05070a;box-shadow:0 2px 8px rgba(16,185,129,.2)}
    .zoka-more-wrap{position:relative}
    .zoka-more-btn{display:flex;align-items:center;gap:4px;padding:10px 14px;border-radius:8px;border:none;background:rgba(255,255,255,0.03);color:#94a3b8;font-size:.72em;font-weight:600;cursor:pointer;font-family:inherit}
    .zoka-more-btn.open{background:rgba(16,185,129,.1);color:#10b981}
    .zoka-more-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:rgba(12,15,22,0.98);backdrop-filter:blur(16px);border:1px solid #1f2937;border-radius:12px;padding:6px;z-index:50;min-width:180px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:320px;overflow-y:auto;animation:zDropDownIn .2s ease-out both}
    .zoka-more-item{display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-radius:6px;background:none;color:#e2e8f0;font-size:.75em;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;transition:background .1s}
    .zoka-more-item:hover{background:rgba(255,255,255,0.05)}
    .zoka-more-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .zoka-more-label{font-size:.6em;font-weight:700;text-transform:uppercase;color:#475569;padding:8px 12px 4px;border-bottom:1px solid #151b26;margin-bottom:4px;letter-spacing:.05em}

    .zoka-tabs{display:flex;gap:4px;background:rgba(255,255,255,0.03);border:1px solid #151b26;border-radius:12px;padding:4px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none}
    .zoka-tabs::-webkit-scrollbar{display:none}
    .zoka-tab{flex:1 0 auto;padding:10px 12px;border:none;border-radius:8px;background:transparent;color:#64748b;font-size:.7em;font-weight:700;cursor:pointer;transition:all .2s ease;text-align:center;font-family:inherit;text-transform:uppercase;letter-spacing:.03em}
    .zoka-tab.active{background:rgba(16,185,129,0.15);color:#10b981;box-shadow:0 0 0 1px rgba(16,185,129,.2)}

    .zoka-search-static{display:flex;align-items:center;gap:10px;width:100%;padding:12px 16px;border-radius:12px;border:1px solid #151b26;background:rgba(255,255,255,0.02);margin-bottom:16px;transition:border-color .2s}
    .zoka-search-static:focus-within{border-color:rgba(16,185,129,.3)}
    .zoka-search-static input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:.85em;font-weight:500;font-family:inherit}
    .zoka-search-static input::placeholder{color:#475569}
    .zoka-search-clear{background:none;border:none;color:#64748b;cursor:pointer;padding:0;display:flex}

    .zoka-filter-row{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
    .zoka-filter-panel{background:rgba(12,15,22,0.98);backdrop-filter:blur(16px);border:1px solid #1f2937;border-radius:12px;padding:8px;z-index:40;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:300px;overflow-y:auto;animation:zDropDownIn .2s ease-out both;margin-top:10px}
    .zoka-filter-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:6px;background:none;color:#e2e8f0;font-size:.75em;font-weight:500;cursor:pointer;font-family:inherit;transition:background .1s}
    .zoka-filter-item:hover{background:rgba(255,255,255,0.05)}
    .zoka-filter-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .zoka-filter-item img{width:18px;height:18px;object-fit:contain}
    .zoka-pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid #151b26;background:rgba(255,255,255,0.03);color:#94a3b8;font-size:.72em;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
    .zoka-pill:hover{border-color:rgba(16,185,129,.3);color:#10b981}
    .zoka-pill.active{background:rgba(16,185,129,.1);color:#10b981;border-color:rgba(16,185,129,.3)}
    .zoka-pill-scroll{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}
    .zoka-pill-scroll::-webkit-scrollbar{display:none}
    .zoka-pill img{width:16px;height:16px;object-fit:contain}

    .zoka-card{position:relative;overflow:hidden;padding:14px 16px;background:#0a0d14;border:1px solid #151b26;border-radius:14px;margin-bottom:8px;transition:all .25s cubic-bezier(.22,1,.36,1);animation:zSlideIn .3s ease both;cursor:pointer}
    .zoka-card:hover{border-color:rgba(16,185,129,.15);transform:translateY(-1px)}
    .zoka-card.live{border-color:rgba(239,68,68,.2);animation:zLiveGlow 3s ease-in-out infinite,zSlideIn .3s ease both}
    .zoka-card.finished{opacity:.6}
    .zoka-card.started{border-color:rgba(16,185,129,.2)}
    .zoka-card.scheduled{border-left:3px solid rgba(255,255,255,0.1)}
    .zoka-card.expanded{border-radius:14px 14px 0 0;margin-bottom:0;border-color:rgba(16,185,129,.2)}
    .zoka-card.goal-flash{animation:zGoalFlash 2s ease-out both}
    .zoka-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px}

    .zoka-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .zoka-status{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;font-size:.55em;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
    .zoka-status.live-s{color:#ef4444;background:rgba(239,68,68,.1)}
    .zoka-status.ft-s{color:#10b981;background:rgba(16,185,129,.1)}
    .zoka-status.time-s{color:#64748b;background:rgba(255,255,255,0.05);font-size:.65em}
    .zoka-status.started-s{color:#10b981;background:rgba(16,185,129,.1);font-size:.6em}
    .zoka-card-actions{display:flex;align-items:center;gap:4px}
    .zoka-icon-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:none;background:transparent;color:#475569;cursor:pointer;transition:all .15s ease;opacity:.6}
    .zoka-icon-btn:hover{opacity:1;color:#10b981}
    .zoka-icon-btn.active{color:#fbbf24;opacity:1}
    .zoka-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:zPulse 2s infinite}

    .zoka-teams{display:flex;align-items:center;gap:8px}
    .zoka-team-col{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0}
    .zoka-team-col.home{align-items:flex-end}
    .zoka-team-col.away{align-items:flex-start}
    .zoka-team-row{display:flex;align-items:center;gap:8px;min-width:0}
    .zoka-team-col.home .zoka-team-row{flex-direction:row-reverse}
    .zoka-crest{width:24px;height:24px;object-fit:contain;flex-shrink:0}
    .zoka-team-name{font-size:.9em;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .zoka-team-col.home .zoka-team-name{text-align:right}
    
    .zoka-score-box{width:70px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .zoka-scores{display:flex;align-items:center;gap:8px}
    .zoka-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.4em;font-weight:800;min-width:20px;text-align:center;line-height:1;transition:color .2s}
    .zoka-score-num.live-score{color:#fff}
    .zoka-score-num.ft-score{color:#94a3b8}
    .zoka-score-num.pop{animation:zScorePop .5s cubic-bezier(.22,1,.36,1) both}
    .zoka-sep{color:#475569;font-size:.8em;font-weight:800}
    .zoka-vs{font-size:.7em;font-weight:800;color:#475569;text-transform:uppercase}

    .zoka-comp-row{display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #151b26}
    .zoka-comp-row img{width:14px;height:14px;object-fit:contain;flex-shrink:0;opacity:.7}
    .zoka-comp-row span{font-size:.65em;color:#64748b;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em}

    .zoka-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.8);backdrop-filter:blur(4px);border-radius:inherit;z-index:3;pointer-events:none}
    .zoka-overlay-badge{padding:10px 24px;border-radius:8px;color:#fff;font-weight:800;font-size:.8em;letter-spacing:.05em;display:flex;align-items:center;gap:8px;animation:zStatusIn 3s ease both;text-transform:uppercase}

    .zoka-expanded{background:#080a0f;border:1px solid rgba(16,185,129,.2);border-top:none;border-radius:0 0 14px 14px;overflow:hidden;animation:zExpand .35s ease-out both}
    .zoka-exp-section{padding:12px 16px 4px;font-size:.6em;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em}
    .zoka-exp-row{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid #151b26;font-size:.8em}
    .zoka-exp-label{color:#64748b;font-weight:600}
    .zoka-exp-val{color:#fff;font-weight:700;font-family:var(--font-display,system-ui)}
    
    .zoka-stat-bar{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid #151b26;font-size:.8em}
    .zoka-stat-val{width:30px;font-weight:700;color:#e2e8f0;font-variant-numeric:tabular-nums}
    .zoka-stat-val.home{text-align:right}
    .zoka-stat-track{flex:1;position:relative;height:16px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;display:flex}
    .zoka-stat-fill{height:100%;transition:width .3s ease}
    .zoka-stat-fill.home{background:rgba(16,185,129,0.8)}
    .zoka-stat-fill.away{background:rgba(255,255,255,0.4)}
    .zoka-stat-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.7em;font-weight:600;color:#fff;mix-blend-mode:difference}

    .zoka-timeline{padding:10px 0}
    .zoka-timeline-row{display:flex;align-items:center;gap:10px;padding:6px 16px;font-size:.8em}
    .zoka-timeline-row.home{flex-direction:row-reverse;text-align:right}
    .zoka-timeline-min{font-weight:700;color:#64748b;min-width:30px;font-variant-numeric:tabular-nums}
    .zoka-timeline-icon{font-size:1.1em}
    .zoka-timeline-text{flex:1;color:#e2e8f0;font-weight:600}
    .zoka-timeline-divider{text-align:center;font-size:.6em;font-weight:700;color:#475569;letter-spacing:.05em;padding:8px 0;border-top:1px dashed #151b26;border-bottom:1px dashed #151b26;margin:6px 0;text-transform:uppercase}

    .zoka-react-banner{display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:linear-gradient(135deg,rgba(16,185,129,.1),rgba(255,255,255,0.02));border-bottom:1px solid #151b26;color:#10b981;font-size:.75em;font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:all .2s}
    .zoka-react-banner:hover{background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(255,255,255,0.05));color:#fff}

    .zoka-view-details{width:100%;padding:10px;border:none;border-radius:0 0 14px 14px;background:rgba(16,185,129,0.05);color:#10b981;font-size:.75em;font-weight:700;cursor:pointer;transition:all .2s;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:6px;text-transform:uppercase;letter-spacing:.03em}
    .zoka-view-details:hover{background:rgba(16,185,129,0.1)}

    .zoka-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:60px 24px;background:rgba(255,255,255,0.02);border:1px solid #151b26;border-radius:16px;text-align:center}
    .zoka-empty-icon{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);color:#475569;margin-bottom:4px}
    .zoka-empty p{color:#64748b;font-size:.85em;margin:0;font-weight:500}
    .zoka-empty-hint{font-size:.75em;color:#475569;margin-top:4px !important}
    .zoka-empty-action{margin-top:12px;padding:8px 16px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.2);border-radius:8px;font-size:.75em;font-weight:600;cursor:pointer}

    .zoka-sk{height:52px;border-radius:14px;background:linear-gradient(90deg,#0a0d14 25%,rgba(255,255,255,0.03) 50%,#0a0d14 75%);background-size:200% 100%;animation:zShimmer 1.5s ease-in-out infinite;margin-bottom:8px}
    .zoka-sk-card{padding:14px 16px;background:#0a0d14;border:1px solid #151b26;border-radius:14px;margin-bottom:8px}
    .zoka-sk-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .zoka-sk-circle{width:24px;height:24px;border-radius:4px;background:rgba(255,255,255,0.04)}
    .zoka-sk-line{height:10px;border-radius:4px;background:rgba(255,255,255,0.04);flex:1}

    .zoka-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:calc(100% - 24px);max-width:400px}
    .zoka-toast{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 18px;color:#fff;backdrop-filter:blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.5);animation:zToastIn .35s cubic-bezier(.22,1,.36,1) both;font-size:.8em}
    .zoka-toast-inner{display:flex;align-items:flex-start;gap:12px}
    .zoka-toast-icon{font-size:1.4em;flex-shrink:0;line-height:1}
    .zoka-toast-title{font-weight:800;font-size:.7em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;color:#10b981}
    .zoka-toast-msg{font-weight:600;line-height:1.3;opacity:.95}
    .zoka-toast-detail{font-size:.85em;opacity:.7;margin-top:2px}
    .zoka-toast-score{font-family:var(--font-display,system-ui);font-weight:800;font-size:1.2em;flex-shrink:0;margin-left:auto;text-shadow:0 0 12px rgba(255,255,255,.3)}

    .zoka-confetti{position:fixed;inset:0;pointer-events:none;z-index:400;overflow:hidden}
    .zoka-confetti-p{position:absolute;width:10px;height:10px;border-radius:2px;animation:zConfetti 1.6s ease-out forwards}

    .zoka-tbl-wrap{background:linear-gradient(145deg, rgba(20,25,35,0.6), rgba(10,12,18,0.6));border:1px solid #151b26;border-radius:12px;overflow:hidden;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
    .zoka-tbl{width:100%;border-collapse:collapse;font-size:.8em}
    .zoka-tbl thead{background:rgba(255,255,255,0.02)}
    .zoka-tbl th{padding:10px 8px;font-size:.6em;font-weight:700;color:#64748b;text-transform:uppercase;text-align:left;border-bottom:1px solid #151b26}
    .zoka-tbl th.c{text-align:center;width:28px}
    .zoka-tbl td{padding:10px 8px;border-bottom:1px solid #151b26;vertical-align:middle}
    .zoka-tbl tr:last-child td{border-bottom:none}
    .zoka-tbl tr:hover{background:rgba(16,185,129,0.03)}
    .zoka-tbl .pos{font-weight:800;color:#e2e8f0;text-align:center;font-variant-numeric:tabular-nums}
    .zoka-tbl .tc{display:flex;align-items:center;gap:8px;min-width:0}
    .zoka-tbl .tc img{width:20px;height:20px;object-fit:contain;flex-shrink:0}
    .zoka-tbl .tc span{font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .zoka-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:#94a3b8}
    .zoka-tbl .pc{text-align:center;font-weight:800;color:#10b981}

    .zoka-teams-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
    .zoka-team-card{background:linear-gradient(145deg, rgba(20,25,35,0.6), rgba(10,12,18,0.6));border:1px solid #151b26;border-radius:12px;padding:14px 10px;text-align:center;transition:all .2s}
    .zoka-team-card:hover{transform:translateY(-2px);border-color:rgba(16,185,129,.15)}
    .zoka-team-card img{width:36px;height:36px;object-fit:contain;margin:0 auto 8px;display:block}
    .zoka-team-card .name{font-size:.7em;font-weight:600;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .zoka-show-more{width:100%;padding:12px;border:none;border-radius:10px;background:rgba(255,255,255,0.02);color:#64748b;font-size:.75em;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;text-transform:uppercase;letter-spacing:.03em}
    .zoka-show-more:hover{background:rgba(16,185,129,.05);color:#10b981}

    .zoka-section{margin-bottom:20px}
    .zoka-league-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 4px}
    .zoka-league-name{font-size:.75em;font-weight:700;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.03em}
    .zoka-league-count{margin-left:auto;font-size:.55em;font-weight:600;color:#475569;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px}
    .zoka-fav-icon{color:#fbbf24}

    .zoka-rescue{background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.15);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .zoka-rescue-icon{width:32px;height:32px;border-radius:8px;background:rgba(251,191,36,0.1);display:flex;align-items:center;justify-content:center;color:#fbbf24;flex-shrink:0}
    .zoka-rescue-title{font-size:.8em;font-weight:700;color:#fbbf24}
    .zoka-rescue-sub{font-size:.65em;color:#94a3b8}

    .zoka-seo-links{text-align:center;padding:30px 0 10px;border-top:1px solid #151b26;margin-top:30px}
    .zoka-seo-links h3{font-size:.75em;font-weight:700;color:#475569;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
    .zoka-seo-link{display:inline-block;font-size:.65em;color:#64748b;text-decoration:none;border:1px solid #151b26;padding:6px 12px;border-radius:8px;margin:3px;transition:all .2s;font-weight:500}
    .zoka-seo-link:hover{color:#10b981;border-color:rgba(16,185,129,.2);background:rgba(16,185,129,0.05)}

    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

// Audio Context for Sound Fx
const Sound = {
  ctx: null, on: true, _lg: 0, _lw: 0,
  _init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return false; } } if (this.ctx.state === 'suspended') this.ctx.resume(); return !!this.ctx; },
  _t() { return this.ctx ? this.ctx.currentTime : 0; },
  goal() {
    if (!this.on || !this._init()) return; if (Date.now() - this._lg < 2000) return; this._lg = Date.now();
    try { navigator.vibrate?.([80,40,80,40,120]); } catch {}
    const t = this._t(), w = this.ctx.createOscillator(), g = this.ctx.createGain();
    w.type='sawtooth'; w.frequency.setValueAtTime(180,t); w.frequency.exponentialRampToValueAtTime(600,t+.12);
    g.gain.setValueAtTime(.04,t); g.gain.exponentialRampToValueAtTime(.001,t+.18);
    w.connect(g); g.connect(this.ctx.destination); w.start(t); w.stop(t+.2);
    [523.25,659.25,783.99,1046.5].forEach((f,i)=>{const o=this.ctx.createOscillator(),gn=this.ctx.createGain();o.type='sine';o.frequency.value=f;const s=t+.14+i*.085;gn.gain.setValueAtTime(0,s);gn.gain.linearRampToValueAtTime(.15,s+.035);gn.gain.exponentialRampToValueAtTime(.001,s+.55);o.connect(gn);gn.connect(this.ctx.destination);o.start(s);o.stop(s+.6);});
  },
  whistle(type='ft') {
    if (!this.on || !this._init()) return; if (Date.now() - this._lw < 3000) return; this._lw = Date.now();
    const t = this._t(), freq = type==='ht'?2800:3200, dur = type==='ht'?.6:.9;
    const play=(start)=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain(),lfo=this.ctx.createOscillator(),lg=this.ctx.createGain();o.type='sine';o.frequency.value=freq;lfo.type='sine';lfo.frequency.value=6;lg.gain.value=80;lfo.connect(lg);lg.connect(o.frequency);g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(.08,start+.05);g.gain.setValueAtTime(.08,start+dur-.1);g.gain.exponentialRampToValueAtTime(.001,start+dur);o.connect(g);g.connect(this.ctx.destination);o.start(start);o.stop(start+dur+.05);lfo.start(start);lfo.stop(start+dur+.05);};
    play(t); if(type==='ft') play(t+dur+.15);
  },
  kickoff() {
    if (!this.on || !this._init()) return;
    const t = this._t(), bs = this.ctx.sampleRate*.15, buf = this.ctx.createBuffer(1,bs,this.ctx.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<bs;i++) d[i]=(Math.random()*2-1)*(1-i/bs);
    const src=this.ctx.createBufferSource(),flt=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    src.buffer=buf; flt.type='bandpass'; flt.frequency.setValueAtTime(2000,t); flt.frequency.exponentialRampToValueAtTime(500,t+.15); flt.Q.value=2;
    g.gain.setValueAtTime(.06,t); g.gain.exponentialRampToValueAtTime(.001,t+.15);
    src.connect(flt); flt.connect(g); g.connect(this.ctx.destination); src.start(t);
  },
};

const CMT = {
  goal:["GOOOAL! Pure strike!","Back of the net!","Zoka magic!"],
  ft:["Full Time!","Final Whistle!"],
  ht:["Half Time!","HT Break."],
  kickoff:["Kick Off!","We're underway!"],
  rescue:["Backup Source Active","Switched to global feed"],
};
const pick = (a) => a[Math.floor(Math.random()*a.length)];

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-2), { ...t, id }]);
    timers.current.set(id, setTimeout(() => { setToasts(p => p.filter(x => x.id !== id)); timers.current.delete(id); }, t.dur || 3500));
    return id;
  }, []);
  const dismiss = useCallback(id => {
    setToasts(p => p.filter(x => x.id !== id));
    if (timers.current.has(id)) { clearTimeout(timers.current.get(id)); timers.current.delete(id); }
  }, []);
  useEffect(() => () => { timers.current.forEach(t => clearTimeout(t)); timers.current.clear(); }, []);
  return { toasts, add, dismiss };
}

function useNotifications({ liveMatches, isFav, tab, addToast }) {
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const timeouts = useRef(new Map());
  
  const [scorePops, setScorePops] = useState(new Map());
  const [flashGoals, setFlashGoals] = useState(new Set());
  const [statusAnims, setStatusAnims] = useState(new Map());
  const [confettiKey, setConfettiKey] = useState(0);

  const clearTO = useCallback((k) => { if (timeouts.current.has(k)) { clearTimeout(timeouts.current.get(k)); timeouts.current.delete(k); } }, []);
  const setTO = useCallback((k, fn, ms) => { clearTO(k); timeouts.current.set(k, setTimeout(() => { fn(); timeouts.current.delete(k); }, ms)); }, [clearTO]);

  const isLiveStatus = useCallback((s) => LIVE_STATUSES_SET.has(s), []);

  useEffect(() => {
    liveMatches.forEach(m => {
      const id = String(m.id);
      const shouldNotify = isFav(id) || tab === 'fixtures';
      const prev = prevScores.current.get(id);
      const h = m.homeScore, a = m.awayScore;
      
      if (prev) {
        if (h != null && prev.h != null && h > prev.h) {
          if (shouldNotify) { addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.homeName, score: `${h}–${a}`, dur: 3500 }); if (Sound.on) Sound.goal(); setConfettiKey(k => k + 1); }
          setFlashGoals(p => new Set([...p, id])); setScorePops(p => new Map([...p, [id, 'home']]));
          setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
        }
        if (a != null && prev.a != null && a > prev.a) {
          if (shouldNotify) { addToast({ type: 'goal', msg: pick(CMT.goal), detail: m.awayName, score: `${h}–${a}`, dur: 3500 }); if (Sound.on) Sound.goal(); setConfettiKey(k => k + 1); }
          setFlashGoals(p => new Set([...p, id])); setScorePops(p => new Map([...p, [id, 'away']]));
          setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
        }
      }
      prevScores.current.set(id, { h, a });
    });

    liveMatches.forEach(m => {
      const id = String(m.id);
      const shouldNotify = isFav(id) || tab === 'fixtures';
      const prev = prevStatuses.current.get(id);
      const curr = m.status || '';
      if (prev && prev !== curr) {
        if (!isLiveStatus(prev) && isLiveStatus(curr)) {
          if (shouldNotify) addToast({ type: 'status', st: 'live', msg: pick(CMT.kickoff), detail: `${m.homeName} vs ${m.awayName}`, dur: 3000 });
          if (Sound.on) Sound.kickoff();
          setStatusAnims(p => new Map([...p, [id, { type: 'live', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
        if (isLiveStatus(prev) && (curr === MatchStatus.FINISHED || curr === MatchStatus.FT)) {
          const score = `${m.homeScore ?? 0}–${m.awayScore ?? 0}`;
          if (shouldNotify) addToast({ type: 'status', st: 'ft', msg: pick(CMT.ft), detail: `${m.homeName} vs ${m.awayName}`, score, dur: 4000 });
          if (Sound.on) Sound.whistle('ft');
          setStatusAnims(p => new Map([...p, [id, { type: 'ft', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
        if ((curr === MatchStatus.HALF_TIME || curr === MatchStatus.HT) && prev !== MatchStatus.HALF_TIME && prev !== MatchStatus.HT) {
          if (shouldNotify) addToast({ type: 'status', st: 'ht', msg: pick(CMT.ht), detail: `${m.homeName} vs ${m.awayName}`, dur: 3000 });
          if (Sound.on) Sound.whistle('ht');
          setStatusAnims(p => new Map([...p, [id, { type: 'ht', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
      }
      prevStatuses.current.set(id, curr);
    });
  }, [liveMatches, addToast, isFav, tab, isLiveStatus, setTO]);

  const matchState = useMemo(() => ({ scorePops, flashGoals, statusAnims }), [scorePops, flashGoals, statusAnims]);
  return { matchState, confettiKey };
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const matchQ = (m, terms) => [m.homeName, m.awayName, m.leagueName].map(norm).some(x => x && terms.every(t => x.includes(t)));

function extractMatchDate(m) {
  if (!m) return '';
  if (m.utcDate) return getLocalDateFromUtc(m.utcDate);
  if (m.date && m.date.includes('T')) return m.date.split('T')[0];
  if (m.date) return m.date;
  return '';
}

function normalizeMatch(raw, isPrimary) {
  if (!raw) return null;
  const id = String(raw.id || raw.matchId);
  const status = raw.status || '';
  
  let dateStr = extractMatchDate(raw);
  let kickoff = 'TBD';
  let timestamp = 0;

  const rawDate = raw.utcDate || raw.date;
  if (rawDate) {
    try {
      const dt = new Date(rawDate);
      kickoff = formatTime(rawDate); 
      timestamp = dt.getTime();
    } catch {}
  } else if (raw.kickoff) {
    kickoff = raw.kickoff;
  }

  const isLive = isPrimary ? !!raw.isLive : LIVE_STATUSES_SET.has(status);
  const isHT = status === MatchStatus.HT || status === 'BT' || status === MatchStatus.HALF_TIME;
  const isFinished = isPrimary ? !!raw.isFinished : (status === MatchStatus.FINISHED || status === MatchStatus.FT || status === MatchStatus.AET || status === MatchStatus.PEN);
  
  let isStarted = false;
  if (timestamp > 0 && Date.now() > timestamp && !isLive && !isFinished) {
    isStarted = true;
  }

  const homeScore = isPrimary ? raw.homeScore : (raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = isPrimary ? raw.awayScore : (raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, dateStr, kickoff, timestamp,
    status, isLive, isHT, isFinished,
    minute: raw.minute || raw.elapsed || null, 
    isStarted, 
    homeName: isPrimary ? (raw.homeTeam?.name || 'TBD') : (raw.homeTeam?.shortName || raw.homeTeam?.name || 'TBD'),
    awayName: isPrimary ? (raw.awayTeam?.name || 'TBD') : (raw.awayTeam?.shortName || raw.awayTeam?.name || 'TBD'),
    homeLogo: isPrimary ? raw.homeLogo : raw.homeTeam?.crest,
    awayLogo: isPrimary ? raw.awayLogo : raw.awayTeam?.crest,
    homeTeamId: isPrimary ? raw.homeTeam?.id : raw.homeTeam?.id,
    awayTeamId: isPrimary ? raw.awayTeam?.id : raw.awayTeam?.id,
    homeScore, awayScore,
    leagueName: isPrimary ? (raw.league?.name || 'Other') : (raw.competition?.name || raw.league?.name || 'Other'),
    leagueLogo: isPrimary ? (raw.league?.emblem || raw.league?.logo) : (raw.competition?.emblem || raw.league?.logo),
    score: raw.score, 
    stats: raw.stats || raw.matchStats || [],
  };
}

const MatchCardSkeleton = React.memo(() => (
  <div className="zoka-sk-card">
    <div className="zoka-sk-row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
      <div className="zoka-sk-line" style={{ width: '60px', height: '10px' }} />
      <div className="zoka-sk-circle" style={{ width: '40px', height: '12px', borderRadius: '4px' }} />
    </div>
    <div className="zoka-sk-row">
      <div className="zoka-sk-circle" />
      <div className="zoka-sk-line" />
    </div>
    <div className="zoka-sk-row" style={{ marginTop: '8px' }}>
      <div className="zoka-sk-circle" />
      <div className="zoka-sk-line" />
    </div>
  </div>
));

const Skeleton = React.memo(({ count = 5 }) => (
  <div>{Array.from({ length: count }).map((_, i) => <MatchCardSkeleton key={i} />)}</div>
));

const ToastContainer = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="zoka-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal', isRescue = t.type === 'rescue';
        let bg, icon;
        if (isRescue) { bg = 'linear-gradient(135deg,rgba(251,191,36,.9),rgba(245,158,11,.85))'; icon = '🌐'; }
        else if (isGoal) { bg = 'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.85))'; icon = '⚽'; }
        else {
          const m = { ft: ['rgba(16,185,129,.9)','rgba(5,150,105,.85)'], ht: ['rgba(249,115,22,.9)','rgba(217,90,12,.85)'], live: ['rgba(239,68,68,.9)','rgba(220,38,38,.85)'] };
          const c = m[t.st] || m.live; bg = `linear-gradient(135deg,${c[0]},${c[1]})`;
          icon = t.st === 'ft' ? '🏁' : t.st === 'ht' ? '⏸️' : '⚡';
        }
        return (
          <div key={t.id} className="zoka-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="zoka-toast-inner">
              <span className="zoka-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="zoka-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'LIVE ACTION'}</div>
                {t.msg && <div className="zoka-toast-msg">{t.msg}</div>}
                {t.detail && <div className="zoka-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="zoka-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const Confetti = React.memo(({ active }) => {
  if (!active) return null;
  const colors = ['#fbbf24','#f59e0b','#ef4444','#ffffff','#fbbf24','#f59e0b'];
  const p = Array.from({ length: 24 }, (_, i) => ({ left: 8 + Math.random() * 84, bottom: 80, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="zoka-confetti">
      {p.map((x, i) => <div key={i} className="zoka-confetti-p" style={{ left: x.left + '%', bottom: x.bottom + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
});

const ScoreBreakdown = React.memo(({ match, onNavigate }) => {
  if (match.isStarted && !match.isLive) {
    return (
      <div className="zoka-empty" style={{ padding: '30px', textAlign: 'center', borderRadius: '0 0 14px 14px' }}>
        <Clock size={24} style={{ marginBottom: '10px', color: '#475569' }} />
        <div style={{ color: '#e2e8f0', fontWeight: 700, marginBottom: '6px' }}>Match in Progress</div>
        <div style={{ color: '#64748b', fontSize: '.9em' }}>Live coverage not available. Results will be shown at Full Time.</div>
      </div>
    );
  }
  
  const s = match.score || {};
  const stats = match.stats || [];
  const goals = s.goals || [];
  const cards = s.cards || [];
  
  const periods = [
    { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
    { l: 'Full Time', h: s.fullTime?.home ?? match.homeScore, a: s.fullTime?.away ?? match.awayScore },
  ];
  
  const hasScoreData = periods.some(p => p.h != null || p.a != null);
  const hasEvents = goals.length > 0 || cards.length > 0;
  const hasStatsData = stats.length > 0;
  
  if (!hasScoreData && !hasEvents && !hasStatsData) return <div className="zoka-empty" style={{ borderRadius: 0, padding: '20px' }}>Details appear once the match begins</div>;
  
  const events = [
    ...goals.map(g => ({ ...g, eventType: 'goal' })),
    ...cards.map(c => ({ ...c, eventType: 'card' }))
  ].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return (
    <div style={{ padding: '8px 0 0' }}>
      {hasScoreData && (
        <>
          <div className="zoka-exp-section">Score Breakdown</div>
          {periods.filter(p => p.h != null || p.a != null).map(p => (
            <div key={p.l} className="zoka-exp-row"><span className="zoka-exp-label">{p.l}</span><span className="zoka-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span></div>
          ))}
        </>
      )}
      
      {hasEvents && (
        <>
          <div className="zoka-exp-section">Match Events</div>
          <div className="zoka-timeline">
            {events.map((e, i) => {
              const isGoal = e.eventType === 'goal';
              const isYellow = e.type === 'YELLOW_CARD';
              const isRed = e.type === 'RED_CARD';
              const isHome = e.team?.id === match.homeTeamId || e.team?.name === match.homeName;
              const prevEvent = events[i-1];
              const showHTDivider = prevEvent && prevEvent.minute <= 45 && e.minute > 45;

              return (
                <React.Fragment key={i}>
                  {showHTDivider && <div className="zoka-timeline-divider">HALF TIME</div>}
                  <div className={`zoka-timeline-row ${isHome ? 'home' : 'away'}`}>
                    <span className="zoka-timeline-min">{e.minute != null ? `${e.minute}'` : ''}</span>
                    <span className="zoka-timeline-icon">
                      {isGoal ? '⚽' : isYellow ? '🟨' : isRed ? '🟥' : '⚠️'}
                    </span>
                    <span className="zoka-timeline-text">{e.scorer?.name || e.player?.name || 'Unknown'}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
      
      {hasStatsData && (
        <>
          <div className="zoka-exp-section">Match Stats</div>
          {stats.map((stat, i) => {
            const homeVal = parseFloat(stat.home) || 0;
            const awayVal = parseFloat(stat.away) || 0;
            const total = homeVal + awayVal;
            const homePct = total > 0 ? (homeVal / total) * 100 : 50;
            const awayPct = total > 0 ? (awayVal / total) * 100 : 50;
            
            return (
              <div key={i} className="zoka-stat-bar">
                <span className="zoka-stat-val home">{stat.home}</span>
                <div className="zoka-stat-track">
                  <div className="zoka-stat-fill home" style={{ width: `${homePct}%` }} />
                  <div className="zoka-stat-fill away" style={{ width: `${awayPct}%` }} />
                  <span className="zoka-stat-label">{stat.type}</span>
                </div>
                <span className="zoka-stat-val away">{stat.away}</span>
              </div>
            );
          })}
        </>
      )}
      
      <button className="zoka-view-details" onClick={() => onNavigate(match.id)}>
        View Match Details <ArrowRight size={14} />
      </button>
    </div>
  );
});

const MatchCard = React.memo(({ m, idx, expanded, onToggle, onNavigate, matchState, isFav, onFav, onReactNow }) => {
  const isLive = m.isLive;
  const isHT = m.isHT;
  const isFt = m.isFinished;
  const isStarted = m.isStarted;
  const isSched = !isLive && !isHT && !isFt && !isStarted;
  const isExp = expanded === m.id;
  const id = String(m.id);
  const isFlash = matchState.flashGoals.has(id);
  const sa = matchState.statusAnims.get(id);
  const popSide = matchState.scorePops.get(id);

  let cls = 'zoka-card';
  if (isLive) cls += ' live';
  else if (isStarted) cls += ' started';
  else if (isFt) cls += ' finished';
  else if (isSched) cls += ' scheduled';
  if (isFlash) cls += ' goal-flash';
  if (sa?.type === 'ft') cls += ' ft-settle';
  if (isExp) cls += ' expanded';

  const barColor = isLive ? '#ef4444' : isStarted ? '#fbbf24' : isFt ? '#10b981' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 15 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 18 : 16 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isStarted || isFt) && <div className="zoka-left-bar" style={{ background: barColor }} />}
        <div className="zoka-card-top">
          <div>
            {isLive && <span className="zoka-status live-s"><span className="zoka-dot" /> {m.minute != null ? `${m.minute}'` : MatchStatus.LIVE}</span>}
            {isStarted && <span className="zoka-status started-s"><Clock size={10} /> {MatchStatus.STARTED}</span>}
            {isHT && <span className="zoka-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>{MatchStatus.HT}</span>}
            {isFt && <span className="zoka-status ft-s">{MatchStatus.FT}</span>}
            {isSched && <span className="zoka-status time-s">{m.kickoff}</span>}
          </div>
          <div className="zoka-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`zoka-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={16} fill={isFav ? '#fbbf24' : 'none'} color={isFav ? '#fbbf24' : '#475569'} />
            </button>
          </div>
        </div>
        <div className="zoka-teams">
          <div className="zoka-team-col home">
            <div className="zoka-team-row">
              {m.homeLogo && <img className="zoka-crest" src={m.homeLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="zoka-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="zoka-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="zoka-scores">
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                <span className="zoka-sep">–</span>
                <span className={`zoka-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
              </div>
            ) : <span className="zoka-vs">VS</span>}
          </div>
          <div className="zoka-team-col away">
            <div className="zoka-team-row">
              {m.awayLogo && <img className="zoka-crest" src={m.awayLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="zoka-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        <div className="zoka-comp-row">
          {m.leagueLogo && <img src={m.leagueLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.leagueName}</span>
        </div>
        {sa && (
          <div className="zoka-overlay">
            <div className="zoka-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={16} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
      {isExp && (
        <div className="zoka-expanded">
          <div className="zoka-react-banner" onClick={(e) => { e.stopPropagation(); onReactNow(m); }}>
            <Camera size={16} /> React Now
          </div>
          <ScoreBreakdown match={m} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  );
});

const LeagueSection = React.memo(({
    group, expanded, onToggle, onNavigate, isExpanded, toggleLeagueExpand,
    matchState, isFav, onFav, isPinned, onTogglePin, onReactNow
}) => {
  const limit = group.isTop || isPinned ? 5 : 1;
  const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
  const hiddenCount = group.matches.length - limit;
  
  return (
    <div className="zoka-section">
      <div className="zoka-league-hd">
        {group.logo && <img src={group.logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px' }} onError={e => { e.target.style.display = 'none'; }} />}
        <span className="zoka-league-name">{group.name}</span>
        <span className="zoka-league-count">{group.matches.length}</span>
        <button className="zoka-icon-btn" style={{ opacity: isPinned ? 1 : 0.5, color: isPinned ? '#10b981' : '#475569' }} onClick={() => onTogglePin(group.name)} title="Pin League">
          <Pin size={12} fill={isPinned ? '#10b981' : 'none'} />
        </button>
      </div>
      {visibleMatches.map((m, i) => (
          <MatchCard
              key={`${group.name}-${m.id}-${i}`}
              m={m}
              idx={i}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
              matchState={matchState}
              isFav={isFav(m.id)}
              onFav={onFav}
              onReactNow={onReactNow}
          />
      ))}
      {hiddenCount > 0 && (
        <button className="zoka-show-more" onClick={() => toggleLeagueExpand(group.name)}>
          {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
        </button>
      )}
    </div>
  );
});

const CompCard = React.memo(({ c }) => (
  <div className="zoka-team-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
    {c.emblem && <img src={c.emblem} alt="" style={{ width: '32px', height: '32px', margin: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
    <div className="name">{c.name}</div>
  </div>
));

function CompetitionSelector({ selectedCompCode, onSelect, topGlobalComps, otherGlobalComps }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  
  const filteredComps = useMemo(() => {
    if (!searchQ.trim()) return otherGlobalComps;
    return otherGlobalComps.filter(c => (c.name || '').toLowerCase().includes(searchQ.toLowerCase()));
  }, [otherGlobalComps, searchQ]);

  return (
    <>
      <div className="zoka-pill-scroll" style={{ marginBottom: '10px' }}>
        {topGlobalComps.map(c => (
          <button key={c.id} className={`zoka-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => onSelect(c.code)}>
            {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
            {c.code || c.name}
          </button>
        ))}
      </div>
      <button className="zoka-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setSearchOpen(p => !p)}>
        <Search size={16} />
        {searchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
        <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
      </button>
      {searchOpen && (
        <div className="zoka-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
          <input className="zoka-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {filteredComps.length === 0 && <div className="zoka-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
          {filteredComps.map(c => (
            <button key={c.id} className={`zoka-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { onSelect(c.code); setSearchOpen(false); setSearchQ(''); }}>
              {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
              {c.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export default function MasterGames() {
  injectStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { fixtures: backupRaw, liveMatches: backupLive, competitions, loading: backupLoading, loadDateFixtures, getStandings, getTeams, refreshFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  
  const [tab, setTab] = useState(searchParams.get('tab') || 'fixtures');
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || getLocalDateStr(0));
  const [compFilter, setCompFilter] = useState(searchParams.get('league') || 'ALL');
  
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_FAVS) || '[]')); } catch { return new Set(); } });
  const [pinnedLeagues, setPinnedLeagues] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_PINNED) || '[]')); } catch { return new Set(); } });
  
  const toggleFav = useCallback(id => { setFavs(p => { const n = new Set(p); const idStr = String(id); if (n.has(idStr)) n.delete(idStr); else n.add(idStr); try { localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify([...n])); } catch {} return n; }); }, []);
  const togglePinLeague = useCallback(leagueName => { setPinnedLeagues(p => { const n = new Set(p); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); try { localStorage.setItem(STORAGE_KEY_PINNED, JSON.stringify([...n])); } catch {} return n; }); }, []);
  
  const isFav = useCallback(id => favs.has(String(id)), [favs]);

  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  
  const deferredSearch = useDeferredValue(searchQ);
  const normalizedSearch = useMemo(() => deferredSearch.trim().toLowerCase(), [deferredSearch]);

  // ★ MODIFIED UI STATE: Added showAllTopMatches and showAllLiveMatches
  const [ui, setUI] = useState({ soundOn: true, rescued: false, moreDatesOpen: false, leagueFilterOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false });
  const toggleUI = useCallback((key) => setUI(prev => ({ ...prev, [key]: !prev[key] })), []);
  
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  
  const rescueToastSent = useRef(false);
  const welcomeToastShown = useRef(false);
  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  
  const [fontScale, setFontScale] = useState(() => { try { return parseFloat(localStorage.getItem(STORAGE_KEY_FONT) || '1'); } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_FONT, String(fontScale)); } catch {} }, [fontScale]);
  
  const [selectedCompCode, setSelectedCompCode] = useState(null);
  const moreRef = useRef(null);

  useEffect(() => {
    const params = {};
    if (tab !== 'fixtures') params.tab = tab;
    if (selectedDate !== getLocalDateStr(0)) params.date = selectedDate;
    if (compFilter !== 'ALL') params.league = compFilter;
    setSearchParams(params, { replace: true });
  }, [tab, selectedDate, compFilter, setSearchParams]);

  const dates = useMemo(() => {
    const past = Array.from({ length: 14 }, (_, i) => { const d = getLocalDateStr(-(i + 2)); return { str: d, label: formatDateShort(d) }; }).reverse();
    const future = Array.from({ length: 14 }, (_, i) => { const d = getLocalDateStr(i + 2); return { str: d, label: formatDateShort(d) }; });
    return { past, future };
  }, []);

  const leaguePriorityMap = useMemo(() => ({
    'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3,
    'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7,
    'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11,
    'Süper Lig': 12, 'Championship': 13
  }), []);

  useEffect(() => { Sound.on = ui.soundOn; }, [ui.soundOn]);

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setUI(prev => ({ ...prev, moreDatesOpen: false })); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isPrimaryDate = [getLocalDateStr(-1), getLocalDateStr(0), getLocalDateStr(1)].includes(selectedDate);

  const fetchPrimary = useCallback(async (date, silent = false) => {
    if (!silent) setPrimaryLoading(true);
    try {
      const res = await fetchFixtures(date);
      const l = Array.isArray(res) ? res : res?.matches || [];
      setPrimaryFixtures(l.map(m => normalizeMatch(m, true)));
    } catch (e) {
      setPrimaryFixtures([]);
    } finally {
      if (!silent) setPrimaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPrimaryDate) { setPrimaryFixtures([]); setPrimaryLoading(false); return; }
    fetchPrimary(selectedDate);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => { if (selectedDate) loadDateFixtures(selectedDate); }, [selectedDate, loadDateFixtures]);

  useEffect(() => {
    if (!isPrimaryDate) return;
    const interval = setInterval(() => { fetchPrimary(selectedDate, true); }, LIVE_REFRESH);
    return () => clearInterval(interval);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => {
    if (selectedDate !== getLocalDateStr(0)) return;
    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!lm || lm.length === 0) return;
      const liveMap = new Map(lm.map(m => [String(m.id), m]));
      setPrimaryFixtures(prev => prev.map(f => {
        const freshMatch = liveMap.get(String(f.id));
        if (freshMatch) return { ...f, ...freshMatch };
        if (f.isLive) {
          const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
          if (ko > 0 && Date.now() > ko + (2 * 60 * 60 * 1000)) return { ...f, isLive: false, isFinished: true, status: MatchStatus.FT };
        }
        const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
        if (!f.isLive && !f.isStarted && ko > 0 && Date.now() > ko && !f.isFinished) return { ...f, isStarted: true, status: MatchStatus.STARTED };
        return f;
      }));
    });
    return () => unsub();
  }, [selectedDate]);

  const backupFixtures = useMemo(() => {
    return (backupRaw || []).map(m => normalizeMatch(m, false)).filter(m => m.dateStr === selectedDate);
  }, [backupRaw, selectedDate]);

  useEffect(() => {
    const needsRescue = primaryFixtures.length === 0 && backupFixtures.length > 0 && !primaryLoading;
    if (needsRescue && !ui.rescued) {
      setUI(prev => ({ ...prev, rescued: true }));
      if (!rescueToastSent.current) { rescueToastSent.current = true; addToast({ type: 'rescue', msg: pick(CMT.rescue), detail: `Showing ${backupFixtures.length} games from backup`, dur: 4000 }); }
    }
    if (!needsRescue && ui.rescued) { setUI(prev => ({ ...prev, rescued: false })); rescueToastSent.current = false; }
  }, [primaryFixtures.length, backupFixtures.length, primaryLoading, ui.rescued, addToast]);

  useEffect(() => {
    if (!welcomeToastShown.current && !primaryLoading && primaryFixtures.length > 0) {
      const live = primaryFixtures.filter(m => m.isLive && (m.homeScore > 0 || m.awayScore > 0));
      if (live.length > 0) {
        welcomeToastShown.current = true;
        setTimeout(() => { addToast({ type: 'status', st: 'live', msg: `${live.length} live match${live.length > 1 ? 'es' : ''} with goals!`, detail: 'Scores updating in real-time', dur: 3500 }); }, 800);
      }
    }
  }, [primaryFixtures, primaryLoading, addToast]);

  useEffect(() => {
    rescueToastSent.current = false; welcomeToastShown.current = false;
    setExpanded(null); setExpandedLeagues(new Set()); setSearchQ('');
    setUI(prev => ({ ...prev, rescued: false, leagueFilterOpen: false, moreDatesOpen: false, showLiveOnly: false, showAllTopMatches: false, showAllLiveMatches: false }));
  }, [selectedDate]);

  const allFixtures = useMemo(() => {
    let list = primaryFixtures.length > 0 ? primaryFixtures : backupFixtures;
    const uniqueIds = new Set();
    return list.filter(m => { const idStr = String(m.id); if (uniqueIds.has(idStr)) return false; uniqueIds.add(idStr); return true; });
  }, [primaryFixtures, backupFixtures]);

  const fixtureCompList = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => { if (!map.has(m.leagueName)) map.set(m.leagueName, { value: m.leagueName, name: m.leagueName, emblem: m.leagueLogo }); });
    return [...map.values()].sort((a, b) => (leaguePriorityMap[a.name] ?? 99) - (leaguePriorityMap[b.name] ?? 99));
  }, [allFixtures, leaguePriorityMap]);

  const displayFixtures = useMemo(() => {
    let list = allFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (ui.showLiveOnly) list = list.filter(m => m.isLive);
    if (normalizedSearch) { const terms = normalizedSearch.split(/\s+/).filter(Boolean); if (terms.length) list = list.filter(m => matchQ(m, terms)); }
    return list;
  }, [allFixtures, compFilter, ui.showLiveOnly, normalizedSearch]);

  const topMatches = useMemo(() => {
    return allFixtures.filter(m => {
      const home = norm(m.homeName); const away = norm(m.awayName);
      const isTopHome = [...TOP_TEAMS_SET].some(t => home.includes(t));
      const isTopAway = [...TOP_TEAMS_SET].some(t => away.includes(t));
      return isTopHome || isTopAway;
    }).sort(sortMatches);
  }, [allFixtures]);

  // ★ NEW LOGIC: Show 2 Top Matches, hide rest in button
  const visibleTopMatches = ui.showAllTopMatches ? topMatches : topMatches.slice(0, 2);
  const hiddenTopCount = topMatches.length - 2;

  const topMatchIds = useMemo(() => new Set(topMatches.map(m => String(m.id))), [topMatches]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (favs.has(String(m.id))) return; 
      if (topMatchIds.has(String(m.id))) return; 
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, matches: [] });
      map.get(key).matches.push(m);
    });
    map.forEach(g => g.matches.sort(sortMatches));
    return [...map.values()].sort((a, b) => {
      const pA = pinnedLeagues.has(a.name) ? 0 : 1;
      const pB = pinnedLeagues.has(b.name) ? 0 : 1;
      if (pA !== pB) return pA - pB;
      const lA = leaguePriorityMap[a.name] ?? 99;
      const lB = leaguePriorityMap[b.name] ?? 99;
      if (lA !== lB) return lA - lB;
      return a.name.localeCompare(b.name);
    });
  }, [displayFixtures, favs, leaguePriorityMap, pinnedLeagues, topMatchIds]);

  const { topLeagues, otherLeagues } = useMemo(() => {
    return { topLeagues: grouped.slice(0, 5).map(g => ({...g, isTop: true})), otherLeagues: grouped.slice(5).map(g => ({...g, isTop: false})) };
  }, [grouped]);

  const toggleLeagueExpand = useCallback((leagueName) => {
    setExpandedLeagues(prev => { const n = new Set(prev); if (n.has(leagueName)) n.delete(leagueName); else n.add(leagueName); return n; });
  }, []);

  const globalCompList = useMemo(() => {
    return (competitions || []).map(c => ({ id: String(c.id), code: c.code, name: c.name, emblem: c.emblem })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [competitions]);

  const topGlobalComps = useMemo(() => globalCompList.filter(c => TOP_5_CODES.includes(c.code)), [globalCompList]);
  const otherGlobalComps = useMemo(() => globalCompList.filter(c => !TOP_5_CODES.includes(c.code)), [globalCompList]);

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favs.has(String(m.id))), [displayFixtures, favs]);
  
  // ★ NEW LOGIC: Show 5 Live Matches, hide rest in button
  const liveMatches = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures.filter(m => m.isLive);
    return (backupLive || []).map(m => normalizeMatch(m, false)).filter(m => m.isLive);
  }, [primaryFixtures, backupLive]);
  
  const visibleLiveMatches = ui.showAllLiveMatches ? liveMatches : liveMatches.slice(0, 5);
  const hiddenLiveCount = liveMatches.length - 5;

  const { matchState, confettiKey } = useNotifications({ liveMatches, isFav, tab, addToast });

  const handleMatchToggle = useCallback((matchId) => {
    setExpanded(prev => prev === matchId ? null : matchId);
  }, []);

  const handleNavigateToMatch = useCallback((matchId) => {
    const m = displayFixtures.find(x => String(x.id) === String(matchId));
    if (m) {
      const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
      navigate(`/match/${m.id}/${slug}`);
    }
  }, [displayFixtures, navigate]);

  const handleReactNow = useCallback((match) => {
    navigate('/studio/reactor', {
      state: {
        fixtureId: match.id,
        homeTeam: match.homeName,
        awayTeam: match.awayName,
        homeLogo: match.homeLogo,
        awayLogo: match.awayLogo,
        score: { home: match.homeScore, away: match.awayScore },
        minute: match.minute,
        scorer: match.homeScore > match.awayScore ? match.homeName : match.awayName, 
        competition: match.leagueName
      }
    });
  }, [navigate]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refreshFixtures(), fetchPrimary(selectedDate)]);
  }, [refreshFixtures, fetchPrimary, selectedDate]);

  const onSearchChange = useCallback((e) => { setSearchQ(e.target.value); }, []);

  const currentLeagueEmblem = useMemo(() => {
    if (compFilter === 'ALL') return null;
    return fixtureCompList.find(c => c.value === compFilter)?.emblem || null;
  }, [compFilter, fixtureCompList]);

  return (
    <div className="zoka-page" style={{ fontSize: `${fontScale * 16}px` }}>
      <SEO 
        title="Football Fixtures, Live Scores & Tables | ZOKA"
        description="Get the latest football fixtures, live scores, league tables, and match predictions on ZOKA."
        keywords="football fixtures, live scores, ZOKA"
        path="/mastergames" 
        robots="index,follow"
      />
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="zoka-wrap">
        <div className="zoka-hdr">
          <div className="zoka-hdr-title">
            <h1><Activity size={18} style={{ color: '#10b981' }} /> Zoka <span>Live</span></h1>
            <div className="zoka-hdr-sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="zoka-hdr-actions">
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.max(0.8, p - 0.1))} title="Decrease Font Size"><Minus size={16} /></button>
            <button className="zoka-hdr-btn" onClick={() => setFontScale(p => Math.min(1.4, p + 0.1))} title="Increase Font Size"><Plus size={16} /></button>
            <button className={`zoka-hdr-btn ${ui.soundOn ? 'active' : ''}`} onClick={() => toggleUI('soundOn')} title="Sound">
              {ui.soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button className="zoka-hdr-btn" onClick={handleRefresh} title="Refresh">
              <RefreshCw size={18} className={primaryLoading || backupLoading ? 'zoka-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="zoka-stats">
          <div className="zoka-schip"><div className="val live-c">{liveCount}</div><div className="lbl">Live</div></div>
          <div className="zoka-schip"><div className="val total-c">{displayFixtures.length}</div><div className="lbl">Matches</div></div>
          <div className="zoka-schip"><div className="val fav-c">{favs.size}</div><div className="lbl">Favourites</div></div>
        </div>

        <div className="zoka-datenav">
          <button className={`zoka-nav-btn ${selectedDate === getLocalDateStr(-1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(-1))}>Yesterday</button>
          <button className={`zoka-nav-btn ${selectedDate === getLocalDateStr(0) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(0))}>Today</button>
          <button className={`zoka-nav-btn ${selectedDate === getLocalDateStr(1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(1))}>Tomorrow</button>
          <div className="zoka-more-wrap" ref={moreRef}>
            <button className={`zoka-more-btn ${ui.moreDatesOpen ? 'open' : ''}`} onClick={() => toggleUI('moreDatesOpen')}>
              <Calendar size={16} /> More <ChevronDown size={16} />
            </button>
            {ui.moreDatesOpen && (
              <div className="zoka-more-dropdown">
                <div className="zoka-more-label">Past Dates</div>
                {dates.past.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
                <div className="zoka-more-label" style={{ marginTop: '8px' }}>Future Dates</div>
                {dates.future.map(d => (<button key={d.str} className={`zoka-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setUI(prev => ({ ...prev, moreDatesOpen: false })); }}>{d.label}</button>))}
              </div>
            )}
          </div>
        </div>

        <div className="zoka-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`zoka-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'fixtures' ? 'Fixtures' : t === 'favourites' ? 'Favs' : t === 'standings' ? 'Table' : t === 'teams' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        <div className="zoka-search-static">
          <Search size={18} style={{ color: '#475569', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams, leagues, or matches..." value={searchQ} onChange={onSearchChange} />
          {searchQ && <button className="zoka-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {tab === 'fixtures' && (
          <>
            {ui.rescued && (
              <div className="zoka-rescue">
                <div className="zoka-rescue-icon"><AlertTriangle size={18} /></div>
                <div>
                  <div className="zoka-rescue-title">Backup Source Active</div>
                  <div className="zoka-rescue-sub">Showing {backupFixtures.length} games from global feed</div>
                </div>
              </div>
            )}

            {/* ★ TOP MATCHES SECTION (Show 2, rest in button) */}
            {topMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Flame size={18} style={{ color: '#fbbf24' }} />
                  <span className="zoka-league-name">Top Matches</span>
                </div>
                {visibleTopMatches.map((m, i) => 
                  <MatchCard key={`top-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />
                )}
                {hiddenTopCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllTopMatches')}>
                    {ui.showAllTopMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllTopMatches ? 'Show less' : `Show ${hiddenTopCount} more top matches`}
                  </button>
                )}
              </div>
            )}

            {/* ★ LIVE MATCHES SECTION (Show 5, rest in button) */}
            {liveMatches.length > 0 && !searchQ && (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <TrendingUp size={18} style={{ color: '#ef4444' }} />
                  <span className="zoka-league-name">Live Matches</span>
                </div>
                {visibleLiveMatches.map((m, i) => 
                  <MatchCard key={`live-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />
                )}
                {hiddenLiveCount > 0 && (
                  <button className="zoka-show-more" onClick={() => toggleUI('showAllLiveMatches')}>
                    {ui.showAllLiveMatches ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    {ui.showAllLiveMatches ? 'Show less' : `Show ${hiddenLiveCount} more live matches`}
                  </button>
                )}
              </div>
            )}

            {fixtureCompList.length > 0 && (
              <div className="zoka-filter-row">
                <button className="zoka-pill" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => toggleUI('leagueFilterOpen')}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {currentLeagueEmblem && <img src={currentLeagueEmblem} alt="" style={{ width: '16px', height: '16px' }} onError={e => { e.target.style.display = 'none'; }} />}
                    {compFilter === 'ALL' ? 'All Leagues' : compFilter}
                  </span>
                  <ChevronDown size={16} />
                </button>
                {ui.leagueFilterOpen && (
                  <div className="zoka-filter-panel" style={{ position: 'static' }}>
                    <button className={`zoka-filter-item ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setCompFilter('ALL'); setUI(prev => ({ ...prev, leagueFilterOpen: false })); }}>All Leagues</button>
                    {fixtureCompList.map(c => (
                      <button key={c.value} className={`zoka-filter-item ${compFilter === String(c.value) ? 'active' : ''}`} onClick={() => { setCompFilter(String(c.value)); setUI(prev => ({ ...prev, leagueFilterOpen: false })); }}>
                        {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <button 
                  className={`zoka-pill ${ui.showLiveOnly ? 'active' : ''}`} 
                  onClick={() => toggleUI('showLiveOnly')}
                  style={{ flexShrink: 0, marginTop: '8px', justifyContent: 'center' }}
                >
                  {ui.showLiveOnly ? <span className="zoka-dot" style={{ background: '#ef4444' }} /> : <Activity size={14} />}
                  {ui.showLiveOnly ? 'Live Only' : 'Show Live'}
                </button>
              </div>
            )}

            {primaryLoading && isPrimaryDate ? (
              <Skeleton count={5} />
            ) : displayFixtures.length === 0 ? (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Calendar size={28} /></div>
                <p>No fixtures scheduled for this date.</p>
                <p className="zoka-empty-hint">Try another date or clear your search.</p>
                {searchQ && <button className="zoka-empty-action" onClick={() => setSearchQ('')}>Clear Search</button>}
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="zoka-section">
                    <div className="zoka-league-hd">
                      <Star size={18} className="zoka-fav-icon" />
                      <span className="zoka-league-name">Favourites</span>
                    </div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
                  </div>
                )}

                {topLeagues.map(g => (
                  <LeagueSection 
                    key={g.name} 
                    group={g} 
                    expanded={expanded} 
                    onToggle={handleMatchToggle} 
                    onNavigate={handleNavigateToMatch}
                    isExpanded={expandedLeagues.has(g.name)} 
                    toggleLeagueExpand={toggleLeagueExpand}
                    matchState={matchState}
                    isFav={isFav}
                    onFav={toggleFav}
                    isPinned={pinnedLeagues.has(g.name)}
                    onTogglePin={togglePinLeague}
                    onReactNow={handleReactNow}
                  />
                ))}

                {otherLeagues.map(g => (
                  <LeagueSection 
                    key={g.name} 
                    group={g} 
                    expanded={expanded} 
                    onToggle={handleMatchToggle} 
                    onNavigate={handleNavigateToMatch}
                    isExpanded={expandedLeagues.has(g.name)} 
                    toggleLeagueExpand={toggleLeagueExpand}
                    matchState={matchState}
                    isFav={isFav}
                    onFav={toggleFav}
                    isPinned={pinnedLeagues.has(g.name)}
                    onTogglePin={togglePinLeague}
                    onReactNow={handleReactNow}
                  />
                ))}

                <div className="zoka-seo-links">
                  <h3>Today's Match Links</h3>
                  {displayFixtures.slice(0, 50).map(m => {
                    const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
                    return (
                      <Link 
                        key={m.id} 
                        to={`/match/${m.id}/${slug}`} 
                        className="zoka-seo-link"
                        rel="bookmark"
                      >
                        {m.homeName} vs {m.awayName}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'favourites' && (
          <>
            {favMatches.length > 0 ? (
              <div className="zoka-section">
                <div className="zoka-league-hd">
                  <Star size={18} className="zoka-fav-icon" />
                  <span className="zoka-league-name">Favourites ({favMatches.length})</span>
                </div>
                {favMatches.map((m, i) => <MatchCard key={`fav-tab-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} matchState={matchState} isFav={isFav(m.id)} onFav={toggleFav} onReactNow={handleReactNow} />)}
              </div>
            ) : (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Star size={28} /></div>
                <p>No favourite matches found for this date</p>
                <p className="zoka-empty-hint">Tap the star icon on any match to add it here.</p>
              </div>
            )}
          </>
        )}

        {tab === 'standings' && (
          <Suspense fallback={<Skeleton count={3} />}>
            <CompetitionSelector selectedCompCode={selectedCompCode} onSelect={setSelectedCompCode} topGlobalComps={topGlobalComps} otherGlobalComps={otherGlobalComps} />
            {standingsLoading ? (
              <Skeleton count={3} />
            ) : standingsData && standingsData.standings ? (
              <div className="zoka-section">
                {standingsData.standings.map((group, i) => (
                  <div key={i} style={{ marginBottom: '24px' }}>
                    {group.group && <div className="zoka-league-hd"><span className="zoka-league-name">{group.group}</span></div>}
                    <div className="zoka-tbl-wrap">
                      <table className="zoka-tbl">
                        <thead>
                          <tr>
                            <th className="c">#</th><th>Team</th><th className="c">P</th><th className="c">W</th><th className="c">D</th><th className="c">L</th><th className="c">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.table?.map(row => (
                            <tr key={row.team?.id || row.position}>
                              <td className="pos">{row.position}</td>
                              <td>
                                <div className="tc">
                                  {row.team?.crest && <img src={row.team?.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                                  <span>{row.team?.shortName || row.team?.name || 'TBD'}</span>
                                </div>
                              </td>
                              <td className="sc">{row.playedGames}</td>
                              <td className="sc">{row.won}</td>
                              <td className="sc">{row.draw}</td>
                              <td className="sc">{row.lost}</td>
                              <td className="pc">{row.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Trophy size={28} /></div>
                <p>Select a competition above to view table</p>
              </div>
            )}
          </Suspense>
        )}

        {tab === 'teams' && (
          <Suspense fallback={<Skeleton count={5} />}>
            <CompetitionSelector selectedCompCode={selectedCompCode} onSelect={setSelectedCompCode} topGlobalComps={topGlobalComps} otherGlobalComps={otherGlobalComps} />
            {teamsLoading ? (
              <Skeleton count={5} />
            ) : teamsData && teamsData.teams ? (
              <div className="zoka-teams-grid">
                {teamsData.teams.map(t => (
                  <div key={t.id} className="zoka-team-card">
                    {t.crest && <img src={t.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <div className="name">{t.shortName || t.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Users size={28} /></div>
                <p>Select a competition above to view teams</p>
              </div>
            )}
          </Suspense>
        )}

        {tab === 'competitions' && (
          <Suspense fallback={<Skeleton count={5} />}>
            {competitions && competitions.length > 0 ? (
              <div className="zoka-teams-grid">
                {globalCompList.map(c => <CompCard key={c.id} c={c} />)}
              </div>
            ) : (
              <div className="zoka-empty">
                <div className="zoka-empty-icon"><Trophy size={28} /></div>
                <p>No competitions data available</p>
              </div>
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}