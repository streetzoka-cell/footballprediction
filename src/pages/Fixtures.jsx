// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/MasterGames.jsx
// v14.0 Ultimate — Smart Top Matches Detection
// ═════════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, AlertTriangle, Activity, Plus, Minus, Pin, TrendingUp, ArrowRight, Flame
} from 'lucide-react';

import { fetchFixtures, subscribeToLiveFixtures } from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';
import SEO from '../components/SEO';

// ─── Constants ───
const STORAGE_KEY_FAVS = "mg11_favs";
const STORAGE_KEY_PINNED = "mg11_pinned_leagues";
const STORAGE_KEY_FONT = "mg11_fontscale";
const LIVE_REFRESH = 45000;
const TOP_5_CODES = ['PL', 'PD', 'SA', 'BL1', 'FL1']; 

// ★ NEW: Top Teams Dictionary (Lowercase for smart matching)
const TOP_TEAMS_LIST = [
  'manchester united', 'manchester city', 'liverpool', 'chelsea', 'arsenal', 'tottenham hotspur', 'tottenham',
  'real madrid', 'barcelona', 'atletico madrid', 'athletic bilbao', 'sevilla', 'valencia',
  'bayern munich', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
  'paris saint germain', 'psg', 'marseille', 'lyon',
  'juventus', 'inter', 'ac milan', 'napoli', 'roma', 'lazio', 'atalanta',
  'benfica', 'porto', 'sporting cp',
  'ajax', 'psv eindhoven', 'feyenoord',
  'celtic', 'rangers',
  'flamengo', 'palmeiras', 'corinthians', 'sao paulo',
  'boca juniors', 'river plate'
];
const TOP_TEAMS_SET = new Set(TOP_TEAMS_LIST);

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

