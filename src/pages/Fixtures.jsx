// FILE: src/pages/MasterGames.jsx
// v8.1 — Clean + Auto-Rescue to Master Data when date has no fixtures

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, X, Star, Volume2, VolumeX, Clock, Trophy, Users,
  Pause, Flag, Zap, ChevronRight, ChevronDown, Bell, BellOff,
  RefreshCw, Calendar, AlertTriangle
} from 'lucide-react';
import { useFootballData } from '../context/FootballDataContext';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════════════════════════
   STYLE INJECTION — Master v8.1
   ═══════════════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('mg81-css')) return;
  const s = document.createElement('style');
  s.id = 'mg81-css';
  s.textContent = `
    @keyframes mg8FadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @keyframes mg8SlideIn{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:translateX(0)}}
    @keyframes mg8Pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(1.8)}}
    @keyframes mg8ScorePop{0%{transform:scale(1)}35%{transform:scale(1.4)}65%{transform:scale(.95)}100%{transform:scale(1)}}
    @keyframes mg8GoalFlash{0%{background:rgba(16,185,129,.18)}100%{background:transparent}}
    @keyframes mg8LivePulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.3)}50%{box-shadow:0 0 0 4px rgba(239,68,68,0)}}
    @keyframes mg8Expand{from{opacity:0;max-height:0}to{opacity:1;max-height:600px}}
    @keyframes mg8ToastIn{from{opacity:0;transform:translateY(-12px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mg8ToastOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-12px) scale(.9)}}
    @keyframes mg8Confetti{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(120px) rotate(600deg);opacity:0}}
    @keyframes mg8Shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes mg8StatusIn{from{opacity:0;transform:scale(.7)}15%{opacity:1;transform:scale(1.05)}25%{transform:scale(1)}75%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}
    @keyframes mg8RescueIn{from{opacity:0;transform:translateY(-8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes mg8RescueBadge{0%{opacity:0;transform:scale(.6)}12%{opacity:1;transform:scale(1.04)}22%{transform:scale(1)}82%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.85)}}

    .mg8-page{min-height:100vh;background:var(--bg-deep,#0a0f1a);padding:0 0 100px;position:relative}
    .mg8-wrap{max-width:640px;margin:0 auto;padding:0 16px;position:relative;z-index:1}

    .mg8-header{text-align:center;padding:24px 0 0}
    .mg8-header h1{margin:0 0 4px;font-size:1.3rem;font-weight:800;color:var(--text-primary,#f1f5f9);letter-spacing:-.02em}
    .mg8-header .sub{font-size:.7rem;color:var(--text-muted,#64748b);font-weight:500}

    .mg8-stats{display:flex;justify-content:center;gap:24px;margin:16px 0 20px}
    .mg8-stat-val{font-size:1.1rem;font-weight:800;color:var(--text-primary,#f1f5f9);line-height:1;font-family:var(--font-display,system-ui)}
    .mg8-stat-val.live-c{color:#ef4444}
    .mg8-stat-val.total-c{color:var(--accent,#10b981)}
    .mg8-stat-label{font-size:.55rem;font-weight:600;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.06em;margin-top:2px}

    .mg8-datenav{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px;flex-wrap:wrap}
    .mg8-date-btn{display:inline-flex;align-items:center;gap:5px;padding:9px 16px;border-radius:10px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827);color:var(--text-muted,#64748b);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s ease;font-family:inherit;white-space:nowrap}
    .mg8-date-btn:hover{color:var(--text-primary,#f1f5f9);border-color:var(--border-hover,#334155)}
    .mg8-date-btn.active{background:var(--accent,#10b981);color:#fff;font-weight:700;border-color:var(--accent,#10b981);box-shadow:0 2px 12px rgba(16,185,129,.25)}
    .mg8-date-today{padding:10px 22px;font-size:.8rem;font-weight:700;border-radius:12px}
    .mg8-more-wrap{position:relative}
    .mg8-more-btn{display:inline-flex;align-items:center;gap:4px;padding:9px 12px;border-radius:10px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827);color:var(--text-muted,#64748b);font-size:.72rem;font-weight:600;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .mg8-more-btn:hover{color:var(--text-primary,#f1f5f9);border-color:var(--border-hover,#334155)}
    .mg8-more-dropdown{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:12px;padding:6px;z-index:50;min-width:170px;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:mg8FadeIn .2s ease both}
    .mg8-more-item{display:block;width:100%;text-align:left;padding:8px 14px;border:none;border-radius:8px;background:none;color:var(--text-muted,#64748b);font-size:.73rem;font-weight:600;cursor:pointer;transition:all .15s ease;font-family:inherit;white-space:nowrap}
    .mg8-more-item:hover{background:rgba(255,255,255,.05);color:var(--text-primary,#f1f5f9)}
    .mg8-more-item.active{color:var(--accent,#10b981);background:rgba(16,185,129,.08)}

    .mg8-tabs{display:flex;gap:3px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:11px;padding:3px;margin-bottom:14px}
    .mg8-tab{flex:1;padding:8px 4px;border:none;border-radius:9px;background:transparent;color:var(--text-muted,#64748b);font-size:.7rem;font-weight:600;cursor:pointer;transition:all .2s ease;text-align:center;font-family:inherit}
    .mg8-tab:hover{color:var(--text-primary,#f1f5f9)}
    .mg8-tab.active{background:var(--accent,#10b981);color:#fff;font-weight:700;box-shadow:0 2px 10px rgba(16,185,129,.2)}

    .mg8-filters{display:flex;gap:5px;overflow-x:auto;padding:2px 0 14px;scrollbar-width:none}
    .mg8-filters::-webkit-scrollbar{display:none}
    .mg8-filter{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827);color:var(--text-muted,#64748b);font-size:.67rem;font-weight:600;cursor:pointer;transition:all .2s ease;white-space:nowrap;font-family:inherit}
    .mg8-filter:hover{color:var(--text-primary,#f1f5f9);border-color:var(--border-hover,#334155)}
    .mg8-filter.active{background:rgba(16,185,129,.08);color:var(--accent,#10b981);border-color:rgba(16,185,129,.25)}
    .mg8-filter img{width:13px;height:13px;object-fit:contain;border-radius:2px}

    .mg8-actions{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:12px;flex-wrap:wrap}
    .mg8-act{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 12px;border-radius:8px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827);color:var(--text-muted,#64748b);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .mg8-act:hover{color:var(--text-primary,#f1f5f9);border-color:var(--border-hover,#334155)}
    .mg8-act.on{background:rgba(16,185,129,.08);color:var(--accent,#10b981);border-color:rgba(16,185,129,.25)}

    .mg8-search-wrap{overflow:hidden;transition:max-height .3s ease,opacity .25s ease,margin .3s ease}
    .mg8-search-wrap.shut{max-height:0;opacity:0;margin-bottom:0}
    .mg8-search-wrap.open{max-height:56px;opacity:1;margin-bottom:12px}
    .mg8-search{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border,#1e293b);background:var(--bg-card,#111827)}
    .mg8-search input{flex:1;background:none;border:none;outline:none;color:var(--text-primary,#f1f5f9);font-size:.82rem;font-weight:500;font-family:inherit}
    .mg8-search input::placeholder{color:var(--text-muted,#64748b);opacity:.5}

    /* Rescue Banner */
    .mg8-rescue{width:100%;padding:10px 14px;border-radius:11px;border:1px solid rgba(251,191,36,.15);background:linear-gradient(135deg,rgba(251,191,36,.04),rgba(251,191,36,.01));margin-bottom:12px;display:flex;align-items:center;gap:10px;animation:mg8RescueIn .4s ease-out both}
    .mg8-rescue-icon{width:30px;height:30px;border-radius:8px;background:rgba(251,191,36,.08);display:flex;align-items:center;justify-content:center;color:#fbbf24;font-size:.8rem;flex-shrink:0}
    .mg8-rescue-text{flex:1;min-width:0}
    .mg8-rescue-title{font-size:.7rem;font-weight:700;color:#fbbf24}
    .mg8-rescue-sub{font-size:.56rem;color:var(--text-muted,#64748b);margin-top:1px}
    .mg8-rescue-dismiss{background:none;border:none;color:var(--text-muted,#64748b);cursor:pointer;padding:4px;border-radius:6px;opacity:.5;transition:opacity .15s}
    .mg8-rescue-dismiss:hover{opacity:1}

    .mg8-live-hd{display:flex;align-items:center;gap:7px;margin-bottom:10px;padding:0 2px}
    .mg8-live-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:mg8Pulse 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.4)}
    .mg8-live-txt{font-size:.78rem;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:.04em}
    .mg8-live-cnt{font-size:.58rem;font-weight:600;color:#ef4444;opacity:.5}

    .mg8-section{margin-bottom:20px;animation:mg8FadeIn .3s ease both}
    .mg8-league-hd{display:flex;align-items:center;gap:7px;margin-bottom:7px;padding:0 2px}
    .mg8-league-hd img{width:15px;height:15px;object-fit:contain;border-radius:3px;flex-shrink:0}
    .mg8-league-hd span{font-size:.73rem;font-weight:700;color:var(--text-muted,#64748b)}
    .mg8-league-hd .cnt{margin-left:auto;font-size:.55rem;font-weight:600;color:var(--text-muted,#64748b);opacity:.4}

    .mg8-card{position:relative;overflow:hidden;padding:12px 14px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:12px;margin-bottom:5px;transition:all .2s ease;animation:mg8SlideIn .25s ease both;cursor:pointer}
    .mg8-card:hover{background:rgba(255,255,255,.02);transform:translateY(-1px)}
    .mg8-card.live{border-color:rgba(239,68,68,.2);animation:mg8LivePulse 2s ease-in-out infinite,mg8SlideIn .25s ease both}
    .mg8-card.live:hover{border-color:rgba(239,68,68,.35)}
    .mg8-card.finished{opacity:.6}
    .mg8-card.scheduled{border-left:3px solid rgba(59,130,246,.25)}
    .mg8-card.expanded{border-radius:12px 12px 0 0;margin-bottom:0;border-color:rgba(16,185,129,.2)}
    .mg8-card.goal-flash{animation:mg8GoalFlash 2s ease-out both}
    .mg8-card.ft-settle{animation:mg8GoalFlash 1.5s ease-out both}
    .mg8-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0}

    .mg8-card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
    .mg8-status{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-size:.58rem;font-weight:700;letter-spacing:.02em;text-transform:uppercase}
    .mg8-status.live-s{color:#ef4444;background:rgba(239,68,68,.1)}
    .mg8-status.ft-s{color:var(--accent,#10b981);background:rgba(16,185,129,.08)}
    .mg8-status.time-s{color:var(--text-muted,#64748b);background:rgba(255,255,255,.04);font-size:.66rem;font-weight:600}
    .mg8-dot{width:5px;height:5px;border-radius:50%;background:#ef4444;animation:mg8Pulse 1.2s ease-in-out infinite;flex-shrink:0}
    .mg8-card-actions{display:flex;align-items:center;gap:2px}
    .mg8-icon-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:none;background:transparent;color:var(--text-muted,#64748b);cursor:pointer;transition:all .15s ease;opacity:.35}
    .mg8-card:hover .mg8-icon-btn,.mg8-icon-btn.active{opacity:1}
    .mg8-icon-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary,#f1f5f9)}
    .mg8-icon-btn.fav.active{color:#f59e0b;opacity:1}
    .mg8-icon-btn.notif.active{color:var(--accent,#10b981);opacity:1}

    .mg8-teams{display:flex;align-items:center;gap:6px}
    .mg8-team-col{flex:1;display:flex;flex-direction:column;gap:1px;min-width:0}
    .mg8-team-col.home{align-items:flex-end}
    .mg8-team-col.away{align-items:flex-start}
    .mg8-team-row{display:flex;align-items:center;gap:6px;min-width:0}
    .mg8-team-col.home .mg8-team-row{flex-direction:row-reverse}
    .mg8-crest{width:20px;height:20px;object-fit:contain;flex-shrink:0;border-radius:3px}
    .mg8-team-name{font-size:.8rem;font-weight:600;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .mg8-team-col.home .mg8-team-name{text-align:right}
    .mg8-score-box{width:64px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .mg8-scores{display:flex;align-items:center;gap:5px}
    .mg8-score-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.05rem;font-weight:800;min-width:20px;text-align:center;line-height:1}
    .mg8-score-num.live-score{color:#ef4444}
    .mg8-score-num.ft-score{color:var(--accent,#10b981)}
    .mg8-score-num.pop{animation:mg8ScorePop .45s cubic-bezier(.22,1,.36,1) both}
    .mg8-sep{color:var(--text-muted,#64748b);font-size:.7rem;font-weight:700;opacity:.35}
    .mg8-vs{font-size:.68rem;font-weight:800;color:var(--text-muted,#64748b);opacity:.25;letter-spacing:.08em}

    .mg8-comp-row{display:flex;align-items:center;gap:5px;margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.03)}
    .mg8-comp-row img{width:12px;height:12px;object-fit:contain;flex-shrink:0}
    .mg8-comp-row span{font-size:.58rem;color:var(--text-muted,#64748b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    .mg8-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border-radius:inherit;z-index:3;pointer-events:none}
    .mg8-overlay-badge{padding:8px 22px;border-radius:10px;color:#fff;font-weight:700;font-size:.85rem;letter-spacing:.05em;display:flex;align-items:center;gap:7px;animation:mg8StatusIn 3s ease both}

    .mg8-expanded{background:var(--bg-surface,#0d1321);border:1px solid var(--border,#1e293b);border-top:none;border-radius:0 0 12px 12px;overflow:hidden;animation:mg8Expand .3s ease-out both}
    .mg8-exp-section{padding:10px 14px 4px;font-size:.55rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.06em}
    .mg8-exp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.03);font-size:.7rem}
    .mg8-exp-row:last-child{border-bottom:none}
    .mg8-exp-label{color:var(--text-muted,#64748b);font-weight:600}
    .mg8-exp-val{color:var(--text-primary,#f1f5f9);font-weight:700;font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums}
    .mg8-goal-row{display:flex;align-items:center;gap:6px;padding:5px 14px;border-bottom:1px solid rgba(255,255,255,.02);font-size:.7rem}
    .mg8-goal-row:last-child{border-bottom:none}
    .mg8-goal-min{font-weight:700;color:var(--text-muted,#64748b);min-width:26px;font-variant-numeric:tabular-nums;font-family:var(--font-display,system-ui)}
    .mg8-goal-icon{color:var(--accent,#10b981);font-size:.6rem}
    .mg8-goal-scorer{font-weight:600;color:var(--text-primary,#f1f5f9);flex:1}
    .mg8-goal-assist{font-size:.58rem;color:var(--text-muted,#64748b)}
    .mg8-card-row{display:flex;align-items:center;gap:5px;padding:5px 14px;border-bottom:1px solid rgba(255,255,255,.02);font-size:.68rem}
    .mg8-card-row:last-child{border-bottom:none}
    .mg8-card-player{flex:1;font-weight:600;color:var(--text-primary,#f1f5f9)}
    .mg8-card-min{font-weight:700;color:var(--text-muted,#64748b);font-variant-numeric:tabular-nums;font-family:var(--font-display,system-ui);min-width:26px;text-align:right}
    .mg8-corner-row{display:flex;align-items:center;justify-content:space-around;padding:10px 14px;font-size:.75rem;font-weight:700}
    .mg8-corner-side{display:flex;align-items:center;gap:6px}
    .mg8-corner-side img{width:16px;height:16px;object-fit:contain;border-radius:3px}
    .mg8-corner-num{font-family:var(--font-display,system-ui);font-variant-numeric:tabular-nums;font-size:1.05rem;font-weight:800}
    .mg8-ref-row{display:flex;align-items:center;gap:7px;padding:5px 14px;font-size:.68rem}
    .mg8-ref-role{font-size:.55rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;min-width:52px;letter-spacing:.04em}
    .mg8-ref-name{font-weight:600;color:var(--text-primary,#f1f5f9)}
    .mg8-ref-nat{font-size:.56rem;color:var(--text-muted,#64748b);margin-left:auto}
    .mg8-no-data{padding:14px;text-align:center;color:var(--text-muted,#64748b);font-size:.7rem;opacity:.5}

    .mg8-tbl-wrap{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:12px;overflow:hidden;margin-bottom:16px}
    .mg8-tbl{width:100%;border-collapse:collapse;font-size:.68rem}
    .mg8-tbl thead{background:rgba(255,255,255,.02)}
    .mg8-tbl th{padding:8px 5px;font-size:.52rem;font-weight:700;color:var(--text-muted,#64748b);text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid var(--border,#1e293b)}
    .mg8-tbl th.c{text-align:center;width:24px}.mg8-tbl th.pts{text-align:center;width:34px}
    .mg8-tbl td{padding:7px 5px;border-bottom:1px solid rgba(255,255,255,.02);vertical-align:middle}
    .mg8-tbl tr:last-child td{border-bottom:none}
    .mg8-tbl tr:hover{background:rgba(255,255,255,.02)}
    .mg8-tbl .pos{font-weight:700;color:var(--text-muted,#64748b);text-align:center;font-variant-numeric:tabular-nums}
    .mg8-tbl .team-cell{display:flex;align-items:center;gap:5px;min-width:0}
    .mg8-tbl .team-cell img{width:15px;height:15px;object-fit:contain;flex-shrink:0;border-radius:2px}
    .mg8-tbl .team-cell span{font-weight:600;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg8-tbl .num-cell{text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:var(--text-muted,#64748b)}
    .mg8-tbl .pts-cell{text-align:center;font-weight:800;color:var(--text-primary,#f1f5f9);font-size:.74rem}
    .mg8-tbl .gd-pos{color:var(--accent,#10b981)}.mg8-tbl .gd-neg{color:#ef4444}
    .mg8-tbl .z-ucl{border-left:3px solid #3b82f6}.mg8-tbl .z-uel{border-left:3px solid #f97316}.mg8-tbl .z-uecl{border-left:3px solid #22c55e}.mg8-tbl .z-rel{border-left:3px solid #ef4444}
    .mg8-zone-bar{display:flex;gap:0;margin-bottom:5px;padding:0 3px}
    .mg8-zone-item{flex:1;padding:3px 4px;border-radius:3px 3px 0 0;font-size:.46rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;text-align:center}

    .mg8-teams-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
    .mg8-team-card{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:11px;padding:14px 8px;text-align:center;transition:all .2s ease}
    .mg8-team-card:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .mg8-team-card img{width:32px;height:32px;object-fit:contain;margin:0 auto 5px;display:block}
    .mg8-team-card .name{font-size:.68rem;font-weight:700;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg8-team-card .tla{font-size:.52rem;font-weight:600;color:var(--text-muted,#64748b);margin-top:1px}

    .mg8-comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:16px}
    .mg8-comp-card{background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:12px;padding:14px;display:flex;align-items:center;gap:11px;transition:all .2s ease;cursor:pointer}
    .mg8-comp-card:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .mg8-comp-card img{width:28px;height:28px;object-fit:contain;flex-shrink:0}
    .mg8-comp-card .info{flex:1;min-width:0}
    .mg8-comp-card .cname{font-size:.76rem;font-weight:700;color:var(--text-primary,#f1f5f9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .mg8-comp-card .carea{font-size:.54rem;color:var(--text-muted,#64748b);margin-top:1px}

    .mg8-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;background:var(--bg-card,#111827);border:1px solid var(--border,#1e293b);border-radius:14px;text-align:center}
    .mg8-empty-icon{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);color:var(--text-muted,#64748b);margin-bottom:2px}
    .mg8-empty p{color:var(--text-muted,#64748b);font-size:.78rem;margin:0;font-weight:600}
    .mg8-empty .hint{font-size:.64rem;color:var(--text-muted,#64748b);opacity:.4;margin-top:2px}

    .mg8-sk{height:60px;border-radius:12px;background:linear-gradient(90deg,var(--bg-surface,#0d1321) 25%,var(--bg-card,#111827) 50%,var(--bg-surface,#0d1321) 75%);background-size:200% 100%;animation:mg8Shimmer 1.5s ease-in-out infinite;margin-bottom:5px}

    .mg8-toast-wrap{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:500;display:flex;flex-direction:column;gap:6px;pointer-events:none;width:calc(100% - 32px);max-width:380px}
    .mg8-toast{pointer-events:auto;cursor:pointer;border:1px solid rgba(255,255,255,.15);border-radius:11px;padding:10px 14px;color:#fff;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 4px 20px rgba(0,0,0,.4);animation:mg8ToastIn .3s ease both;font-size:.74rem}
    .mg8-toast-inner{display:flex;align-items:flex-start;gap:8px}
    .mg8-toast-icon{font-size:1.1rem;flex-shrink:0;line-height:1}
    .mg8-toast-title{font-weight:700;font-size:.65rem;text-transform:uppercase;letter-spacing:.03em;margin-bottom:1px}
    .mg8-toast-msg{font-weight:600;line-height:1.3;opacity:.95}
    .mg8-toast-detail{font-size:.6rem;opacity:.6;margin-top:1px}
    .mg8-toast-score{font-family:var(--font-display,system-ui);font-weight:800;font-size:.95rem;flex-shrink:0;margin-left:auto;text-shadow:0 0 8px rgba(255,255,255,.2)}

    .mg8-confetti{position:fixed;inset:0;pointer-events:none;z-index:400;overflow:hidden}
    .mg8-confetti-p{position:absolute;width:7px;height:7px;border-radius:2px;animation:mg8Confetti 1.4s ease-out forwards}

    .mg8-notif-banner{position:fixed;bottom:0;left:0;right:0;z-index:100;background:linear-gradient(180deg,transparent,rgba(10,15,26,.95) 30%);padding:30px 16px 20px;text-align:center}
    .mg8-notif-btn{display:inline-flex;align-items:center;gap:7px;padding:11px 24px;border-radius:12px;border:none;background:var(--accent,#10b981);color:#fff;font-size:.78rem;font-weight:700;cursor:pointer;transition:all .2s ease;font-family:inherit;box-shadow:0 4px 16px rgba(16,185,129,.3)}
    .mg8-notif-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(16,185,129,.4)}

    @media(min-width:500px){.mg8-team-name{font-size:.84rem}.mg8-score-num{font-size:1.12rem}.mg8-score-box{width:72px}.mg8-teams-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}}
    @media(max-width:380px){.mg8-team-name{font-size:.72rem}.mg8-score-num{font-size:.95rem}.mg8-score-box{width:56px}.mg8-crest{width:17px;height:17px}.mg8-card{padding:10px 10px 11px}.mg8-teams-grid{grid-template-columns:repeat(auto-fill,minmax(100px,1fr))}.mg8-comp-grid{grid-template-columns:1fr}.mg8-datenav{gap:5px}.mg8-date-btn{padding:8px 11px;font-size:.7rem}.mg8-date-today{padding:9px 16px;font-size:.75rem}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════════════
   SOUND
   ═══════════════════════════════════════════════════════════════════════ */
const Sound = {
  ctx: null, on: true, _lg: 0, _lc: 0, _lw: 0,
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
  card() {
    if (!this.on || !this._init()) return; if (Date.now() - this._lc < 1500) return; this._lc = Date.now();
    try { navigator.vibrate?.([50,30,50]); } catch {}
    const t = this._t(); [0,.15].forEach(off=>{const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='square';o.frequency.value=880;g.gain.setValueAtTime(.04,t+off);g.gain.exponentialRampToValueAtTime(.001,t+off+.1);o.connect(g);g.connect(this.ctx.destination);o.start(t+off);o.stop(t+off+.12);});
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

/* ═══════════════════════════════════════════════════════════════════════
   COMMENTARY
   ═══════════════════════════════════════════════════════════════════════ */
const CMT = {
  goal:["GOOOAL! The stadium erupts!","What a strike! Net ripped!","Pure football magic!","The ball is in the back of the net!","Somebody call the fire department!"],
  card:["Yellow card shown!","Into the book!","Walking on thin ice now!"],
  redCard:["RED CARD! Early shower!","Straight red! Game changer!"],
  ft:["Full Time! What a match!","Final whistle!"],
  ht:["Half Time! Regrouping...","HT — Manager's talk incoming!"],
  kickoff:["Kick Off! We're underway!","And we're off! Game on!"],
  rescue:["No fixtures for this date — showing all available games","Switching to worldwide coverage","Rescue mode: pulling games from all leagues"],
};
const pick = (a) => a[Math.floor(Math.random()*a.length)];

/* ═══════════════════════════════════════════════════════════════════════
   TOAST SYSTEM
   ═══════════════════════════════════════════════════════════════════════ */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());
  const add = useCallback(t => {
    const id = ++idRef.current;
    setToasts(p => [...p.slice(-3), { ...t, id }]);
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
    <div className="mg8-toast-wrap">
      {toasts.map(t => {
        const isGoal = t.type === 'goal', isCard = t.type === 'card', isRescue = t.type === 'rescue';
        let bg, icon;
        if (isRescue) { bg = 'linear-gradient(135deg,rgba(251,191,36,.92),rgba(245,158,11,.9))'; icon = '🌐'; }
        else if (isGoal) { bg = 'linear-gradient(135deg,rgba(239,68,68,.92),rgba(185,28,28,.9))'; icon = '⚽'; }
        else if (isCard) { bg = t.cardType === 'RED_CARD' ? 'linear-gradient(135deg,rgba(220,38,38,.92),rgba(153,27,27,.9))' : 'linear-gradient(135deg,rgba(202,138,4,.92),rgba(146,100,4,.9))'; icon = t.cardType === 'RED_CARD' ? '🟥' : '🟨'; }
        else {
          const m = { ft: ['rgba(16,185,129,.92)','rgba(5,150,105,.9)'], ht: ['rgba(249,115,22,.92)','rgba(217,90,12,.9)'], live: ['rgba(239,68,68,.92)','rgba(220,38,38,.9)'] };
          const c = m[t.st] || m.live; bg = `linear-gradient(135deg,${c[0]},${c[1]})`;
          icon = t.st === 'ft' ? '🏁' : t.st === 'ht' ? '⏸️' : '⚡';
        }
        return (
          <div key={t.id} className="mg8-toast" style={{ background: bg }} onClick={() => onDismiss(t.id)}>
            <div className="mg8-toast-inner">
              <span className="mg8-toast-icon">{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mg8-toast-title">{isRescue ? 'AUTO-SWITCH' : isGoal ? 'GOAL!' : isCard ? (t.cardType === 'RED_CARD' ? 'RED CARD' : 'YELLOW CARD') : t.st === 'ft' ? 'FULL TIME' : t.st === 'ht' ? 'HALF TIME' : 'KICK OFF'}</div>
                {t.msg && <div className="mg8-toast-msg">{t.msg}</div>}
                {t.detail && <div className="mg8-toast-detail">{t.detail}</div>}
              </div>
              {t.score && <div className="mg8-toast-score">{t.score}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CONFETTI
   ═══════════════════════════════════════════════════════════════════════ */
function Confetti({ active }) {
  if (!active) return null;
  const colors = ['#ef4444','#10b981','#f59e0b','#3b82f6','#a855f7','#ec4899'];
  const p = Array.from({ length: 18 }, (_, i) => ({ left: 8 + Math.random() * 84, top: -8, color: colors[i % colors.length], delay: Math.random() * .3, rot: Math.random() * 360 }));
  return (
    <div className="mg8-confetti">
      {p.map((x, i) => <div key={i} className="mg8-confetti-p" style={{ left: x.left + '%', top: x.top + 'px', background: x.color, animationDelay: x.delay + 's', transform: `rotate(${x.rot}deg)` }} />)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPERS — robust date extraction for multiple data formats
   ═══════════════════════════════════════════════════════════════════════ */
function getDateStr(off) { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().split('T')[0]; }
function formatDateShort(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function zoneCls(pos, total) { if (total <= 0) return ''; const r = pos / total; if (r <= .25) return 'z-ucl'; if (r <= .4) return 'z-uel'; if (r <= .5) return 'z-uecl'; if (r >= .85) return 'z-rel'; return ''; }

// KEY FIX: Extract date from match in multiple possible formats
function extractMatchDate(m) {
  if (!m) return '';
  // Standard ISO: "2025-01-15T20:00:00+0000"
  if (m.utcDate) {
    const d = m.utcDate.split('T')[0];
    if (d && d.length >= 10) return d;
  }
  // Fallback: "date" field
  if (m.date) {
    const d = String(m.date).split('T')[0];
    if (d && d.length >= 10) return d;
  }
  // Fallback: kickoff as ISO
  if (m.kickoff && typeof m.kickoff === 'string' && m.kickoff.includes('T')) {
    return m.kickoff.split('T')[0];
  }
  // Fallback: timestamp
  if (m.timestamp || m.kickOffTimestamp) {
    const ts = m.timestamp || m.kickOffTimestamp;
    if (typeof ts === 'number' && ts > 1e12) {
      return new Date(ts).toISOString().split('T')[0];
    }
  }
  return '';
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const matchQ = (m, terms) => [m.homeTeam?.name, m.awayTeam?.name, m.competition?.name, m.league?.name].map(norm).some(x => x && terms.every(t => x.includes(t)));

/* ═══════════════════════════════════════════════════════════════════════
   FAVOURITES & NOTIFICATIONS PERSISTENCE
   ═══════════════════════════════════════════════════════════════════════ */
function useFavourites() {
  const [favs, setFavs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg8_favs') || '[]')); } catch { return new Set(); } });
  const toggle = useCallback(id => { setFavs(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('mg8_favs', JSON.stringify([...n])); } catch {} return n; }); }, []);
  const isFav = useCallback(id => favs.has(id), [favs]);
  return { favs, toggle, isFav };
}

function useNotifications() {
  const [notifs, setNotifs] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('mg8_notifs') || '[]')); } catch { return new Set(); } });
  const [globalEnabled, setGlobalEnabled] = useState(() => { try { return localStorage.getItem('mg8_notif_global') === 'true'; } catch { return false; } });
  const toggle = useCallback(id => { setNotifs(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem('mg8_notifs', JSON.stringify([...n])); } catch {} return n; }); }, []);
  const isOn = useCallback(id => notifs.has(id), [notifs]);
  const toggleGlobal = useCallback(() => { setGlobalEnabled(p => { const n = !p; try { localStorage.setItem('mg8_notif_global', String(n)); } catch {} return n; }); }, []);
  return { notifs, toggle, isOn, globalEnabled, toggleGlobal };
}

async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

function sendBrowserNotif(title, body, icon) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: icon || '', badge: icon || '', vibrate: [80, 40, 80], tag: 'mg8-' + Date.now() }); } catch {}
}

/* ═══════════════════════════════════════════════════════════════════════
   SCORE BREAKDOWN
   ═══════════════════════════════════════════════════════════════════════ */
function ScoreBreakdown({ match }) {
  const s = match.score || {};
  const periods = [
    { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
    { l: 'Full Time', h: s.fullTime?.home, a: s.fullTime?.away },
    { l: 'Extra Time', h: s.extraTime?.home, a: s.extraTime?.away },
    { l: 'Penalties', h: s.penalties?.home, a: s.penalties?.away },
  ];
  const goals = s.goals || [], cards = s.cards || [], corners = s.corners, refs = match.referees || [];
  const hasData = periods.some(p => p.h != null || p.a != null) || goals.length || cards.length || corners || refs.length;
  if (!hasData) return <div className="mg8-no-data">Details appear once the match begins</div>;
  return (
    <div style={{ padding: '6px 0 2px' }}>
      {periods.some(p => p.h != null || p.a != null) && <>
        <div className="mg8-exp-section">Score Breakdown</div>
        {periods.filter(p => p.h != null || p.a != null).map(p => (
          <div key={p.l} className="mg8-exp-row"><span className="mg8-exp-label">{p.l}</span><span className="mg8-exp-val">{p.h ?? '-'} – {p.a ?? '-'}</span></div>
        ))}
      </>}
      {goals.length > 0 && <>
        <div className="mg8-exp-section">Goals ({goals.length})</div>
        {goals.map((g, i) => (
          <div key={i} className="mg8-goal-row">
            <span className="mg8-goal-min">{g.minute != null ? g.minute + "'" : ''}</span>
            <span className="mg8-goal-icon">⚽</span>
            <span className="mg8-goal-scorer">{g.scorer?.name || 'Unknown'}</span>
            {g.assist?.name && <span className="mg8-goal-assist">(ast. {g.assist.name})</span>}
          </div>
        ))}
      </>}
      {cards.length > 0 && <>
        <div className="mg8-exp-section">Cards ({cards.length})</div>
        {cards.map((c, i) => (
          <div key={i} className="mg8-card-row">
            <span>{c.type === 'YELLOW_CARD' ? '🟨' : c.type === 'RED_CARD' ? '🟥' : '⚪'}</span>
            <span className="mg8-card-player">{c.player?.name || 'Unknown'}</span>
            <span className="mg8-card-min">{c.minute != null ? c.minute + "'" : ''}</span>
          </div>
        ))}
      </>}
      {corners && (corners.home != null || corners.away != null) && <>
        <div className="mg8-exp-section">Corners</div>
        <div className="mg8-corner-row">
          <div className="mg8-corner-side">{match.homeTeam?.crest && <img src={match.homeTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}<span className="mg8-corner-num">{corners.home ?? 0}</span></div>
          <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>vs</span>
          <div className="mg8-corner-side"><span className="mg8-corner-num">{corners.away ?? 0}</span>{match.awayTeam?.crest && <img src={match.awayTeam.crest} alt="" onError={e => { e.target.style.display = 'none'; }} />}</div>
        </div>
      </>}
      {refs.length > 0 && <>
        <div className="mg8-exp-section">Officials</div>
        {refs.map((r, i) => (
          <div key={i} className="mg8-ref-row"><span className="mg8-ref-role">{r.role || 'Referee'}</span><span className="mg8-ref-name">{r.name || '—'}</span>{r.nationality && <span className="mg8-ref-nat">{r.nationality}</span>}</div>
        ))}
      </>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MATCH CARD
   ═══════════════════════════════════════════════════════════════════════ */
function MatchCard({ m, idx, expanded, onToggle, scorePops, flashGoals, statusAnims, isFav, onFav, isNotif, onNotif }) {
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === '1H' || m.status === '2H' || m.status === 'ET' || m.status === 'BT';
  const isHT = m.status === 'HALF_TIME' || m.status === 'HT' || m.status === 'BT';
  const isFt = m.status === 'FINISHED' || m.status === 'FT' || m.status === 'AET' || m.status === 'PEN';
  const isSched = m.status === 'SCHEDULED' || m.status === 'TIMED' || m.status === 'NS' || m.status === 'TBD';
  const sh = m.score?.fullTime;
  const mDate = extractMatchDate(m);
  const time = m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (m.kickoff || '');
  const isExp = expanded === m.id;
  const id = String(m.id);
  const isFlash = flashGoals.has(id);
  const sa = statusAnims.get(id);
  const popSide = scorePops.get(id);

  let cls = 'mg8-card';
  if (isLive) cls += ' live';
  else if (isFt) cls += ' finished';
  else if (isSched) cls += ' scheduled';
  if (isFlash) cls += ' goal-flash';
  if (sa?.type === 'ft') cls += ' ft-settle';
  if (isExp) cls += ' expanded';

  const barColor = isLive ? '#ef4444' : isFt ? 'var(--accent,#10b981)' : 'transparent';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 10 + 'ms', paddingLeft: (isLive || isFt) ? 16 : 14 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isFt) && <div className="mg8-left-bar" style={{ background: barColor }} />}
        <div className="mg8-card-top">
          <div>
            {isLive && <span className="mg8-status live-s"><span className="mg8-dot" /> LIVE</span>}
            {isHT && <span className="mg8-status" style={{ color: '#fbbf24', background: 'rgba(251,191,36,.08)' }}>HT</span>}
            {isFt && <span className="mg8-status ft-s">FT</span>}
            {isSched && <span className="mg8-status time-s">{time}</span>}
          </div>
          <div className="mg8-card-actions" onClick={e => e.stopPropagation()}>
            <button className={`mg8-icon-btn fav ${isFav ? 'active' : ''}`} onClick={() => onFav(m.id)} title="Favourite" aria-label="Toggle favourite">
              <Star size={14} fill={isFav ? '#f59e0b' : 'none'} />
            </button>
            <button className={`mg8-icon-btn notif ${isNotif ? 'active' : ''}`} onClick={() => onNotif(m.id)} title="Notifications" aria-label="Toggle notifications">
              {isNotif ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
          </div>
        </div>
        <div className="mg8-teams">
          <div className="mg8-team-col home">
            <div className="mg8-team-row">
              {m.homeTeam?.crest && <img className="mg8-crest" src={m.homeTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg8-team-name">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
            </div>
          </div>
          <div className="mg8-score-box">
            {(isLive || isHT || isFt) ? (
              <div className="mg8-scores">
                <span className={`mg8-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${sh?.home}-${popSide}`}>{sh?.home ?? 0}</span>
                <span className="mg8-sep">–</span>
                <span className={`mg8-score-num ${isLive ? 'live-score' : ''} ${isFt ? 'ft-score' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${sh?.away}-${popSide}`}>{sh?.away ?? 0}</span>
              </div>
            ) : <span className="mg8-vs">VS</span>}
          </div>
          <div className="mg8-team-col away">
            <div className="mg8-team-row">
              {m.awayTeam?.crest && <img className="mg8-crest" src={m.awayTeam.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
              <span className="mg8-team-name">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
            </div>
          </div>
        </div>
        <div className="mg8-comp-row">
          {m.competition?.emblem && <img src={m.competition.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
          <span>{m.competition?.name || m.league?.name || ''}</span>
        </div>
        {sa && (
          <div className="mg8-overlay">
            <div className="mg8-overlay-badge" style={{ background: sa.type === 'ht' ? 'rgba(249,115,22,.88)' : sa.type === 'ft' ? 'rgba(16,185,129,.88)' : 'rgba(239,68,68,.88)' }}>
              {sa.type === 'ht' && <><Pause size={15} /> HALF TIME</>}
              {sa.type === 'ft' && <><Flag size={15} /> FULL TIME</>}
              {sa.type === 'live' && <><Zap size={15} /> KICK OFF</>}
            </div>
          </div>
        )}
      </div>
      {isExp && <div className="mg8-expanded"><ScoreBreakdown match={m} /></div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   STANDINGS TABLE
   ═══════════════════════════════════════════════════════════════════════ */
function StandingsTable({ standings }) {
  if (!standings?.length) return null;
  return (
    <div>
      {standings.map((g, gi) => {
        const t = g.table || []; if (!t.length) return null; const total = t.length; const hasZ = total >= 10;
        return (
          <div key={gi}>
            {g.group && <div style={{ padding: '8px 12px 4px', fontSize: '.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{g.group}</div>}
            {hasZ && <div className="mg8-zone-bar"><div className="mg8-zone-item" style={{ background: 'rgba(59,130,246,.1)', color: '#3b82f6' }}>UCL</div><div className="mg8-zone-item" style={{ background: 'rgba(249,115,22,.08)', color: '#f97316' }}>UEL</div><div className="mg8-zone-item" style={{ background: 'rgba(34,197,94,.06)', color: '#22c55e' }}>UECL</div><div className="mg8-zone-item" style={{ background: 'rgba(239,68,68,.06)', color: '#ef4444' }}>REL</div></div>}
            <div className="mg8-tbl-wrap">
              <table className="mg8-tbl">
                <thead><tr><th className="c">#</th><th>Team</th><th className="c">P</th><th className="c">W</th><th className="c">D</th><th className="c">L</th><th className="c">GD</th><th className="pts">Pts</th></tr></thead>
                <tbody>{t.map(r => { const gd = (r.goalsFor || 0) - (r.goalsAgainst || 0); return (<tr key={r.position} className={hasZ ? zoneCls(r.position, total) : ''}><td className="pos">{r.position}</td><td><div className="team-cell">{r.team?.crest && <img src={r.team.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}<span>{r.team?.shortName || r.team?.name || '—'}</span></div></td><td className="num-cell">{r.playedGames}</td><td className="num-cell">{r.won}</td><td className="num-cell">{r.draw}</td><td className="num-cell">{r.lost}</td><td className={`num-cell ${gd > 0 ? 'gd-pos' : gd < 0 ? 'gd-neg' : ''}`}>{gd > 0 ? '+' : ''}{gd}</td><td className="pts-cell">{r.points}</td></tr>); })}</tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   TEAMS GRID
   ═══════════════════════════════════════════════════════════════════════ */
function TeamsGrid({ teams }) {
  if (!teams?.length) return null;
  return (
    <div className="mg8-teams-grid">
      {teams.map(t => (
        <div key={t.id} className="mg8-team-card">
          {t.crest && <img src={t.crest} alt="" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />}
          <div className="name">{t.shortName || t.name}</div>
          {t.tla && <div className="tla">{t.tla}</div>}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
export default function MasterGames() {
  injectStyles();

  const { fixtures, liveMatches, competitions, loading, lastUpdated, getStandings, getTeams } = useFootballData();
  const { toasts, add: addToast, dismiss: dismissToast } = useToasts();
  const { favs, toggle: toggleFav, isFav } = useFavourites();
  const { isOn: isNotif, toggle: toggleNotif, globalEnabled, toggleGlobal } = useNotifications();

  /* ── State ── */
  const [tab, setTab] = useState('fixtures');
  const [compFilter, setCompFilter] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState(getDateStr(0));
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [moreDatesOpen, setMoreDatesOpen] = useState(false);
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(() => { try { return localStorage.getItem('mg8_notif_banner_dismissed') === 'true'; } catch { return false; } });

  // ★ KEY FIX: Rescue state — auto-switch when date has no fixtures
  const [rescued, setRescued] = useState(false);
  const rescueToastSent = useRef(false);

  const [scorePops, setScorePops] = useState(new Map());
  const [flashGoals, setFlashGoals] = useState(new Set());
  const [statusAnims, setStatusAnims] = useState(new Map());

  /* ── Refs ── */
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const prevCardData = useRef(new Map());
  const timeouts = useRef(new Map());
  const moreRef = useRef(null);

  useEffect(() => { Sound.on = soundOn; }, [soundOn]);
  const clearTO = (k) => { if (timeouts.current.has(k)) { clearTimeout(timeouts.current.get(k)); timeouts.current.delete(k); } };
  const setTO = (k, fn, ms) => { clearTO(k); timeouts.current.set(k, setTimeout(() => { fn(); timeouts.current.delete(k); }, ms)); };

  useEffect(() => {
    const handler = (e) => { if (moreRef.current && !moreRef.current.contains(e.target)) setMoreDatesOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Dates ── */
  const todayStr = getDateStr(0);
  const yesterdayStr = getDateStr(-1);
  const tomorrowStr = getDateStr(1);
  const otherDates = useMemo(() => {
    const arr = [];
    for (let i = -7; i <= 7; i++) {
      if (i >= -1 && i <= 1) continue;
      arr.push({ str: getDateStr(i), label: formatDateShort(getDateStr(i)) });
    }
    return arr;
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     ★ KEY FIX: Robust fixture filtering with AUTO-RESCUE
     ═══════════════════════════════════════════════════════════════ */
  const allFixtures = useMemo(() => {
    // Normalize fixtures — handle both API format and master format
    return (fixtures || []).map(m => {
      // If using master format with nested objects, normalize
      if (m.homeTeam && typeof m.homeTeam === 'object' && m.homeTeam.name) return m;
      // If using flat format (from some APIs), wrap in objects
      if (m.homeTeam && typeof m.homeTeam === 'string') {
        return {
          ...m,
          homeTeam: { name: m.homeTeam, shortName: m.homeShortName || m.homeTeam, crest: m.homeLogo || m.homeCrest },
          awayTeam: { name: m.awayTeam, shortName: m.awayShortName || m.awayTeam, crest: m.awayLogo || m.awayCrest },
          competition: m.competition || (m.league ? { name: m.league, emblem: m.leagueLogo } : null),
          score: m.score || { fullTime: { home: m.homeScore ?? m.goalsHome, away: m.awayScore ?? m.goalsAway } },
          utcDate: m.utcDate || m.date || (m.kickoff || ''),
        };
      }
      return m;
    }).filter(m => m.homeTeam && m.awayTeam);
  }, [fixtures]);

  // Date-specific fixtures
  const dateSpecificFixtures = useMemo(() => {
    return allFixtures.filter(m => extractMatchDate(m) === selectedDate);
  }, [allFixtures, selectedDate]);

  // ★ AUTO-RESCUE: If no fixtures for this date but master data exists, show everything
  const needsRescue = useMemo(() => {
    return dateSpecificFixtures.length === 0 && allFixtures.length > 0 && !loading;
  }, [dateSpecificFixtures.length, allFixtures.length, loading]);

  // Trigger rescue with toast (once per date change)
  useEffect(() => {
    if (needsRescue && !rescued) {
      setRescued(true);
      if (!rescueToastSent.current) {
        rescueToastSent.current = true;
        addToast({ type: 'rescue', msg: pick(CMT.rescue), detail: `Showing ${allFixtures.length} games from all dates`, dur: 4000 });
      }
    }
    if (!needsRescue) {
      setRescued(false);
      rescueToastSent.current = false;
    }
  }, [needsRescue, rescued, allFixtures.length, addToast]);

  // Reset rescue when date changes
  useEffect(() => {
    setRescued(false);
    rescueToastSent.current = false;
  }, [selectedDate]);

  // ★ The actual display list — rescued or date-filtered
  const displayFixtures = useMemo(() => {
    let list = rescued ? allFixtures : dateSpecificFixtures;
    if (compFilter !== 'ALL') list = list.filter(m => String(m.competition?.id || m.league?.id) === compFilter);
    if (searchQ.trim()) {
      const terms = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (terms.length) list = list.filter(m => matchQ(m, terms));
    }
    return list;
  }, [rescued, allFixtures, dateSpecificFixtures, compFilter, searchQ]);

  /* ── Grouped by competition ── */
  const grouped = useMemo(() => {
    const map = new Map();
    displayFixtures.forEach(m => {
      const key = m.competition?.name || m.league?.name || 'Other';
      if (!map.has(key)) map.set(key, { comp: m.competition || m.league, matches: [] });
      map.get(key).matches.push(m);
    });
    map.forEach(g => {
      g.matches.sort((a, b) => {
        const statusOrder = s => {
          const st = s.status || '';
          if (st === 'IN_PLAY' || st === 'PAUSED' || st === '1H' || st === '2H') return 0;
          if (st === 'HALF_TIME' || st === 'HT' || st === 'BT') return 1;
          if (st === 'SCHEDULED' || st === 'TIMED' || st === 'NS') return 2;
          return 3;
        };
        return statusOrder(a) - statusOrder(b);
      });
    });
    return [...map.values()];
  }, [displayFixtures]);

  /* ── Competitions for filter ── */
  const compList = useMemo(() => {
    const map = new Map();
    allFixtures.forEach(m => {
      const c = m.competition || m.league;
      if (c) map.set(String(c.id || c.name), c);
    });
    return [...map.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [allFixtures]);

  /* ── Live count ── */
  const liveCount = useMemo(() => displayFixtures.filter(m => {
    const s = m.status || '';
    return s === 'IN_PLAY' || s === 'PAUSED' || s === '1H' || s === '2H';
  }).length, [displayFixtures]);

  /* ── Favourites ── */
  const favMatches = useMemo(() => displayFixtures.filter(m => favs.has(m.id)), [displayFixtures, favs]);

  /* ── Load standings/teams ── */
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
     LIVE CHANGE DETECTION
     ═══════════════════════════════════════════════════════════════ */
  const isLiveStatus = (s) => s === 'IN_PLAY' || s === 'PAUSED' || s === '1H' || s === '2H' || s === 'ET';

  useEffect(() => {
    const live = liveMatches || [];

    live.forEach(m => {
      const id = String(m.id);
      const prev = prevScores.current.get(id);
      const h = m.score?.fullTime?.home, a = m.score?.fullTime?.away;
      if (prev) {
        if (h != null && prev.h != null && h > prev.h) {
          const team = m.homeTeam?.name || 'Home';
          const score = `${h}–${a}`;
          addToast({ type: 'goal', msg: pick(CMT.goal), detail: team, score, dur: 3500 });
          if (Sound.on) Sound.goal();
          setConfettiKey(k => k + 1);
          setFlashGoals(p => new Set([...p, id]));
          setScorePops(p => new Map([...p, [id, 'home']]));
          setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
          if (isNotif(id) && globalEnabled) sendBrowserNotif('⚽ GOAL!', `${team} scored! ${score}`, m.homeTeam?.crest);
        }
        if (a != null && prev.a != null && a > prev.a) {
          const team = m.awayTeam?.name || 'Away';
          const score = `${h}–${a}`;
          addToast({ type: 'goal', msg: pick(CMT.goal), detail: team, score, dur: 3500 });
          if (Sound.on) Sound.goal();
          setConfettiKey(k => k + 1);
          setFlashGoals(p => new Set([...p, id]));
          setScorePops(p => new Map([...p, [id, 'away']]));
          setTO(`pop-${id}`, () => setScorePops(p => { const n = new Map(p); n.delete(id); return n; }), 600);
          setTO(`flash-${id}`, () => setFlashGoals(p => { const n = new Set(p); n.delete(id); return n; }), 3000);
          if (isNotif(id) && globalEnabled) sendBrowserNotif('⚽ GOAL!', `${team} scored! ${score}`, m.awayTeam?.crest);
        }
      }
      prevScores.current.set(id, { h, a });
    });

    live.forEach(m => {
      const id = String(m.id);
      const prev = prevStatuses.current.get(id);
      const curr = m.status || '';
      if (prev && prev !== curr) {
        if (!isLiveStatus(prev) && isLiveStatus(curr)) {
          addToast({ type: 'status', st: 'live', msg: pick(CMT.kickoff), detail: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, dur: 3000 });
          if (Sound.on) Sound.kickoff();
          setStatusAnims(p => new Map([...p, [id, { type: 'live', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
          if (isNotif(id) && globalEnabled) sendBrowserNotif('⚡ Kick Off!', `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, m.competition?.emblem);
        }
        if (isLiveStatus(prev) && (curr === 'FINISHED' || curr === 'FT')) {
          const score = `${m.score?.fullTime?.home ?? 0}–${m.score?.fullTime?.away ?? 0}`;
          addToast({ type: 'status', st: 'ft', msg: pick(CMT.ft), detail: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, score, dur: 4000 });
          if (Sound.on) Sound.whistle('ft');
          setStatusAnims(p => new Map([...p, [id, { type: 'ft', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
          if (isNotif(id) && globalEnabled) sendBrowserNotif('🏁 Full Time', `${m.homeTeam?.name} ${score} ${m.awayTeam?.name}`, m.competition?.emblem);
        }
        if ((curr === 'HALF_TIME' || curr === 'HT') && prev !== 'HALF_TIME' && prev !== 'HT') {
          addToast({ type: 'status', st: 'ht', msg: pick(CMT.ht), detail: `${m.homeTeam?.name} vs ${m.awayTeam?.name}`, dur: 3000 });
          if (Sound.on) Sound.whistle('ht');
          setStatusAnims(p => new Map([...p, [id, { type: 'ht', t: Date.now() }]]));
          setTO(`sa-${id}`, () => setStatusAnims(p => { const n = new Map(p); n.delete(id); return n; }), 3500);
        }
      }
      prevStatuses.current.set(id, curr);
    });

    live.forEach(m => {
      const id = String(m.id);
      const cards = m.score?.cards || [];
      const prev = prevCardData.current.get(id) || [];
      if (prev.length > 0 && cards.length > prev.length) {
        cards.slice(prev.length).forEach(c => {
          if (c.type === 'RED_CARD') { addToast({ type: 'card', cardType: 'RED_CARD', msg: pick(CMT.redCard), detail: c.player?.name || '', dur: 3000 }); if (Sound.on) Sound.card(); }
          else if (c.type === 'YELLOW_CARD') { addToast({ type: 'card', cardType: 'YELLOW_CARD', msg: pick(CMT.card), detail: c.player?.name || '', dur: 2500 }); if (Sound.on) Sound.card(); }
        });
      }
      prevCardData.current.set(id, cards);
    });
  }, [liveMatches, addToast, isNotif, globalEnabled]);

  const handleGlobalNotif = useCallback(async () => {
    if (!globalEnabled) { const granted = await requestNotifPermission(); if (!granted) { addToast({ type: 'status', st: 'live', msg: 'Notifications blocked by browser.', dur: 3000 }); return; } }
    toggleGlobal();
  }, [globalEnabled, toggleGlobal, addToast]);

  const handleNotifToggle = useCallback(async (id) => {
    const willEnable = !isNotif(id);
    if (willEnable && !globalEnabled) { const granted = await requestNotifPermission(); if (!granted) { addToast({ type: 'status', st: 'live', msg: 'Enable notifications in browser settings first.', dur: 3000 }); return; } toggleGlobal(); }
    toggleNotif(id);
  }, [isNotif, toggleNotif, globalEnabled, toggleGlobal, addToast]);

  const dismissBanner = useCallback(() => {
    setNotifBannerDismissed(true);
    try { localStorage.setItem('mg8_notif_banner_dismissed', 'true'); } catch {}
  }, []);

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="mg8-page">
     <SEO
  title="Today's Football Fixtures & Match Schedule"
  description="Check today's football fixtures, upcoming matches, kick-off times, leagues and match details from around the world with ZOKASCORE."
  keywords="football fixtures today, soccer fixtures, football match schedule, upcoming football matches, live football scores, football leagues"
  path="/fixtures"
