// FILE: src/pages/Fixtures.jsx
//
// v6 — Unified Fixtures + Master Games • Football Hacking Aesthetic
//      Zero matches → Master view (standings, teams, comps, 14-day fixtures)
//      Matches found → Fixtures view + "Explore" scroll at top
//      Smooth crossfade + glitch transitions
//      All live features: goal detection, sounds, minute interpolation
//

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CalendarDays, RefreshCw, WifiOff, Search, X,
  Star, Volume2, VolumeX, Clock,
  Pause, Flag, Zap, ChevronRight, ChevronDown,
  Terminal, Radio, BarChart3, Users, Trophy,
  Monitor, Grid3X3, List, ArrowLeftRight, Eye,
  Shield, MapPin, ZapOff
} from 'lucide-react';
import {
  fetchFixtures,
  subscribeToLiveFixtures,
  getFavs, addFav, removeFav,
} from '../utils/api';
import { useFootballData } from '../context/FootballDataContext';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('fh-v6')) return;
  const s = document.createElement('style');
  s.id = 'fh-v6';
  s.textContent = `
    /* ── HACKING AESTHETIC BASE ── */
    @keyframes fhScanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
    @keyframes fhGlitch{0%,100%{transform:translate(0);filter:none}20%{transform:translate(-2px,1px);filter:hue-rotate(90deg)}40%{transform:translate(2px,-1px);filter:hue-rotate(-90deg)}60%{transform:translate(-1px,-1px)}80%{transform:translate(1px,1px)}}
    @keyframes fhCursorBlink{0%,100%{opacity:1}50%{opacity:0}}
    @keyframes fhNeonFlicker{0%,100%{opacity:1}92%{opacity:1}93%{opacity:.3}94%{opacity:1}96%{opacity:.5}97%{opacity:1}}
    @keyframes fhDataStream{0%{background-position:0 0}100%{background-position:0 -200px}}
    @keyframes fhGridScroll{0%{background-position:0 0}100%{background-position:40px 40px}}
    @keyframes fhFadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    @keyframes fhScaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
    @keyframes fhSlideRow{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
    @keyframes fhLivePulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(2)}}
    @keyframes fhLiveBorder{0%,100%{border-color:rgba(239,68,68,.15);box-shadow:0 0 6px rgba(239,68,68,.03)}50%{border-color:rgba(239,68,68,.4);box-shadow:0 0 18px rgba(239,68,68,.08)}}
    @keyframes fhHtBorder{0%,100%{border-color:rgba(249,115,22,.12);box-shadow:none}50%{border-color:rgba(249,115,22,.3);box-shadow:0 0 12px rgba(249,115,22,.04)}}
    @keyframes fhScorePop{0%{transform:scale(1)}30%{transform:scale(1.45)}60%{transform:scale(.95)}100%{transform:scale(1)}}
    @keyframes fhScoreGlow{0%,100%{text-shadow:0 0 6px rgba(239,68,68,.2)}50%{text-shadow:0 0 16px rgba(239,68,68,.5)}}
    @keyframes fhGoalFlash{0%{background:rgba(0,230,118,.2)}100%{background:transparent}}
    @keyframes fhKickGlow{0%{border-color:rgba(0,230,118,.5);box-shadow:0 0 28px rgba(0,230,118,.15)}100%{border-color:rgba(239,68,68,.15);box-shadow:0 0 6px rgba(239,68,68,.03)}}
    @keyframes fhKickBadge{0%{opacity:0;transform:scale(.5) translateY(4px)}10%{opacity:1;transform:scale(1.15) translateY(0)}75%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.8) translateY(-4px)}}
    @keyframes fhStatusOverlay{from{opacity:0;transform:scale(.85)}20%{opacity:1;transform:scale(1.05)}30%{opacity:1;transform:scale(1)}80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.9)}}
    @keyframes fhNotifBar{0%{transform:translateY(-100%);opacity:0}12%{transform:translateY(0);opacity:1}85%{transform:translateY(0);opacity:1}100%{transform:translateY(-100%);opacity:0}}
    @keyframes fhShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    @keyframes fhProgressPulse{0%,100%{opacity:.7}50%{opacity:1}}
    @keyframes fhFavPop{0%{transform:scale(1)}40%{transform:scale(1.4)}100%{transform:scale(1)}}
    @keyframes fhPanelOpen{from{opacity:0;max-height:0}to{opacity:1;max-height:600px}}
    @keyframes fhFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes fhJumpPulse{0%,100%{box-shadow:0 4px 16px rgba(239,68,68,.2)}50%{box-shadow:0 4px 28px rgba(239,68,68,.4)}}
    @keyframes fhFtSettle{0%{border-color:rgba(239,68,68,.4);background:linear-gradient(135deg,rgba(239,68,68,.05) 0%,var(--bg-card) 40%)}100%{border-color:rgba(0,230,118,.1);background:var(--bg-card)}}
    @keyframes fhCrossIn{from{opacity:0;transform:scale(.96) translateY(8px);filter:blur(6px)}to{opacity:1;transform:scale(1) translateY(0);filter:blur(0)}}
    @keyframes fhCrossOut{from{opacity:1;transform:scale(1) translateY(0);filter:blur(0)}to{opacity:0;transform:scale(.96) translateY(-8px);filter:blur(6px)}}
    @keyframes fhGlitchFrame{0%{clip-path:inset(40% 0 61% 0);transform:translate(-3px,0)}20%{clip-path:inset(92% 0 1% 0);transform:translate(3px,0)}40%{clip-path:inset(43% 0 1% 0);transform:translate(-1px,0)}60%{clip-path:inset(25% 0 58% 0);transform:translate(1px,0)}80%{clip-path:inset(54% 0 7% 0);transform:translate(-2px,0)}100%{clip-path:inset(58% 0 43% 0);transform:translate(0)}}
    @keyframes fhTyping{from{width:0}to{width:100%}}
    @keyframes fhBorderTrace{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
    @keyframes fhExploreShine{0%{transform:translateX(-100%)}100%{transform:translateX(200%)}}

    .fh-enter{animation:fhFadeUp .45s cubic-bezier(.22,1,.36,1) both}
    .fh-scale-in{animation:fhScaleIn .35s cubic-bezier(.22,1,.36,1) both}
    .fh-row{animation:fhSlideRow .3s cubic-bezier(.22,1,.36,1) both}
    .fh-cross-in{animation:fhCrossIn .4s cubic-bezier(.22,1,.36,1) both}
    .fh-cross-out{animation:fhCrossOut .25s cubic-bezier(.22,1,.36,1) both}
    .fh-glitch-frame{animation:fhGlitchFrame .3s steps(1) both;position:absolute;inset:0;background:rgba(0,230,118,.03);pointer-events:none;z-index:50}
    .fh-sk{background:linear-gradient(90deg,var(--bg-surface) 25%,var(--bg-card) 50%,var(--bg-surface) 75%);background-size:200% 100%;animation:fhShimmer 1.5s ease-in-out infinite;border-radius:8px}
    .fh-float{animation:fhFloat 3s ease-in-out infinite}
    .fh-btn{transition:all .2s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .fh-btn:hover{transform:translateY(-1px)}
    .fh-btn:active{transform:translateY(0) scale(.97)}
    .fh-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

    /* ── PAGE WRAPPER ── */
    .fh-page{min-height:100vh;background:var(--bg-deep);display:flex;flex-direction:column;align-items:center;position:relative;overflow:hidden}
    .fh-page::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,230,118,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(0,230,118,.015) 1px,transparent 1px);background-size:40px 40px;animation:fhGridScroll 20s linear infinite;pointer-events:none;z-index:0}
    .fh-scanline{position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.03) 2px,rgba(0,0,0,.03) 4px);pointer-events:none;z-index:999}
    .fh-scanline::after{content:'';position:fixed;left:0;right:0;height:4px;background:linear-gradient(180deg,transparent,rgba(0,230,118,.04),transparent);animation:fhScanline 4s linear infinite;pointer-events:none}
    .fh-container{width:100%;max-width:560px;padding:0 16px 100px;position:relative;z-index:1}

    /* ── TERMINAL HEADER ── */
    .fh-term-header{width:100%;padding:16px 0 8px;text-align:center}
    .fh-term-bar{display:inline-flex;align-items:center;gap:6px;padding:4px 12px 4px 8px;border-radius:6px 6px 0 0;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.06);border-bottom:none;font-size:.55rem;font-weight:700;color:var(--text-muted);letter-spacing:.04em;text-transform:uppercase}
    .fh-term-dot{width:6px;height:6px;border-radius:50%}
    .fh-term-dot.r{background:#ef4444}.fh-term-dot.y{background:#f59e0b}.fh-term-dot.g{background:#22c55e}
    .fh-term-body{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06);border-radius:0 0 10px 10px;padding:14px 16px 12px;text-align:left}
    .fh-term-line{font-family:var(--font-display,ui-monospace,monospace);font-size:.68rem;color:var(--text-muted);line-height:1.7}
    .fh-term-line .prompt{color:var(--accent);font-weight:700}
    .fh-term-line .cmd{color:var(--text-primary);font-weight:600}
    .fh-term-line .out{color:rgba(0,230,118,.7)}
    .fh-term-line .err{color:#ef4444}
    .fh-term-cursor{display:inline-block;width:7px;height:12px;background:var(--accent);animation:fhCursorBlink 1s step-end infinite;vertical-align:middle;margin-left:2px;border-radius:1px}
    .fh-term-title{margin:10px 0 2px;font-size:1.15rem;font-weight:900;color:var(--text-primary);letter-spacing:-.02em;animation:fhNeonFlicker 4s ease-in-out infinite;text-shadow:0 0 20px rgba(0,230,118,.15)}
    .fh-term-sub{font-size:.66rem;color:var(--text-muted);font-weight:500;font-family:var(--font-display,ui-monospace,monospace)}

    /* ── STATS BAR ── */
    .fh-stats{display:flex;justify-content:center;gap:16px;margin:14px 0 16px;flex-wrap:wrap}
    .fh-stat{text-align:center;padding:8px 14px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border);min-width:64px;transition:all .2s ease}
    .fh-stat:hover{border-color:rgba(0,230,118,.15);background:rgba(0,230,118,.03)}
    .fh-sv{font-size:1.1rem;font-weight:900;color:var(--text-primary);line-height:1.2;font-family:var(--font-display,ui-monospace,monospace)}
    .fh-sv.red{color:#ef4444;text-shadow:0 0 10px rgba(239,68,68,.3)}.fh-sv.grn{color:var(--accent);text-shadow:0 0 10px rgba(0,230,118,.2)}
    .fh-sl{font-size:.5rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em;margin-top:2px}

    /* ── VIEW TOGGLE ── */
    .fh-view-toggle{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:14px}
    .fh-vt-btn{display:inline-flex;align-items:center;gap:5px;padding:7px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.68rem;font-weight:700;cursor:pointer;transition:all .2s ease;font-family:inherit;letter-spacing:.02em;text-transform:uppercase}
    .fh-vt-btn:hover{color:var(--text-primary);border-color:rgba(255,255,255,.1);background:rgba(255,255,255,.03)}
    .fh-vt-btn.active{background:rgba(0,230,118,.08);color:var(--accent);border-color:rgba(0,230,118,.25);box-shadow:0 0 12px rgba(0,230,118,.06)}
    .fh-vt-sep{width:1px;height:20px;background:var(--border)}

    /* ── DATE TABS (3-day) ── */
    .fh-date-tabs{display:flex;gap:4px;width:100%;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:14px}
    .fh-date-tab{flex:1;padding:9px 6px;border:none;border-radius:9px;background:transparent;color:var(--text-muted);font-size:.76rem;font-weight:600;cursor:pointer;transition:all .2s ease;text-align:center;display:flex;flex-direction:column;align-items:center;gap:1px;font-family:inherit}
    .fh-date-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.03)}
    .fh-date-tab.active{background:var(--accent);color:var(--bg-deep);font-weight:800;box-shadow:0 2px 12px rgba(0,230,118,.25)}
    .fh-date-tab .day-label{font-size:.62rem;font-weight:500;opacity:.6}

    /* ── DATE STRIP (15-day) ── */
    .fh-date-strip{display:flex;gap:3px;overflow-x:auto;padding:4px 0 14px;scrollbar-width:none;-webkit-overflow-scrolling:touch;width:100%}
    .fh-date-strip::-webkit-scrollbar{display:none}
    .fh-ds-btn{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 10px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.68rem;font-weight:600;cursor:pointer;transition:all .18s ease;min-width:50px;font-family:inherit}
    .fh-ds-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.03)}
    .fh-ds-btn.active{background:var(--accent);color:var(--bg-deep);font-weight:800;border-color:var(--accent);box-shadow:0 2px 12px rgba(0,230,118,.25)}
    .fh-ds-btn .dn{font-size:.5rem;opacity:.55;font-weight:500}
    .fh-ds-btn.today-marker{position:relative}
    .fh-ds-btn.today-marker::after{content:'';position:absolute;bottom:3px;width:4px;height:4px;border-radius:50%;background:var(--accent)}

    /* ── ACTIONS ── */
    .fh-actions{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-bottom:14px;flex-wrap:wrap}
    .fh-action-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:8px 14px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.72rem;font-weight:600;cursor:pointer;transition:all .2s ease;font-family:inherit}
    .fh-action-btn:hover{background:rgba(255,255,255,.05);color:var(--text-primary);border-color:rgba(255,255,255,.1)}
    .fh-action-btn.active{background:rgba(0,230,118,.08);color:var(--accent);border-color:rgba(0,230,118,.2)}

    /* ── SEARCH ── */
    .fh-search-wrap{width:100%;overflow:hidden;transition:max-height .3s ease,opacity .25s ease,margin .3s ease}
    .fh-search-wrap.closed{max-height:0;opacity:0;margin-bottom:0}
    .fh-search-wrap.open{max-height:60px;opacity:1;margin-bottom:14px}
    .fh-search-bar{display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card)}
    .fh-search-bar input{flex:1;background:none;border:none;outline:none;color:var(--text-primary);font-size:.82rem;font-weight:500;font-family:inherit}
    .fh-search-bar input::placeholder{color:var(--text-muted);opacity:.5}

    /* ── COMPETITION FILTER ── */
    .fh-comp-bar{display:flex;gap:5px;overflow-x:auto;padding:3px 0 14px;scrollbar-width:none}
    .fh-comp-bar::-webkit-scrollbar{display:none}
    .fh-comp-pill{flex-shrink:0;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:9px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-muted);font-size:.7rem;font-weight:600;cursor:pointer;transition:all .18s ease;white-space:nowrap;font-family:inherit}
    .fh-comp-pill:hover{background:rgba(255,255,255,.04);color:var(--text-primary)}
    .fh-comp-pill.active{background:rgba(0,230,118,.08);color:var(--accent);border-color:rgba(0,230,118,.2)}
    .fh-comp-pill img{width:14px;height:14px;object-fit:contain;border-radius:2px}

    /* ── TABS ── */
    .fh-tabs{display:flex;gap:4px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:4px;margin-bottom:14px}
    .fh-tab{flex:1;padding:9px 6px;border:none;border-radius:9px;background:transparent;color:var(--text-muted);font-size:.73rem;font-weight:600;cursor:pointer;transition:all .18s ease;text-align:center;font-family:inherit}
    .fh-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.03)}
    .fh-tab.active{background:var(--accent);color:var(--bg-deep);font-weight:800;box-shadow:0 2px 12px rgba(0,230,118,.25)}

    /* ── EXPLORE SCROLL ── */
    .fh-explore{width:100%;margin-bottom:18px;overflow:hidden}
    .fh-explore-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;padding:0 2px}
    .fh-explore-title{font-size:.7rem;font-weight:800;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:flex;align-items:center;gap:6px}
    .fh-explore-title .pulse-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:fhLivePulse 2s ease-in-out infinite}
    .fh-explore-more{font-size:.62rem;font-weight:700;color:var(--accent);cursor:pointer;display:flex;align-items:center;gap:3px;transition:opacity .15s}
    .fh-explore-more:hover{opacity:.7}
    .fh-explore-scroll{display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none;-webkit-overflow-scrolling:touch;position:relative}
    .fh-explore-scroll::-webkit-scrollbar{display:none}
    .fh-explore-scroll::after{content:'';position:absolute;right:0;top:0;bottom:0;width:40px;background:linear-gradient(90deg,transparent,var(--bg-deep));pointer-events:none;z-index:2}
    .fh-explore-card{flex-shrink:0;width:200px;padding:10px 12px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border);cursor:pointer;transition:all .18s ease;position:relative;overflow:hidden}
    .fh-explore-card:hover{border-color:rgba(0,230,118,.2);transform:translateY(-1px)}
    .fh-explore-card::after{content:'';position:absolute;top:0;left:-100%;width:50%;height:100%;background:linear-gradient(90deg,transparent,rgba(0,230,118,.04),transparent);animation:fhExploreShine 3s ease-in-out infinite}
    .fh-explore-date{font-size:.5rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
    .fh-explore-teams{display:flex;align-items:center;gap:6px;margin-bottom:6px}
    .fh-explore-team{flex:1;display:flex;align-items:center;gap:4px;min-width:0}
    .fh-explore-team.away{flex-direction:row-reverse;text-align:right}
    .fh-explore-team img{width:16px;height:16px;object-fit:contain;flex-shrink:0;border-radius:3px}
    .fh-explore-team span{font-size:.68rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fh-explore-score{font-family:var(--font-display,ui-monospace,monospace);font-size:.85rem;font-weight:900;color:var(--text-muted);text-align:center;min-width:36px;flex-shrink:0}
    .fh-explore-score.live{color:#ef4444;animation:fhScoreGlow 2s ease-in-out infinite}
    .fh-explore-score.ft{color:var(--accent)}
    .fh-explore-league{display:flex;align-items:center;gap:4px;font-size:.52rem;color:var(--text-muted);opacity:.6}
    .fh-explore-league img{width:10px;height:10px;object-fit:contain}

    /* ── LIVE TICKER ── */
    .fh-ticker{display:flex;gap:8px;overflow-x:auto;padding:6px 0 10px;scrollbar-width:none;-webkit-overflow-scrolling:touch;width:100%}
    .fh-ticker::-webkit-scrollbar{display:none}
    .fh-ticker-item{flex-shrink:0;display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.12);font-size:.68rem;white-space:nowrap;cursor:pointer;transition:background .15s}
    .fh-ticker-item:hover{background:rgba(239,68,68,.1)}
    .fh-ticker-score{font-family:var(--font-display,ui-monospace,monospace);font-weight:800;color:#ef4444;font-variant-numeric:tabular-nums}

    /* ── LEAGUE SECTION ── */
    .fh-league{width:100%;margin-bottom:20px}
    .fh-league-header{display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:0 2px}
    .fh-league-header img{width:18px;height:18px;border-radius:4px;object-fit:contain;flex-shrink:0}
    .fh-league-header span{font-size:.78rem;font-weight:700;color:var(--text-muted)}
    .fh-league-header .count{margin-left:auto;font-size:.6rem;font-weight:600;color:var(--text-muted);opacity:.5}

    /* ── LIVE SECTION HEADER ── */
    .fh-live-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:0 2px}
    .fh-live-dot-lg{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:fhLivePulse 1.2s ease-in-out infinite;box-shadow:0 0 8px rgba(239,68,68,.5)}
    .fh-live-title{font-size:.82rem;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:.04em}
    .fh-live-count{font-size:.6rem;font-weight:700;color:#ef4444;opacity:.55}

    /* ── DATE HEADER ── */
    .fh-date-header{display:flex;align-items:center;gap:8px;margin:16px 0 8px;padding:0 2px}
    .fh-date-label{font-size:.78rem;font-weight:800;color:var(--text-primary);text-transform:uppercase;letter-spacing:.02em}
    .fh-date-label.today{color:var(--accent)}
    .fh-date-count{font-size:.58rem;font-weight:600;color:var(--text-muted);opacity:.45}
    .fh-date-line{flex:1;height:1px;background:var(--border)}

    /* ── MATCH CARD ── */
    .fh-card{position:relative;overflow:hidden;padding:14px 16px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px;margin-bottom:6px;cursor:pointer;transition:all .2s cubic-bezier(.22,1,.36,1)}
    .fh-card:hover{background:rgba(255,255,255,.02);transform:translateY(-1px)}
    .fh-card:active{transform:translateY(0) scale(.998)}
    .fh-card.expanded{border-radius:12px 12px 0 0;margin-bottom:0;border-color:rgba(0,230,118,.18)}
    .fh-card.is-live{border-color:rgba(239,68,68,.15);background:linear-gradient(135deg,rgba(239,68,68,.03) 0%,var(--bg-card) 40%);animation:fhLiveBorder 2.2s ease-in-out infinite}
    .fh-card.is-ht{border-color:rgba(249,115,22,.12);background:linear-gradient(135deg,rgba(249,115,22,.02) 0%,var(--bg-card) 40%);animation:fhHtBorder 2.5s ease-in-out infinite}
    .fh-card.is-ft{border-color:rgba(0,230,118,.1)}
    .fh-card.is-kickoff{animation:fhKickGlow 4s ease-out forwards}
    .fh-card.is-flash{animation:fhGoalFlash 2.5s ease-out both}
    .fh-card.is-ft-settle{animation:fhFtSettle 2s ease-out both}
    .fh-card.master-card{padding:12px 15px 14px}
    .fh-card.master-card.ft-card{opacity:.55}

    .fh-left-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:0 2px 2px 0;animation:fhScaleIn .4s cubic-bezier(.22,1,.36,1) both}

    .fh-status-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:12px}
    .fh-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:5px;font-size:.6rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase}
    .fh-badge-live{color:#ef4444;background:rgba(239,68,68,.1)}
    .fh-badge-ht{color:#f97316;background:rgba(249,115,22,.1)}
    .fh-badge-ft{color:var(--accent);background:rgba(0,230,118,.08)}
    .fh-badge-time{font-size:.7rem;font-weight:600;color:var(--text-muted);display:flex;align-items:center;gap:4px;font-family:var(--font-display,ui-monospace,monospace)}
    .fh-live-dot{width:5px;height:5px;border-radius:50%;background:#ef4444;animation:fhLivePulse 1.2s ease-in-out infinite;flex-shrink:0}
    .fh-ht-dot{width:5px;height:5px;border-radius:50%;background:#f97316;animation:fhProgressPulse 2s ease-in-out infinite;flex-shrink:0}
    .fh-minute{font-size:.7rem;font-weight:700;color:#ef4444;font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums}
    .fh-kickoff-badge{animation:fhKickBadge 4.5s ease-out forwards;pointer-events:none;font-size:.56rem;font-weight:800;color:#00e676;background:rgba(0,230,118,.12);padding:2px 7px;border-radius:4px;letter-spacing:.04em}

    .fh-teams{display:flex;align-items:center;justify-content:center;gap:6px}
    .fh-team-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0}
    .fh-team-col.home{align-items:flex-end}.fh-team-col.away{align-items:flex-start}
    .fh-team-info{display:flex;align-items:center;gap:6px;min-width:0}
    .fh-team-col.home .fh-team-info{flex-direction:row-reverse}
    .fh-team-logo{width:22px;height:22px;object-fit:contain;flex-shrink:0;border-radius:4px}
    .fh-team-name{font-size:.82rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2}
    .fh-team-col.home .fh-team-name{text-align:right}
    .fh-team-col.away .fh-team-name{text-align:left}

    .fh-score-center{width:72px;flex-shrink:0;text-align:center;display:flex;align-items:center;justify-content:center}
    .fh-score-pair{display:flex;align-items:center;gap:5px}
    .fh-score-num{font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums;font-size:1.1rem;font-weight:900;min-width:26px;text-align:center;line-height:1}
    .fh-score-num.live{color:#ef4444;animation:fhScoreGlow 2s ease-in-out infinite}
    .fh-score-num.ft{color:var(--accent)}
    .fh-score-num.pop{animation:fhScorePop .5s cubic-bezier(.22,1,.36,1) both}
    .fh-score-sep{color:var(--text-muted);font-size:.75rem;font-weight:700;opacity:.5}
    .fh-vs{font-size:.72rem;font-weight:900;color:var(--text-muted);opacity:.4;letter-spacing:.12em}

    .fh-fav{background:none;border:none;cursor:pointer;padding:3px;border-radius:6px;display:flex;align-items:center;justify-content:center;transition:all .15s;color:var(--text-muted);opacity:.2}
    .fh-fav:hover{background:rgba(245,197,66,.1);opacity:.6}
    .fh-fav.active{color:var(--gold);opacity:1}
    .fh-fav.pop{animation:fhFavPop .35s cubic-bezier(.22,1,.36,1) both}

    .fh-progress{height:2px;border-radius:1px;background:rgba(239,68,68,.06);margin-top:10px;overflow:hidden}
    .fh-progress-fill{height:100%;border-radius:1px;transition:width 1s linear;animation:fhProgressPulse 1.5s ease-in-out infinite}

    .fh-comp-row{display:flex;align-items:center;gap:5px;margin-top:9px;padding-top:7px;border-top:1px solid rgba(255,255,255,.03)}
    .fh-comp-row img{width:13px;height:13px;object-fit:contain;flex-shrink:0}
    .fh-comp-row span{font-size:.6rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

    /* ── EXPANDED PANEL ── */
    .fh-expanded{background:var(--bg-surface);border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px;overflow:hidden;animation:fhPanelOpen .3s ease-out both}
    .fh-score-row{display:flex;justify-content:space-between;align-items:center;padding:7px 18px;border-bottom:1px solid rgba(255,255,255,.035);font-size:.72rem}
    .fh-score-row:last-child{border-bottom:none}

    /* ── GOAL/CARD/REF ROWS ── */
    .fh-goal-row{display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid rgba(255,255,255,.025);font-size:.72rem}
    .fh-goal-row:last-child{border-bottom:none}
    .fh-goal-min{font-weight:800;color:var(--text-muted);font-variant-numeric:tabular-nums;min-width:28px;font-family:var(--font-display,ui-monospace,monospace)}
    .fh-goal-scorer{font-weight:600;color:var(--text-primary);flex:1}
    .fh-goal-assist{font-size:.62rem;color:var(--text-muted)}
    .fh-goal-team{font-size:.6rem;color:var(--text-muted);opacity:.6}
    .fh-card-row{display:flex;align-items:center;gap:6px;padding:5px 14px;border-bottom:1px solid rgba(255,255,255,.025);font-size:.7rem}
    .fh-card-row:last-child{border-bottom:none}
    .fh-card-player{flex:1;font-weight:600;color:var(--text-primary)}
    .fh-card-min{font-weight:700;color:var(--text-muted);font-variant-numeric:tabular-nums;font-family:var(--font-display,ui-monospace,monospace);min-width:28px;text-align:right}
    .fh-card-team{font-size:.58rem;color:var(--text-muted);opacity:.5}
    .fh-corner-row{display:flex;align-items:center;justify-content:space-around;padding:10px 14px;font-size:.75rem;font-weight:700}
    .fh-corner-team{display:flex;align-items:center;gap:6px}
    .fh-corner-team img{width:18px;height:18px;object-fit:contain;border-radius:3px}
    .fh-corner-num{font-family:var(--font-display,ui-monospace,monospace);font-variant-numeric:tabular-nums;font-size:1.1rem;font-weight:900}
    .fh-ref-row{display:flex;align-items:center;gap:8px;padding:5px 14px;font-size:.7rem}
    .fh-ref-row:last-child{border-bottom:none}
    .fh-ref-role{font-size:.58rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;min-width:56px;letter-spacing:.04em}
    .fh-ref-name{font-weight:600;color:var(--text-primary)}
    .fh-ref-nat{font-size:.6rem;color:var(--text-muted);margin-left:auto}
    .fh-exp-sec{padding:10px 14px 4px;font-size:.58rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
    .fh-no-data{padding:16px 14px;text-align:center;color:var(--text-muted);font-size:.74rem;font-style:italic;opacity:.6}

    /* ── OVERLAY ── */
    .fh-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border-radius:inherit;z-index:2;pointer-events:none}
    .fh-overlay-badge{padding:8px 24px;border-radius:10px;color:#fff;font-weight:800;font-size:.9rem;letter-spacing:.06em;display:flex;align-items:center;gap:8px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fhStatusOverlay 3.5s cubic-bezier(.22,1,.36,1) both}

    /* ── GOAL NOTIFICATION ── */
    .fh-goal-notif{position:fixed;top:0;left:0;right:0;z-index:300;padding:10px 20px;background:linear-gradient(135deg,rgba(239,68,68,.95),rgba(220,38,38,.92));color:#fff;text-align:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 30px rgba(239,68,68,.4);border-bottom:1px solid rgba(255,255,255,.15);animation:fhNotifBar 3.2s cubic-bezier(.22,1,.36,1) both;pointer-events:none;font-family:var(--font-display,ui-monospace,monospace);font-weight:700;letter-spacing:.02em}

    /* ── JUMP TO LIVE FAB ── */
    .fh-jump-btn{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:7px;padding:10px 22px;border-radius:28px;border:1.5px solid rgba(239,68,68,.3);background:rgba(239,68,68,.12);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#ef4444;font-size:.78rem;font-weight:700;cursor:pointer;animation:fhJumpPulse 2s ease-in-out infinite,fhFadeUp .3s ease-out both;transition:all .2s ease;font-family:inherit}
    .fh-jump-btn:hover{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.45);transform:translateX(-50%) translateY(-2px)}
    .fh-jump-btn:active{transform:translateX(-50%) translateY(0) scale(.97)}

    /* ── EMPTY STATE ── */
    .fh-empty{width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 20px;background:var(--bg-card);border:1px solid var(--border);border-radius:16px;text-align:center}
    .fh-empty-icon{width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);font-size:1.4rem}
    .fh-empty p{color:var(--text-muted);font-size:.8rem;margin:0}
    .fh-empty .hint{font-size:.66rem;color:var(--text-muted);opacity:.45;margin-top:3px}

    /* ── STANDINGS TABLE ── */
    .fh-tbl-w{background:var(--bg-card);border:1px solid var(--border);border-radius:13px;overflow:hidden}
    .fh-tbl{width:100%;border-collapse:collapse;font-size:.72rem}
    .fh-tbl thead{background:rgba(255,255,255,.03)}
    .fh-tbl th{padding:9px 8px;font-size:.56rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:1px solid var(--border)}
    .fh-tbl th.n{text-align:center;width:28px}.fh-tbl th.p{text-align:center;width:38px}
    .fh-tbl td{padding:8px;border-bottom:1px solid rgba(255,255,255,.025);vertical-align:middle}
    .fh-tbl tr:last-child td{border-bottom:none}
    .fh-tbl tr:hover{background:rgba(255,255,255,.02)}
    .fh-tbl .pos{font-weight:800;color:var(--text-muted);text-align:center;font-variant-numeric:tabular-nums}
    .fh-tbl .tc{display:flex;align-items:center;gap:7px;min-width:0}
    .fh-tbl .tc img{width:18px;height:18px;object-fit:contain;flex-shrink:0;border-radius:3px}
    .fh-tbl .tc span{font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.73rem}
    .fh-tbl .sc{text-align:center;font-variant-numeric:tabular-nums;font-weight:600;color:var(--text-muted);font-size:.7rem}
    .fh-tbl .pc{text-align:center;font-weight:900;color:var(--text-primary);font-size:.78rem}
    .fh-tbl .gdp{color:var(--accent)}.fh-tbl .gdn{color:#ef4444}
    .fh-tbl .zu{border-left:3px solid #3b82f6}.fh-tbl .ze{border-left:3px solid #f97316}.fh-tbl .zc{border-left:3px solid #22c55e}.fh-tbl .zr{border-left:3px solid #ef4444}
    .fh-zone-bar{display:flex;gap:0;margin-bottom:8px;padding:0 4px}
    .fh-zone-item{flex:1;padding:3px 6px;border-radius:3px 3px 0 0;font-size:.5rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;text-align:center}

    /* ── TEAMS GRID ── */
    .fh-tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:7px}
    .fh-tcard{background:var(--bg-card);border:1px solid var(--border);border-radius:11px;padding:14px 10px;text-align:center;transition:all .18s ease}
    .fh-tcard:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .fh-tcard img{width:36px;height:36px;object-fit:contain;margin:0 auto 6px;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,.3))}
    .fh-tcard .nm{font-size:.72rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fh-tcard .tl{font-size:.56rem;font-weight:600;color:var(--text-muted);margin-top:2px}
    .fh-tcard .vn{font-size:.54rem;color:var(--text-muted);opacity:.55;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

    /* ── COMPS GRID ── */
    .fh-cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px}
    .fh-cc{background:var(--bg-card);border:1px solid var(--border);border-radius:13px;padding:16px;display:flex;align-items:center;gap:12px;transition:all .18s ease;cursor:pointer}
    .fh-cc:hover{background:rgba(255,255,255,.03);transform:translateY(-1px)}
    .fh-cc img{width:32px;height:32px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 2px 6px rgba(0,0,0,.3))}
    .fh-cc .info{flex:1;min-width:0}
    .fh-cc .cn{font-size:.82rem;font-weight:700;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .fh-cc .badge{font-size:.55rem;font-weight:800;color:var(--accent);background:rgba(0,230,118,.08);padding:2px 7px;border-radius:4px;display:inline-block;margin-top:3px;letter-spacing:.04em}
    .fh-cc .area{font-size:.58rem;color:var(--text-muted);margin-top:2px}
    .fh-rg-title{font-size:.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 2px 6px;border-bottom:1px solid var(--border)}

    /* ── LOADING ── */
    .fh-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 0;gap:12px}
    .fh-loading-spinner{width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .fh-loading-text{font-family:var(--font-display,ui-monospace,monospace);font-size:.72rem;color:var(--text-muted);font-weight:600}

    /* ── VIEW TRANSITION WRAPPER ── */
    .fh-view-wrapper{position:relative;min-height:200px}
    .fh-view-panel{transition:opacity .35s ease,transform .35s ease,filter .35s ease}
    .fh-view-panel.entering{opacity:0;transform:scale(.97) translateY(8px);filter:blur(4px)}
    .fh-view-panel.active{opacity:1;transform:scale(1) translateY(0);filter:blur(0)}
    .fh-view-panel.leaving{opacity:0;transform:scale(.97) translateY(-8px);filter:blur(4px);pointer-events:none}

    /* ── RESPONSIVE ── */
    @media(min-width:480px){.fh-team-name{font-size:.88rem}.fh-score-num{font-size:1.2rem;min-width:30px}.fh-score-center{width:80px}.fh-tg{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
    @media(max-width:380px){.fh-team-name{font-size:.74rem}.fh-score-num{font-size:1rem}.fh-score-center{width:64px}.fh-team-logo{width:18px;height:18px}.fh-card{padding:12px 12px 14px}.fh-tg{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}.fh-cg{grid-template-columns:1fr}.fh-explore-card{width:170px}}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   SOUND
   ═══════════════════════════════════════════════════════════════ */
const Sound = {
  ctx: null,
  on: true,
  _init() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  },
  goal() {
    if (!this.on || !this._init()) return;
    try { navigator.vibrate?.([80, 40, 80, 40, 120]); } catch { /* */ }
    const t = this.ctx.currentTime;
    const w = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    w.type = 'sawtooth';
    w.frequency.setValueAtTime(180, t);
    w.frequency.exponentialRampToValueAtTime(600, t + 0.12);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    w.connect(g); g.connect(this.ctx.destination);
    w.start(t); w.stop(t + 0.2);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      const s = t + 0.14 + i * 0.085;
      gn.gain.setValueAtTime(0, s);
      gn.gain.linearRampToValueAtTime(0.15, s + 0.035);
      gn.gain.exponentialRampToValueAtTime(0.001, s + 0.55);
      o.connect(gn); gn.connect(this.ctx.destination);
      o.start(s); o.stop(s + 0.6);
    });
  },
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const DATES_3 = [YESTERDAY, TODAY, TOMORROW];
const LIVE_SET = new Set(['1H', '2H', 'ET', 'BT', 'P', '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT']);
const SCHED_SET = new Set(['NS', 'TBD', 'PST', 'CANC', 'SUSP', 'INT', 'POSTP']);
const HT_SET = new Set(['HT', 'BT']);
const FT_SET = new Set(['FT', 'AET', 'PEN', 'ABD']);
const HALF_MAX = { '1H': 45, '2H': 90, 'ET': 120, '1Q': 12, 'Q1': 12, '2Q': 24, 'Q2': 24, '3Q': 36, 'Q3': 36, '4Q': 48, 'Q4': 48, 'OT': 53 };

const dateLabel = (d) =>
  d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : d === TOMORROW ? 'Tomorrow'
  : new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const dateLabelMaster = (d) =>
  d === TODAY ? 'TODAY' : d === YESTERDAY ? 'YESTERDAY' : d === TOMORROW ? 'TOMORROW'
  : new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const safeNum = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const matchQ = (m, terms) => [m.homeTeam?.name, m.awayTeam?.name, m.league?.name].map(normalize).some((x) => terms.every((t) => x.includes(t)));
const getDateStr = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().split('T')[0]; };
const timeAgo = (ts) => { if (!ts) return ''; const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; };

function normalizeMasterMatch(m) {
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const isFinished = m.status === 'FINISHED';
  const sh = m.score?.fullTime;
  return {
    ...m,
    homeScore: sh?.home,
    awayScore: sh?.away,
    isLive,
    isFinished,
    minute: null,
    kickoff: m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
    timestamp: m.utcDate ? new Date(m.utcDate).getTime() : 0,
    homeLogo: m.homeTeam?.crest,
    awayLogo: m.awayTeam?.crest,
    league: m.competition ? { id: m.competition.id, name: m.competition.name, emblem: m.competition.emblem, code: m.competition.code } : null,
  };
}

function zoneCls(pos, total) {
  if (total <= 0) return '';
  const r = pos / total;
  if (r <= 0.25) return 'zu'; if (r <= 0.40) return 'ze'; if (r <= 0.50) return 'zc'; if (r >= 0.85) return 'zr';
  return '';
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */

/* ── Expanded Score Breakdown ── */
function ScoreBreakdown({ match }) {
  const s = match.score || {};
  const periods = [
    { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
    { l: 'Full Time', h: s.fullTime?.home, a: s.fullTime?.away },
    { l: 'Extra Time', h: s.extraTime?.home, a: s.extraTime?.away },
    { l: 'Penalties', h: s.penalties?.home, a: s.penalties?.away },
  ];
  const goals = s.goals || [];
  const cards = s.cards || [];
  const corners = s.corners;
  const refs = match.referees || [];
  const hasScore = periods.some((p) => p.h != null || p.a != null);
  const hasAny = hasScore || goals.length > 0 || cards.length > 0 || corners || refs.length > 0;

  return (
    <div>
      {hasScore && (
        <>
          <div className="fh-exp-sec">Score Breakdown</div>
          {periods.filter((p) => p.h != null || p.a != null).map((p) => (
            <div key={p.l} className="fh-score-row">
              <span style={{ width: 40, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'right' }}>{p.h ?? '-'}</span>
              <span style={{ flex: 1, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '.68rem' }}>{p.l}</span>
              <span style={{ width: 40, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'left' }}>{p.a ?? '-'}</span>
            </div>
          ))}
        </>
      )}
      {goals.length > 0 && (
        <>
          <div className="fh-exp-sec">Goals ({goals.length})</div>
          {goals.map((g, i) => (
            <div key={i} className="fh-goal-row">
              <span className="fh-goal-min">{g.minute != null ? g.minute + "'" : ''}</span>
              <span style={{ color: 'var(--accent)', fontSize: '.65rem' }}>⚽</span>
              <span className="fh-goal-scorer">{g.scorer?.name || 'Unknown'}</span>
              {g.assist?.name && <span className="fh-goal-assist">(assist: {g.assist.name})</span>}
              <span className="fh-goal-team">{g.team?.name || ''}</span>
            </div>
          ))}
        </>
      )}
      {cards.length > 0 && (
        <>
          <div className="fh-exp-sec">Cards ({cards.length})</div>
          {cards.map((c, i) => (
            <div key={i} className="fh-card-row">
              <span style={{ fontSize: '.7rem' }}>{c.type === 'YELLOW_CARD' ? '🟨' : c.type === 'RED_CARD' ? '🟥' : '⚪'}</span>
              <span className="fh-card-player">{c.player?.name || 'Unknown'}</span>
              <span className="fh-card-min">{c.minute != null ? c.minute + "'" : ''}</span>
              <span className="fh-card-team">{c.team?.name || ''}</span>
            </div>
          ))}
        </>
      )}
      {corners && (corners.home != null || corners.away != null) && (
        <>
          <div className="fh-exp-sec">Corners</div>
          <div className="fh-corner-row">
            <div className="fh-corner-team">
              {match.homeTeam?.crest && <img src={match.homeTeam.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
              <span className="fh-corner-num">{corners.home ?? 0}</span>
            </div>
            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontWeight: 700 }}>vs</span>
            <div className="fh-corner-team">
              <span className="fh-corner-num">{corners.away ?? 0}</span>
              {match.awayTeam?.crest && <img src={match.awayTeam.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
            </div>
          </div>
        </>
      )}
      {refs.length > 0 && (
        <>
          <div className="fh-exp-sec">Officials</div>
          {refs.map((r, i) => (
            <div key={i} className="fh-ref-row">
              <span className="fh-ref-role">{r.role || 'Referee'}</span>
              <span className="fh-ref-name">{r.name || '—'}</span>
              {r.nationality && <span className="fh-ref-nat">{r.nationality}</span>}
            </div>
          ))}
        </>
      )}
      {!hasAny && <div className="fh-no-data">Details appear once the match begins</div>}
    </div>
  );
}

/* ── Master-Style Match Card (for master mode & explore) ── */
function MasterCard({ m, idx, expanded, onToggle }) {
  const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
  const isFt = m.status === 'FINISHED';
  const sh = m.score?.fullTime;
  const time = m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const lc = isLive ? 'linear-gradient(180deg,#ef4444,#f97316)' : isFt ? 'var(--accent)' : 'transparent';
  const isExp = expanded === m.id;

  let cls = 'fh-card master-card fh-row';
  if (isLive) cls += ' is-live';
  else if (isFt) cls += ' is-ft master-card ft-card';
  if (isExp) cls += ' expanded';

  return (
    <div>
      <div className={cls} style={{ animationDelay: idx * 12 + 'ms', paddingLeft: (isLive || isFt) ? 16 : 15 }} onClick={() => onToggle(isExp ? null : m.id)}>
        {(isLive || isFt) && <div className="fh-left-bar" style={{ background: lc }} />}
        <div className="fh-status-row">
          {isLive && <span className="fh-badge fh-badge-live"><span className="fh-live-dot" /> LIVE</span>}
          {isFt && <span className="fh-badge fh-badge-ft">FT</span>}
          {!isLive && !isFt && <span className="fh-badge-time"><Clock size={10} /> {time}</span>}
        </div>
        <div className="fh-teams">
          <div className="fh-team-col home">
            <div className="fh-team-info">
              {m.homeTeam?.crest && <img className="fh-team-logo" src={m.homeTeam.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
              <span className="fh-team-name">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
            </div>
          </div>
          <div className="fh-score-center">
            {(isLive || isFt) ? (
              <div className="fh-score-pair">
                <span className={`fh-score-num ${isLive ? 'live' : ''} ${isFt ? 'ft' : ''}`}>{sh?.home ?? 0}</span>
                <span className="fh-score-sep">-</span>
                <span className={`fh-score-num ${isLive ? 'live' : ''} ${isFt ? 'ft' : ''}`}>{sh?.away ?? 0}</span>
              </div>
            ) : <span className="fh-vs">VS</span>}
          </div>
          <div className="fh-team-col away">
            <div className="fh-team-info">
              {m.awayTeam?.crest && <img className="fh-team-logo" src={m.awayTeam.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
              <span className="fh-team-name">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
            </div>
          </div>
        </div>
        <div className="fh-comp-row">
          {m.competition?.emblem && <img src={m.competition.emblem} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
          <span>{m.competition?.name || ''}</span>
        </div>
      </div>
      {isExp && (
        <div className="fh-expanded">
          <ScoreBreakdown match={m} />
        </div>
      )}
    </div>
  );
}

/* ── Standings Table ── */
function StandingsTable({ standings }) {
  if (!standings || standings.length === 0) return null;
  return (
    <div>
      {standings.map((g, gi) => {
        const t = g.table || [];
        if (t.length === 0) return null;
        const total = t.length;
        const hasZ = total >= 10;
        return (
          <div key={gi} style={{ marginBottom: 18 }}>
            {g.group && <div className="fh-exp-sec" style={{ padding: '10px 12px 4px' }}>{g.group}</div>}
            {hasZ && (
              <div className="fh-zone-bar">
                <div className="fh-zone-item" style={{ background: 'rgba(59,130,246,.12)', color: '#3b82f6' }}>UCL</div>
                <div className="fh-zone-item" style={{ background: 'rgba(249,115,22,.1)', color: '#f97316' }}>UEL</div>
                <div className="fh-zone-item" style={{ background: 'rgba(34,197,94,.08)', color: '#22c55e' }}>UECL</div>
                <div className="fh-zone-item" style={{ background: 'rgba(239,68,68,.08)', color: '#ef4444' }}>REL</div>
              </div>
            )}
            <div className="fh-tbl-w">
              <table className="fh-tbl">
                <thead><tr><th className="n">#</th><th>Team</th><th className="n">P</th><th className="n">W</th><th className="n">D</th><th className="n">L</th><th className="n">GD</th><th className="p">Pts</th></tr></thead>
                <tbody>
                  {t.map((r) => {
                    const gd = (r.goalsFor || 0) - (r.goalsAgainst || 0);
                    return (
                      <tr key={r.position} className={hasZ ? zoneCls(r.position, total) : ''}>
                        <td className="pos">{r.position}</td>
                        <td><div className="tc">{r.team?.crest && <img src={r.team.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}<span>{r.team?.shortName || r.team?.name || '—'}</span></div></td>
                        <td className="sc">{r.playedGames}</td><td className="sc">{r.won}</td><td className="sc">{r.draw}</td><td className="sc">{r.lost}</td>
                        <td className={`sc ${gd > 0 ? 'gdp' : gd < 0 ? 'gdn' : ''}`}>{gd > 0 ? '+' : ''}{gd}</td>
                        <td className="pc">{r.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Teams Grid ── */
function TeamsGrid({ teams }) {
  if (!teams || teams.length === 0) return null;
  return (
    <div className="fh-tg">
      {teams.map((t) => (
        <div key={t.id} className="fh-tcard">
          {t.crest && <img src={t.crest} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
          <div className="nm">{t.shortName || t.name}</div>
          {t.tla && <div className="tl">{t.tla}</div>}
          {t.venue && <div className="vn">{t.venue}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Competitions Grid ── */
function CompsGrid({ competitions, onSelect }) {
  if (!competitions || competitions.length === 0) return null;
  const regions = {};
  competitions.forEach((c) => {
    const r = c.area?.name || 'Other';
    if (!regions[r]) regions[r] = [];
    regions[r].push(c);
  });
  return (
    <div>
      {Object.entries(regions).sort((a, b) => {
        if (a[0] === 'Europe') return -1; if (b[0] === 'Europe') return 1;
        return a[0].localeCompare(b[0]);
      }).map(([region, comps]) => (
        <div key={region} style={{ marginBottom: 16 }}>
          <div className="fh-rg-title">{region} ({comps.length})</div>
          <div className="fh-cg">
            {comps.map((c) => (
              <div key={c.code || c.id} className="fh-cc" onClick={() => onSelect?.(c.code)}>
                {c.emblem && <img src={c.emblem} alt="" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />}
                <div className="info">
                  <div className="cn">{c.name}</div>
                  {c.code && <span className="badge">{c.code}</span>}
                  <div className="area">{c.type || ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Fixtures() {
  injectStyles();

  /* ── Data Sources ── */
  const master = useFootballData();

  /* ── View State ── */
  const [viewMode, setViewMode] = useState('auto'); // 'auto' | 'fixtures' | 'master'
  const [transitionState, setTransitionState] = useState('active'); // 'active' | 'leaving' | 'entering'
  const [glitchFrame, setGlitchFrame] = useState(false);

  /* ── Fixtures State ── */
  const [date, setDate] = useState(TODAY);
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [favFilter, setFavFilter] = useState(false);
  const [favs, setFavs] = useState(() => getFavs());
  const [flashGoals, setFlashGoals] = useState(new Set());
  const [kickOffs, setKickOffs] = useState(new Set());
  const [scorePops, setScorePops] = useState(new Map());
  const [goalNotif, setGoalNotif] = useState(null);
  const [statusAnims, setStatusAnims] = useState(new Map());
  const [showJump, setShowJump] = useState(false);
  const [favPopId, setFavPopId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

  /* ── Master State ── */
  const [masterTab, setMasterTab] = useState('fixtures');
  const [compFilter, setCompFilter] = useState('ALL');
  const [masterDate, setMasterDate] = useState(TODAY);
  const [masterExpanded, setMasterExpanded] = useState(null);
  const [standingsData, setStandingsData] = useState(null);
  const [teamsData, setTeamsData] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [teamsLoading, setTeamsLoading] = useState(false);

  /* ── Refs ── */
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const liveAnchor = useRef(null);
  const soundRef = useRef(true);
  const timeouts = useRef(new Map());
  const minuteUpdatedAt = useRef(new Map());

  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  const clearTO = (key) => { if (timeouts.current.has(key)) { clearTimeout(timeouts.current.get(key)); timeouts.current.delete(key); } };
  const setTO = (key, fn, ms) => { clearTO(key); timeouts.current.set(key, setTimeout(() => { fn(); timeouts.current.delete(key); }, ms)); };

  /* ═══════════════════════════════════════════════════════════
     VIEW MODE LOGIC
     ═══════════════════════════════════════════════════════════ */
  const effectiveView = useMemo(() => {
    if (viewMode !== 'auto') return viewMode;
    return fixtures.length > 0 ? 'fixtures' : 'master';
  }, [viewMode, fixtures.length]);

  const switchView = useCallback((target) => {
    if (target === effectiveView) return;
    setGlitchFrame(true);
    setTransitionState('leaving');
    setTO('glitch', () => setGlitchFrame(false), 300);
    setTO('switch', () => {
      setViewMode(target === effectiveView ? 'auto' : target);
      setTransitionState('entering');
      setTO('enter', () => setTransitionState('active'), 350);
    }, 250);
  }, [effectiveView]);

  /* ═══════════════════════════════════════════════════════════
     LIVE MINUTE INTERPOLATION
     ═══════════════════════════════════════════════════════════ */
  const getDisplayMinute = useCallback((m) => {
    void liveTick;
    if (!m.isLive) return m.minute || 0;
    if (m.minute == null || m.minute <= 0) return 0;
    if (m.status === 'HT' || m.status === 'BT') return m.minute;
    const updatedAt = minuteUpdatedAt.current.get(String(m.id));
    if (!updatedAt) return m.minute;
    const additionalMinutes = Math.floor((Date.now() - updatedAt) / 60000);
    let display = m.minute + additionalMinutes;
    const cap = HALF_MAX[m.status || ''];
    display = Math.min(display, cap || 90);
    if (display < m.minute) display = m.minute;
    return display;
  }, [liveTick]);

  useEffect(() => {
    if (date !== TODAY) return;
    const iv = setInterval(() => setLiveTick((t) => t + 1), 10000);
    return () => clearInterval(iv);
  }, [date]);

  /* ═══════════════════════════════════════════════════════════
     GOAL / KICKOFF / STATUS DETECTION
     ═══════════════════════════════════════════════════════════ */
  const detectGoals = useCallback((list) => {
    const newGoals = [];
    list.forEach((m) => {
      if (!m.isLive) return;
      const id = String(m.id);
      const prev = prevScores.current.get(id);
      const h = safeNum(m.homeScore), a = safeNum(m.awayScore);
      if (prev) {
        if (h != null && prev.h != null && h > prev.h) newGoals.push({ id, side: 'home', m });
        if (a != null && prev.a != null && a > prev.a) newGoals.push({ id, side: 'away', m });
      }
      prevScores.current.set(id, { h, a });
    });
    list.forEach((m) => { if (!m.isLive) prevScores.current.set(String(m.id), { h: safeNum(m.homeScore), a: safeNum(m.awayScore) }); });
    if (newGoals.length > 0) {
      newGoals.forEach((g) => {
        setFlashGoals((p) => new Set([...p, g.id]));
        setScorePops((p) => new Map([...p, [g.id, g.side]]));
        setTO(`pop-${g.id}`, () => setScorePops((p) => { const n = new Map(p); n.delete(g.id); return n; }), 600);
        setTO(`flash-${g.id}`, () => setFlashGoals((p) => { const n = new Set(p); n.delete(g.id); return n; }), 3000);
      });
      const first = newGoals[0];
      const team = first.side === 'home' ? first.m.homeTeam?.name : first.m.awayTeam?.name;
      setGoalNotif({ text: `⚽ ${team} scores! ${first.m.homeScore ?? '?'}-${first.m.awayScore ?? '?'}`, key: Date.now() });
      setTO('goal-notif', () => setGoalNotif(null), 3200);
      if (soundRef.current) Sound.goal();
    }
  }, []);

  const detectKickOffs = useCallback((live) => {
    const newKO = new Set();
    live.forEach((m) => {
      const id = String(m.id);
      const prev = prevStatuses.current.get(id);
      const curr = m.status || '';
      if (prev && SCHED_SET.has(prev) && LIVE_SET.has(curr)) newKO.add(id);
      prevStatuses.current.set(id, curr);
    });
    if (newKO.size > 0) {
      setKickOffs((p) => new Set([...p, ...newKO]));
      newKO.forEach((k) => { setTO(`ko-${k}`, () => { setKickOffs((p) => { const n = new Set(p); n.delete(k); return n; }); }, 5000); });
    }
  }, []);

  const detectStatusChanges = useCallback((old, cur) => {
    const oldMap = new Map(old.map((f) => [String(f.id), f.status || '']));
    cur.forEach((f) => {
      const id = String(f.id), ns = f.status || '', os = oldMap.get(id);
      if (os && os !== ns) {
        let type = null;
        if (LIVE_SET.has(os) && HT_SET.has(ns)) type = 'ht';
        else if ((LIVE_SET.has(os) || HT_SET.has(os)) && FT_SET.has(ns)) type = 'ft';
        else if (SCHED_SET.has(os) && LIVE_SET.has(ns)) type = 'live';
        if (type) {
          setStatusAnims((p) => new Map([...p, [id, { type, t: Date.now() }]]));
          setTO(`sa-${id}`, () => { setStatusAnims((p) => { const n = new Map(p); n.delete(id); return n; }); }, 3500);
        }
      }
    });
  }, []);

  /* ═══════════════════════════════════════════════════════════
     LOAD FIXTURES
     ═══════════════════════════════════════════════════════════ */
  const load = useCallback(async (d) => {
    setLoading(true); setError(null); setExpanded(null);
    setKickOffs(new Set()); setStatusAnims(new Map());
    minuteUpdatedAt.current.clear();
    try {
      const res = await fetchFixtures(d);
      const matches = res?.matches || [];
      if (matches.length > 0) {
        setFixtures(matches);
        detectGoals(matches);
        matches.forEach((m) => {
          prevStatuses.current.set(String(m.id), m.status || '');
          if (m.isLive && m.minute != null && m.minute > 0) minuteUpdatedAt.current.set(String(m.id), Date.now());
        });
        setError(null);
      } else {
        setError(res?.error || 'NO_DATA');
      }
    } catch { setError('NETWORK'); }
    setLoading(false);
  }, [detectGoals]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await load(date);
    setIsRefreshing(false);
  }, [load, date]);

  useEffect(() => {
    prevScores.current.clear(); prevStatuses.current.clear();
    load(date);
  }, [date, load]);

  /* ═══════════════════════════════════════════════════════════
     REAL-TIME SUBSCRIPTION
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (date !== TODAY) return;
    const unsub = subscribeToLiveFixtures(({ matches: live }) => {
      detectKickOffs(live);
      const liveMap = new Map(live.map((m) => [String(m.id), m]));
      setFixtures((prev) => {
        let changed = false;
        const updated = prev.map((f) => {
          const id = String(f.id), l = liveMap.get(id);
          if (l) {
            const newMinute = l.minute ?? f.minute;
            if (newMinute !== f.minute && newMinute != null && newMinute > 0) minuteUpdatedAt.current.set(id, Date.now());
            if (!f.isLive && newMinute != null && newMinute > 0) minuteUpdatedAt.current.set(id, Date.now());
            changed = true;
            return { ...f, homeScore: l.homeScore ?? f.homeScore, awayScore: l.awayScore ?? f.awayScore, isLive: true, isFinished: false, status: l.status || f.status, minute: newMinute, score: l.score || f.score, referee: l.referee || f.referee };
          } else if (f.isLive || HT_SET.has(f.status)) {
            changed = true;
            return { ...f, isLive: false, isFinished: true, status: 'FT', statusLong: 'Match Finished', minute: null };
          }
          return f;
        });
        if (changed) { detectStatusChanges(prev, updated); detectGoals(updated); }
        return updated;
      });
    });
    return () => unsub();
  }, [date, detectGoals, detectKickOffs, detectStatusChanges]);

  /* ═══════════════════════════════════════════════════════════
     SCROLL TRACKING
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const fn = () => { if (liveAnchor.current) setShowJump(liveAnchor.current.getBoundingClientRect().top < -100); else setShowJump(false); };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     PAGE TITLE
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const live = fixtures.filter((m) => m.isLive);
    const ft = fixtures.filter((m) => m.isFinished);
    if (live.length > 0) document.title = `${live[0].homeScore ?? '?'}-${live[0].awayScore ?? '?'} ${live[0].homeTeam?.name} vs ${live[0].awayTeam?.name} • LIVE • zokascore!`;
    else if (ft.length > 0 && date === TODAY) document.title = `FT: ${ft[0].homeTeam?.name} ${ft[0].homeScore ?? '?'}-${ft[0].awayScore ?? '?'} ${ft[0].awayTeam?.name} • zokascore!`;
    else document.title = `${dateLabel(date)}'s Matches • zokascore!`;
    return () => { document.title = 'zokascore!'; };
  }, [fixtures, date]);

  /* ═══════════════════════════════════════════════════════════
     MASTER DATA: STANDINGS & TEAMS
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (masterTab !== 'standings' || compFilter === 'ALL') { setStandingsData(null); return; }
    let c = false;
    setStandingsLoading(true);
    master.getStandings(compFilter).then((d) => { if (!c) { setStandingsData(d); setStandingsLoading(false); } }).catch(() => { if (!c) { setStandingsData(null); setStandingsLoading(false); } });
    return () => { c = true; };
  }, [masterTab, compFilter, master.getStandings]);

  useEffect(() => {
    if (masterTab !== 'teams' || compFilter === 'ALL') { setTeamsData(null); return; }
    let c = false;
    setTeamsLoading(true);
    master.getTeams(compFilter).then((d) => { if (!c) { setTeamsData(d); setTeamsLoading(false); } }).catch(() => { if (!c) { setTeamsData(null); setTeamsLoading(false); } });
    return () => { c = true; };
  }, [masterTab, compFilter, master.getTeams]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED: FIXTURES VIEW
     ═══════════════════════════════════════════════════════════ */
  const filtered = useMemo(() => {
    let list = fixtures;
    if (searchQ.trim()) { const t = searchQ.trim().toLowerCase().split(/\s+/).filter(Boolean); list = list.filter((m) => matchQ(m, t)); }
    if (favFilter) { const ids = new Set(favs.map((f) => String(f.id))); list = list.filter((m) => ids.has(String(m.homeTeam?.id)) || ids.has(String(m.awayTeam?.id))); }
    return list;
  }, [fixtures, searchQ, favFilter, favs]);

  const grouped = useMemo(() => {
    const map = new Map();
    const sorted = [...filtered].sort((a, b) => {
      if (a.isLive && !b.isLive) return -1; if (!a.isLive && b.isLive) return 1;
      if (a.status === 'HT' && b.status !== 'HT') return -1; if (a.status !== 'HT' && b.status === 'HT') return 1;
      if (a.isFinished && !b.isFinished) return 1; if (!a.isFinished && b.isFinished) return -1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
    sorted.forEach((m) => {
      const lid = m.league?.id ? String(m.league.id) : '_';
      if (!map.has(lid)) map.set(lid, { id: lid, name: m.league?.name || 'Other', logo: m.league?.emblem || m.league?.logo || null, matches: [] });
      map.get(lid).matches.push(m);
    });
    return [...map.values()].sort((a, b) => {
      const af = a.matches[0], bf = b.matches[0];
      if (af?.isLive && !bf?.isLive) return -1; if (!af?.isLive && bf?.isLive) return 1;
      return (af?.timestamp || 0) - (bf?.timestamp || 0);
    });
  }, [filtered]);

  const liveMatches = useMemo(() => fixtures.filter((m) => m.isLive), [fixtures]);
  const liveCount = liveMatches.length;
  const firstLiveId = liveMatches.length > 0 ? String(liveMatches[0].id) : null;

  /* ═══════════════════════════════════════════════════════════
     COMPUTED: MASTER VIEW
     ═══════════════════════════════════════════════════════════ */
  const masterDates = useMemo(() => {
    const arr = [];
    for (let i = -7; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      arr.push({ str: d.toISOString().split('T')[0], day: d.toLocaleDateString('en', { weekday: 'short' }), num: d.getDate(), isToday: i === 0 });
    }
    return arr;
  }, []);

  const masterDayMatches = useMemo(() => {
    return (master.fixtures || []).filter((m) => m.date === masterDate);
  }, [master.fixtures, masterDate]);

  const filteredMasterDay = useMemo(() => {
    if (compFilter === 'ALL') return masterDayMatches;
    return masterDayMatches.filter((m) => m.competition?.code === compFilter);
  }, [masterDayMatches, compFilter]);

  const filteredMasterLive = useMemo(() => {
    if (compFilter === 'ALL') return master.liveMatches || [];
    return (master.liveMatches || []).filter((m) => m.competition?.code === compFilter);
  }, [master.liveMatches, compFilter]);

  const compOptions = useMemo(() => (master.competitions || []).filter((c) => c.code), [master.competitions]);

  const handleCompSelect = useCallback((code) => setCompFilter((p) => p === code ? 'ALL' : code), []);
  const handleMasterToggle = useCallback((id) => setMasterExpanded((p) => p === id ? null : id), []);

  /* ── "No games today" detection for master ── */
  const noGamesMasterToday = masterDate === TODAY && masterDayMatches.length === 0;
  const nextDateWithMatches = useMemo(() => {
    if (!noGamesMasterToday) return null;
    for (const d of masterDates) {
      if (d.str <= TODAY) continue;
      if ((master.fixtures || []).some((f) => f.date === d.str)) return d.str;
    }
    return null;
  }, [noGamesMasterToday, masterDates, master.fixtures]);

  const upcomingMaster = useMemo(() => {
    if (!nextDateWithMatches) return [];
    return (master.fixtures || []).filter((f) => f.date === nextDateWithMatches);
  }, [nextDateWithMatches, master.fixtures]);

  /* ═══════════════════════════════════════════════════════════
     EXPLORE SCROLL DATA
     ═══════════════════════════════════════════════════════════ */
  const exploreMatches = useMemo(() => {
    const all = master.fixtures || [];
    const otherDates = all.filter((m) => m.date !== date && m.date >= YESTERDAY && m.date <= TOMORROW);
    const withScore = otherDates.filter((m) => m.status === 'FINISHED' || m.status === 'IN_PLAY' || m.status === 'PAUSED');
    const upcoming = otherDates.filter((m) => m.status !== 'FINISHED' && m.status !== 'IN_PLAY' && m.status !== 'PAUSED');
    return [...withScore.slice(0, 4), ...upcoming.slice(0, 6)].slice(0, 10);
  }, [master.fixtures, date]);

  /* ═══════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════ */
  const toggleFav = (e, tid, data) => {
    e.stopPropagation();
    const exists = favs.some((f) => String(f.id) === String(tid));
    if (exists) removeFav(tid); else addFav({ id: tid, ...data });
    setFavs(getFavs());
    setFavPopId(String(tid));
    setTO(`fp-${tid}`, () => setFavPopId(null), 400);
  };
  const isFav = (tid) => favs.some((f) => String(f.id) === String(tid));
  const jumpToLive = () => liveAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* ═══════════════════════════════════════════════════════════
     RENDER: FIXTURES MATCH CARD
     ═══════════════════════════════════════════════════════════ */
  const renderFixturesCard = (m, idx) => {
    const isLive = m.isLive;
    const isHT = m.status === 'HT';
    const isFT = m.isFinished;
    const isKO = kickOffs.has(String(m.id));
    const isFlash = flashGoals.has(String(m.id));
    const isExp = expanded === String(m.id);
    const isStatusAnim = statusAnims.get(String(m.id));
    const popSide = scorePops.get(String(m.id));
    const minute = getDisplayMinute(m);
    const progress = isLive ? Math.min(minute / 90, 1) : 0;
    const pColor = minute <= 45 ? '#ef4444' : '#f97316';
    const hFav = isFav(m.homeTeam?.id), aFav = isFav(m.awayTeam?.id);
    const isFirstLive = isLive && String(m.id) === firstLiveId;

    let cls = 'fh-card fh-row';
    if (isLive) cls += ' is-live'; else if (isHT) cls += ' is-ht'; else if (isFT) cls += ' is-ft';
    if (isKO) cls += ' is-kickoff'; if (isFlash) cls += ' is-flash';
    if (isStatusAnim?.type === 'ft') cls += ' is-ft-settle'; if (isExp) cls += ' expanded';

    const leftColor = isLive ? 'linear-gradient(180deg, #ef4444, #f97316)' : isHT ? '#f97316' : isFT ? 'var(--accent)' : 'transparent';

    return (
      <div key={m.id} ref={isFirstLive ? liveAnchor : null}>
        <div id={`fh-card-${m.id}`} className={cls} style={{ animationDelay: `${idx * 20}ms`, paddingLeft: (isLive || isHT || isFT) ? 17 : 16 }} onClick={() => setExpanded(isExp ? null : String(m.id))}>
          {(isLive || isHT || isFT) && <div className="fh-left-bar" style={{ background: leftColor }} />}
          <div className="fh-status-row">
            {isLive && <span className="fh-badge fh-badge-live"><span className="fh-live-dot" /> LIVE</span>}
            {isHT && <span className="fh-badge fh-badge-ht"><span className="fh-ht-dot" /> HT</span>}
            {isFT && <span className="fh-badge fh-badge-ft">FT</span>}
            {isKO && <span className="fh-kickoff-badge">KICK OFF</span>}
            {isLive && minute > 0 && <span className="fh-minute">{minute}&apos;</span>}
            {isHT && <span className="fh-minute" style={{ color: '#f97316' }}>45{minute > 45 ? `+${minute - 45}` : ''}&apos;</span>}
            {!isLive && !isHT && !isFT && m.kickoff && <span className="fh-badge-time"><Clock size={10} /> {m.kickoff}</span>}
          </div>
          <div className="fh-teams">
            <div className="fh-team-col home">
              <div className="fh-team-info">
                {m.homeLogo && <img className="fh-team-logo" src={m.homeLogo} alt="" loading="lazy" />}
                <span className="fh-team-name">{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
              </div>
              <button className={`fh-fav ${hFav ? 'active' : ''} ${favPopId === String(m.homeTeam?.id) ? 'pop' : ''}`} onClick={(e) => toggleFav(e, m.homeTeam?.id, { name: m.homeTeam?.name, logo: m.homeTeam?.logo })}>
                <Star size={11} fill={hFav ? 'var(--gold)' : 'none'} />
              </button>
            </div>
            <div className="fh-score-center">
              {(isLive || isHT || isFT) ? (
                <div className="fh-score-pair">
                  <span className={`fh-score-num ${isLive ? 'live' : ''} ${isFT ? 'ft' : ''} ${popSide === 'home' ? 'pop' : ''}`} key={`h-${m.id}-${m.homeScore}-${popSide}`}>{m.homeScore ?? 0}</span>
                  <span className="fh-score-sep">-</span>
                  <span className={`fh-score-num ${isLive ? 'live' : ''} ${isFT ? 'ft' : ''} ${popSide === 'away' ? 'pop' : ''}`} key={`a-${m.id}-${m.awayScore}-${popSide}`}>{m.awayScore ?? 0}</span>
                </div>
              ) : <span className="fh-vs">VS</span>}
            </div>
            <div className="fh-team-col away">
              <div className="fh-team-info">
                {m.awayLogo && <img className="fh-team-logo" src={m.awayLogo} alt="" loading="lazy" />}
                <span className="fh-team-name">{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
              </div>
              <button className={`fh-fav ${aFav ? 'active' : ''} ${favPopId === String(m.awayTeam?.id) ? 'pop' : ''}`} onClick={(e) => toggleFav(e, m.awayTeam?.id, { name: m.awayTeam?.name, logo: m.awayTeam?.logo })}>
                <Star size={11} fill={aFav ? 'var(--gold)' : 'none'} />
              </button>
            </div>
          </div>
          {isLive && minute > 0 && (
            <div className="fh-progress">
              <div className="fh-progress-fill" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${pColor}, ${pColor}88)` }} />
            </div>
          )}
          {isStatusAnim && (
            <div className="fh-overlay">
              <div className="fh-overlay-badge" style={{
                background: isStatusAnim.type === 'ht' ? 'rgba(249,115,22,.9)' : isStatusAnim.type === 'ft' ? 'rgba(0,230,118,.9)' : 'rgba(239,68,68,.9)',
                boxShadow: `0 4px 24px ${isStatusAnim.type === 'ht' ? 'rgba(249,115,22,.3)' : isStatusAnim.type === 'ft' ? 'rgba(0,230,118,.3)' : 'rgba(239,68,68,.3)'}`
              }}>
                {isStatusAnim.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
                {isStatusAnim.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
                {isStatusAnim.type === 'live' && <><Zap size={16} /> KICK OFF</>}
              </div>
            </div>
          )}
        </div>
        {isExp && <div className="fh-expanded"><ScoreBreakdown match={m} /></div>}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER: MASTER LEAGUE GROUP
     ═══════════════════════════════════════════════════════════ */
  const renderMasterLeagueGroup = (matches, keyPrefix) => {
    const gMap = new Map();
    matches.forEach((m) => {
      const lid = m.competition?.id ? String(m.competition.id) : '_';
      if (!gMap.has(lid)) gMap.set(lid, { id: lid, name: m.competition?.name || 'Other', emblem: m.competition?.emblem || null, matches: [] });
      gMap.get(lid).matches.push(m);
    });
    return [...gMap.values()].sort((a, b) => {
      const af = a.matches[0], bf = b.matches[0];
      if (af?.status === 'IN_PLAY' && bf?.status !== 'IN_PLAY') return -1;
      if (bf?.status === 'IN_PLAY' && af?.status !== 'IN_PLAY') return 1;
      if (af?.status === 'FINISHED' && bf?.status !== 'FINISHED') return 1;
      if (bf?.status === 'FINISHED' && af?.status !== 'FINISHED') return -1;
      return 0;
    }).map((league) => (
      <div key={`${keyPrefix}-${league.id}`} className="fh-league fh-enter">
        <div className="fh-league-header">
          {league.emblem && <img src={league.emblem} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
          <span>{league.name}</span>
          <span className="count">{league.matches.length}</span>
        </div>
        {league.matches.map((m, i) => <MasterCard key={m.id} m={m} idx={i} expanded={masterExpanded} onToggle={handleMasterToggle} />)}
      </div>
    ));
  };

  /* ═══════════════════════════════════════════════════════════
     MAIN RENDER
     ═══════════════════════════════════════════════════════════ */
  const totalMasterFixtures = master.fixtures?.length || 0;
  const totalMasterLive = master.liveMatches?.length || 0;

  return (
    <>
      <SEO title={`${dateLabel(date)}'s Matches • zokascore!`} description="Live football scores, fixtures, standings and more" />
      <div className="fh-page">
        <div className="fh-scanline" />

        <div className="fh-container">
          {/* ── TERMINAL HEADER ── */}
          <div className="fh-term-header">
            <div className="fh-term-bar">
              <span className="fh-term-dot r" /><span className="fh-term-dot y" /><span className="fh-term-dot g" />
              <span>zokascore@football:~</span>
            </div>
            <div className="fh-term-body">
              <div className="fh-term-line">
                <span className="prompt">$ </span>
                <span className="cmd">fetch --live --standings --all</span>
                <span className="fh-term-cursor" />
              </div>
              <div className="fh-term-line">
                <span className="out">{totalMasterLive > 0 ? `⚠ ${totalMasterLive} match${totalMasterLive !== 1 ? 'es' : ''} live` : `✓ ${totalMasterFixtures} fixtures indexed`} • {compOptions.length} leagues • {master.lastUpdated ? `synced ${timeAgo(master.lastUpdated)}` : 'free tier'}</span>
              </div>
            </div>
            <div className="fh-term-title">⚽ zokascore!</div>
            <div className="fh-term-sub">{effectiveView === 'fixtures' ? `${dateLabel(date)}'s Matches` : 'Master Control Panel'}</div>
          </div>

          {/* ── STATS BAR ── */}
          <div className="fh-stats">
            <div className="fh-stat"><div className={`fh-sv ${liveCount > 0 ? 'red' : ''}`}>{liveCount}</div><div className="fh-sl">Live</div></div>
            <div className="fh-stat"><div className="fh-sv">{fixtures.length}</div><div className="fh-sl">Today</div></div>
            <div className="fh-stat"><div className="fh-sv grn">{compOptions.length}</div><div className="fh-sl">Leagues</div></div>
            <div className="fh-stat"><div className="fh-sv">{totalMasterFixtures}</div><div className="fh-sl">Indexed</div></div>
          </div>

          {/* ── VIEW TOGGLE ── */}
          {fixtures.length > 0 && (
            <div className="fh-view-toggle">
              <button className={`fh-vt-btn ${effectiveView === 'fixtures' ? 'active' : ''}`} onClick={() => switchView('fixtures')}>
                <Radio size={12} /> Live Fixtures
              </button>
              <div className="fh-vt-sep" />
              <button className={`fh-vt-btn ${effectiveView === 'master' ? 'active' : ''}`} onClick={() => switchView('master')}>
                <Terminal size={12} /> Master Panel
              </button>
            </div>
          )}

          {/* ── GLITCH FRAME ── */}
          {glitchFrame && <div className="fh-glitch-frame" />}

          {/* ═══════════════════════════════════════════════════
              FIXTURES VIEW
              ═══════════════════════════════════════════════════ */}
          <div className={`fh-view-panel ${transitionState}`}>
            {effectiveView === 'fixtures' && (
              <>
                {/* Date Tabs */}
                <div className="fh-date-tabs">
                  {DATES_3.map((d) => (
                    <button key={d} className={`fh-date-tab ${date === d ? 'active' : ''}`} onClick={() => setDate(d)}>
                      <span className="day-label">{dateLabel(d).split(' ')[0]}</span>
                      <span>{dateLabel(d).split(' ').slice(1).join(' ') || d.slice(5)}</span>
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="fh-actions">
                  <button className={`fh-action-btn ${searchOpen ? 'active' : ''}`} onClick={() => setSearchOpen((p) => !p)}>
                    {searchOpen ? <X size={13} /> : <Search size={13} />} Search
                  </button>
                  <button className={`fh-action-btn ${favFilter ? 'active' : ''}`} onClick={() => setFavFilter((p) => !p)}>
                    <Star size={13} fill={favFilter ? 'var(--gold)' : 'none'} /> Favs
                  </button>
                  <button className={`fh-action-btn ${soundOn ? 'active' : ''}`} onClick={() => { setSoundOn((p) => !p); Sound.on = !soundOn; }}>
                    {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />} Sound
                  </button>
                  <button className="fh-action-btn" onClick={handleRefresh} disabled={isRefreshing} style={isRefreshing ? { opacity: 0.5 } : {}}>
                    <RefreshCw size={13} style={isRefreshing ? { animation: 'spin 1s linear infinite' } : {}} /> Refresh
                  </button>
                </div>

                {/* Search */}
                <div className={`fh-search-wrap ${searchOpen ? 'open' : 'closed'}`}>
                  <div className="fh-search-bar">
                    <Search size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                    <input placeholder="Search team or league..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} autoFocus={searchOpen} />
                    {searchQ && <X size={14} style={{ color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5 }} onClick={() => setSearchQ('')} />}
                  </div>
                </div>

                {/* Loading */}
                {loading && (
                  <div className="fh-loading">
                    <div className="fh-loading-spinner" />
                    <div className="fh-loading-text">Fetching match data...</div>
                    {Array.from({ length: 3 }).map((_, i) => <div key={i} className="fh-sk" style={{ width: '100%', height: 80, marginBottom: 8, animationDelay: i * 100 + 'ms' }} />)}
                  </div>
                )}

                {/* Error: Network */}
                {error === 'NETWORK' && !loading && (
                  <div className="fh-empty">
                    <div className="fh-empty-icon"><WifiOff size={24} style={{ color: '#ef4444' }} /></div>
                    <p>Connection lost</p>
                    <p className="hint">Check your internet connection and try again</p>
                    <button className="fh-action-btn" onClick={handleRefresh} style={{ marginTop: 8 }}><RefreshCw size={13} /> Retry</button>
                  </div>
                )}

                {/* Error: No Data → auto-switch handled by effectiveView */}
                {error === 'NO_DATA' && !loading && (
                  <div className="fh-empty" style={{ cursor: 'pointer' }} onClick={() => switchView('master')}>
                    <div className="fh-empty-icon"><CalendarDays size={24} style={{ color: 'var(--accent)' }} /></div>
                    <p>No matches on {dateLabel(date)}</p>
                    <p className="hint">Tap to explore {totalMasterFixtures} indexed games →</p>
                  </div>
                )}

                {/* Live Ticker */}
                {liveCount > 0 && !loading && (
                  <div className="fh-ticker">
                    {liveMatches.map((m) => (
                      <div key={m.id} className="fh-ticker-item" onClick={jumpToLive}>
                        <span style={{ fontWeight: 600 }}>{m.homeTeam?.shortName || m.homeTeam?.name}</span>
                        <span className="fh-ticker-score">{m.homeScore ?? 0}-{m.awayScore ?? 0}</span>
                        <span style={{ fontWeight: 600 }}>{m.awayTeam?.shortName || m.awayTeam?.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* EXPLORE SCROLL: Master games at top */}
                {exploreMatches.length > 0 && !loading && (
                  <div className="fh-explore fh-enter">
                    <div className="fh-explore-header">
                      <div className="fh-explore-title">
                        <span className="pulse-dot" />
                        Data Feed
                      </div>
                      <div className="fh-explore-more" onClick={() => switchView('master')}>
                        Explore All <ChevronRight size={11} />
                      </div>
                    </div>
                    <div className="fh-explore-scroll">
                      {exploreMatches.map((m) => {
                        const sh = m.score?.fullTime;
                        const isLive = m.status === 'IN_PLAY' || m.status === 'PAUSED';
                        const isFt = m.status === 'FINISHED';
                        const time = m.utcDate ? new Date(m.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        return (
                          <div key={m.id} className="fh-explore-card" onClick={() => { setMasterDate(m.date || TODAY); switchView('master'); }}>
                            <div className="fh-explore-date">{dateLabelMaster(m.date)} {time}</div>
                            <div className="fh-explore-teams">
                              <div className="fh-explore-team">
                                {m.homeTeam?.crest && <img src={m.homeTeam.crest} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
                                <span>{m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}</span>
                              </div>
                              <div className={`fh-explore-score ${isLive ? 'live' : ''} ${isFt ? 'ft' : ''}`}>
                                {(isLive || isFt) ? `${sh?.home ?? 0}-${sh?.away ?? 0}` : 'VS'}
                              </div>
                              <div className="fh-explore-team away">
                                {m.awayTeam?.crest && <img src={m.awayTeam.crest} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
                                <span>{m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}</span>
                              </div>
                            </div>
                            <div className="fh-explore-league">
                              {m.competition?.emblem && <img src={m.competition.emblem} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
                              {m.competition?.name || ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Match Cards */}
                {!loading && !error && grouped.map((league) => (
                  <div key={league.id} className="fh-league fh-enter">
                    <div className="fh-league-header">
                      {league.logo && <img src={league.logo} alt="" />}
                      <span>{league.name}</span>
                      <span className="count">{league.matches.length}</span>
                    </div>
                    {league.matches.map((m, i) => renderFixturesCard(m, i))}
                  </div>
                ))}

                {/* No filtered results */}
                {!loading && !error && filtered.length === 0 && fixtures.length > 0 && (
                  <div className="fh-empty">
                    <div className="fh-empty-icon"><Search size={24} style={{ color: 'var(--text-muted)' }} /></div>
                    <p>No matches match your filter</p>
                    <p className="hint">Try clearing search or favorites filter</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════
              MASTER VIEW
              ═══════════════════════════════════════════════════ */}
          <div className={`fh-view-panel ${effectiveView === 'master' ? (transitionState === 'active' ? 'active' : transitionState) : 'leaving'}`}>
            {effectiveView === 'master' && (
              <>
                {/* Master Loading */}
                {master.loading && (
                  <div className="fh-loading">
                    <div className="fh-loading-spinner" />
                    <div className="fh-loading-text">Indexing football data...</div>
                  </div>
                )}

                {!master.loading && !master.dbReady && (
                  <div className="fh-empty">
                    <div className="fh-empty-icon"><WifiOff size={24} style={{ color: '#ef4444' }} /></div>
                    <p>Data source not connected</p>
                    <p className="hint">Check Firebase configuration</p>
                  </div>
                )}

                {!master.loading && master.dbReady && (
                  <>
                    {/* Tabs */}
                    <div className="fh-tabs">
                      {[
                        { id: 'fixtures', label: 'Fixtures', icon: <List size={12} /> },
                        { id: 'standings', label: 'Standings', icon: <BarChart3 size={12} /> },
                        { id: 'teams', label: 'Teams', icon: <Users size={12} /> },
                        { id: 'competitions', label: 'Comps', icon: <Trophy size={12} />, count: compOptions.length },
                      ].map((t) => (
                        <button key={t.id} className={`fh-tab ${masterTab === t.id ? 'active' : ''}`} onClick={() => { setMasterTab(t.id); setMasterExpanded(null); }}>
                          {t.icon} {t.label}{t.count ? <span style={{ marginLeft: 3, fontSize: '.5rem', background: 'rgba(0,0,0,.15)', padding: '1px 5px', borderRadius: 4, fontWeight: 800 }}>{t.count}</span> : ''}
                        </button>
                      ))}
                    </div>
                    {/* Competition Filter (not on comps tab) */}
                    {masterTab !== 'competitions' && (
                      <div className="fh-comp-bar">
                        <button className={`fh-comp-pill ${compFilter === 'ALL' ? 'active' : ''}`} onClick={() => handleCompSelect('ALL')}>All</button>
                        {compOptions.map((c) => (
                          <button key={c.code} className={`fh-comp-pill ${compFilter === c.code ? 'active' : ''}`} onClick={() => handleCompSelect(c.code)}>
                            {c.emblem && <img src={c.emblem} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ══════ MASTER: FIXTURES TAB ══════ */}
                    {masterTab === 'fixtures' && (
                      <>
                        {/* Date Strip */}
                        <div className="fh-date-strip">
                          {masterDates.map((d) => (
                            <button
                              key={d.str}
                              className={`fh-ds-btn ${masterDate === d.str ? 'active' : ''} ${d.isToday ? 'today-marker' : ''}`}
                              onClick={() => { setMasterDate(d.str); setMasterExpanded(null); }}
                            >
                              <span className="dn">{d.day}</span>
                              <span style={{ fontWeight: d.isToday ? 800 : 600, fontSize: d.isToday ? '.82rem' : '.75rem' }}>{d.num}</span>
                            </button>
                          ))}
                        </div>

                        {/* Live Section */}
                        {filteredMasterLive.length > 0 && (
                          <div className="fh-enter">
                            <div className="fh-live-header">
                              <span className="fh-live-dot-lg" />
                              <span className="fh-live-title">LIVE NOW</span>
                              <span className="fh-live-count">({filteredMasterLive.length})</span>
                            </div>
                            {filteredMasterLive.map((m, i) => (
                              <MasterCard key={m.id} m={m} idx={i} expanded={masterExpanded} onToggle={handleMasterToggle} />
                            ))}
                          </div>
                        )}

                        {/* No Games Today */}
                        {noGamesMasterToday && (
                          <div className="fh-empty" style={{ marginBottom: 20 }}>
                            <div className="fh-empty-icon">😴</div>
                            <p>No games today</p>
                            {nextDateWithMatches && (
                              <p className="hint">Next available: {dateLabelMaster(nextDateWithMatches)} ({upcomingMaster.length} matches)</p>
                            )}
                          </div>
                        )}

                        {/* No Matches Found (filtered) */}
                        {!noGamesMasterToday && filteredMasterDay.length === 0 && (
                          <div className="fh-empty">
                            <div className="fh-empty-icon">⚽</div>
                            <p>No matches found{compFilter !== 'ALL' ? ` in ${compOptions.find((c) => c.code === compFilter)?.name || compFilter}` : ` on ${dateLabelMaster(masterDate)}`}</p>
                            <p className="hint">Try a different date or competition</p>
                          </div>
                        )}

                        {/* Grouped by League */}
                        {renderMasterLeagueGroup(filteredMasterDay, 'day')}

                        {/* Upcoming (when no games today) */}
                        {noGamesMasterToday && nextDateWithMatches && upcomingMaster.length > 0 && (
                          <>
                            <div className="fh-date-header">
                              <span className={`fh-date-label ${nextDateWithMatches === TODAY ? 'today' : ''}`}>{dateLabelMaster(nextDateWithMatches)}</span>
                              <span className="fh-date-count">{upcomingMaster.length} match{upcomingMaster.length !== 1 ? 'es' : ''}</span>
                              <div className="fh-date-line" />
                            </div>
                            {renderMasterLeagueGroup(upcomingMaster, 'upcoming')}
                          </>
                        )}

                        {/* If fixtures exist today, show "back to live" option */}
                        {fixtures.length > 0 && (
                          <div style={{ textAlign: 'center', padding: '20px 0 0' }}>
                            <button
                              className="fh-vt-btn"
                              style={{ display: 'inline-flex', padding: '10px 24px', fontSize: '.72rem' }}
                              onClick={() => switchView('fixtures')}
                            >
                              <Radio size={13} /> Back to Live Feed
                              {liveCount > 0 && <span style={{ marginLeft: 6, color: '#ef4444', fontWeight: 900 }}>({liveCount} live)</span>}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* ══════ MASTER: STANDINGS TAB ══════ */}
                    {masterTab === 'standings' && (
                      <>
                        {compFilter === 'ALL' ? (
                          <div className="fh-empty">
                            <div className="fh-empty-icon"><BarChart3 size={24} style={{ color: 'var(--text-muted)' }} /></div>
                            <p>Select a competition above to view standings</p>
                            <p className="hint">Available: PL, BL1, SA, PD, FL1, CL on free tier</p>
                          </div>
                        ) : standingsLoading ? (
                          <div className="fh-tbl-w" style={{ padding: '14px 10px' }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                              <div key={i} className="fh-sk" style={{ marginBottom: 6, height: 13, animationDelay: i * 70 + 'ms' }} />
                            ))}
                          </div>
                        ) : standingsData?.standings ? (
                          <div className="fh-enter">
                            {compOptions.find((c) => c.code === compFilter) && (
                              <div className="fh-league-header" style={{ marginBottom: 12 }}>
                                {compOptions.find((c) => c.code === compFilter).emblem && (
                                  <img src={compOptions.find((c) => c.code === compFilter).emblem} alt="" />
                                )}
                                <span>{compOptions.find((c) => c.code === compFilter).name} — Standings</span>
                              </div>
                            )}
                            <StandingsTable standings={standingsData.standings} />
                          </div>
                        ) : (
                          <div className="fh-empty">
                            <div className="fh-empty-icon"><BarChart3 size={24} style={{ color: 'var(--text-muted)' }} /></div>
                            <p>Standings not available for this competition</p>
                            <p className="hint">Requires a paid Football-Data.org plan for most leagues</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* ══════ MASTER: TEAMS TAB ══════ */}
                    {masterTab === 'teams' && (
                      <>
                        {compFilter === 'ALL' ? (
                          <div className="fh-empty">
                            <div className="fh-empty-icon"><Users size={24} style={{ color: 'var(--text-muted)' }} /></div>
                            <p>Select a competition above to view teams</p>
                            <p className="hint">Available: PL, BL1, SA, PD, FL1, CL on free tier</p>
                          </div>
                        ) : teamsLoading ? (
                          <div className="fh-tg" style={{ padding: '14px 10px' }}>
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} className="fh-tcard" style={{ padding: '18px 10px' }}>
                                <div className="fh-sk" style={{ width: 36, height: 36, borderRadius: '50%', margin: '0 auto 8px', animationDelay: i * 60 + 'ms' }} />
                                <div className="fh-sk" style={{ width: '65%', height: 11, margin: '0 auto 5px', animationDelay: i * 60 + 100 + 'ms' }} />
                                <div className="fh-sk" style={{ width: '40%', height: 9, margin: '0 auto', animationDelay: i * 60 + 200 + 'ms' }} />
                              </div>
                            ))}
                          </div>
                        ) : teamsData?.teams ? (
                          <div className="fh-enter">
                            {compOptions.find((c) => c.code === compFilter) && (
                              <div className="fh-league-header" style={{ marginBottom: 12 }}>
                                {compOptions.find((c) => c.code === compFilter).emblem && (
                                  <img src={compOptions.find((c) => c.code === compFilter).emblem} alt="" />
                                )}
                                <span>{compOptions.find((c) => c.code === compFilter).name} — {teamsData.teams.length} Teams</span>
                                <span className="count" style={{ marginLeft: 'auto' }}>{teamsData.teams.length}</span>
                              </div>
                            )}
                            <TeamsGrid teams={teamsData.teams} />
                          </div>
                        ) : (
                          <div className="fh-empty">
                            <div className="fh-empty-icon"><Users size={24} style={{ color: 'var(--text-muted)' }} /></div>
                            <p>Teams not available for this competition</p>
                            <p className="hint">Requires a paid Football-Data.org plan for most leagues</p>
                          </div>
                        )}
                      </>
                    )}

                    {/* ══════ MASTER: COMPETITIONS TAB ══════ */}
                    {masterTab === 'competitions' && (
                      <div className="fh-enter">
                        <div className="fh-league-header" style={{ marginBottom: 12 }}>
                          <span style={{ textTransform: 'none', fontSize: '.82rem', color: 'var(--text-primary)' }}>All Competitions</span>
                          <span className="count">{compOptions.length} available</span>
                        </div>
                        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginBottom: 14, padding: '0 2px', lineHeight: 1.6 }}>
                          Showing all competitions returned by the free tier. Standings and teams are available for: Premier League, Bundesliga, Serie A, La Liga, Ligue 1, Champions League.
                        </div>
                        <CompsGrid competitions={compOptions} onSelect={handleCompSelect} />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* ── JUMP TO LIVE FAB (fixtures view only) ── */}
          {effectiveView === 'fixtures' && showJump && liveCount > 0 && (
            <button className="fh-jump-btn" onClick={jumpToLive}>
              <Radio size={14} /> Jump to Live ({liveCount})
            </button>
          )}

          {/* ── GOAL NOTIFICATION ── */}
          {goalNotif && (
            <div className="fh-goal-notif" key={goalNotif.key}>
              <Zap size={16} />
              {goalNotif.text}
            </div>
          )}
        </div>
      </div>
    </>
  );
}