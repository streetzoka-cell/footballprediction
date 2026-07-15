// ═════════════════════════════════════════════════════════════════════════════════
// FILE: src/pages/MasterGames.jsx
// v9.8 Pro UI — Smart Dropdown, Toggles, Live Only, Accurate Minutes, Started State
// ═════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  RefreshCw, Calendar, AlertTriangle, Activity, ListFilter
} from 'lucide-react';

// Primary Source (Node Backend)
import {
  fetchFixtures,
  subscribeToLiveFixtures
} from '../utils/api';

// Backup Source (Football-data.org context)
import { useFootballData } from '../context/FootballDataContext';

// Date & Constants Helpers
import { todayStr as getTodayStr, getLocalDateStr, getLocalDateFromUtc, formatDateShort, formatTime } from '../utils/dates';
import { isLiveStatus, isFinishedStatus, SPORT } from '../utils/constants';

const getYesterdayStr = () => getLocalDateStr(-1);
const getTomorrowStr = () => getLocalDateStr(1);

import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════════════════════════
   LEAGUE PRIORITY MAP (World Cup downwards)
   ═══════════════════════════════════════════════════════════════════════ */
const LEAGUE_PRIORITY = {
  'FIFA World Cup': 1,
  'UEFA Champions League': 2,
  'UEFA Europa League': 3,
  'UEFA Conference League': 4,
  'Premier League': 5,
  'La Liga': 6,
  'Serie A': 7,
  'Bundesliga': 8,
  'Ligue 1': 9,
  'Primeira Liga': 10,
  'Eredivisie': 11,
  'Süper Lig': 12,
  'Championship': 13,
};
const getLeaguePriority = (name) => LEAGUE_PRIORITY[name] || 99;