/>
      <Confetti active={confettiKey > 0} key={confettiKey} />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="mg8-wrap">
        <div className="mg8-header">
          <h1>Master Games</h1>
          <div className="sub">Live scores · Fixtures · Standings</div>
        </div>

        <div className="mg8-stats">
          <div style={{ textAlign: 'center' }}>
            <div className="mg8-stat-val live-c">{liveCount}</div>
            <div className="mg8-stat-label">Live</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="mg8-stat-val total-c">{displayFixtures.length}</div>
            <div className="mg8-stat-label">{rescued ? 'All Games' : 'Matches'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div className="mg8-stat-val">{favs.size}</div>
            <div className="mg8-stat-label">Favourites</div>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="mg8-datenav">
          <div className="mg8-more-wrap" ref={moreRef}>
            <button className="mg8-more-btn" onClick={() => setMoreDatesOpen(p => !p)}>
              <Calendar size={13} />
              <span>More</span>
              <ChevronDown size={12} style={{ transition: 'transform .2s', transform: moreDatesOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
            </button>
            {moreDatesOpen && (
              <div className="mg8-more-dropdown">
                {otherDates.map(d => (
                  <button key={d.str} className={`mg8-more-item ${selectedDate === d.str ? 'active' : ''}`} onClick={() => { setSelectedDate(d.str); setMoreDatesOpen(false); setExpanded(null); }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={`mg8-date-btn ${selectedDate === yesterdayStr ? 'active' : ''}`} onClick={() => { setSelectedDate(yesterdayStr); setExpanded(null); }}>Yesterday</button>
          <button className={`mg8-date-btn mg8-date-today ${selectedDate === todayStr ? 'active' : ''}`} onClick={() => { setSelectedDate(todayStr); setExpanded(null); }}>Today</button>
          <button className={`mg8-date-btn ${selectedDate === tomorrowStr ? 'active' : ''}`} onClick={() => { setSelectedDate(tomorrowStr); setExpanded(null); }}>Tomorrow</button>
        </div>

        {/* Tabs */}
        <div className="mg8-tabs">
          {['fixtures', 'favourites', 'standings', 'teams', 'competitions'].map(t => (
            <button key={t} className={`mg8-tab ${tab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>
              {t === 'fixtures' ? 'Fixtures' : t === 'favourites' ? 'Favourites' : t === 'standings' ? 'Standings' : t === 'teams' ? 'Teams' : 'Leagues'}
            </button>
          ))}
        </div>

        {/* ═══ Fixtures Tab ═══ */}
        {tab === 'fixtures' && <>
          {/* ★ Rescue Banner */}
          {rescued && (
            <div className="mg8-rescue">
              <div className="mg8-rescue-icon"><AlertTriangle size={15} /></div>
              <div className="mg8-rescue-text">
                <div className="mg8-rescue-title">No fixtures for this date</div>
                <div className="mg8-rescue-sub">Showing {allFixtures.length} games from all available dates</div>
              </div>
              <button className="mg8-rescue-dismiss" onClick={() => setRescued(false)}><X size={14} /></button>
            </div>
          )}

          {compList.length > 1 && (
            <div className="mg8-filters">
              <button className={`mg8-filter ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => setCompFilter('ALL')}>All</button>
              {compList.map(c => (
                <button key={c.id || c.name} className={`mg8-filter ${compFilter === String(c.id) ? 'active' : ''}`} onClick={() => setCompFilter(String(c.id))}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <div className="mg8-actions">
            <button className={`mg8-act ${searchOpen ? 'on' : ''}`} onClick={() => setSearchOpen(p => !p)}>
              {searchOpen ? <X size={13} /> : <Search size={13} />}
              Search
            </button>
            <button className={`mg8-act ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn(p => !p)}>
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              Sound
            </button>
            <button className={`mg8-act ${globalEnabled ? 'on' : ''}`} onClick={handleGlobalNotif}>
              {globalEnabled ? <Bell size={13} /> : <BellOff size={13} />}
              Alerts
            </button>
          </div>

          <div className={`mg8-search-wrap ${searchOpen ? 'open' : 'shut'}`}>
            <div className="mg8-search">
              <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input type="text" placeholder="Search teams or leagues..." value={searchQ} onChange={e => setSearchQ(e.target.value)} autoFocus={searchOpen} />
              {searchQ && <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }} onClick={() => setSearchQ('')}><X size={14} /></button>}
            </div>
          </div>

          {loading ? (
            <div>{[1,2,3,4,5].map(i => <div key={i} className="mg8-sk" style={{ animationDelay: i * 80 + 'ms' }} />)}</div>
          ) : displayFixtures.length === 0 ? (
            <div className="mg8-empty">
              <div className="mg8-empty-icon"><Calendar size={22} /></div>
              <p>No matches found</p>
              <div className="hint">{rescued ? 'Master data is still loading...' : 'Try a different date or filter'}</div>
            </div>
          ) : (
            <>
              {liveCount > 0 && (
                <div className="mg8-section">
                  <div className="mg8-live-hd">
                    <span className="mg8-live-dot" />
                    <span className="mg8-live-txt">Live Now</span>
                    <span className="mg8-live-cnt">{liveCount} match{liveCount > 1 ? 'es' : ''}</span>
                  </div>
                  {grouped.filter(g => g.matches.some(m => isLiveStatus(m.status))).map(g => (
                    <div key={g.comp?.id || g.comp?.name || 'live'}>
                      {g.matches.some(m => !isLiveStatus(m.status)) && (
                        <div className="mg8-league-hd">
                          {g.comp?.emblem && <img src={g.comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                          <span>{g.comp?.name || ''}</span>
                        </div>
                      )}
                      {g.matches.filter(m => isLiveStatus(m.status)).map((m, i) => (
                        <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav} onFav={toggleFav} isNotif={isNotif} onNotif={handleNotifToggle} />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {grouped.filter(g => g.matches.some(m => !isLiveStatus(m.status))).map(g => (
                <div key={g.comp?.id || g.comp?.name || g.comp?.name + '-rest'} className="mg8-section">
                  <div className="mg8-league-hd">
                    {g.comp?.emblem && <img src={g.comp.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                    <span>{g.comp?.name || ''}</span>
                    <span className="cnt">{g.matches.filter(m => !isLiveStatus(m.status)).length}</span>
                  </div>
                  {g.matches.filter(m => !isLiveStatus(m.status)).map((m, i) => (
                    <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav} onFav={toggleFav} isNotif={isNotif} onNotif={handleNotifToggle} />
                  ))}
                </div>
              ))}
            </>
          )}
        </>}

        {/* ═══ Favourites Tab ═══ */}
        {tab === 'favourites' && <>
          {favMatches.length === 0 ? (
            <div className="mg8-empty">
              <div className="mg8-empty-icon"><Star size={22} /></div>
              <p>No favourites yet</p>
              <div className="hint">Tap the star icon on any match to add it here</div>
            </div>
          ) : (
            <>
              {liveCount > 0 && (
                <div className="mg8-live-hd" style={{ marginBottom: 10 }}>
                  <span className="mg8-live-dot" />
                  <span className="mg8-live-txt">Live</span>
                  <span className="mg8-live-cnt">{favMatches.filter(m => isLiveStatus(m.status)).length}</span>
                </div>
              )}
              {favMatches.map((m, i) => (
                <MatchCard key={m.id} m={m} idx={i} expanded={expanded} onToggle={setExpanded} scorePops={scorePops} flashGoals={flashGoals} statusAnims={statusAnims} isFav={isFav} onFav={toggleFav} isNotif={isNotif} onNotif={handleNotifToggle} />
              ))}
            </>
          )}
        </>}

        {/* ═══ Standings Tab ═══ */}
        {tab === 'standings' && <>
          {standingsLoading ? (
            <div>{[1,2,3].map(i => <div key={i} className="mg8-sk" style={{ height: 200, animationDelay: i * 100 + 'ms' }} />)}</div>
          ) : !standingsData ? (
            <div className="mg8-empty">
              <div className="mg8-empty-icon"><Trophy size={22} /></div>
              <p>No standings data</p>
              <div className="hint">Select a competition to view standings</div>
            </div>
          ) : (
            <StandingsTable standings={standingsData} />
          )}
        </>}

        {/* ═══ Teams Tab ═══ */}
        {tab === 'teams' && <>
          {teamsLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8 }}>{[1,2,3,4,5,6].map(i => <div key={i} className="mg8-sk" style={{ height: 90, animationDelay: i * 60 + 'ms' }} />)}</div>
          ) : !teamsData?.length ? (
            <div className="mg8-empty">
              <div className="mg8-empty-icon"><Users size={22} /></div>
              <p>No teams data</p>
              <div className="hint">Select a competition to view teams</div>
            </div>
          ) : (
            <TeamsGrid teams={teamsData} />
          )}
        </>}

        {/* ═══ Competitions Tab ═══ */}
        {tab === 'competitions' && <>
          {(!competitions || competitions.length === 0) ? (
            <div className="mg8-empty">
              <div className="mg8-empty-icon"><Trophy size={22} /></div>
              <p>No competitions</p>
              <div className="hint">Competitions will appear once data loads</div>
            </div>
          ) : (
            <div className="mg8-comp-grid">
              {competitions.map(c => (
                <div key={c.id} className="mg8-comp-card" onClick={() => { setCompFilter(String(c.id)); setTab('fixtures'); }}>
                  {c.emblem && <img src={c.emblem} alt="" onError={e => { e.target.style.display = 'none'; }} />}
                  <div className="info">
                    <div className="cname">{c.name}</div>
                    {c.area?.name && <div className="carea">{c.area.name}</div>}
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
        </>}

        {lastUpdated && (
          <div style={{ textAlign: 'center', padding: '16px 0 0', fontSize: '.58rem', color: 'var(--text-muted)', opacity: .35 }}>
            Updated {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        )}
      </div>

      {!globalEnabled && !notifBannerDismissed && (
        <div className="mg8-notif-banner">
          <button className="mg8-notif-btn" onClick={handleGlobalNotif}>
            <Bell size={15} />
            Enable Live Notifications
          </button>
          <div style={{ marginTop: 6 }}>
            <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '.6rem', cursor: 'pointer', opacity: .5, fontFamily: 'inherit' }} onClick={dismissBanner}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}