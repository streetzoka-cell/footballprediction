// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/MasterGames.jsx
// v12.1 Ultimate — 10/10 Performance, SEO, and Readability
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, AlertTriangle, Activity, Plus, Minus
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';
import SEO from '../components/SEO';

const getYesterdayStr = () => getLocalDateStr(-1);
const getTomorrowStr = () => getLocalDateStr(1);

const TOP_5_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1']; 
const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const LEAGUE_PRIORITY = {
  'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3,
  'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7,
  'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11,
  'Süper Lig': 12, 'Championship': 13,
};
const getLeaguePriority = (name) => LEAGUE_PRIORITY[name] || 99;

const injectStyles = () => {
  if (document.getElementById('mg11-css')) return;
  const s = document.createElement('style');
  s.id = 'mg11-css';
  s.textContent = `
    @keyframes mg11FadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mg11SlideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mg11Pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}
    @keyframes mg11ScorePop{0%{transform:scale(1)}40%{transform:scale(1.4);color:#fff;text-shadow:0 0 12px rgba(255,255,255,.6)}100%{transform:scale(1)}}
    @keyframes mg11GoalFlash{0%{background:rgba(16,185,129,.15)}100%{background:transparent}}
    @keyframes mg11LiveGlow{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,.2), 0 4px 20px rgba(0,0,0,0.3)}50%{box-shadow:0 0 15px 1px rgba(239,68,68,.4), 0 4px 20px rgba(0,0,0,0.3)}}
    @keyframes mg11Expand{from{opacity:0;max-height:0}to{opacity:1;max-height:1500px}}
    @keyframes mg11ToastIn{from{opacity:0;transform:translateY(-20px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mg11Confetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-150px) rotate(720deg);opacity:0}}
    @keyframes mg11Shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes mg11StatusIn{from{opacity:0;transform:scale(.8)}15%{opacity:1;transform:scale(1.05)}25%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.8)}}
    @keyframes mg11Spin{to{transform:rotate(360deg)}}
    @keyframes mg11DropDownIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

    .mg11-page{min-height:100vh;background:radial-gradient(circle at top right, #1e293b, #0a0f1a);padding:0 0 120px;position:relative;color:#f8fafc;font-weight:600;overflow-x:hidden}
    .mg11-wrap{max-width:560px;margin:0 auto;padding:0 12px;position:relative;z-index:1}

    .mg11-hdr{position:sticky;top:0;z-index:50;background:rgba(10,15,26,.75);backdrop-filter:blur(20px) saturate(1.8);-webkit-backdrop-filter:blur(20px) saturate(1.8);padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mg11-hdr-title{display:flex;flex-direction:column;flex:1;min-width:0}
    .mg11-hdr-title h1{margin:0;font-size:1.2em;font-weight:900;letter-spacing:-.02em;color:#fff;display:flex;align-items:center;gap:6px}
    .mg11-hdr-title .sub{font-size:.7em;color:#cbd5e1;font-weight:700;margin-top:2px}
    .mg11-hdr-actions{display:flex;align-items:center;gap:6px}
    .mg11-hdr-btn{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#e2e8f0;cursor:pointer;transition:all .2s ease;-webkit-tap-highlight-color:transparent}
    .mg11-hdr-btn:hover{background:rgba(255,255,255,0.1);color:#fff;transform:translateY(-1px)}
    .mg11-hdr-btn.active{color:#10b981;border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.1)}
    .mg11-spin{animation:mg11Spin .8s linear infinite}

    .mg11-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
    .mg11-schip{background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:10px 6px;text-align:center;transition:transform .2s}
    .mg11-schip:hover{transform:translateY(-2px);background:rgba(255,255,255,0.05)}
    .mg11-schip .val{font-size:1.4em;font-weight:900;font-family:var(--font-display,system-ui);line-height:1}
    .mg11-schip .val.live-c{color:#ef4444}.mg11-schip .val.total-c{color:#10b981}.mg11-schip .val.fav-c{color:#f59e0b}
    .mg11-schip .lbl{font-size:.55em;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

    .mg11-datenav{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 auto 16px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:4px;width:fit-content;box-shadow:0 4px 12px rgba(0,0,0,.2)}
    .mg11-nav-btn{padding:8px 18px;border-radius:10px;border:none;background:transparent;color:#94a3b8;font-size:.75em;font-weight:800;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .mg11-nav-btn.active{background:#10b981;color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.3)}
    .mg11-more-wrap{position:relative}
    .mg11-more-btn{display:flex;align-items:center;gap:4px;padding:8px 14px;border-radius:10px;border:none;background:rgba(255,255,255,0.05);color:#e2e8f0;font-size:.72em;font-weight:700;cursor:pointer;font-family:inherit}
    .mg11-more-btn.open{background:rgba(16,185,129,.1);color:#10b981}
    .mg11-more-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;z-index:50;min-width:180px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:320px;overflow-y:auto;animation:mg11DropDownIn .2s ease-out both}
    .mg11-more-item{display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-radius:8px;background:none;color:#e2e8f0;font-size:.75em;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
    .mg11-more-item:hover{background:rgba(255,255,255,0.05)}
    .mg11-more-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .mg11-more-label{font-size:.6em;font-weight:800;text-transform:uppercase;color:#64748b;padding:8px 12px 4px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:4px}

    .mg11-tabs{display:flex;gap:4px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:4px;margin-bottom:16px}
    .mg11-tab{flex:1;padding:10px 4px;border:none;border-radius:10px;background:transparent;color:#94a3b8;font-size:.7em;font-weight:800;cursor:pointer;transition:all .2s ease;text-align:center;font-family:inherit;text-transform:uppercase}
    .mg11-tab.active{background:#10b981;color:#fff;box-shadow:0 4px 12px rgba(16,185,129,.25)}

    .mg11-search-static{display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);margin-bottom:16px}
    .mg11-search-static input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:.85em;font-weight:600;font-family:inherit}
    .mg11-search-static input::placeholder{color:#64748b}

    .mg11-filter-row{display:flex;gap:10px;align-items:flex-start;margin-bottom:16px}
    .mg11-pill-scroll{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding-bottom:4px;flex:1}
    .mg11-pill-scroll::-webkit-scrollbar{display:none}
    .mg11-pill{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#94a3b8;font-size:.72em;font-weight:800;cursor:pointer;transition:all .2s;white-space:nowrap;flex-shrink:0}
    .mg11-pill:hover{background:rgba(255,255,255,0.08);color:#fff}
    .mg11-pill.active{background:rgba(16,185,129,0.1);border-color:rgba(16,185,129,0.4);color:#10b981}
    .mg11-pill.live-active{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.4);color:#ef4444}
    .mg11-pill img{width:16px;height:16px;object-fit:contain}
    .mg11-dot{width:6px;height:6px;border-radius:50%;background:#ef4444;animation:mg11Pulse 1.2s ease-in-out infinite;flex-shrink:0}

    .mg11-filter-panel{background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;z-index:40;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:300px;overflow-y:auto;animation:mg11DropDownIn .2s ease-out both;margin-top:10px}
    .mg11-filter-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:8px;background:none;color:#e2e8f0;font-size:.75em;font-weight:700;cursor:pointer;font-family:inherit}
    .mg11-filter-item:hover{background:rgba(255,255,255,0.05)}
    .mg11-filter-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .mg11-filter-item img{width:18px;height:18px;object-fit:contain}

    .mg11-card{position:relative;overflow:hidden;padding:14px 16px;background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:8px;transition:all .25s cubic-bezier(.22,1,.36,1);animation:mg11SlideIn .3s ease both;cursor:pointer}
    .mg11-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);transform:translateY(-1px)}
    .mg11-card.live{border-color:rgba(239,68,68,.3);animation:mg11LiveGlow 2.5s ease-in-out infinite,mg11SlideIn .3s ease both}
    .mg11-card.finished{opacity:.7}
    .mg11-card.started{border-color:rgba(245,158,11,.3)}
    .mg11-card.scheduled{border-left:3px solid rgba(59,130,246,.4)}
    .mg11-card.expanded{border-radius:14px 14px 0 0;margin-bottom:0;border-color:rgba(16,185,129,.3)}
    .mg11-card.goal-flash{animation:mg11GoalFlash 2s ease-out both}
    .mg11-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

    .mg11-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .mg11-status{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:.55em;font-weight:900;letter-spacing:.02em;text-transform:uppercase}
    .mg11-status.live-s{color:#ef4444;background:rgba(239,68,68,.15)}
    .mg11-status.ft-s{color:#10b981;background:rgba(16,185,129,.1)}
    .mg11-status.time-s{color:#cbd5e1;background:rgba(255,255,255,0.06);font-size:.65em}
    .mg11-status.started-s{color:#f59e0b;background:rgba(245,158,11,.1);font-size:.6em}
    .mg11-card-actions{display:flex;align-items:center;gap:4px}
    .mg11-icon-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:none;background:transparent;color:#94a3b8;cursor:pointer;transition:all .15s ease;opacity:.5}
    .mg11-icon-btn.fav.active{color:#f59e0b;opacity:1;animation:mg11StarPop .4s ease}

    .mg11-teams{display:flex;align-items:center;gap:8px}
    .mg11-team-col{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
    .mg11-team-col.home{align-items:flex-end}
    .mg11-team-col.away{align-items:flex-start}
    .mg11-team-row{display:flex;align-items:center;gap:8px;min-width:0}
    .mg11-team-col.home .mg11-team-row{flex-direction:row-reverse}
    .mg11-crest{width:22px;height:22px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .mg11-team-name{font-size:.9em;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .mg11-team-col.home .mg11-team-name{text-align:right}
    
    .mg11-score-box{width:70px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .mg11-scores{display:flex;align-items:center;gap:6px}
    .mg11-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.3em;font-weight:900;min-width:20px;text-align:center;line-height:1;transition:color .2s}
    .mg11-score-num.live-score{color:#ef4444}
    .mg11-score-num.ft-score{color:#10b981}
    .mg11-score-num.pop{animation:mg11ScorePop .5s cubic-bezier(.22,1,.36,1) both}
    .mg11-sep{color:#64748b;font-size:.75em;font-weight:800;opacity:.5}
    .mg11-vs{font-size:.7em;font-weight:900;color:#64748b;opacity:.4}

    .mg11-comp-row{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)}
    .mg11-comp-row img{width:14px;height:14px;object-fit:contain;flex-shrink:0}
    .mg11-comp-row span{font-size:.6em;color:#94a3b8;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg11-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border-radius:inherit;z-index:3;pointer-events:none}
    .mg11-overlay-badge{padding:10px 24px;border-radius:12px;color:#fff;font-weight:900;font-size:.8em;letter-spacing:.05em;display:flex;align-items:center;gap:8px;animation:mg11StatusIn 3s ease both}

    .mg11-expanded{background:rgba(15,23,42,0.6);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 14px 14px;overflow:hidden;animation:mg11Expand .35s ease-out both}
    .mg11-exp-section{padding:12px 16px 4px;font-size:.6em;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
    .mg11-exp-row{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8em}
    .mg11-exp-row:last-child{border-bottom:none}
    .mg11-exp-label{color:#94a3b8;font-weight:700}
    .mg11-exp-val{color:#fff;font-weight:800;font-family:var(--font-display,system-ui)}
    
    .mg11-event-row{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8em}
    .mg11-event-min{font-weight:900;color:#cbd5e1;min-width:30px;font-variant-numeric:tabular-nums;font-family:var(--font-display,system-ui)}
    .mg11-event-icon{font-size:1.1em;flex-shrink:0}
    .mg11-event-text{flex:1;color:#fff;font-weight:700}
    .mg11-event-assist{font-size:.85em;color:#94a3b8;font-weight:600}

    .mg11-stat-row{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8em}
    .mg11-stat-home{text-align:right;color:#fff;font-weight:800}
    .mg11-stat-away{text-align:left;color:#fff;font-weight:800}
    .mg11-stat-label{text-align:center;color:#94a3b8;font-weight:700;font-size:.9em}
    .mg11-no-data{padding:20px;text-align:center;color:#94a3b8;font-size:.8em;opacity:.6;font-weight:600}

    .mg11-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:50px 24px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.05);border-radius:16px;text-align:center}
    .mg11-empty-icon{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);color:#64748b;margin-bottom:4px}
    .mg11-empty p{color:#cbd5e1;font-size:.85em;margin:0;font-weight:700}

    .mg11-sk{height:52px;border-radius:14px;background:linear-gradient(90deg,rgba(30,41,59,0.2) 25%,rgba(255,255,255,0.05) 50%,rgba(30,41,59,0.2) 75%);background-size:200% 100%;animation:mg11Shimmer 1.5s ease-in-out infinite;margin-bottom:8px}

    .mg11-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:calc(100% - 24px);max-width:400px}
    .mg11-toast{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px 18px;color:#fff;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.5);animation:mg11ToastIn .35s cubic-bezier(.22,1,.36,1) both;font-size:.8em}
    .mg11-toast-inner{display:flex;align-items:flex-start;gap:12px}
    .mg11-toast-icon{font-size:1.4em;flex-shrink:0;line-height:1}
    .mg11-toast-title{font-weight:900;font-size:.7em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
    .mg11-toast-msg{font-weight:700;line-height:1.3;opacity:.95}
    .mg11-toast-detail{font-size:.85em;opacity:.7;margin-top:2px}
    .mg11-toast-score{font-family:var(--font-display,system-ui);font-weight:900;font-size:1.2em;flex-shrink:0;margin-left:auto;text-shadow:0 0 12px rgba(255,255,255,.3)}

    .mg11-confetti{position:fixed;inset:0;pointer-events:none;z-index:400;overflow:hidden}
    .mg11-confetti-p{position:absolute;width:10px;height:10px;border-radius:3px;animation:mg11Confetti 1.6s ease-out forwards}

    .mg11-tbl-wrap{background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
    .mg11-tbl{width:100%;border-collapse:collapse;font-size:.8em}
    .mg11-tbl thead{background:rgba(255,255,255,0.02)}
    .mg11-tbl th{padding:10px 8px;font-size:.6em;font-weight:900;color:#94a3b8;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08)}
    .mg11-tbl th.c{text-align:center;width:28px}
    .mg11-tbl td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle}
    .mg11-tbl tr:last-child td{border-bottom:none}
    .mg11-tbl tr:hover{background:rgba(255,255,255,0.03)}
    .mg11-tbl .pos{font-weight:900;color:#cbd5e1;text-align:center;font-variant-numeric:tabular-nums}
    .mg11-tbl .tc{display:flex;align-items:center;gap:8px;min-width:0}
    .mg11-tbl .tc img{width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .mg11-tbl .tc span{font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg11-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:#cbd5e1}
    .mg11-tbl .pc{text-align:center;font-weight:900;color:#fff}

    .mg11-teams-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
    .mg11-team-card{background:rgba(30,41,59,0.4);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 10px;text-align:center;transition:transform .2s}
    .mg11-team-card:hover{transform:translateY(-2px);background:rgba(255,255,255,0.05)}
    .mg11-team-card img{width:36px;height:36px;object-fit:contain;margin:0 auto 8px;display:block}
    .mg11-team-card .name{font-size:.7em;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg11-show-more{width:100%;padding:12px;border:none;border-radius:12px;background:rgba(255,255,255,0.03);color:#94a3b8;font-size:.75em;font-weight:800;cursor:pointer;transition:all .2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px}
    .mg11-show-more:hover{background:rgba(16,185,129,.05);color:#10b981}

    .mg11-seo-links{text-align:center;padding:30px 0 10px;border-top:1px solid rgba(255,255,255,0.05);margin-top:30px}
    .mg11-seo-links h3{font-size:.75em;font-weight:900;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
    .mg11-seo-link{display:inline-block;font-size:.65em;color:#cbd5e1;text-decoration:none;border:1px solid rgba(255,255,255,0.08);padding:6px 12px;border-radius:8px;margin:3px;transition:all .2s;font-weight:700}
    .mg11-seo-link:hover{color:#10b981;border-color:#10b981;background:rgba(16,185,129,0.05)}

    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

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
  goal:["GOOOAL! The stadium erupts!","What a strike! Net ripped!","Pure football magic!"],
  ft:["Full Time! What a match!","Final whistle!"],
  ht:["Half Time! Regrouping...","HT — Manager's talk incoming!"],
  kickoff:["Kick Off! We're underway!","And we're off! Game on!"],
  rescue:["Backup Source Active","Switched to global feed"],
};
const pick = (a) => a[Math.floor(Math.random()*a.length)];

// ═══ Custom Hooks for Clean Logic ═══
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

  const isLiveStatus = useCallback((s) => s === 'IN_PLAY' || s === 'PAUSED' || s === '1H' || s === '2H' || s === 'ET' || s === 'BT' || s === 'LIVE', []);

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
        if (isLiveStatus(prev) && (curr === 'FINISHED' || curr === 'FT')) {
          const score = `${m.homeScore ?? 0}–${m.awayScore ?? 0}`;
          if (shouldNotify) addToast({ type: 'status', st: 'ft', msg: pick(CMT.ft), detail: `${m.homeName} vs ${m.awayName}`, score, dur: 4000 });
          if (Sound.on) Sound.whistle('ft');
          setStatusAnims(p => new Map([...p, [id, { type: 'ft', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
        if ((curr === 'HALF_TIME' || curr === 'HT') && prev !== 'HALF_TIME' && prev !== 'HT') {
          if (shouldNotify) addToast({ type: 'status', st: 'ht', msg: pick(CMT.ht), detail: `${m.homeName} vs ${m.awayName}`, dur: 3000 });
          if (Sound.on) Sound.whistle('ht');
          setStatusAnims(p => new Map([...p, [id, { type: 'ht', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
      }
      prevStatuses.current.set(id, curr);
    });
  }, [liveMatches, addToast, isFav, tab, isLiveStatus, setTO]);

  return { scorePops, flashGoals, statusAnims, confettiKey };
}

// ═══ Memoized UI Components ═══
const ToastContainer = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="mg11-toast-wrap">
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
          <div key={t.id} className="mg11-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="mg11-toast-inner">
              <span className="mg11-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mg11-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'LIVE ACTION'}</div>
                {t.msg && <div className="mg11-toast-msg">{t.msg}</div>}
                {t.detail && <div className="mg11-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="mg11-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
});

const Confetti = React.memo(({ active }) => {
  if (!active) return null;
  const colors = ['#ef4444','#10b981','#f59e0b','#3b82f6','#a855f7','#ec4899'];
  const p = Array.from({ length: 24 }, (_, i) => ({ left: 8 + Math.random() * 84, bottom: 80, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="mg11-confetti">
      {p.map((x, i) => <div key={i} className="mg11-confetti-p" style={{ left: x.left + '%', bottom: x.bottom + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
});

const MatchCard = React.memo(({ m, idx, expanded, onToggle, scorePops, flashGoals, statusAnims, isFav, onFav }) => {
  const isLive = m.isLive;
  const isHT = m.isHT;
  const isFt = m.isFinished;
  const isStarted = m.isStarted;
  const isSched = !isLive && !isHT && !isFt && !isStarted;
  const isExp = expanded === m.id;
  const id = String(m.id);
  const isFlash = flashGoals.has(id);
  const sa = statusAnims.get(id);
  const popSide = scorePops.get(id);

  let cls = 'mg11-card';
  if (isLive) cls += ' live';
  else if (isStarted) cls += ' started';
  else if (isFt) cls += ' finished';
  else if (isSched) cls += ' scheduled';
  if (isFlash) cls += ' goal-flash';
  if (sa?.type === 'ft') cls += ' ft-settle';
  if (isExp) cls += ' expanded';

  const barColor = isLive ? '#ef4444' : isStarted ? '#f59e0b' : isFt ? '#10b981' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 15 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 18 : 16 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isStarted || isFt) && <div className="mg11-left-bar" style={{ background: barColor }} />}
        <div className="mg11-card-top">
          <div>
            {isLive && <span className="mg11-status live-s"><span className="mg11-dot" /> {m.minute != null ? `${m.minute}'` : 'LIVE'}</span>}
            {isStarted && <span className="mg11-status started-s"><Clock size={10} /> STARTED</span>}
            {isHT && <span className="mg11-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>HT</span>}
            {isFt && <span className="mg11-status ft-s">FT</span>}
            {isSched && <span className="mg11-status time-s">{m.kickoff}</span>}
          </div>
          <div className="mg11-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`mg11-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={16} fill={isFav ? '#f59e0b' : 'none'} />
            </button>
          </div>
        </div>
        <div className="mg11-teams">
          <div className="mg11-team-col home">
            <div className="mg11-team-row">
              {m.homeLogo && <img className="mg11-crest" src={m.homeLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg11-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="mg11-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="mg11-scores">
                <span className={`mg11-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                <span className="mg11-sep">–</span>
                <span className={`mg11-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
              </div>
            ) : <span className="mg11-vs">VS</span>}
          </div>
          <div className="mg11-team-col away">
            <div className="mg11-team-row">
              {m.awayLogo && <img className="mg11-crest" src={m.awayLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg11-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        <div className="mg11-comp-row">
          {m.leagueLogo && <img src={m.leagueLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.leagueName}</span>
        </div>
        {sa && (
          <div className="mg11-overlay">
            <div className="mg11-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={16} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const LeagueSection = React.memo(({
    group,
    expanded,
    onToggle,
    isExpanded,
    toggleLeagueExpand,
    scorePops,
    flashGoals,
    statusAnims,
    isFav,
    onFav
}) => {
  const limit = group.isTop ? 5 : 1;
  const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
  const hiddenCount = group.matches.length - limit;
  
  return (
    <div className="mg11-section" style={{ marginBottom: '20px' }}>
      <div className="mg11-league-hd" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
        {group.logo && <img src={group.logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px' }} onError={e => { e.target.style.display = 'none'; }} />}
        <span style={{ fontSize: '.75em', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{group.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: '.55em', fontWeight: 700, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>{group.matches.length}</span>
      </div>
      {visibleMatches.map((m, i) => (
          <MatchCard
              key={`${group.name}-${m.id}-${i}`}
              m={m}
              idx={i}
              expanded={expanded}
              onToggle={onToggle}
              scorePops={scorePops}
              flashGoals={flashGoals}
              statusAnims={statusAnims}
              isFav={isFav(m.id)}
              onFav={onFav}
          />
      ))}
      {hiddenCount > 0 && (
        <button className="mg11-show-more" onClick={() => toggleLeagueExpand(group.name)}>
          {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
        </button>
      )}
    </div>
  );
});

// ═══ Helper Functions ═══
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

  const isLive = isPrimary ? !!raw.isLive : (status === 'IN_PLAY' || status === 'PAUSED' || status === '1H' || status === '2H' || status === 'ET' || status === 'BT' || status === 'LIVE');
  const isHT = status === 'HT' || status === 'BT' || status === 'HALF_TIME';
  const isFinished = isPrimary ? !!raw.isFinished : (status === 'FINISHED' || status === 'FT' || status === 'AET' || status === 'PEN');
  
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
    homeScore, awayScore,
    leagueName: isPrimary ? (raw.league?.name || 'Other') : (raw.competition?.name || raw.league?.name || 'Other'),
    leagueLogo: isPrimary ? (raw.league?.emblem || raw.league?.logo) : (raw.competition?.emblem || raw.league?.logo),
    score: raw.score, 
    stats: raw.stats || raw.matchStats || [],
  };
}

// ═══ Main Component ═══
export default function MasterGames() {
  injectStyles();
  const navigate = useNavigate();

  const { fixtures: backupRaw, liveMatches: backupLive, competitions, loading: backupLoading, loadDateFixtures, getStandings, getTeams, refreshFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg11_favs') || '[]')); } catch { return new Set(); } });
  const toggleFav = useCallback(id => { setFavs(p => { const n = new Set(p); const idStr = String(id); if (n.has(idStr)) n.delete(idStr); else n.add(idStr); try { localStorage.setItem('mg11_favs', JSON.stringify([...n])); } catch {} return n; }); }, []);
  const isFav = useCallback(id => favs.has(String(id)), [favs]);

  const [tab, setTab] = useState('fixtures');
  const [compFilter, setCompFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  
  // Point 7: useDeferredValue for smooth search
  const deferredSearch = useDeferredValue(searchQ);

  const [soundOn, setSoundOn] = useState(true);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [rescued, setRescued] = useState(false);
  const [moreDatesOpen, setMoreDatesOpen] = useState(false);
  const [leagueSearchOpen, setLeagueSearchOpen] = useState(false);
  const [leagueSearchQ, setLeagueSearchQ] = useState('');
  const rescueToastSent = useRef(false);
  const welcomeToastShown = useRef(false);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  
  const [fontScale, setFontScale] = useState(() => { try { return parseFloat(localStorage.getItem('mg11_fontscale') || '1'); } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem('mg11_fontscale', String(fontScale)); } catch {} }, [fontScale]);
  
  const [selectedCompCode, setSelectedCompCode] = useState(null);
  const moreRef = useRef(null);

  const pastDates = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = getLocalDateStr(-(i + 2)); 
    return { str: d, label: formatDateShort(d) };
  }).reverse(), []); 

  const futureDates = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = getLocalDateStr(i + 2); 
    return { str: d, label: formatDateShort(d) };
  }), []);

  useEffect(() => { Sound.on = soundOn; }, [soundOn]);

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreDatesOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isPrimaryDate = [getYesterdayStr(), getTodayStr(), getTomorrowStr()].includes(selectedDate);

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
    if (!isPrimaryDate) {
      setPrimaryFixtures([]);
      setPrimaryLoading(false);
      return;
    }
    fetchPrimary(selectedDate);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => {
    if (selectedDate) loadDateFixtures(selectedDate);
  }, [selectedDate, loadDateFixtures]);

  useEffect(() => {
    if (!isPrimaryDate) return;
    const interval = setInterval(() => {
      fetchPrimary(selectedDate, true);
    }, 45000);
    return () => clearInterval(interval);
  }, [selectedDate, isPrimaryDate, fetchPrimary]);

  useEffect(() => {
    if (selectedDate !== getTodayStr()) return;

    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!lm || lm.length === 0) return;
      const liveMap = new Map(lm.map(m => [String(m.id), m]));
      
      setPrimaryFixtures(prev => prev.map(f => {
        const freshMatch = liveMap.get(String(f.id));
        if (freshMatch) return { ...f, ...freshMatch };
        if (f.isLive) {
          const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
          if (ko > 0 && Date.now() > ko + (2 * 60 * 60 * 1000)) {
            return { ...f, isLive: false, isFinished: true, status: 'FT' };
          }
        }
        const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
        if (!f.isLive && !f.isStarted && ko > 0 && Date.now() > ko && !f.isFinished) {
          return { ...f, isStarted: true, status: 'STARTED' };
        }
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
    if (needsRescue && !rescued) {
      setRescued(true);
      if (!rescueToastSent.current) {
        rescueToastSent.current = true;
        addToast({ type: 'rescue', msg: pick(CMT.rescue), detail: `Showing ${backupFixtures.length} games from backup`, dur: 4000 });
      }
    }
    if (!needsRescue) {
      setRescued(false);
      rescueToastSent.current = false;
    }
  }, [primaryFixtures.length, backupFixtures.length, primaryLoading, rescued, addToast]);

  useEffect(() => {
    if (!welcomeToastShown.current && !primaryLoading && primaryFixtures.length > 0) {
      const live = primaryFixtures.filter(m => m.isLive && (m.homeScore > 0 || m.awayScore > 0));
      if (live.length > 0) {
        welcomeToastShown.current = true;
        setTimeout(() => {
          addToast({ type: 'status', st: 'live', msg: `${live.length} live match${live.length > 1 ? 'es' : ''} with goals!`, detail: 'Scores updating in real-time', dur: 3500 });
        }, 800);
      }
    }
  }, [primaryFixtures, primaryLoading, addToast]);

  // Point 9: Reset searchQ on date change
  useEffect(() => {
    setRescued(false);
    rescueToastSent.current = false;
    welcomeToastShown.current = false;
    setExpanded(null);
    setShowLiveOnly(false);
    setExpandedLeagues(new Set());
    setCompFilter('ALL');
    setSearchQ('');
  }, [selectedDate]);

  const allFixtures = useMemo(() => {
    let list = primaryFixtures.length > 0 ? primaryFixtures : backupFixtures;
    const uniqueIds = new Set();
    return list.filter(m => {
      const idStr = String(m.id);
      if (uniqueIds.has(idStr)) return false;
      uniqueIds.add(idStr);
      return true;
    });
  }, [primaryFixtures, backupFixtures]);

  // Point 5: Renamed 'id' to 'value'
  const fixtureCompList = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => {
      if (!map.has(m.leagueName)) map.set(m.leagueName, { value: m.leagueName, name: m.leagueName, emblem: m.leagueLogo });
    });
    return [...map.values()].sort((a, b) => getLeaguePriority(a.name) - getLeaguePriority(b.name));
  }, [allFixtures]);

  const displayFixtures = useMemo(() => {
    let list = allFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (showLiveOnly) list = list.filter(m => m.isLive);
    // Point 7: Use deferredSearch
    if (deferredSearch.trim()) {
      const terms = deferredSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => matchQ(m, terms));
    }
    return list;
  }, [allFixtures, compFilter, showLiveOnly, deferredSearch]);

  // Point 2: Filter favourites out of the main grouped lists
  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (favs.has(String(m.id))) return; // Skip favorites
      
      const key = m.leagueName || 'Other';
      if (!map.has(key)) map.set(key, { name: key, logo: m.leagueLogo, matches: [] });
      map.get(key).matches.push(m);
    });

    map.forEach(g => {
      g.matches.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1;
        if (!a.isLive && b.isLive) return 1;
        if (a.isHT && !b.isHT) return -1;
        if (!a.isHT && b.isHT) return 1;
        if (a.isFinished && !b.isFinished) return 1;
        if (!a.isFinished && b.isFinished) return -1;
        return (a.timestamp || 0) - (b.timestamp || 0);
      });
    });

    return [...map.values()].sort((a, b) => {
      const pa = getLeaguePriority(a.name);
      const pb = getLeaguePriority(b.name);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [displayFixtures, favs]);

  const { topLeagues, otherLeagues } = useMemo(() => {
    return { topLeagues: grouped.slice(0, 5).map(g => ({...g, isTop: true})), otherLeagues: grouped.slice(5).map(g => ({...g, isTop: false})) };
  }, [grouped]);

  const toggleLeagueExpand = useCallback((leagueName) => {
    setExpandedLeagues(prev => {
      const n = new Set(prev);
      if (n.has(leagueName)) n.delete(leagueName);
      else n.add(leagueName);
      return n;
    });
  }, []);

  const globalCompList = useMemo(() => {
    return (competitions || []).map(c => ({
      id: String(c.id),
      code: c.code,
      name: c.name,
      emblem: c.emblem
    })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [competitions]);

  const topGlobalComps = useMemo(() => globalCompList.filter(c => TOP_5_CODES.includes(c.code)), [globalCompList]);
  const otherGlobalComps = useMemo(() => globalCompList.filter(c => !TOP_5_CODES.includes(c.code)), [globalCompList]);
  const filteredOtherComps = useMemo(() => {
    if (!leagueSearchQ.trim()) return otherGlobalComps;
    return otherGlobalComps.filter(c => (c.name || '').toLowerCase().includes(leagueSearchQ.toLowerCase()));
  }, [otherGlobalComps, leagueSearchQ]);

  const liveCount = useMemo(() => allFixtures.filter(m => m.isLive).length, [allFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favs.has(String(m.id))), [displayFixtures, favs]);

  const handleTabChange = useCallback(async (t) => {
    setTab(t);
    if (t === 'standings' || t === 'teams') {
      if (!selectedCompCode && globalCompList.length > 0) {
        setSelectedCompCode(globalCompList[0].code || globalCompList[0].id);
      }
    }
  }, [selectedCompCode, globalCompList]);

  const loadStandings = useCallback(async (code, force = false) => {
    setStandingsLoading(true);
    try { const data = await getStandings(code, force); setStandingsData(data); } catch {}
    setStandingsLoading(false);
  }, [getStandings]);

  const loadTeams = useCallback(async (code, force = false) => {
    setTeamsLoading(true);
    try { const data = await getTeams(code, force); setTeamsData(data); } catch {}
    setTeamsLoading(false);
  }, [getTeams]);

  useEffect(() => {
    if (selectedCompCode && tab === 'standings') loadStandings(selectedCompCode);
    if (selectedCompCode && tab === 'teams') loadTeams(selectedCompCode);
  }, [selectedCompCode, tab, loadStandings, loadTeams]);

  useEffect(() => {
    if (tab !== 'standings' && tab !== 'teams') return;
    const interval = setInterval(() => {
      if (tab === 'standings' && selectedCompCode) loadStandings(selectedCompCode, true);
      if (tab === 'teams' && selectedCompCode) loadTeams(selectedCompCode, true);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [tab, selectedCompCode, loadStandings, loadTeams]);

  const liveMatches = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures.filter(m => m.isLive);
    return (backupLive || []).map(m => normalizeMatch(m, false)).filter(m => m.isLive);
  }, [primaryFixtures, backupLive]);

  const { scorePops, flashGoals, statusAnims, confettiKey } = useNotifications({
    liveMatches,
    isFav,
    tab,
    addToast
  });

  // Point 3: Clean SEO URLs using useNavigate
  const handleMatchToggle = useCallback((matchId) => {
    if (matchId) {
      const m = displayFixtures.find(x => String(x.id) === String(matchId));
      if (m) {
        const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
        navigate(`/match/${m.id}/${slug}`);
      }
    } else {
      setExpanded(null);
    }
  }, [displayFixtures, navigate]);

  return (
    <div className="mg11-page" style={{ fontSize: `${fontScale * 16}px` }}>
      <SEO 
        title="Football Fixtures, Live Scores & Tables | ZOKASCORE"
        description="Get the latest football fixtures, live scores, league tables, and match predictions on ZOKASCORE."
        keywords="football fixtures, live scores, ZOKASCORE"
        path="/mastergames" 
        robots="index,follow"
      />
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mg11-wrap">
        {/* Clean Header */}
        <div className="mg11-hdr">
          <div className="mg11-hdr-title">
            <h1><Activity size={18} style={{ color: '#10b981' }} /> Master Games</h1>
            <div className="sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="mg11-hdr-actions">
            <button className="mg11-hdr-btn" onClick={() => setFontScale(p => Math.max(0.8, p - 0.1))} title="Decrease Font Size"><Minus size={16} /></button>
            <button className="mg11-hdr-btn" onClick={() => setFontScale(p => Math.min(1.4, p + 0.1))} title="Increase Font Size"><Plus size={16} /></button>
            <button className={`mg11-hdr-btn ${soundOn ? 'active' : ''}`} onClick={() => setSoundOn(p => !p)} title="Sound">
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            {/* Point 4: Refresh both primary and backup */}
            <button className="mg11-hdr-btn" onClick={() => { refreshFixtures(); fetchPrimary(selectedDate); }} title="Refresh">
              <RefreshCw size={18} className={primaryLoading || backupLoading ? 'mg11-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mg11-stats">
          <div className="mg11-schip">
            <div className="val live-c">{liveCount}</div>
            <div className="lbl">Live</div>
          </div>
          <div className="mg11-schip">
            <div className="val total-c">{displayFixtures.length}</div>
            <div className="lbl">Matches</div>
          </div>
          <div className="mg11-schip">
            <div className="val fav-c">{favs.size}</div>
            <div className="lbl">Favourites</div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="mg11-datenav">
          <button className={`mg11-nav-btn ${selectedDate === getLocalDateStr(-1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(-1))}>
            Yesterday
          </button>
          <button className={`mg11-nav-btn ${selectedDate === getLocalDateStr(0) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(0))}>
            Today
          </button>
          <button className={`mg11-nav-btn ${selectedDate === getLocalDateStr(1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(1))}>
            Tomorrow
          </button>
          <div className="mg11-more-wrap" ref={moreRef}>
            <button className={`mg11-more-btn ${moreDatesOpen ? 'open' : ''}`} onClick={() => setMoreDatesOpen(p => !p)}>
              <Calendar size={16} /> More <ChevronDown size={16} />
            </button>
            {moreDatesOpen && (
              <div className="mg11-more-dropdown">
                <div className="mg11-more-label">Past Dates</div>
                {pastDates.map(d => (
                  <button key={d.str} className={`mg11-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
                <div className="mg11-more-label" style={{ marginTop: '8px' }}>Future Dates</div>
                {futureDates.map(d => (
                  <button key={d.str} className={`mg11-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mg11-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`mg11-tab ${tab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>
              {t === 'fixtures' ? 'Fixtures' : t === 'favourites' ? 'Favs' : t === 'standings' ? 'Table' : t === 'teams' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        {/* Always Visible Search */}
        <div className="mg11-search-static">
          <Search size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams, leagues, or matches..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          {searchQ && <button style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {/* ═══ Fixtures Tab ═══ */}
        {tab === 'fixtures' && (
          <>
            {rescued && (
              <div className="mg11-rescue" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(251,191,36,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24', flexShrink: 0 }}>
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '.8em', fontWeight: 800, color: '#fbbf24' }}>Backup Source Active</div>
                  <div style={{ fontSize: '.65em', color: '#cbd5e1' }}>Showing {backupFixtures.length} games from global feed</div>
                </div>
              </div>
            )}

            {/* Point 5: Using 'value' in pills */}
            {fixtureCompList.length > 0 && (
              <div className="mg11-filter-row">
                <div className="mg11-pill-scroll">
                  <button 
                    className={`mg11-pill ${compFilter === 'ALL' ? 'active' : ''}`} 
                    onClick={() => setCompFilter('ALL')}
                  >
                    All Leagues
                  </button>
                  {fixtureCompList.map(c => (
                    <button 
                      key={c.value} 
                      className={`mg11-pill ${compFilter === String(c.value) ? 'active' : ''}`} 
                      onClick={() => setCompFilter(String(c.value))}
                    >
                      {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                      {c.name}
                    </button>
                  ))}
                </div>
                
                <button 
                  className={`mg11-pill ${showLiveOnly ? 'live-active' : ''}`} 
                  onClick={() => setShowLiveOnly(p => !p)}
                  style={{ flexShrink: 0 }}
                >
                  {showLiveOnly ? <span className="mg11-dot" style={{ background: '#ef4444' }} /> : <Activity size={14} />}
                  {showLiveOnly ? 'Live Only' : 'Show Live'}
                </button>
              </div>
            )}

            {primaryLoading && isPrimaryDate ? (
              <div>{[1,2,3,4,5].map(i => <div key={i} className="mg11-sk" style={{ animationDelay: i * 80 + 'ms' }} />)}</div>
            ) : displayFixtures.length === 0 ? (
              <div className="mg11-empty">
                <div className="mg11-empty-icon"><Search size={28} /></div>
                <p>No matches found for this date</p>
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="mg11-section" style={{ marginBottom: '20px' }}>
                    <div className="mg11-league-hd" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
                      <Star size={18} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: '.75em', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Favourites</span>
                    </div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
                  </div>
                )}

                {/* Point 1: Properly passing all props down from LeagueSection */}
                {topLeagues.map(g => (
                  <LeagueSection 
                    key={g.name} 
                    group={g} 
                    expanded={expanded} 
                    onToggle={handleMatchToggle} 
                    isExpanded={expandedLeagues.has(g.name)} 
                    toggleLeagueExpand={toggleLeagueExpand}
                    scorePops={scorePops}
                    flashGoals={flashGoals}
                    statusAnims={statusAnims}
                    isFav={isFav}
                    onFav={toggleFav}
                  />
                ))}

                {otherLeagues.map(g => (
                  <LeagueSection 
                    key={g.name} 
                    group={g} 
                    expanded={expanded} 
                    onToggle={handleMatchToggle} 
                    isExpanded={expandedLeagues.has(g.name)} 
                    toggleLeagueExpand={toggleLeagueExpand}
                    scorePops={scorePops}
                    flashGoals={flashGoals}
                    statusAnims={statusAnims}
                    isFav={isFav}
                    onFav={toggleFav}
                  />
                ))}

                {/* SEO Crawlable Links Footer */}
                <div className="mg11-seo-links">
                  <h3>Today's Match Links</h3>
                  {displayFixtures.slice(0, 50).map(m => {
                    const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
                    return (
                      <Link 
                        key={m.id} 
                        to={`/match/${m.id}/${slug}`} 
                        className="mg11-seo-link"
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

        {/* ═══ Favourites Tab ═══ */}
        {tab === 'favourites' && (
          <>
            {favMatches.length > 0 ? (
              <div className="mg11-section" style={{ marginBottom: '20px' }}>
                <div className="mg11-league-hd" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
                  <Star size={18} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: '.75em', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Favourites ({favMatches.length})</span>
                </div>
                {favMatches.map((m, i) => <MatchCard key={`fav-tab-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
              </div>
            ) : (
              <div className="mg11-empty">
                <div className="mg11-empty-icon"><Star size={28} /></div>
                <p>No favourite matches found for this date</p>
              </div>
            )}
          </>
        )}

        {/* ═══ Standings Tab (ALL LEAGUES) ═══ */}
        {tab === 'standings' && (
          <>
            <div className="mg11-pill-scroll" style={{ marginBottom: '10px' }}>
              {topGlobalComps.map(c => (
                <button key={c.id} className={`mg11-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => setSelectedCompCode(c.code)}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {c.code || c.name}
                </button>
              ))}
            </div>
            <button className="mg11-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setLeagueSearchOpen(p => !p)}>
              <Search size={16} />
              {leagueSearchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
              <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {leagueSearchOpen && (
              <div className="mg11-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
                <input className="mg11-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={leagueSearchQ} onChange={e => setLeagueSearchQ(e.target.value)} />
                {filteredOtherComps.length === 0 && <div className="mg11-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
                {filteredOtherComps.map(c => (
                  <button key={c.id} className={`mg11-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { setSelectedCompCode(c.code); setLeagueSearchOpen(false); setLeagueSearchQ(''); }}>
                    {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {standingsLoading ? (
              <div>{[1, 2, 3].map(i => <div key={i} className="mg11-sk" style={{ height: '320px', marginBottom: '14px', animationDelay: i * 80 + 'ms' }} />)}</div>
            ) : standingsData && standingsData.standings ? (
              <div className="mg11-section" style={{ marginBottom: '20px' }}>
                {standingsData.standings.map((group, i) => (
                  <div key={i} style={{ marginBottom: '24px' }}>
                    {group.group && <div className="mg11-league-hd" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 4px' }}><span style={{ fontSize: '.75em', fontWeight: 900, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{group.group}</span></div>}
                    <div className="mg11-tbl-wrap">
                      <table className="mg11-tbl">
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
                              <td className="sc" style={{ fontWeight: 900, color: '#fff' }}>{row.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mg11-empty">
                <div className="mg11-empty-icon"><Trophy size={28} /></div>
                <p>Select a competition above to view table</p>
              </div>
            )}
          </>
        )}

        {/* ═══ Teams Tab (ALL LEAGUES) ═══ */}
        {tab === 'teams' && (
          <>
            <div className="mg11-pill-scroll" style={{ marginBottom: '10px' }}>
              {topGlobalComps.map(c => (
                <button key={c.id} className={`mg11-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => setSelectedCompCode(c.code)}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {c.code || c.name}
                </button>
              ))}
            </div>
            <button className="mg11-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setLeagueSearchOpen(p => !p)}>
              <Search size={16} />
              {leagueSearchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
              <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {leagueSearchOpen && (
              <div className="mg11-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
                <input className="mg11-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={leagueSearchQ} onChange={e => setLeagueSearchQ(e.target.value)} />
                {filteredOtherComps.length === 0 && <div className="mg11-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
                {filteredOtherComps.map(c => (
                  <button key={c.id} className={`mg11-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { setSelectedCompCode(c.code); setLeagueSearchOpen(false); setLeagueSearchQ(''); }}>
                    {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {teamsLoading ? (
              <div>{[1, 2, 3, 4, 5].map(i => <div key={i} className="mg11-sk" style={{ height: '120px', marginBottom: '10px', animationDelay: i * 80 + 'ms' }} />)}</div>
            ) : teamsData && teamsData.teams ? (
              <div className="mg11-teams-grid">
                {teamsData.teams.map(t => (
                  <div key={t.id} className="mg11-team-card">
                    {t.crest && <img src={t.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <div className="name">{t.shortName || t.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mg11-empty">
                <div className="mg11-empty-icon"><Users size={28} /></div>
                <p>Select a competition above to view teams</p>
              </div>
            )}
          </>
        )}

        {/* ═══ Competitions Tab ═══ */}
        {tab === 'competitions' && (
          competitions && competitions.length > 0 ? (
            <div className="mg11-teams-grid">
              {globalCompList.map(c => (
                <div key={c.id} className="mg11-team-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                  {c.emblem && <img src={c.emblem} alt="" style={{ width: '32px', height: '32px', margin: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
                  <div className="name">{c.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mg11-empty">
              <div className="mg11-empty-icon"><Trophy size={28} /></div>
              <p>No competitions data available</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}