/* ═══════════════════════════════════════════════════════════════════════
   STYLE INJECTION — Pro v9.8
   ═══════════════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('mg9-css')) return;
  const s = document.createElement('style');
  s.id = 'mg9-css';
  s.textContent = `
    @keyframes mg9FadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mg9SlideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mg9Pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(1.6)}}
    @keyframes mg9ScorePop{0%{transform:scale(1)}40%{transform:scale(1.4);color:#fff}100%{transform:scale(1)}}
    @keyframes mg9GoalFlash{0%{background:rgba(16,185,129,.2)}100%{background:transparent}}
    @keyframes mg9LiveGlow{0%,100%{box-shadow:0 0 0 1px rgba(239,68,68,.2)}50%{box-shadow:0 0 8px 1px rgba(239,68,68,.3)}}
    @keyframes mg9Expand{from{opacity:0;max-height:0}to{opacity:1;max-height:800px}}
    @keyframes mg9ToastIn{from{opacity:0;transform:translateY(12px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mg9Confetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(-120px) rotate(720deg);opacity:0}}
    @keyframes mg9Shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes mg9StatusIn{from{opacity:0;transform:scale(.8)}15%{opacity:1;transform:scale(1.05)}25%{transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:scale(.8)}}
    @keyframes mg9Spin{to{transform:rotate(360deg)}}
    @keyframes mg9StarPop{0%{transform:scale(1)}50%{transform:scale(1.4) rotate(15deg)}100%{transform:scale(1) rotate(0)}}
    @keyframes mg9DropDownIn{from{opacity:0;transform:translateY(-5px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mg9ToggleIn{from{opacity:0;max-height:0}to{opacity:1;max-height:2000px}}

    .mg9-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding:0 0 100px;position:relative;color:var(--text-primary,#f1f5f9)}
    .mg9-wrap{max-width:100%;margin:0 auto;padding:0 8px;position:relative;z-index:1}

    .mg9-hdr{position:sticky;top:0;z-index:50;background:color-mix(in srgb, var(--bg-deep,#0a0f1a) 92%, transparent);backdrop-filter:blur(12px) saturate(1.5);-webkit-backdrop-filter:blur(12px) saturate(1.5);padding:10px 0;border-bottom:1px solid var(--border,#1e293b);display:flex;align-items:center;justify-content:space-between;gap:8px}
    .mg9-hdr-title{display:flex;flex-direction:column;flex:1;min-width:0}
    .mg9-hdr-title h1{margin:0;font-size:1rem;font-weight:900;letter-spacing:-.02em;color:var(--text-primary,#f1f5f9);display:flex;align-items:center;gap:4px}
    .mg9-hdr-title .sub{font-size:.6rem;color:var(--text-muted,#64748b);font-weight:600;margin-top:1px}
    .mg9-hdr-actions{display:flex;align-items:center;gap:4px}
    .mg9-hdr-btn{width:32px;height:32px;border-radius:8px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);display:flex;align-items:center;justify-content:center;color:var(--text-muted,#64748b);cursor:pointer;transition:all .2s ease;-webkit-tap-highlight-color:transparent}
    .mg9-hdr-btn:hover{color:var(--text-primary,#f1f5f9);border-color:var(--border-hover,#334155)}
    .mg9-hdr-btn.active{color:var(--accent,#10b981);border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.05)}
    .mg9-spin{animation:mg9Spin .8s linear infinite}

    .mg9-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}
    .mg9-schip{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:6px 4px;text-align:center}
    .mg9-schip .val{font-size:.9rem;font-weight:900;font-family:var(--font-display,system-ui);line-height:1}
    .mg9-schip .val.live-c{color:#ef4444}.mg9-schip .val.total-c{color:var(--accent,#10b981)}.mg9-schip .val.fav-c{color:#f59e0b}
    .mg9-schip .lbl{font-size:.45rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}

    .mg9-datenav{display:flex;align-items:center;justify-content:center;gap:2px;margin:0 auto 10px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:3px;width:fit-content;position:relative}
    .mg9-nav-btn{padding:6px 12px;border-radius:7px;border:none;background:transparent;color:var(--text-muted,#64748b);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .mg9-nav-btn.active{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 8px rgba(16,185,129,.2)}
    .mg9-more-wrap{position:relative}
    .mg9-more-btn{display:flex;align-items:center;gap:3px;padding:6px 10px;border-radius:7px;border:none;background:rgba(255,255,255,.03);color:var(--text-muted,#64748b);font-size:.66rem;font-weight:600;cursor:pointer;font-family:inherit}
    .mg9-more-btn.open{background:rgba(16,185,129,.1);color:var(--accent,#10b981)}
    .mg9-more-dropdown{position:absolute;top:calc(100% + 4px);right:0;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:4px;z-index:50;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.4);max-height:300px;overflow-y:auto;animation:mg9DropDownIn .2s ease-out both}
    .mg9-more-item{display:block;width:100%;text-align:left;padding:6px 10px;border:none;border-radius:6px;background:none;color:var(--text-muted,#64748b);font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
    .mg9-more-item.active{color:var(--accent,#10b981);background:rgba(16,185,129,.08)}
    .mg9-more-label{font-size:.55rem;font-weight:800;text-transform:uppercase;color:var(--text-muted,#64748b);opacity:.6;padding:6px 10px 2px;border-bottom:1px solid var(--border,#1e293b);margin-bottom:2px}

    .mg9-tabs{display:flex;gap:2px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:2px;margin-bottom:10px}
    .mg9-tab{flex:1;padding:6px 2px;border:none;border-radius:6px;background:transparent;color:var(--text-muted,#64748b);font-size:.62rem;font-weight:700;cursor:pointer;transition:all .2s ease;text-align:center;font-family:inherit;text-transform:uppercase}
    .mg9-tab.active{background:var(--accent,#10b981);color:#fff;box-shadow:0 2px 6px rgba(16,185,129,.2)}

    /* Smart Dropdown Filters */
    .mg9-filter-wrap{position:relative;margin-bottom:12px;display:flex;gap:8px;align-items:center}
    .mg9-filter-btn{display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827);color:var(--text-primary,#f1f5f9);font-size:.7rem;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
    .mg9-filter-btn:hover{border-color:var(--accent,#10b981)}
    .mg9-filter-btn .left{display:flex;align-items:center;gap:6px}
    .mg9-filter-btn .left img{width:14px;height:14px;object-fit:contain}
    .mg9-filter-panel{position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:4px;z-index:40;box-shadow:0 8px 24px rgba(0,0,0,.4);max-height:240px;overflow-y:auto;animation:mg9DropDownIn .2s ease-out both}
    .mg9-filter-item{display:flex;align-items:center;gap:6px;width:100%;text-align:left;padding:8px 10px;border:none;border-radius:6px;background:none;color:var(--text-muted,#64748b);font-size:.68rem;font-weight:600;cursor:pointer;font-family:inherit}
    .mg9-filter-item:hover{background:rgba(255,255,255,.03)}
    .mg9-filter-item.active{color:var(--accent,#10b981);background:rgba(16,185,129,.08)}
    .mg9-filter-item img{width:14px;height:14px;object-fit:contain}

    .mg9-search-wrap{overflow:hidden;transition:max-height .3s ease,opacity .25s ease,margin .3s ease}
    .mg9-search-wrap.shut{max-height:0;opacity:0;margin-bottom:0}
    .mg9-search-wrap.open{max-height:50px;opacity:1;margin-bottom:10px}
    .mg9-search{display:flex;align-items:center;gap:6px;width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827)}
    .mg9-search input{flex:1;background:none;border:none;outline:none;color:var(--text-primary,#f1f5f9);font-size:.75rem;font-weight:500;font-family:inherit}

    .mg9-rescue{width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(251,191,36,.15);background:linear-gradient(135deg,rgba(251,191,36,.04),rgba(251,191,36,.01));margin-bottom:8px;display:flex;align-items:center;gap:8px}
    .mg9-rescue-icon{width:24px;height:24px;border-radius:6px;background:rgba(251,191,36,.08);display:flex;align-items:center;justify-content:center;color:#fbbf24;flex-shrink:0}
    .mg9-rescue-title{font-size:.66rem;font-weight:700;color:#fbbf24}
    .mg9-rescue-sub{font-size:.55rem;color:var(--text-muted,#64748b)}

    .mg9-section{margin-bottom:14px;animation:mg9FadeIn .3s ease both}
    .mg9-league-hd{display:flex;align-items:center;gap:5px;margin-bottom:5px;padding:0 2px}
    .mg9-league-hd img{width:12px;height:12px;object-fit:contain;border-radius:2px;flex-shrink:0}
    .mg9-league-hd span{font-size:.65rem;font-weight:700;color:var(--text-muted,#64748b)}
    .mg9-league-hd .cnt{margin-left:auto;font-size:.5rem;font-weight:600;color:var(--text-muted,#64748b);opacity:.4}

    .mg9-card{position:relative;overflow:hidden;padding:8px 10px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;margin-bottom:4px;transition:all .2s cubic-bezier(.22,1,.36,1);animation:mg9SlideIn .3s ease both;cursor:pointer}
    .mg9-card:hover{background:rgba(255,255,255,.02);border-color:var(--border-hover,#334155)}
    .mg9-card.live{border-color:rgba(239,68,68,.2);animation:mg9LiveGlow 2.5s ease-in-out infinite,mg9SlideIn .3s ease both}
    .mg9-card.finished{opacity:.6}
    .mg9-card.started{border-color:rgba(245,158,11,.2)}
    .mg9-card.scheduled{border-left:2px solid rgba(59,130,246,.25)}
    .mg9-card.expanded{border-radius:10px 10px 0 0;margin-bottom:0;border-color:rgba(16,185,129,.2)}
    .mg9-card.goal-flash{animation:mg9GoalFlash 2s ease-out both}
    .mg9-left-bar{position:absolute;left:0;top:0;bottom:0;width:2px;border-radius:0 2px 2px 0}

    .mg9-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
    .mg9-status{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:5px;font-size:.5rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
    .mg9-status.live-s{color:#ef4444;background:rgba(239,68,68,.1)}
    .mg9-status.ft-s{color:var(--accent,#10b981);background:rgba(16,185,129,.08)}
    .mg9-status.time-s{color:var(--text-muted,#64748b);background:rgba(255,255,255,.04);font-size:.6rem}
    .mg9-status.started-s{color:#f59e0b;background:rgba(245,158,11,.1);font-size:.55rem}
    .mg9-dot{width:4px;height:4px;border-radius:50%;background:#ef4444;animation:mg9Pulse 1.2s ease-in-out infinite;flex-shrink:0}
    .mg9-card-actions{display:flex;align-items:center;gap:2px}
    .mg9-icon-btn{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:var(--text-muted,#64748b);cursor:pointer;transition:all .15s ease;opacity:.4}
    .mg9-icon-btn.fav.active{color:#f59e0b;opacity:1;animation:mg9StarPop .4s ease}

    .mg9-teams{display:flex;align-items:center;gap:4px}
    .mg9-team-col{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}
    .mg9-team-col.home{align-items:flex-end}
    .mg9-team-col.away{align-items:flex-start}
    .mg9-team-row{display:flex;align-items:center;gap:4px;min-width:0}
    .mg9-team-col.home .mg9-team-row{flex-direction:row-reverse}
    .mg9-crest{width:16px;height:16px;object-fit:contain;flex-shrink:0;border-radius:2px}
    .mg9-team-name{font-size:.72rem;font-weight:700;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.1}
    .mg9-team-col.home .mg9-team-name{text-align:right}
    
    .mg9-score-box{width:50px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .mg9-scores{display:flex;align-items:center;gap:4px}
    .mg9-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:.9rem;font-weight:800;min-width:16px;text-align:center;line-height:1}
    .mg9-score-num.live-score{color:#ef4444}
    .mg9-score-num.ft-score{color:var(--accent,#10b981)}
    .mg9-score-num.pop{animation:mg9ScorePop .45s cubic-bezier(.22,1,.36,1) both}
    .mg9-sep{color:var(--text-muted,#64748b);font-size:.6rem;font-weight:700;opacity:.35}
    .mg9-vs{font-size:.6rem;font-weight:800;color:var(--text-muted,#64748b);opacity:.25}

    .mg9-comp-row{display:flex;align-items:center;gap:4px;margin-top:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,.03)}
    .mg9-comp-row img{width:10px;height:10px;object-fit:contain;flex-shrink:0}
    .mg9-comp-row span{font-size:.5rem;color:var(--text-muted,#64748b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg9-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border-radius:inherit;z-index:3;pointer-events:none}
    .mg9-overlay-badge{padding:6px 16px;border-radius:8px;color:#fff;font-weight:800;font-size:.7rem;letter-spacing:.05em;display:flex;align-items:center;gap:5px;animation:mg9StatusIn 3s ease both}

    .mg9-expanded{background:var(--bg-surface,#0d1321);border:1px solid var(--border,#1e293b);border-top:none;border-radius:0 0 10px 10px;overflow:hidden;animation:mg9Expand .3s ease-out both}
    .mg9-exp-section{padding:8px 10px 2px;font-size:.5rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.05em}
    .mg9-exp-row{display:flex;justify-content:space-between;align-items:center;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:.65rem}
    .mg9-exp-row:last-child{border-bottom:none}
    .mg9-exp-label{color:var(--text-muted,#64748b);font-weight:600}
    .mg9-exp-val{color:var(--text-primary,#f1f5f9);font-weight:700;font-family:var(--font-display,system-ui)}
    .mg9-stat-row{display:grid;grid-template-columns:1fr 2fr 1fr;align-items:center;padding:4px 10px;border-bottom:1px solid rgba(255,255,255,.03);font-size:.65rem}
    .mg9-stat-home{text-align:right;color:var(--text-primary);font-weight:700}
    .mg9-stat-away{text-align:left;color:var(--text-primary);font-weight:700}
    .mg9-stat-label{text-align:center;color:var(--text-muted);font-weight:600;font-size:.6rem}
    .mg9-no-data{padding:10px;text-align:center;color:var(--text-muted,#64748b);font-size:.6rem;opacity:.5}

    .mg9-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:30px 20px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:12px;text-align:center}
    .mg9-empty-icon{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);color:var(--text-muted,#64748b);margin-bottom:2px}
    .mg9-empty p{color:var(--text-muted,#64748b);font-size:.7rem;margin:0;font-weight:600}

    .mg9-sk{height:40px;border-radius:10px;background:linear-gradient(90deg,var(--bg-surface,#0d1321) 25%,var(--bg-card,#111827) 50%,var(--bg-surface,#0d1321) 75%);background-size:200% 100%;animation:mg9Shimmer 1.5s ease-in-out infinite;margin-bottom:4px}

    .mg9-toast-wrap{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:6px;pointer-events:none;width:calc(100% - 20px);max-width:360px}
    .mg9-toast{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:8px 12px;color:#fff;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 8px 24px rgba(0,0,0,.5);animation:mg9ToastIn .3s cubic-bezier(.22,1,.36,1) both;font-size:.7rem}
    .mg9-toast-inner{display:flex;align-items:flex-start;gap:6px}
    .mg9-toast-icon{font-size:1rem;flex-shrink:0;line-height:1}
    .mg9-toast-title{font-weight:800;font-size:.6rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:1px}
    .mg9-toast-msg{font-weight:600;line-height:1.3;opacity:.95}
    .mg9-toast-detail{font-size:.55rem;opacity:.6;margin-top:1px}
    .mg9-toast-score{font-family:var(--font-display,system-ui);font-weight:800;font-size:.9rem;flex-shrink:0;margin-left:auto;text-shadow:0 0 8px rgba(255,255,255,.2)}

    .mg9-confetti{position:fixed;inset:0;pointer-events:none;z-index:400;overflow:hidden}
    .mg9-confetti-p{position:absolute;width:6px;height:6px;border-radius:2px;animation:mg9Confetti 1.4s ease-out forwards}

    .mg9-tbl-wrap{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;overflow:hidden;margin-bottom:8px}
    .mg9-tbl{width:100%;border-collapse:collapse;font-size:.65rem}
    .mg9-tbl thead{background:rgba(255,255,255,.02)}
    .mg9-tbl th{padding:6px 4px;font-size:.5rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;text-align:left;border-bottom:1px solid var(--border,#1e293b)}
    .mg9-tbl th.c{text-align:center;width:20px}
    .mg9-tbl td{padding:5px 4px;border-bottom:1px solid rgba(255,255,255,.025);vertical-align:middle}
    .mg9-tbl tr:last-child td{border-bottom:none}
    .mg9-tbl .pos{font-weight:700;color:var(--text-muted,#64748b);text-align:center;font-variant-numeric:tabular-nums}
    .mg9-tbl .tc{display:flex;align-items:center;gap:4px;min-width:0}
    .mg9-tbl .tc img{width:14px;height:14px;object-fit:contain;flex-shrink:0;border-radius:2px}
    .mg9-tbl .tc span{font-weight:600;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg9-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:var(--text-muted,#64748b)}
    .mg9-tbl .pc{text-align:center;font-weight:800;color:var(--text-primary,#f1f5f9)}

    .mg9-teams-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
    .mg9-team-card{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:10px 6px;text-align:center}
    .mg9-team-card img{width:28px;height:28px;object-fit:contain;margin:0 auto 4px;display:block}
    .mg9-team-card .name{font-size:.6rem;font-weight:700;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg9-comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
    .mg9-comp-card{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:10px;padding:10px;display:flex;align-items:center;gap:8px;cursor:pointer}
    .mg9-comp-card img{width:24px;height:24px;object-fit:contain;flex-shrink:0}
    .mg9-comp-card .cname{font-size:.7rem;font-weight:700;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg9-comp-card .carea{font-size:.5rem;color:var(--text-muted,#64748b)}

    .mg9-show-more{width:100%;padding:10px;border:none;border-radius:10px;background:rgba(255,255,255,.02);color:var(--text-muted,#64748b);font-size:.65rem;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px}
    .mg9-show-more:hover{background:rgba(16,185,129,.05);color:var(--accent,#10b981)}

    @media(max-width:380px){.mg9-team-name{font-size:.68rem}.mg9-score-num{font-size:.85rem}.mg9-crest{width:14px;height:14px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════════════
   SOUND & COMMENTARY
   ═══════════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════════
   TOAST SYSTEM & CONFETTI
   ═══════════════════════════════════════════════════════════════════════ */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-1), { ...t, id }]);
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

function ToastContainer({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="mg9-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal', isRescue = t.type === 'rescue';
        let bg, icon;
        if (isRescue) { bg = 'linear-gradient(135deg,rgba(251,191,36,.92),rgba(245,158,11,.9))'; icon = '🌐'; }
        else if (isGoal) { bg = 'linear-gradient(135deg,rgba(239,68,68,.92),rgba(185,28,28,.9))'; icon = '⚽'; }
        else {
          const m = { ft: ['rgba(16,185,129,.92)','rgba(5,150,105,.9)'], ht: ['rgba(249,115,22,.92)','rgba(217,90,12,.9)'], live: ['rgba(239,68,68,.92)','rgba(220,38,38,.9)'] };
          const c = m[t.st] || m.live; bg = `linear-gradient(135deg,${c[0]},${c[1]})`;
          icon = t.st === 'ft' ? '🏁' : t.st === 'ht' ? '⏸️' : '⚡';
        }
        return (
          <div key={t.id} className="mg9-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="mg9-toast-inner">
              <span className="mg9-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mg9-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'KICK OFF'}</div>
                {t.msg && <div className="mg9-toast-msg">{t.msg}</div>}
                {t.detail && <div className="mg9-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="mg9-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Confetti({ active }) {
  if (!active) return null;
  const colors = ['#ef4444','#10b981','#f59e0b','#3b82f6','#a855f7','#ec4899'];
  const p = Array.from({ length: 18 }, (_, i) => ({ left: 8 + Math.random() * 84, bottom: 60, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="mg9-confetti">
      {p.map((x, i) => <div key={i} className="mg9-confetti-p" style={{ left: x.left + '%', bottom: x.bottom + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   DATA NORMALIZATION & HELPERS
   ═══════════════════════════════════════════════════════════════════════ */
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
      kickoff = formatTime(rawDate); // ★ Use global formatTime for consistency
      timestamp = dt.getTime();
    } catch {}
  } else if (raw.kickoff) {
    kickoff = raw.kickoff;
  }

  // ★ FIX: Match Home.jsx logic exactly for isLive/isFinished
  const isLive = isPrimary ? !!raw.isLive : (status === 'IN_PLAY' || status === 'PAUSED' || status === '1H' || status === '2H' || isLiveStatus(status, 'football'));
  const isHT = status === 'HT' || status === 'BT' || status === 'HALF_TIME';
  const isFinished = isPrimary ? !!raw.isFinished : (status === 'FINISHED' || status === 'FT' || status === 'AET' || isFinishedStatus(status, 'football'));
  
  // ★ NEW: Calculate if match has started but has no live coverage
  let isStarted = false;
  if (timestamp > 0 && Date.now() > timestamp && !isLive && !isFinished) {
    isStarted = true;
  }

  const homeScore = isPrimary ? raw.homeScore : (raw.score?.fullTime?.home ?? raw.score?.halfTime?.home ?? null);
  const awayScore = isPrimary ? raw.awayScore : (raw.score?.fullTime?.away ?? raw.score?.halfTime?.away ?? null);

  return {
    id, dateStr, kickoff, timestamp,
    status, isLive, isHT, isFinished,
    minute: raw.minute || raw.elapsed || null, // ★ FIX: Restore minute property
    isStarted, // ★ NEW: Add isStarted flag
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

/* ═══════════════════════════════════════════════════════════════════════
   UI COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */
function ScoreBreakdown({ match }) {
  // ★ NEW: Show message if match started but has no live coverage
  if (match.isStarted && !match.isLive) {
    return (
      <div className="mg9-no-data" style={{ padding: '20px', textAlign: 'center' }}>
        <Clock size={18} style={{ marginBottom: '8px', color: 'var(--text-muted)' }} />
        <div style={{ color: 'var(--text-primary)', fontWeight: 700, marginBottom: '4px' }}>Match in Progress</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>Live coverage not available. Results will be shown at Full Time.</div>
      </div>
    );
  }
  
  const s = match.score || {};
  const stats = match.stats || [];
  
  const periods = [
    { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
    { l: 'Full Time', h: s.fullTime?.home ?? match.homeScore, a: s.fullTime?.away ?? match.awayScore },
  ];
  
  const hasScoreData = periods.some(p => p.h != null || p.a != null);
  const hasStatsData = stats.length > 0;
  
  if (!hasScoreData && !hasStatsData) return <div className="mg9-no-data">Details appear once the match begins</div>;
  
  return (
    <div style={{ padding: '4px 0 0' }}>
      {hasScoreData && (
        <>
          <div className="mg9-exp-section">Score Breakdown</div>
          {periods.filter(p => p.h != null || p.a != null).map(p => (
            <div key={p.l} className="mg9-exp-row"><span className="mg9-exp-label">{p.l}</span><span className="mg9-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span></div>
          ))}
        </>
      )}
      
      {hasStatsData && (
        <>
          <div className="mg9-exp-section">Match Stats</div>
          {stats.map((stat, i) => (
            <div key={i} className="mg9-stat-row">
              <span className="mg9-stat-home">{stat.home ?? '-'}</span>
              <span className="mg9-stat-label">{stat.type}</span>
              <span className="mg9-stat-away">{stat.away ?? '-'}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MatchCard({ m, idx, expanded, onToggle, scorePops, flashGoals, statusAnims, isFav, onFav }) {
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

  let cls = 'mg9-card';
  if (isLive) cls += ' live';
  else if (isStarted) cls += ' started';
  else if (isFt) cls += ' finished';
  else if (isSched) cls += ' scheduled';
  if (isFlash) cls += ' goal-flash';
  if (sa?.type === 'ft') cls += ' ft-settle';
  if (isExp) cls += ' expanded';

  const barColor = isLive ? '#ef4444' : isStarted ? '#f59e0b' : isFt ? 'var(--accent,#10b981)' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 10 + 'ms', paddingLeft: (isLive || isStarted || isFt) ? 12 : 10 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isStarted || isFt) && <div className="mg9-left-bar" style={{ background: barColor }} />}
        <div className="mg9-card-top">
          <div>
            {isLive && <span className="mg9-status live-s"><span className="mg9-dot" /> {m.minute != null ? `${m.minute}'` : 'LIVE'}</span>}
            {isStarted && <span className="mg9-status started-s"><Clock size={8} /> STARTED</span>}
            {isHT && <span className="mg9-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.08)' }}>HT</span>}
            {isFt && <span className="mg9-status ft-s">FT</span>}
            {isSched && <span className="mg9-status time-s">{m.kickoff}</span>}
          </div>
          <div className="mg9-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`mg9-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={12} fill={isFav ? '#f59e0b' : 'none'} />
            </button>
          </div>
        </div>
        <div className="mg9-teams">
          <div className="mg9-team-col home">
            <div className="mg9-team-row">
              {m.homeLogo && <img className="mg9-crest" src={m.homeLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg9-team-name">{m.homeName}</span>
            </div>
          </div>
          <div className="mg9-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="mg9-scores">
                <span className={`mg9-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                <span className="mg9-sep">–</span>
                <span className={`mg9-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
              </div>
            ) : <span className="mg9-vs">VS</span>}
          </div>
          <div className="mg9-team-col away">
            <div className="mg9-team-row">
              {m.awayLogo && <img className="mg9-crest" src={m.awayLogo} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg9-team-name">{m.awayName}</span>
            </div>
          </div>
        </div>
        <div className="mg9-comp-row">
          {m.leagueLogo && <img src={m.leagueLogo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.leagueName}</span>
        </div>
        {sa && (
          <div className="mg9-overlay">
            <div className="mg9-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={12} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={12} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={12} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
      {isExp && <div className="mg9-expanded"><ScoreBreakdown match={m} /></div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function MasterGames() {
  injectStyles();

  // Backup Context (always runs silently in the background)
  const { fixtures: backupRaw, liveMatches: backupLive, competitions, loading: backupLoading, lastUpdated, loadDateFixtures, getStandings, getTeams, refreshFixtures } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg9_favs') || '[]')); } catch { return new Set(); } });
  const toggleFav = useCallback(id => { setFavs(p => { const n = new Set(p); const idStr = String(id); if (n.has(idStr)) n.delete(idStr); else n.add(idStr); try { localStorage.setItem('mg9_favs', JSON.stringify([...n])); } catch {} return n; }); }, []);
  const isFav = useCallback(id => favs.has(String(id)), [favs]);

  /* ── State ── */
  const [tab, setTab] = useState('fixtures');
  const [compFilter, setCompFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [primaryFixtures, setPrimaryFixtures] = useState([]);
  const [primaryLoading, setPrimaryLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [rescued, setRescued] = useState(false);
  const [moreDatesOpen, setMoreDatesOpen] = useState(false);
  const [leagueDropdownOpen, setLeagueDropdownOpen] = useState(false);
  const [showOtherMatches, setShowOtherMatches] = useState(false);
  const rescueToastSent = useRef(false);
  const [scorePops, setScorePops] = useState(new Map());
  const [flashGoals, setFlashGoals] = useState(new Set());
  const [statusAnims, setStatusAnims] = useState(new Map());

  // ★ NEW: State for live filter and per-league toggles
  const [showLiveOnly, setShowLiveOnly] = useState(false);
  const [expandedLeagues, setExpandedLeagues] = useState(new Set());

  /* ── Refs ── */
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const timeouts = useRef(new Map());
  const moreRef = useRef(null);
  const leagueDdRef = useRef(null);

  // Generate 14 past dates (reversed so oldest is at top) and 14 future dates
  const pastDates = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = getLocalDateStr(-(i + 2)); // -2, -3, ..., -15
    return { str: d, label: formatDateShort(d) };
  }).reverse(), []); 

  const futureDates = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = getLocalDateStr(i + 2); // +2, +3, ..., +15
    return { str: d, label: formatDateShort(d) };
  }), []);

  useEffect(() => { Sound.on = soundOn; }, [soundOn]);
  const clearTO = (k) => { if (timeouts.current.has(k)) { clearTimeout(timeouts.current.get(k)); timeouts.current.delete(k); } };
  const setTO = (k, fn, ms) => { clearTO(k); timeouts.current.set(k, setTimeout(() => { fn(); timeouts.current.delete(k); }, ms)); };

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreDatesOpen(false);
      if (leagueDdRef.current && !leagueDdRef.current.contains(e.target)) setLeagueDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     1. DATA FETCHING (Primary + Backup)
     ═══════════════════════════════════════════════════════════════ */
  const isPrimaryDate = [getYesterdayStr(), getTodayStr(), getTomorrowStr()].includes(selectedDate);

  // Fetch Primary (Node Backend)
  useEffect(() => {
    if (!isPrimaryDate) {
      setPrimaryFixtures([]); // Clear primary if outside 3-day window
      setPrimaryLoading(false);
      return;
    }

    let mnt = true;
    setPrimaryLoading(true);

    (async () => {
      try {
        const res = await fetchFixtures(selectedDate);
        if (mnt) {
          const l = Array.isArray(res) ? res : res?.matches || [];
          setPrimaryFixtures(l.map(m => normalizeMatch(m, true)));
        }
      } catch (e) {
        if (mnt) setPrimaryFixtures([]);
      } finally {
        if (mnt) setPrimaryLoading(false);
      }
    })();

    return () => { mnt = false; };
  }, [selectedDate, isPrimaryDate]);

  // Fetch Backup (Football-data.org)
  useEffect(() => {
    if (selectedDate) loadDateFixtures(selectedDate);
  }, [selectedDate, loadDateFixtures]);

  // Primary Live Polling (Only for Today)
  useEffect(() => {
    if (selectedDate !== getTodayStr()) return;

    const unsub = subscribeToLiveFixtures(({ matches: lm }) => {
      if (!lm || lm.length === 0) return;
      const liveMap = new Map(lm.map(m => [String(m.id), m]));
      
      setPrimaryFixtures(prev => prev.map(f => {
        const live = liveMap.get(String(f.id));
        if (live) {
          return { 
            ...f, 
            homeScore: live.homeScore ?? f.homeScore, 
            awayScore: live.awayScore ?? f.awayScore, 
            isLive: true, 
            isFinished: false, 
            status: live.status || 'LIVE',
            minute: live.minute ?? live.elapsed ?? f.minute // ★ FIX: Update minute during poll
          };
        }
        // ★ FIX: Only mark as STARTED if not already live
        const ko = f.timestamp ? new Date(f.timestamp).getTime() : 0;
        const now = Date.now();
        if (!f.isLive && !f.isStarted && ko > 0 && now > ko && !f.isFinished) {
          return { ...f, isStarted: true, status: 'STARTED' };
        }
        return f;
      }));
    });

    return () => unsub();
  }, [selectedDate]);

  /* ═══════════════════════════════════════════════════════════════
     2. SEAMLESS AUTO-FAILOVER BLEND & DEDUPLICATION
     ═══════════════════════════════════════════════════════════════ */
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
    setRescued(false);
    rescueToastSent.current = false;
    setExpanded(null);
    setShowOtherMatches(false); // Reset toggle on date change
    setExpandedLeagues(new Set()); // Reset league expansion on date change
  }, [selectedDate]);

  const displayFixtures = useMemo(() => {
    let list = primaryFixtures.length > 0 ? primaryFixtures : backupFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.leagueName) === compFilter);
    if (searchQ.trim()) {
      const terms = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => matchQ(m, terms));
    }
    
    const uniqueIds = new Set();
    const dedupedList = list.filter(m => {
      const idStr = String(m.id);
      if (uniqueIds.has(idStr)) return false;
      uniqueIds.add(idStr);
      return true;
    });
    
    return dedupedList;
  }, [primaryFixtures, backupFixtures, compFilter, searchQ]);

  /* ═══════════════════════════════════════════════════════════════
     3. GROUPING & SORTING (League Priority & Live Status)
     ═══════════════════════════════════════════════════════════════ */
  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
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
  }, [displayFixtures]);

  // ★ NEW: Split into Top 5 Leagues and Others (with Live Filter)
  const { topLeagues, otherLeagues } = useMemo(() => {
    let groups = [...grouped];
    
    // Apply Live Only Filter
    if (showLiveOnly) {
      groups = groups.map(g => ({
        ...g,
        matches: g.matches.filter(m => m.isLive)
      })).filter(g => g.matches.length > 0);
    }
    
    const top = groups.slice(0, 5);
    const others = groups.slice(5); // Keep them grouped by league!
    return { topLeagues: top, otherLeagues: others };
  }, [grouped, showLiveOnly]);

  const toggleLeagueExpand = (leagueName) => {
    setExpandedLeagues(prev => {
      const n = new Set(prev);
      if (n.has(leagueName)) n.delete(leagueName);
      else n.add(leagueName);
      return n;
    });
  };

  const compList = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      if (!map.has(m.leagueName)) map.set(m.leagueName, { id: m.leagueName, name: m.leagueName, emblem: m.leagueLogo });
    });
    return [...map.values()].sort((a, b) => getLeaguePriority(a.name) - getLeaguePriority(b.name));
  }, [displayFixtures]);

  const liveCount = useMemo(() => displayFixtures.filter(m => m.isLive).length, [displayFixtures]);
  const favMatches = useMemo(() => displayFixtures.filter(m => favs.has(String(m.id))), [displayFixtures, favs]);

  /* ═══════════════════════════════════════════════════════════════
     4. TABS (Standings / Teams)
     ═══════════════════════════════════════════════════════════════ */
  const handleTabChange = useCallback(async (t) => {
    setTab(t);
    if (t === 'standings' && !standingsData && !standingsLoading) {
      setStandingsLoading(true);
      try { const data = await getStandings(); setStandingsData(data); } catch {}
      setStandingsLoading(false);
    }
    if (t === 'teams' && !teamsData && !teamsLoading) {
      setTeamsLoading(true);
      try { const data = await getTeams(); setTeamsData(data); } catch {}
      setTeamsLoading(false);
    }
  }, [standingsData, standingsLoading, teamsData, teamsLoading, getStandings, getTeams]);

  /* ═══════════════════════════════════════════════════════════════
     5. LIVE CHANGE DETECTION (Unified)
     ═══════════════════════════════════════════════════════════════ */
  const isLiveStatus = (s) => s === 'IN_PLAY' || s === 'PAUSED' || s === '1H' || s === '2H' || s === 'ET' || s === 'BT' || s === 'LIVE';

  const liveMatches = useMemo(() => {
    if (primaryFixtures.length > 0) return primaryFixtures.filter(m => m.isLive);
    return (backupLive || []).map(m => normalizeMatch(m, false)).filter(m => m.isLive);
  }, [primaryFixtures, backupLive]);

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
  }, [liveMatches, addToast, isFav, tab]);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  const selectedCompData = compList.find(c => c.id === compFilter);

  return (
    <div className="mg9-page">
      <SEO title="Football Fixtures & Live Scores" description="Live football scores, fixtures, and predictions." path="/fixtures" />
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mg9-wrap">
        {/* Header */}
        <div className="mg9-hdr">
          <div className="mg9-hdr-title">
            <h1><Activity size={14} style={{ color: 'var(--accent)' }} /> Master Games</h1>
            <div className="sub">{liveCount > 0 ? `${liveCount} Live Matches` : 'Live scores · Fixtures · Standings'}</div>
          </div>
          <div className="mg9-hdr-actions">
            <button className={`mg9-hdr-btn ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen(p => !p)} title="Search">
              {searchOpen ? <X size={14} /> : <Search size={14} />}
            </button>
            <button className={`mg9-hdr-btn ${soundOn ? 'active' : ''}`} onClick={() => setSoundOn(p => !p)} title="Sound">
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button className="mg9-hdr-btn" onClick={() => refreshFixtures()} title="Refresh">
              <RefreshCw size={14} className={primaryLoading || backupLoading ? 'mg9-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mg9-stats">
          <div className="mg9-schip">
            <div className="val live-c">{liveCount}</div>
            <div className="lbl">Live</div>
          </div>
          <div className="mg9-schip">
            <div className="val total-c">{displayFixtures.length}</div>
            <div className="lbl">Matches</div>
          </div>
          <div className="mg9-schip">
            <div className="val fav-c">{favs.size}</div>
            <div className="lbl">Favourites</div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="mg9-datenav">
          <button className={`mg9-nav-btn ${selectedDate === getLocalDateStr(-1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(-1))}>
            Yesterday
          </button>
          <button className={`mg9-nav-btn ${selectedDate === getLocalDateStr(0) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(0))}>
            Today
          </button>
          <button className={`mg9-nav-btn ${selectedDate === getLocalDateStr(1) ? 'active' : ''}`} onClick={() => setSelectedDate(getLocalDateStr(1))}>
            Tomorrow
          </button>
          <div className="mg9-more-wrap" ref={moreRef}>
            <button className={`mg9-more-btn ${moreDatesOpen ? 'open' : ''}`} onClick={() => setMoreDatesOpen(p => !p)}>
              <Calendar size={12} /> More <ChevronDown size={12} />
            </button>
            {moreDatesOpen && (
              <div className="mg9-more-dropdown">
                <div className="mg9-more-label">Past Dates</div>
                {pastDates.map(d => (
                  <button key={d.str} className={`mg9-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
                <div className="mg9-more-label" style={{ marginTop: '6px' }}>Future Dates</div>
                {futureDates.map(d => (
                  <button key={d.str} className={`mg9-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mg9-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`mg9-tab ${tab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>
              {t === 'fixtures' ? 'Fixtures' : t === 'favourites' ? 'Favs' : t === 'standings' ? 'Table' : t === 'teams' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={`mg9-search-wrap ${searchOpen ? 'open' : 'shut'}`}>
          <div className="mg9-search">
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus={searchOpen} />
            {searchQ && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setSearchQ('')}><X size={14} /></button>}
          </div>
        </div>

        {/* ═══ Fixtures Tab ═══ */}
        {tab === 'fixtures' && (
          <>
            {rescued && (
              <div className="mg9-rescue">
                <div className="mg9-rescue-icon"><AlertTriangle size={14} /></div>
                <div className="mg9-rescue-text">
                  <div className="mg9-rescue-title">Backup Source Active</div>
                  <div className="mg9-rescue-sub">Showing {backupFixtures.length} games from global feed</div>
                </div>
              </div>
            )}

            <div className="mg9-filter-wrap" ref={leagueDdRef} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {compList.length > 1 && (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <button className="mg9-filter-btn" onClick={() => setLeagueDropdownOpen(p => !p)} style={{ width: '100%' }}>
                    <div className="left">
                      <ListFilter size={12} />
                      {compFilter === 'ALL' ? 'All Leagues' : (
                        <>
                          {selectedCompData?.emblem && <img src={selectedCompData.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                          {selectedCompData?.name}
                        </>
                      )}
                    </div>
                    <ChevronDown size={12} style={{ opacity: 0.6 }} />
                  </button>
                  {leagueDropdownOpen && (
                    <div className="mg9-filter-panel">
                      <button className={`mg9-filter-item ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => { setCompFilter('ALL'); setLeagueDropdownOpen(false); }}>
                        All Leagues
                      </button>
                      {compList.map(c => (
                        <button key={c.id} className={`mg9-filter-item ${compFilter === String(c.id) ? 'active' : ''}`} onClick={() => { setCompFilter(String(c.id)); setLeagueDropdownOpen(false); }}>
                          {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* ★ NEW: Live Only Button */}
              <button 
                className="mg9-filter-btn" 
                onClick={() => setShowLiveOnly(p => !p)} 
                style={{ 
                  width: '130px', 
                  flexShrink: 0,
                  background: showLiveOnly ? 'rgba(239,68,68,.1)' : 'var(--bg-card,#111827)', 
                  borderColor: showLiveOnly ? 'rgba(239,68,68,.3)' : 'var(--border,#1e293b)', 
                  color: showLiveOnly ? '#ef4444' : 'var(--text-muted,#64748b)',
                  boxShadow: showLiveOnly ? '0 0 10px rgba(239,68,68,.1)' : 'none'
                }}
              >
                <div className="left" style={{ justifyContent: 'center', width: '100%' }}>
                  {showLiveOnly ? <span className="mg9-dot" style={{ background: '#ef4444' }} /> : <Activity size={12} />}
                  {showLiveOnly ? 'Live Only' : 'Show Live'}
                </div>
              </button>
            </div>

            {primaryLoading && isPrimaryDate ? (
              <div>{[1,2,3,4,5].map(i => <div key={i} className="mg9-sk" style={{ animationDelay: i * 80 + 'ms' }} />)}</div>
            ) : displayFixtures.length === 0 ? (
              <div className="mg9-empty">
                <div className="mg9-empty-icon"><Search size={20} /></div>
                <p>No matches found for this date</p>
              </div>
            ) : (
              <>
                {favMatches.length > 0 && (
                  <div className="mg9-section">
                    <div className="mg9-league-hd"><Star size={14} style={{ color: '#f59e0b' }} /><span>Favourites</span></div>
                    {favMatches.map((m, i) => <MatchCard key={`fav-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
                  </div>
                )}

                {/* Render Top 5 Leagues (5 matches max, rest in toggler) */}
                {topLeagues.map(g => {
                  const isExpanded = expandedLeagues.has(g.name);
                  const limit = 5;
                  const visibleMatches = isExpanded ? g.matches : g.matches.slice(0, limit);
                  const hiddenCount = g.matches.length - limit;
                  
                  return (
                    <div key={g.name} className="mg9-section">
                      <div className="mg9-league-hd">
                        {g.logo && <img src={g.logo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                        <span>{g.name}</span>
                        <span className="cnt">{g.matches.length}</span>
                      </div>
                      {visibleMatches.map((m, i) => 
                        <MatchCard key={`${g.name}-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />
                      )}
                      {hiddenCount > 0 && (
                        <button className="mg9-show-more" onClick={() => toggleLeagueExpand(g.name)}>
                          {isExpanded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Render Other Leagues (1 match max, rest in toggler) */}
                {otherLeagues.map(g => {
                  const isExpanded = expandedLeagues.has(g.name);
                  const limit = 1;
                  const visibleMatches = isExpanded ? g.matches : g.matches.slice(0, limit);
                  const hiddenCount = g.matches.length - limit;
                  
                  return (
                    <div key={g.name} className="mg9-section">
                      <div className="mg9-league-hd">
                        {g.logo && <img src={g.logo} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                        <span>{g.name}</span>
                        <span className="cnt">{g.matches.length}</span>
                      </div>
                      {visibleMatches.map((m, i) => 
                        <MatchCard key={`${g.name}-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />
                      )}
                      {hiddenCount > 0 && (
                        <button className="mg9-show-more" onClick={() => toggleLeagueExpand(g.name)}>
                          {isExpanded ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          {isExpanded ? 'Show less' : `Show ${hiddenCount} more matches`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* ═══ Favourites Tab ═══ */}
        {tab === 'favourites' && (
          <>
            {favMatches.length > 0 ? (
              <div className="mg9-section">
                <div className="mg9-league-hd"><Star size={14} style={{ color: '#f59e0b' }} /><span>Favourites ({favMatches.length})</span></div>
                {favMatches.map((m, i) => <MatchCard key={`fav-tab-${m.id}-${i}`} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav(m.id)} onFav={toggleFav} />)}
              </div>
            ) : (
              <div className="mg9-empty">
                <div className="mg9-empty-icon"><Star size={20} /></div>
                <p>No favourite matches found for this date</p>
              </div>
            )}
          </>
        )}

        {/* ═══ Standings Tab ═══ */}
        {tab === 'standings' && (
          standingsLoading ? (
            <div>{[1, 2, 3].map(i => <div key={i} className="mg9-sk" style={{ height: '250px', marginBottom: '10px', animationDelay: i * 80 + 'ms' }} />)}</div>
          ) : standingsData && standingsData.length > 0 ? (
            <div className="mg9-section">
              {standingsData.map((league, i) => (
                <div key={i} style={{ marginBottom: '20px' }}>
                  <div className="mg9-league-hd">
                    {league.area?.ensignUrl || league.league?.emblem && <img src={league.area?.ensignUrl || league.league?.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{league.league?.name || 'League Table'}</span>
                  </div>
                  <div className="mg9-tbl-wrap">
                    <table className="mg9-tbl">
                      <thead>
                        <tr>
                          <th className="c">#</th><th>Team</th><th className="c">P</th><th className="c">W</th><th className="c">D</th><th className="c">L</th><th className="p">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {league.standings?.[0]?.map(row => (
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
            <div className="mg9-empty">
              <div className="mg9-empty-icon"><Trophy size={20} /></div>
              <p>No standings data available</p>
            </div>
          )
        )}

        {/* ═══ Teams Tab ═══ */}
        {tab === 'teams' && (
          teamsLoading ? (
            <div>{[1, 2, 3, 4, 5].map(i => <div key={i} className="mg9-sk" style={{ height: '100px', marginBottom: '10px', animationDelay: i * 80 + 'ms' }} />)}</div>
          ) : teamsData && teamsData.length > 0 ? (
            <div className="mg9-teams-grid">
              {teamsData.map(t => (
                <div key={t.id} className="mg9-team-card">
                  {t.crest && <img src={t.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  <div className="name">{t.shortName || t.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mg9-empty">
              <div className="mg9-empty-icon"><Users size={20} /></div>
              <p>No teams data available</p>
            </div>
          )
        )}

        {/* ═══ Competitions Tab ═══ */}
        {tab === 'competitions' && (
          competitions && competitions.length > 0 ? (
            <div className="mg9-comp-grid">
              {competitions.map(c => (
                <div key={c.id} className="mg9-comp-card">
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  <div className="info">
                    <div className="cname">{c.name}</div>
                    <div className="carea">{c.area?.name || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mg9-empty">
              <div className="mg9-empty-icon"><Trophy size={20} /></div>
              <p>No competitions data available</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}