const injectStyles = () => {
  if (document.getElementById('mg14-css')) return;
  const s = document.createElement('style');
  s.id = 'mg14-css';
  s.textContent = `
    @keyframes mgFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mgSlideIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mgPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.4)}}
    @keyframes mgScorePop{0%{transform:scale(1)}40%{transform:scale(1.4);color:#fff;text-shadow:0 0 12px rgba(255,255,255,.6)}100%{transform:scale(1)}}
    @keyframes mgGoalFlash{0%{background:rgba(16,185,129,.15)}100%{background:transparent}}
    @keyframes mgLiveGlow{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,.2), 0 4px 20px rgba(0,0,0,0.3)}50%{box-shadow:0 0 15px 1px rgba(239,68,68,.4), 0 4px 20px rgba(0,0,0,0.3)}}
    @keyframes mgExpand{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}
    @keyframes mgToastIn{from{opacity:0;transform:translateY(-20px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mgConfetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-150px) rotate(720deg);opacity:0}}
    @keyframes mgShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes mgStatusIn{from{opacity:0;transform:scale(.8)}15%{opacity:1;transform:scale(1.05)}25%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.8)}}
    @keyframes mgSpin{to{transform:rotate(360deg)}}
    @keyframes mgDropDownIn{from{opacity:0;transform:translateY(-8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

    .mg-page{min-height:100vh;background:radial-gradient(circle at top right, #1e293b, #0a0f1a);padding:0 0 120px;position:relative;color:#f8fafc;font-weight:600;overflow-x:hidden}
    .mg-wrap{max-width:560px;margin:0 auto;padding:0 12px;position:relative;z-index:1}

    .mg-hdr{position:sticky;top:0;z-index:50;background:rgba(10,15,26,.75);backdrop-filter:blur(20px) saturate(1.8);-webkit-backdrop-filter:blur(20px) saturate(1.8);padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mg-hdr-title{display:flex;flex-direction:column;flex:1;min-width:0}
    .mg-hdr-title h1{margin:0;font-size:1.2em;font-weight:900;letter-spacing:-.02em;color:#fff;display:flex;align-items:center;gap:6px}
    .mg-hdr-sub{font-size:.7em;color:#cbd5e1;font-weight:700;margin-top:2px}
    .mg-hdr-actions{display:flex;align-items:center;gap:6px}
    .mg-hdr-btn{width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;color:#e2e8f0;cursor:pointer;transition:all .2s ease;-webkit-tap-highlight-color:transparent}
    .mg-hdr-btn:hover{background:rgba(255,255,255,0.1);color:#fff;transform:translateY(-1px)}
    .mg-hdr-btn.active{color:#10b981;border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.1)}
    .mg-spin{animation:mgSpin .8s linear infinite}

    .mg-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}
    .mg-schip{background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.05);border-radius:14px;padding:10px 6px;text-align:center;transition:transform .2s}
    .mg-schip .val{font-size:1.4em;font-weight:900;font-family:var(--font-display,system-ui);line-height:1}
    .mg-schip .val.live-c{color:#ef4444}.mg-schip .val.total-c{color:#10b981}.mg-schip .val.fav-c{color:#f59e0b}
    .mg-schip .lbl{font-size:.55em;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}

    .mg-datenav{display:flex;align-items:center;justify-content:center;gap:4px;margin:0 auto 16px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:4px;width:fit-content;box-shadow:0 4px 12px rgba(0,0,0,.2)}
    .mg-nav-btn{padding:8px 18px;border-radius:10px;border:none;background:transparent;color:#94a3b8;font-size:.75em;font-weight:800;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .mg-nav-btn.active{background:#10b981;color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.3)}
    .mg-more-wrap{position:relative}
    .mg-more-btn{display:flex;align-items:center;gap:4px;padding:8px 14px;border-radius:10px;border:none;background:rgba(255,255,255,0.05);color:#e2e8f0;font-size:.72em;font-weight:700;cursor:pointer;font-family:inherit}
    .mg-more-btn.open{background:rgba(16,185,129,.1);color:#10b981}
    .mg-more-dropdown{position:absolute;top:calc(100% + 8px);right:0;background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;z-index:50;min-width:180px;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:320px;overflow-y:auto;animation:mgDropDownIn .2s ease-out both}
    .mg-more-item{display:block;width:100%;text-align:left;padding:8px 12px;border:none;border-radius:8px;background:none;color:#e2e8f0;font-size:.75em;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
    .mg-more-item:hover{background:rgba(255,255,255,0.05)}
    .mg-more-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .mg-more-label{font-size:.6em;font-weight:800;text-transform:uppercase;color:#64748b;padding:8px 12px 4px;border-bottom:1px solid rgba(255,255,255,0.05);margin-bottom:4px}

    .mg-tabs{display:flex;gap:4px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:4px;margin-bottom:16px}
    .mg-tab{flex:1;padding:10px 4px;border:none;border-radius:10px;background:transparent;color:#94a3b8;font-size:.7em;font-weight:800;cursor:pointer;transition:all .2s ease;text-align:center;font-family:inherit;text-transform:uppercase}
    .mg-tab.active{background:#10b981;color:#fff;box-shadow:0 4px 12px rgba(16,185,129,.25)}

    .mg-search-static{display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);margin-bottom:16px}
    .mg-search-static input{flex:1;background:none;border:none;outline:none;color:#fff;font-size:.85em;font-weight:600;font-family:inherit}
    .mg-search-static input::placeholder{color:#64748b}
    .mg-search-clear{background:none;border:none;color:#94a3b8;cursor:pointer;padding:0;display:flex}

    .mg-filter-row{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}
    .mg-filter-panel{background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:8px;z-index:40;box-shadow:0 12px 32px rgba(0,0,0,.5);max-height:300px;overflow-y:auto;animation:mgDropDownIn .2s ease-out both;margin-top:10px}
    .mg-filter-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:10px 12px;border:none;border-radius:8px;background:none;color:#e2e8f0;font-size:.75em;font-weight:700;cursor:pointer;font-family:inherit}
    .mg-filter-item:hover{background:rgba(255,255,255,0.05)}
    .mg-filter-item.active{color:#10b981;background:rgba(16,185,129,.1)}
    .mg-filter-item img{width:18px;height:18px;object-fit:contain}

    .mg-card{position:relative;overflow:hidden;padding:14px 16px;background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:8px;transition:all .25s cubic-bezier(.22,1,.36,1);animation:mgSlideIn .3s ease both;cursor:pointer}
    .mg-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);transform:translateY(-1px)}
    .mg-card.live{border-color:rgba(239,68,68,.3);animation:mgLiveGlow 2.5s ease-in-out infinite,mgSlideIn .3s ease both}
    .mg-card.finished{opacity:.7}
    .mg-card.started{border-color:rgba(245,158,11,.3)}
    .mg-card.scheduled{border-left:3px solid rgba(59,130,246,.4)}
    .mg-card.expanded{border-radius:14px 14px 0 0;margin-bottom:0;border-color:rgba(16,185,129,.3)}
    .mg-card.goal-flash{animation:mgGoalFlash 2s ease-out both}
    .mg-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

    .mg-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .mg-status{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:.55em;font-weight:900;letter-spacing:.02em;text-transform:uppercase}
    .mg-status.live-s{color:#ef4444;background:rgba(239,68,68,.15)}
    .mg-status.ft-s{color:#10b981;background:rgba(16,185,129,.1)}
    .mg-status.time-s{color:#cbd5e1;background:rgba(255,255,255,0.06);font-size:.65em}
    .mg-status.started-s{color:#f59e0b;background:rgba(245,158,11,.1);font-size:.6em}
    .mg-card-actions{display:flex;align-items:center;gap:4px}
    .mg-icon-btn{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;border:none;background:transparent;color:#94a3b8;cursor:pointer;transition:all .15s ease;opacity:.5}
    .mg-icon-btn.active{color:#3b82f6;opacity:1}

    .mg-teams{display:flex;align-items:center;gap:8px}
    .mg-team-col{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
    .mg-team-col.home{align-items:flex-end}
    .mg-team-col.away{align-items:flex-start}
    .mg-team-row{display:flex;align-items:center;gap:8px;min-width:0}
    .mg-team-col.home .mg-team-row{flex-direction:row-reverse}
    .mg-crest{width:22px;height:22px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .mg-team-name{font-size:.9em;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .mg-team-col.home .mg-team-name{text-align:right}
    
    .mg-score-box{width:70px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .mg-scores{display:flex;align-items:center;gap:6px}
    .mg-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.3em;font-weight:900;min-width:20px;text-align:center;line-height:1;transition:color .2s}
    .mg-score-num.live-score{color:#ef4444}
    .mg-score-num.ft-score{color:#10b981}
    .mg-score-num.pop{animation:mgScorePop .5s cubic-bezier(.22,1,.36,1) both}
    .mg-sep{color:#64748b;font-size:.75em;font-weight:800;opacity:.5}
    .mg-vs{font-size:.7em;font-weight:900;color:#64748b;opacity:.4}

    .mg-comp-row{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04)}
    .mg-comp-row img{width:14px;height:14px;object-fit:contain;flex-shrink:0}
    .mg-comp-row span{font-size:.6em;color:#94a3b8;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border-radius:inherit;z-index:3;pointer-events:none}
    .mg-overlay-badge{padding:10px 24px;border-radius:12px;color:#fff;font-weight:900;font-size:.8em;letter-spacing:.05em;display:flex;align-items:center;gap:8px;animation:mgStatusIn 3s ease both}

    .mg-expanded{background:rgba(15,23,42,0.6);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-top:none;border-radius:0 0 14px 14px;overflow:hidden;animation:mgExpand .35s ease-out both}
    .mg-exp-section{padding:12px 16px 4px;font-size:.6em;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em}
    .mg-exp-row{display:flex;justify-content:space-between;align-items:center;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8em}
    .mg-exp-label{color:#94a3b8;font-weight:700}
    .mg-exp-val{color:#fff;font-weight:800;font-family:var(--font-display,system-ui)}
    
    .mg-stat-bar{display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.8em}
    .mg-stat-val{width:30px;font-weight:800;color:#fff;font-variant-numeric:tabular-nums}
    .mg-stat-val.home{text-align:right}
    .mg-stat-track{flex:1;position:relative;height:20px;background:rgba(255,255,255,0.05);border-radius:4px;overflow:hidden;display:flex}
    .mg-stat-fill{height:100%;transition:width .3s ease}
    .mg-stat-fill.home{background:rgba(16,185,129,0.6)}
    .mg-stat-fill.away{background:rgba(239,68,68,0.6)}
    .mg-stat-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:.7em;font-weight:700;color:#fff;mix-blend-mode:difference}

    .mg-timeline{padding:10px 0}
    .mg-timeline-row{display:flex;align-items:center;gap:10px;padding:6px 16px;font-size:.8em}
    .mg-timeline-row.home{flex-direction:row-reverse;text-align:right}
    .mg-timeline-min{font-weight:900;color:#94a3b8;min-width:30px;font-variant-numeric:tabular-nums}
    .mg-timeline-icon{font-size:1.1em}
    .mg-timeline-text{flex:1;color:#fff;font-weight:700}
    .mg-timeline-divider{text-align:center;font-size:.6em;font-weight:800;color:#64748b;letter-spacing:.05em;padding:8px 0;border-top:1px dashed rgba(255,255,255,0.1);border-bottom:1px dashed rgba(255,255,255,0.1);margin:6px 0}

    .mg-view-details{width:100%;padding:10px;border:none;border-radius:0 0 14px 14px;background:rgba(16,185,129,0.1);color:#10b981;font-size:.75em;font-weight:800;cursor:pointer;transition:all .2s;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:6px}
    .mg-view-details:hover{background:rgba(16,185,129,0.2)}

    .mg-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:50px 24px;background:rgba(255,255,255,0.03);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.05);border-radius:16px;text-align:center}
    .mg-empty-icon{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);color:#64748b;margin-bottom:4px}
    .mg-empty p{color:#cbd5e1;font-size:.85em;margin:0;font-weight:700}
    .mg-empty-hint{font-size:.75em;color:#64748b;margin-top:4px !important}
    .mg-empty-action{margin-top:12px;padding:8px 16px;background:rgba(16,185,129,0.1);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:8px;font-size:.75em;font-weight:700;cursor:pointer}

    .mg-sk{height:52px;border-radius:14px;background:linear-gradient(90deg,rgba(30,41,59,0.2) 25%,rgba(255,255,255,0.05) 50%,rgba(30,41,59,0.2) 75%);background-size:200% 100%;animation:mgShimmer 1.5s ease-in-out infinite;margin-bottom:8px}
    .mg-sk-card{padding:14px 16px;background:rgba(30,41,59,0.4);border:1px solid rgba(255,255,255,0.06);border-radius:14px;margin-bottom:8px}
    .mg-sk-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .mg-sk-circle{width:22px;height:22px;border-radius:4px;background:rgba(255,255,255,0.05)}
    .mg-sk-line{height:10px;border-radius:4px;background:rgba(255,255,255,0.05);flex:1}

    .mg-toast-wrap{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:calc(100% - 24px);max-width:400px}
    .mg-toast{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px 18px;color:#fff;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.5);animation:mgToastIn .35s cubic-bezier(.22,1,.36,1) both;font-size:.8em}
    .mg-toast-inner{display:flex;align-items:flex-start;gap:12px}
    .mg-toast-icon{font-size:1.4em;flex-shrink:0;line-height:1}
    .mg-toast-title{font-weight:900;font-size:.7em;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
    .mg-toast-msg{font-weight:700;line-height:1.3;opacity:.95}
    .mg-toast-detail{font-size:.85em;opacity:.7;margin-top:2px}
    .mg-toast-score{font-family:var(--font-display,system-ui);font-weight:900;font-size:1.2em;flex-shrink:0;margin-left:auto;text-shadow:0 0 12px rgba(255,255,255,.3)}

    .mg-confetti{position:fixed;inset:0;pointer-events:none;z-index:400;overflow:hidden}
    .mg-confetti-p{position:absolute;width:10px;height:10px;border-radius:3px;animation:mgConfetti 1.6s ease-out forwards}

    .mg-tbl-wrap{background:rgba(30,41,59,0.4);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;overflow:hidden;margin-bottom:14px;box-shadow:0 4px 12px rgba(0,0,0,.15)}
    .mg-tbl{width:100%;border-collapse:collapse;font-size:.8em}
    .mg-tbl thead{background:rgba(255,255,255,0.02)}
    .mg-tbl th{padding:10px 8px;font-size:.6em;font-weight:900;color:#94a3b8;text-transform:uppercase;text-align:left;border-bottom:1px solid rgba(255,255,255,0.08)}
    .mg-tbl th.c{text-align:center;width:28px}
    .mg-tbl td{padding:10px 8px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle}
    .mg-tbl tr:last-child td{border-bottom:none}
    .mg-tbl tr:hover{background:rgba(255,255,255,0.03)}
    .mg-tbl .pos{font-weight:900;color:#cbd5e1;text-align:center;font-variant-numeric:tabular-nums}
    .mg-tbl .tc{display:flex;align-items:center;gap:8px;min-width:0}
    .mg-tbl .tc img{width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .mg-tbl .tc span{font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:700;color:#cbd5e1}
    .mg-tbl .pc{text-align:center;font-weight:900;color:#fff}

    .mg-teams-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
    .mg-team-card{background:rgba(30,41,59,0.4);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:14px 10px;text-align:center;transition:transform .2s}
    .mg-team-card:hover{transform:translateY(-2px);background:rgba(255,255,255,0.05)}
    .mg-team-card img{width:36px;height:36px;object-fit:contain;margin:0 auto 8px;display:block}
    .mg-team-card .name{font-size:.7em;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg-show-more{width:100%;padding:12px;border:none;border-radius:12px;background:rgba(255,255,255,0.03);color:#94a3b8;font-size:.75em;font-weight:800;cursor:pointer;transition:all .2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px}
    .mg-show-more:hover{background:rgba(16,185,129,.05);color:#10b981}

    .mg-section{margin-bottom:20px}
    .mg-league-hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 4px}
    .mg-league-name{font-size:.75em;font-weight:900;color:#cbd5e1;text-transform:uppercase;letter-spacing:0.03em}
    .mg-league-count{margin-left:auto;font-size:.55em;font-weight:700;color:#64748b;background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px}
    .mg-fav-icon{color:#f59e0b}

    .mg-rescue{background:rgba(251,191,36,0.05);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:12px;margin-bottom:14px}
    .mg-rescue-icon{width:32px;height:32px;border-radius:8px;background:rgba(251,191,36,0.1);display:flex;align-items:center;justify-content:center;color:#fbbf24;flex-shrink:0}
    .mg-rescue-title{font-size:.8em;font-weight:800;color:#fbbf24}
    .mg-rescue-sub{font-size:.65em;color:#cbd5e1}

    .mg-seo-links{text-align:center;padding:30px 0 10px;border-top:1px solid rgba(255,255,255,0.05);margin-top:30px}
    .mg-seo-links h3{font-size:.75em;font-weight:900;color:#94a3b8;margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em}
    .mg-seo-link{display:inline-block;font-size:.65em;color:#cbd5e1;text-decoration:none;border:1px solid rgba(255,255,255,0.08);padding:6px 12px;border-radius:8px;margin:3px;transition:all .2s;font-weight:700}
    .mg-seo-link:hover{color:#10b981;border-color:#10b981;background:rgba(16,185,129,0.05)}

    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

// ─── Sound Engine ───
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

// ─── Custom Hooks ───
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

// ─── Helper Functions ───
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
    homeTeamId: isPrimary ? raw.homeTeam?.id : raw.homeTeam?.id,
    awayTeamId: isPrimary ? raw.awayTeam?.id : raw.awayTeam?.id,
    homeScore, awayScore,
    leagueName: isPrimary ? (raw.league?.name || 'Other') : (raw.competition?.name || raw.league?.name || 'Other'),
    leagueLogo: isPrimary ? (raw.league?.emblem || raw.league?.logo) : (raw.competition?.emblem || raw.league?.logo),
    score: raw.score, 
    stats: raw.stats || raw.matchStats || [],
  };
}

// ─── Memoized UI Components ───
const MatchCardSkeleton = React.memo(() => (
  <div className="mg-sk-card">
    <div className="mg-sk-row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
      <div className="mg-sk-line" style={{ width: '60px', height: '10px' }} />
      <div className="mg-sk-circle" style={{ width: '40px', height: '12px', borderRadius: '4px' }} />
    </div>
    <div className="mg-sk-row">
      <div className="mg-sk-circle" />
      <div className="mg-sk-line" />
    </div>
    <div className="mg-sk-row" style={{ marginTop: '8px' }}>
      <div className="mg-sk-circle" />
      <div className="mg-sk-line" />
    </div>
  </div>
));

const Skeleton = React.memo(({ count = 5 }) => (
  <div>{Array.from({ length: count }).map((_, i) => <MatchCardSkeleton key={i} />)}</div>
));

const ToastContainer = React.memo(({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="mg-toast-wrap">
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
          <div key={t.id} className="mg-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="mg-toast-inner">
              <span className="mg-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mg-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'LIVE ACTION'}</div>
                {t.msg && <div className="mg-toast-msg">{t.msg}</div>}
                {t.detail && <div className="mg-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="mg-toast-score">{t.score}</div>}
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
    <div className="mg-confetti">
      {p.map((x, i) => <div key={i} className="mg-confetti-p" style={{ left: x.left + '%', bottom: x.bottom + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
});

const ScoreBreakdown = React.memo(({ match, onNavigate }) => {
  if (match.isStarted && !match.isLive) {
    return (
      <div className="mg-empty" style={{ padding: '30px', textAlign: 'center', borderRadius: '0 0 14px 14px' }}>
        <Clock size={24} style={{ marginBottom: '10px', color: '#94a3b8' }} />
        <div style={{ color: '#fff', fontWeight: 800, marginBottom: '6px' }}>Match in Progress</div>
        <div style={{ color: '#94a3b8', fontSize: '.9em' }}>Live coverage not available. Results will be shown at Full Time.</div>
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
  
  if (!hasScoreData && !hasEvents && !hasStatsData) return <div className="mg-empty" style={{ borderRadius: 0, padding: '20px' }}>Details appear once the match begins</div>;
  
  const events = [
    ...goals.map(g => ({ ...g, eventType: 'goal' })),
    ...cards.map(c => ({ ...c, eventType: 'card' }))
  ].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  return (
    <div style={{ padding: '8px 0 0' }}>
      {hasScoreData && (
        <>
          <div className="mg-exp-section">Score Breakdown</div>
          {periods.filter(p => p.h != null || p.a != null).map(p => (
            <div key={p.l} className="mg-exp-row"><span className="mg-exp-label">{p.l}</span><span className="mg-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span></div>
          ))}
        </>
      )}
      
      {hasEvents && (
        <>
          <div className="mg-exp-section">Match Events</div>
          <div className="mg-timeline">
            {events.map((e, i) => {
              const isGoal = e.eventType === 'goal';
              const isYellow = e.type === 'YELLOW_CARD';
              const isRed = e.type === 'RED_CARD';
              const isHome = e.team?.id === match.homeTeamId || e.team?.name === match.homeName;
              const prevEvent = events[i-1];
              const showHTDivider = prevEvent && prevEvent.minute <= 45 && e.minute > 45;

              return (
                <React.Fragment key={i}>
                  {showHTDivider && <div className="mg-timeline-divider">HALF TIME</div>}
                  <div className={`mg-timeline-row ${isHome ? 'home' : 'away'}`}>
                    <span className="mg-timeline-min">{e.minute != null ? `${e.minute}'` : ''}</span>
                    <span className="mg-timeline-icon">
                      {isGoal ? '⚽' : isYellow ? '🟨' : isRed ? '🟥' : '⚠️'}
                    </span>
                    <span className="mg-timeline-text">{e.scorer?.name || e.player?.name || 'Unknown'}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </>
      )}
      
      {hasStatsData && (
        <>
          <div className="mg-exp-section">Match Stats</div>
          {stats.map((stat, i) => {
            const homeVal = parseFloat(stat.home) || 0;
            const awayVal = parseFloat(stat.away) || 0;
            const total = homeVal + awayVal;
            const homePct = total > 0 ? (homeVal / total) * 100 : 50;
            const awayPct = total > 0 ? (awayVal / total) * 100 : 50;
            
            return (
              <div key={i} className="mg-stat-bar">
                <span className="mg-stat-val home">{stat.home}</span>
                <div className="mg-stat-track">
                  <div className="mg-stat-fill home" style={{ width: `${homePct}%` }} />
                  <div className="mg-stat-fill away" style={{ width: `${awayPct}%` }} />
                  <span className="mg-stat-label">{stat.type}</span>
                </div>
                <span className="mg-stat-val away">{stat.away}</span>
              </div>
            );
          })}
        </>
      )}
      
      <button className="mg-view-details" onClick={() => onNavigate(match.id)}>
        View Match Details <ArrowRight size={14} />
      </button>
    </div>
  );
});

const MatchCard = React.memo(({ m, idx, expanded, onToggle, onNavigate, scorePops, flashGoals, statusAnims, isFav, onFav }) => {
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

  let cls = 'mg-card';
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
        {(isLive || isStarted || isFt) && <div className="mg-left-bar" style={{ background: barColor }} />}
        <div className="mg-card-top">
          <div>
            {isLive && <span className="mg-status live-s"><span className="mg-dot" /> {m.minute != null ? `${m.minute}'` : 'LIVE'}</span>}
            {isStarted && <span className="mg-status started-s"><Clock size={10} /> STARTED</span>}
            {isHT && <span className="mg-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.12)' }}>HT</span>}
            {isFt && <span className="mg-status ft-s">FT</span>}
            {isSched && <span className="mg-status time-s">{m.kickoff}</span>}
          </div>
          <div className="mg-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`mg-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={16} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : '#94a3b8'} />
            </button>
          </div>
        </div>
        <div className="mg-teams">
          <div className="mg-team-col home">
            <div className="mg-team-row">
              {m.homeLogo && <img className="mg-crest" src={m.homeLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="mg-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="mg-scores">
                <span className={`mg-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                <span className="mg-sep">–</span>
                <span className={`mg-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
              </div>
            ) : <span className="mg-vs">VS</span>}
          </div>
          <div className="mg-team-col away">
            <div className="mg-team-row">
              {m.awayLogo && <img className="mg-crest" src={m.awayLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />>}
              <span className="mg-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        <div className="mg-comp-row">
          {m.leagueLogo && <img src={m.leagueLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.leagueName}</span>
        </div>
        {sa && (
          <div className="mg-overlay">
            <div className="mg-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={16} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
      {isExp && <div className="mg-expanded"><ScoreBreakdown match={m} onNavigate={onNavigate} /></div>}
    </div>
  );
});

const LeagueSection = React.memo(({
    group,
    expanded,
    onToggle,
    onNavigate,
    isExpanded,
    toggleLeagueExpand,
    scorePops,
    flashGoals,
    statusAnims,
    isFav,
    onFav,
    isPinned,
    onTogglePin
}) => {
  const limit = group.isTop || isPinned ? 5 : 1;
  const visibleMatches = isExpanded ? group.matches : group.matches.slice(0, limit);
  const hiddenCount = group.matches.length - limit;
  
  return (
    <div className="mg-section">
      <div className="mg-league-hd">
        {group.logo && <img src={group.logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '3px' }} onError={e => { e.target.style.display = 'none'; }} />}
        <span className="mg-league-name">{group.name}</span>
        <span className="mg-league-count">{group.matches.length}</span>
        <button className="mg-icon-btn" style={{ opacity: isPinned ? 1 : 0.5, color: isPinned ? '#3b82f6' : '#94a3b8' }} onClick={() => onTogglePin(group.name)} title="Pin League">
          <Pin size={12} fill={isPinned ? '#3b82f6' : 'none'} />
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
              scorePops={scorePops}
              flashGoals={flashGoals}
              statusAnims={statusAnims}
              isFav={isFav(m.id)}
              onFav={onFav}
          />
      ))}
      {hiddenCount > 0 && (
        <button className="mg-show-more" onClick={() => toggleLeagueExpand(group.name)}>
          {isExpanded ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
        </button>
      )}
    </div>
  );
});

const CompCard = React.memo(({ c }) => (
  <div className="mg-team-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
    {c.emblem && <img src={c.emblem} alt="" style={{ width: '32px', height: '32px', margin: 0 }} onError={e => { e.target.style.display = 'none'; }} />}
    <div className="name">{c.name}</div>
  </div>
));

// ─── Main Component ───
export default function MasterGames() {
  injectStyles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { fixtures: backupRaw, liveMatches: backupLive, competitions, loading: backupLoading, loadDateFixtures, getStandings, getTeams, refreshFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  
  // ─── URL & Local State Sync ───
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

  const [soundOn, setSoundOn] = useState(true);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [rescued, setRescued] = useState(false);
  const [moreDatesOpen, setMoreDatesOpen] = useState(false);
  const [leagueFilterOpen, setLeagueFilterOpen] = useState(false);
  const [leagueSearchOpen, setLeagueSearchOpen] = useState(false);
  const [leagueSearchQ, setLeagueSearchQ] = useState('');
  const rescueToastSent = useRef(false);
  const welcomeToastShown = useRef(false);
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState(new Set());
  
  const [fontScale, setFontScale] = useState(() => { try { return parseFloat(localStorage.getItem(STORAGE_KEY_FONT) || '1'); } catch { return 1; } });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY_FONT, String(fontScale)); } catch {} }, [fontScale]);
  
  const [selectedCompCode, setSelectedCompCode] = useState(null);
  const moreRef = useRef(null);

  // ─── Update URL when state changes ───
  useEffect(() => {
    const params = {};
    if (tab !== 'fixtures') params.tab = tab;
    if (selectedDate !== getLocalDateStr(0)) params.date = selectedDate;
    if (compFilter !== 'ALL') params.league = compFilter;
    setSearchParams(params, { replace: true });
  }, [tab, selectedDate, compFilter, setSearchParams]);

  const dates = useMemo(() => {
    const past = Array.from({ length: 14 }, (_, i) => {
      const d = getLocalDateStr(-(i + 2)); 
      return { str: d, label: formatDateShort(d) };
    }).reverse();
    const future = Array.from({ length: 14 }, (_, i) => {
      const d = getLocalDateStr(i + 2); 
      return { str: d, label: formatDateShort(d) };
    });
    return { past, future };
  }, []);

  const leaguePriorityMap = useMemo(() => ({
    'FIFA World Cup': 1, 'UEFA Champions League': 2, 'UEFA Europa League': 3,
    'UEFA Conference League': 4, 'Premier League': 5, 'La Liga': 6, 'Serie A': 7,
    'Bundesliga': 8, 'Ligue 1': 9, 'Primeira Liga': 10, 'Eredivisie': 11,
    'Süper Lig': 12, 'Championship': 13
  }), []);

  useEffect(() => { Sound.on = soundOn; }, [soundOn]);

  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreDatesOpen(false);
    };
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
    }, LIVE_REFRESH);
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

  useEffect(() => {
    setRescued(false);
    rescueToastSent.current = false;
    welcomeToastShown.current = false;
    setExpanded(null);
    setShowLiveOnly(false);
    setExpandedLeagues(new Set());
    setLeagueFilterOpen(false);
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

  const fixtureCompList = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => {
      if (!map.has(m.leagueName)) map.set(m.leagueName, { value: m.leagueName, name: m.leagueName, emblem: m.leagueLogo });
    });
    return [...map.values()].sort((a, b) => (leaguePriorityMap[a.name] ?? 99) - (leaguePriorityMap[b.name] ?? 99));
  }, [allFixtures, leaguePriorityMap]);

  const displayFixtures = useMemo(() => {
    let list = allFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (showLiveOnly) list = list.filter(m => m.isLive);
    if (normalizedSearch) {
      const terms = normalizedSearch.split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => matchQ(m, terms));
    }
    return list;
  }, [allFixtures, compFilter, showLiveOnly, normalizedSearch]);

  // ★ NEW: Top Matches Detection Logic
  const topMatches = useMemo(() => {
    return allFixtures.filter(m => {
      const home = norm(m.homeName);
      const away = norm(m.awayName);
      const isTopHome = [...TOP_TEAMS_SET].some(t => home.includes(t));
      const isTopAway = [...TOP_TEAMS_SET].some(t => away.includes(t));
      return isTopHome || isTopAway;
    }).sort((a, b) => {
      // Sort live first, then by time
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
  }, [allFixtures]);

  const topMatchIds = useMemo(() => new Set(topMatches.map(m => String(m.id))), [topMatches]);

  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (favs.has(String(m.id))) return; 
      if (topMatchIds.has(String(m.id))) return; // ★ Skip top matches so they don't duplicate
      
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
  
  const trendingMatches = useMemo(() => {
    return allFixtures.filter(m => m.isLive && (m.homeScore > 0 || m.awayScore > 0)).slice(0, 3);
  }, [allFixtures]);

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

  const handleRefresh = useCallback(async () => {
    await Promise.all([refreshFixtures(), fetchPrimary(selectedDate)]);
  }, [refreshFixtures, fetchPrimary, selectedDate]);

  const onSearchChange = useCallback((e) => {
    setSearchQ(e.target.value);
  }, []);

  const currentLeagueEmblem = useMemo(() => {
    if (compFilter === 'ALL') return null;
    return fixtureCompList.find(c => c.value === compFilter)?.emblem || null;
  }, [compFilter, fixtureCompList]);

  return (
    <div className="mg-page" style={{ fontSize: `${fontScale * 16}px` }}>
      <SEO 
        title="Football Fixtures, Live Scores & Tables | ZOKASCORE"
        description="Get the latest football fixtures, live scores, league tables, and match predictions on ZOKASCORE."
        keywords="football fixtures, live scores, ZOKASCORE"
        path="/mastergames" 
        robots="index,follow"
      />
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mg-wrap">
        {/* Clean Header */}
        <div className="mg-hdr">
          <div className="mg-hdr-title">
            <h1><Activity size={18} style={{ color: '#10b981' }} /> Master Games</h1>
            <div className="mg-hdr-sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="mg-hdr-actions">
            <button className="mg-hdr-btn" onClick={() => setFontScale(p => Math.max(0.8, p - 0.1))} title="Decrease Font Size"><Minus size={16} /></button>
            <button className="mg-hdr-btn" onClick={() => setFontScale(p => Math.min(1.4, p + 0.1))} title="Increase Font Size"><Plus size={16} /></button>
            <button className={`mg-hdr-btn ${soundOn ? 'active' : ''}`} onClick={() => setSoundOn(p => !p)} title="Sound">
              {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button className="mg-hdr-btn" onClick={handleRefresh} title="Refresh">
              <RefreshCw size={18} className={primaryLoading || backupLoading ? 'mg-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mg-stats">
          <div className="mg-schip">
            <div className="val live-c">{liveCount}</div>
            <div className="lbl">Live</div>
          </div>
          <div className="mg-schip">
            <div className="val total-c">{displayFixtures.length}</div>
            <div className="lbl">Matches</div>
          </div>
          <div className="mg-schip">
            <div className="val fav-c">{favs.size}</div>
            <div className="lbl">Favourites</div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="mg-datenav">
          <button className={`mg-nav-btn ${selectedDate === getLocalDateStr(-1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(-1))}>
            Yesterday
          </button>
          <button className={`mg-nav-btn ${selectedDate === getLocalDateStr(0) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(0))}>
            Today
          </button>
          <button className={`mg-nav-btn ${selectedDate === getLocalDateStr(1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(1))}>
            Tomorrow
          </button>
          <div className="mg-more-wrap" ref={moreRef}>
            <button className={`mg-more-btn ${moreDatesOpen ? 'open' : ''}`} onClick={() => setMoreDatesOpen(p => !p)}>
              <Calendar size={16} /> More <ChevronDown size={16} />
            </button>
            {moreDatesOpen && (
              <div className="mg-more-dropdown">
                <div className="mg-more-label">Past Dates</div>
                {dates.past.map(d => (
                  <button key={d.str} className={`mg-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
                <div className="mg-more-label" style={{ marginTop: '8px' }}>Future Dates</div>
                {dates.future.map(d => (
                  <button key={d.str} className={`mg-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mg-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`mg-tab ${tab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>
              {t === 'fixtures' ? 'Fixtures' : t === 'favourites' ? 'Favs' : t === 'standings' ? 'Table' : t === 'teams' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        {/* Always Visible Search */}
        <div className="mg-search-static">
          <Search size={18} style={{ color: '#94a3b8', flexShrink: 0 }} />
          <input type="text" placeholder="Search teams, leagues, or matches..." value={searchQ} onChange={onSearchChange} />
          {searchQ && <button className="mg-search-clear" onClick={() => setSearchQ('')}><X size={18} /></button>}
        </div>

        {/* ═══ Fixtures Tab ═══ */}
        {tab === 'fixtures' && (
          <>
            {rescued && (
              <div className="mg-rescue">
                <div className="mg-rescue-icon">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <div className="mg-rescue-title">Backup Source Active</div>
                  <div className="mg-rescue-sub">Showing {backupFixtures.length} games from global feed</div>
                </div>
              </div>
            )}

            {/* ★ NEW: Top Matches Section (Smart Detection) */}
            {topMatches.length > 0 && !searchQ && (
              <div className="mg-section">
                <div className="mg-league-hd">
                  <Flame size={18} style={{ color: '#f59e0b' }} />
                  <span className="mg-league-name">Top Matches</span>
                </div>
                {topMatches.map((m, i) => 
                  <MatchCard key={`top-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />
                )}
              </div>
            )}

            {/* Trending Matches Section */}
            {trendingMatches.length > 0 && !searchQ && (
              <div className="mg-section">
                <div className="mg-league-hd">
                  <TrendingUp size={18} style={{ color: '#ef4444' }} />
                  <span className="mg-league-name">Trending Live</span>
                </div>
                {trendingMatches.map((m, i) => 
                  <MatchCard key={`trend-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />
                )}
              </div>
            )}

            {/* League Dropdown Filter */}
            {fixtureCompList.length > 0 && (
              <div className="mg-filter-row">
                <button className="mg-pill" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setLeagueFilterOpen(p => !p)}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {currentLeagueEmblem && <img src={currentLeagueEmblem} alt="" style={{ width: '16px', height: '16px' }} onError={e => { e.target.style.display = 'none'; }} />}
                    {compFilter === 'ALL' ? 'All Leagues' : compFilter}
                  </span>
                  <ChevronDown size={16} />
                </button>
                {leagueFilterOpen && (
                  <div className="mg-filter-panel" style={{ position: 'static' }}>
                    <button className={`mg-filter-item ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setCompFilter('ALL'); setLeagueFilterOpen(false); }}>
                      All Leagues
                    </button>
                    {fixtureCompList.map(c => (
                      <button key={c.value} className={`mg-filter-item ${compFilter === String(c.value) ? 'active' : ''}`} onClick={() => { setCompFilter(String(c.value)); setLeagueFilterOpen(false); }}>
                        {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <button 
                  className={`mg-pill ${showLiveOnly ? 'live-active' : ''}`} 
                  onClick={() => setShowLiveOnly(p => !p)}
                  style={{ flexShrink: 0, marginTop: '8px', justifyContent: 'center' }}
                >
                  {showLiveOnly ? <span className="mg-dot" style={{ background: '#ef4444' }} /> : <Activity size={14} />}
                  {showLiveOnly ? 'Live Only' : 'Show Live'}
                </button>
              </div>
            )}

            {primaryLoading && isPrimaryDate ? (
              <Skeleton count={5} />
            ) : displayFixtures.length === 0 ? (
              <div className="mg-empty">
                <div className="mg-empty-icon"><Calendar size={28} /></div>
                <p>No fixtures scheduled for this date.</p>
                <p className="mg-empty-hint">Try another date or clear your search.</p>
                {searchQ && <button className="mg-empty-action" onClick={() => setSearchQ('')}>Clear Search</button>}
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="mg-section">
                    <div className="mg-league-hd">
                      <Star size={18} className="mg-fav-icon" />
                      <span className="mg-league-name">Favourites</span>
                    </div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
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
                    scorePops={scorePops}
                    flashGoals={flashGoals}
                    statusAnims={statusAnims}
                    isFav={isFav}
                    onFav={toggleFav}
                    isPinned={pinnedLeagues.has(g.name)}
                    onTogglePin={togglePinLeague}
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
                    scorePops={scorePops}
                    flashGoals={flashGoals}
                    statusAnims={statusAnims}
                    isFav={isFav}
                    onFav={toggleFav}
                    isPinned={pinnedLeagues.has(g.name)}
                    onTogglePin={togglePinLeague}
                  />
                ))}

                {/* SEO Crawlable Links Footer */}
                <div className="mg-seo-links">
                  <h3>Today's Match Links</h3>
                  {displayFixtures.slice(0, 50).map(m => {
                    const slug = `${slugify(m.homeName)}-vs-${slugify(m.awayName)}`;
                    return (
                      <Link 
                        key={m.id} 
                        to={`/match/${m.id}/${slug}`} 
                        className="mg-seo-link"
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

        {/* ═══ Favourites Tab ═══ */}
        {tab === 'favourites' && (
          <>
            {favMatches.length > 0 ? (
              <div className="mg-section">
                <div className="mg-league-hd">
                  <Star size={18} className="mg-fav-icon" />
                  <span className="mg-league-name">Favourites ({favMatches.length})</span>
                </div>
                {favMatches.map((m, i) => <MatchCard key={`fav-tab-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={handleMatchToggle} onNavigate={handleNavigateToMatch} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
              </div>
            ) : (
              <div className="mg-empty">
                <div className="mg-empty-icon"><Star size={28} /></div>
                <p>No favourite matches found for this date</p>
                <p className="mg-empty-hint">Tap the star icon on any match to add it here.</p>
              </div>
            )}
          </>
        )}

        {/* ═══ Standings Tab (ALL LEAGUES) ═══ */}
        {tab === 'standings' && (
          <Suspense fallback={<Skeleton count={3} />}>
            <div className="mg-pill-scroll" style={{ marginBottom: '10px' }}>
              {topGlobalComps.map(c => (
                <button key={c.id} className={`mg-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => setSelectedCompCode(c.code)}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {c.code || c.name}
                </button>
              ))}
            </div>
            <button className="mg-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setLeagueSearchOpen(p => !p)}>
              <Search size={16} />
              {leagueSearchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
              <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {leagueSearchOpen && (
              <div className="mg-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
                <input className="mg-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={leagueSearchQ} onChange={e => setLeagueSearchQ(e.target.value)} />
                {filteredOtherComps.length === 0 && <div className="mg-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
                {filteredOtherComps.map(c => (
                  <button key={c.id} className={`mg-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { setSelectedCompCode(c.code); setLeagueSearchOpen(false); setLeagueSearchQ(''); }}>
                    {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {standingsLoading ? (
              <Skeleton count={3} />
            ) : standingsData && standingsData.standings ? (
              <div className="mg-section">
                {standingsData.standings.map((group, i) => (
                  <div key={i} style={{ marginBottom: '24px' }}>
                    {group.group && <div className="mg-league-hd"><span className="mg-league-name">{group.group}</span></div>}
                    <div className="mg-tbl-wrap">
                      <table className="mg-tbl">
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
              <div className="mg-empty">
                <div className="mg-empty-icon"><Trophy size={28} /></div>
                <p>Select a competition above to view table</p>
              </div>
            )}
          </Suspense>
        )}

        {/* ═══ Teams Tab (ALL LEAGUES) ═══ */}
        {tab === 'teams' && (
          <Suspense fallback={<Skeleton count={5} />}>
            <div className="mg-pill-scroll" style={{ marginBottom: '10px' }}>
              {topGlobalComps.map(c => (
                <button key={c.id} className={`mg-pill ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => setSelectedCompCode(c.code)}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {c.code || c.name}
                </button>
              ))}
            </div>
            <button className="mg-pill" style={{ width: '100%', marginBottom: '10px', borderRadius: '12px', padding: '12px 16px' }} onClick={() => setLeagueSearchOpen(p => !p)}>
              <Search size={16} />
              {leagueSearchOpen ? 'Close All Leagues Search' : 'Search All Other Leagues'}
              <ChevronDown size={16} style={{ marginLeft: 'auto', opacity: 0.6 }} />
            </button>
            {leagueSearchOpen && (
              <div className="mg-filter-panel" style={{ position: 'static', maxHeight: '300px' }}>
                <input className="mg-search-static" style={{ width: '100%', marginBottom: '10px' }} placeholder="Type league name..." value={leagueSearchQ} onChange={e => setLeagueSearchQ(e.target.value)} />
                {filteredOtherComps.length === 0 && <div className="mg-empty" style={{ padding: '12px' }}><p>No leagues found</p></div>}
                {filteredOtherComps.map(c => (
                  <button key={c.id} className={`mg-filter-item ${selectedCompCode === c.code ? 'active' : ''}`} onClick={() => { setSelectedCompCode(c.code); setLeagueSearchOpen(false); setLeagueSearchQ(''); }}>
                    {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {teamsLoading ? (
              <Skeleton count={5} />
            ) : teamsData && teamsData.teams ? (
              <div className="mg-teams-grid">
                {teamsData.teams.map(t => (
                  <div key={t.id} className="mg-team-card">
                    {t.crest && <img src={t.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <div className="name">{t.shortName || t.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mg-empty">
                <div className="mg-empty-icon"><Users size={28} /></div>
                <p>Select a competition above to view teams</p>
              </div>
            )}
          </Suspense>
        )}

        {/* ═══ Competitions Tab ═══ */}
        {tab === 'competitions' && (
          <Suspense fallback={<Skeleton count={5} />}>
            {competitions && competitions.length > 0 ? (
              <div className="mg-teams-grid">
                {globalCompList.map(c => <CompCard key={c.id} c={c} />)}
              </div>
            ) : (
              <div className="mg-empty">
                <div className="mg-empty-icon"><Trophy size={28} /></div>
                <p>No competitions data available</p>
              </div>
            )}
          </Suspense>
        )}
      </div>
    </div>
  );
}