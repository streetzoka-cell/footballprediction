// FILE: src/pages/Fixtures.jsx
//
// v5 — Live minute interpolation + FT transition fix.
//

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  CalendarDays, RefreshCw, WifiOff, Search, X,
  Star, Volume2, VolumeX, Clock,
  Pause, Flag, Zap
} from 'lucide-react';
import {
  fetchFixtures,
  subscribeToLiveFixtures,
  getFavs, addFav, removeFav,
} from '../utils/api';
import SEO from '../components/SEO';

/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('fx-clean-v5')) return;
  const s = document.createElement('style');
  s.id = 'fx-clean-v5';
  s.textContent = `
    @keyframes fxFadeUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes fxScaleIn {
      from { opacity: 0; transform: scale(.92); }
      to   { opacity: 1; transform: scale(1); }
    }
    @keyframes fxSlideRow {
      from { opacity: 0; transform: translateX(-10px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes fxLivePulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: .2; transform: scale(2); }
    }
    @keyframes fxLiveBorder {
      0%, 100% { border-color: rgba(239,68,68,.15); box-shadow: 0 0 6px rgba(239,68,68,.03); }
      50%      { border-color: rgba(239,68,68,.4);  box-shadow: 0 0 18px rgba(239,68,68,.08); }
    }
    @keyframes fxHtBorder {
      0%, 100% { border-color: rgba(249,115,22,.12); box-shadow: none; }
      50%      { border-color: rgba(249,115,22,.3);  box-shadow: 0 0 12px rgba(249,115,22,.04); }
    }
    @keyframes fxScorePop {
      0%   { transform: scale(1); }
      30%  { transform: scale(1.45); }
      60%  { transform: scale(.95); }
      100% { transform: scale(1); }
    }
    @keyframes fxScoreGlow {
      0%, 100% { text-shadow: 0 0 6px rgba(239,68,68,.2); }
      50%      { text-shadow: 0 0 16px rgba(239,68,68,.5); }
    }
    @keyframes fxGoalFlash {
      0%   { background: rgba(0,230,118,.2); }
      100% { background: transparent; }
    }
    @keyframes fxKickGlow {
      0%   { border-color: rgba(0,230,118,.5); box-shadow: 0 0 28px rgba(0,230,118,.15); }
      100% { border-color: rgba(239,68,68,.15); box-shadow: 0 0 6px rgba(239,68,68,.03); }
    }
    @keyframes fxKickBadge {
      0%   { opacity: 0; transform: scale(.5) translateY(4px); }
      10%  { opacity: 1; transform: scale(1.15) translateY(0); }
      75%  { opacity: 1; transform: scale(1) translateY(0); }
      100% { opacity: 0; transform: scale(.8) translateY(-4px); }
    }
    @keyframes fxStatusOverlay {
      from { opacity: 0; transform: scale(.85); }
      20%  { opacity: 1; transform: scale(1.05); }
      30%  { opacity: 1; transform: scale(1); }
      80%  { opacity: 1; transform: scale(1); }
      100% { opacity: 0; transform: scale(.9); }
    }
    @keyframes fxNotifBar {
      0%   { transform: translateY(-100%); opacity: 0; }
      12%  { transform: translateY(0); opacity: 1; }
      85%  { transform: translateY(0); opacity: 1; }
      100% { transform: translateY(-100%); opacity: 0; }
    }
    @keyframes fxShimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes fxProgressPulse {
      0%, 100% { opacity: .7; }
      50%      { opacity: 1; }
    }
    @keyframes fxFavPop {
      0%   { transform: scale(1); }
      40%  { transform: scale(1.4); }
      100% { transform: scale(1); }
    }
    @keyframes fxPanelOpen {
      from { opacity: 0; max-height: 0; }
      to   { opacity: 1; max-height: 400px; }
    }
    @keyframes fxFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-5px); }
    }
    @keyframes fxJumpPulse {
      0%, 100% { box-shadow: 0 4px 16px rgba(239,68,68,.2); }
      50%      { box-shadow: 0 4px 28px rgba(239,68,68,.4); }
    }
    @keyframes fxFtSettle {
      0%   { border-color: rgba(239,68,68,.4); background: linear-gradient(135deg, rgba(239,68,68,.05) 0%, var(--bg-card) 40%); }
      100% { border-color: rgba(0,230,118,.1); background: var(--bg-card); }
    }

    .fx-enter     { animation: fxFadeUp .45s cubic-bezier(.22,1,.36,1) both; }
    .fx-scale-in  { animation: fxScaleIn .35s cubic-bezier(.22,1,.36,1) both; }
    .fx-row       { animation: fxSlideRow .3s cubic-bezier(.22,1,.36,1) both; }
    .fx-sk {
      background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-card) 50%, var(--bg-surface) 75%);
      background-size: 200% 100%;
      animation: fxShimmer 1.5s ease-in-out infinite;
      border-radius: 8px;
    }
    .fx-float     { animation: fxFloat 3s ease-in-out infinite; }
    .fx-btn {
      transition: all .2s cubic-bezier(.22,1,.36,1);
      cursor: pointer; outline: none;
    }
    .fx-btn:hover  { transform: translateY(-1px); }
    .fx-btn:active { transform: translateY(0) scale(.97); }
    .fx-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    .fx-page {
      min-height: 100vh;
      background: var(--bg-deep);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .fx-container {
      width: 100%;
      max-width: 520px;
      padding: 0 16px 100px;
    }

    .fx-header {
      width: 100%;
      text-align: center;
      padding: 20px 0 12px;
    }
    .fx-header h1 {
      margin: 0 0 2px;
      font-size: 1.2rem;
      font-weight: 900;
      color: var(--text-primary);
      letter-spacing: -.02em;
    }
    .fx-header .sub {
      font-size: .72rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .fx-date-tabs {
      display: flex;
      gap: 4px;
      width: 100%;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 14px;
    }
    .fx-date-tab {
      flex: 1;
      padding: 9px 6px;
      border: none;
      border-radius: 9px;
      background: transparent;
      color: var(--text-muted);
      font-size: .76rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s ease;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
    }
    .fx-date-tab:hover { color: var(--text-primary); background: rgba(255,255,255,.03); }
    .fx-date-tab.active {
      background: var(--accent);
      color: var(--bg-deep);
      font-weight: 800;
      box-shadow: 0 2px 12px rgba(0,230,118,.25);
    }
    .fx-date-tab .day-label { font-size: .62rem; font-weight: 500; opacity: .6; }

    .fx-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }
    .fx-action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 8px 14px;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: .72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s ease;
    }
    .fx-action-btn:hover {
      background: rgba(255,255,255,.05);
      color: var(--text-primary);
      border-color: rgba(255,255,255,.1);
    }
    .fx-action-btn.active {
      background: rgba(0,230,118,.08);
      color: var(--accent);
      border-color: rgba(0,230,118,.2);
    }

    .fx-search-wrap {
      width: 100%;
      overflow: hidden;
      transition: max-height .3s ease, opacity .25s ease, margin .3s ease;
    }
    .fx-search-wrap.closed {
      max-height: 0; opacity: 0; margin-bottom: 0;
    }
    .fx-search-wrap.open {
      max-height: 60px; opacity: 1; margin-bottom: 14px;
    }
    .fx-search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-card);
    }
    .fx-search-bar input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary);
      font-size: .82rem;
      font-weight: 500;
      font-family: inherit;
    }
    .fx-search-bar input::placeholder { color: var(--text-muted); opacity: .5; }

    .fx-ticker {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 6px 0 10px;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
      width: 100%;
    }
    .fx-ticker::-webkit-scrollbar { display: none; }
    .fx-ticker-item {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      background: rgba(239,68,68,.06);
      border: 1px solid rgba(239,68,68,.12);
      font-size: .68rem;
      white-space: nowrap;
      cursor: pointer;
      transition: background .15s;
    }
    .fx-ticker-item:hover { background: rgba(239,68,68,.1); }
    .fx-ticker-score {
      font-family: var(--font-display);
      font-weight: 800;
      color: #ef4444;
      font-variant-numeric: tabular-nums;
    }

    .fx-league {
      width: 100%;
      margin-bottom: 20px;
    }
    .fx-league-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    .fx-league-header img {
      width: 18px; height: 18px;
      border-radius: 4px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .fx-league-header span {
      font-size: .78rem;
      font-weight: 700;
      color: var(--text-muted);
    }
    .fx-league-header .count {
      margin-left: auto;
      font-size: .6rem;
      font-weight: 600;
      color: var(--text-muted);
      opacity: .5;
    }

    .fx-card {
      position: relative;
      overflow: hidden;
      padding: 14px 16px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 6px;
      cursor: pointer;
      transition: all .2s cubic-bezier(.22,1,.36,1);
    }
    .fx-card:hover {
      background: rgba(255,255,255,.02);
      transform: translateY(-1px);
    }
    .fx-card:active {
      transform: translateY(0) scale(.998);
    }
    .fx-card.expanded {
      border-radius: 12px 12px 0 0;
      margin-bottom: 0;
      border-color: rgba(0,230,118,.18);
    }
    .fx-card.is-live {
      border-color: rgba(239,68,68,.15);
      background: linear-gradient(135deg, rgba(239,68,68,.03) 0%, var(--bg-card) 40%);
      animation: fxLiveBorder 2.2s ease-in-out infinite;
    }
    .fx-card.is-ht {
      border-color: rgba(249,115,22,.12);
      background: linear-gradient(135deg, rgba(249,115,22,.02) 0%, var(--bg-card) 40%);
      animation: fxHtBorder 2.5s ease-in-out infinite;
    }
    .fx-card.is-ft {
      border-color: rgba(0,230,118,.1);
    }
    .fx-card.is-kickoff {
      animation: fxKickGlow 4s ease-out forwards;
    }
    .fx-card.is-flash {
      animation: fxGoalFlash 2.5s ease-out both;
    }
    .fx-card.is-ft-settle {
      animation: fxFtSettle 2s ease-out both;
    }

    .fx-left-bar {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      border-radius: 0 2px 2px 0;
      transform-origin: top center;
      animation: fxScaleIn .4s cubic-bezier(.22,1,.36,1) both;
    }

    .fx-status-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-bottom: 12px;
    }
    .fx-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 5px;
      font-size: .6rem;
      font-weight: 800;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .fx-badge-live {
      color: #ef4444;
      background: rgba(239,68,68,.1);
    }
    .fx-badge-ht {
      color: #f97316;
      background: rgba(249,115,22,.1);
    }
    .fx-badge-ft {
      color: var(--accent);
      background: rgba(0,230,118,.08);
    }
    .fx-badge-time {
      font-size: .7rem;
      font-weight: 600;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .fx-live-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #ef4444;
      animation: fxLivePulse 1.2s ease-in-out infinite;
      flex-shrink: 0;
    }
    .fx-ht-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: #f97316;
      animation: fxProgressPulse 2s ease-in-out infinite;
      flex-shrink: 0;
    }
    .fx-minute {
      font-size: .7rem;
      font-weight: 700;
      color: #ef4444;
      font-family: var(--font-display);
      font-variant-numeric: tabular-nums;
    }
    .fx-kickoff-badge {
      animation: fxKickBadge 4.5s ease-out forwards;
      pointer-events: none;
      font-size: .56rem;
      font-weight: 800;
      color: #00e676;
      background: rgba(0,230,118,.12);
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: .04em;
    }

    .fx-teams {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .fx-team-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .fx-team-col.home { align-items: flex-end; }
    .fx-team-col.away { align-items: flex-start; }
    .fx-team-info {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .fx-team-col.home .fx-team-info { flex-direction: row-reverse; }
    .fx-team-logo {
      width: 22px; height: 22px;
      object-fit: contain;
      flex-shrink: 0;
      border-radius: 4px;
    }
    .fx-team-name {
      font-size: .82rem;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.2;
    }
    .fx-team-col.home .fx-team-name { text-align: right; }
    .fx-team-col.away .fx-team-name { text-align: left; }

    .fx-score-center {
      width: 72px;
      flex-shrink: 0;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .fx-score-pair {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .fx-score-num {
      font-family: var(--font-display);
      font-variant-numeric: tabular-nums;
      font-size: 1.1rem;
      font-weight: 900;
      min-width: 26px;
      text-align: center;
      line-height: 1;
    }
    .fx-score-num.live {
      color: #ef4444;
      animation: fxScoreGlow 2s ease-in-out infinite;
    }
    .fx-score-num.ft {
      color: var(--accent);
    }
    .fx-score-num.pop { animation: fxScorePop .5s cubic-bezier(.22,1,.36,1) both; }
    .fx-score-sep {
      color: var(--text-muted);
      font-size: .75rem;
      font-weight: 700;
      opacity: .5;
    }
    .fx-vs {
      font-size: .72rem;
      font-weight: 900;
      color: var(--text-muted);
      opacity: .4;
      letter-spacing: .12em;
    }

    .fx-fav {
      background: none;
      border: none;
      cursor: pointer;
      padding: 3px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all .15s;
      color: var(--text-muted);
      opacity: .2;
    }
    .fx-fav:hover { background: rgba(245,197,66,.1); opacity: .6; }
    .fx-fav.active { color: var(--gold); opacity: 1; }
    .fx-fav.pop { animation: fxFavPop .35s cubic-bezier(.22,1,.36,1) both; }

    .fx-progress {
      height: 2px;
      border-radius: 1px;
      background: rgba(239,68,68,.06);
      margin-top: 10px;
      overflow: hidden;
    }
    .fx-progress-fill {
      height: 100%;
      border-radius: 1px;
      transition: width 1s linear;
      animation: fxProgressPulse 1.5s ease-in-out infinite;
    }

    .fx-expanded {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 12px 12px;
      overflow: hidden;
      animation: fxPanelOpen .3s ease-out both;
    }
    .fx-score-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 18px;
      border-bottom: 1px solid rgba(255,255,255,.035);
      font-size: .72rem;
    }
    .fx-score-row:last-child { border-bottom: none; }

    .fx-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.35);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
      border-radius: inherit;
      z-index: 2;
      pointer-events: none;
    }
    .fx-overlay-badge {
      padding: 8px 24px;
      border-radius: 10px;
      color: #fff;
      font-weight: 800;
      font-size: .9rem;
      letter-spacing: .06em;
      display: flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      animation: fxStatusOverlay 3.5s cubic-bezier(.22,1,.36,1) both;
    }

    .fx-goal-notif {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 300;
      padding: 10px 20px;
      background: linear-gradient(135deg, rgba(239,68,68,.95), rgba(220,38,38,.92));
      color: #fff;
      text-align: center;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-shadow: 0 4px 30px rgba(239,68,68,.4);
      border-bottom: 1px solid rgba(255,255,255,.15);
      animation: fxNotifBar 3.2s cubic-bezier(.22,1,.36,1) both;
      pointer-events: none;
    }

    .fx-jump-btn {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 90;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 10px 22px;
      border-radius: 28px;
      border: 1.5px solid rgba(239,68,68,.3);
      background: rgba(239,68,68,.12);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      color: #ef4444;
      font-size: .78rem;
      font-weight: 700;
      cursor: pointer;
      animation: fxJumpPulse 2s ease-in-out infinite, fxFadeUp .3s ease-out both;
      transition: all .2s ease;
    }
    .fx-jump-btn:hover {
      background: rgba(239,68,68,.18);
      border-color: rgba(239,68,68,.45);
      transform: translateX(-50%) translateY(-2px);
    }
    .fx-jump-btn:active {
      transform: translateX(-50%) translateY(0) scale(.97);
    }

    .fx-empty {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 40px 20px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      text-align: center;
    }
    .fx-empty-icon {
      width: 52px; height: 52px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (min-width: 480px) {
      .fx-team-name { font-size: .88rem; }
      .fx-score-num { font-size: 1.2rem; min-width: 30px; }
      .fx-score-center { width: 80px; }
    }
    @media (max-width: 380px) {
      .fx-team-name { font-size: .74rem; }
      .fx-score-num { font-size: 1rem; }
      .fx-score-center { width: 64px; }
      .fx-team-logo { width: 18px; height: 18px; }
      .fx-card { padding: 12px 12px 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
      }
    }
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
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch { /* no audio */ }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    return !!this.ctx;
  },
  goal() {
    if (!this.on || !this._init()) return;
    try {
      navigator.vibrate?.([80, 40, 80, 40, 120]);
    } catch { /* vibrate not supported */ }
    const t = this.ctx.currentTime;
    const w = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    w.type = 'sawtooth';
    w.frequency.setValueAtTime(180, t);
    w.frequency.exponentialRampToValueAtTime(600, t + 0.12);
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    w.connect(g);
    g.connect(this.ctx.destination);
    w.start(t);
    w.stop(t + 0.2);
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const s = t + 0.14 + i * 0.085;
      gn.gain.setValueAtTime(0, s);
      gn.gain.linearRampToValueAtTime(0.15, s + 0.035);
      gn.gain.exponentialRampToValueAtTime(0.001, s + 0.55);
      o.connect(gn);
      gn.connect(this.ctx.destination);
      o.start(s);
      o.stop(s + 0.6);
    });
  },
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & HELPERS
   ═══════════════════════════════════════════════════════════════ */
const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const TOMORROW = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const DATES = [YESTERDAY, TODAY, TOMORROW];
const LIVE_SET = new Set([
  '1H', '2H', 'ET', 'BT', 'P',
  '1Q', 'Q1', '2Q', 'Q2', '3Q', 'Q3', '4Q', 'Q4', 'OT',
]);
const SCHED_SET = new Set(['NS', 'TBD', 'PST', 'CANC', 'SUSP', 'INT', 'POSTP']);
const HT_SET = new Set(['HT', 'BT']);
const FT_SET = new Set(['FT', 'AET', 'PEN', 'ABD']);

const HALF_MAX = {
  '1H': 45, '2H': 90, 'ET': 120,
  '1Q': 12, 'Q1': 12, '2Q': 24, 'Q2': 24,
  '3Q': 36, 'Q3': 36, '4Q': 48, 'Q4': 48, 'OT': 53,
};

const dateLabel = (d) =>
  d === TODAY
    ? 'Today'
    : d === YESTERDAY
    ? 'Yesterday'
    : d === TOMORROW
    ? 'Tomorrow'
    : new Date(d + 'T12:00:00').toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });

const safeNum = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const matchQ = (m, terms) =>
  [m.homeTeam?.name, m.awayTeam?.name, m.league?.name]
    .map(normalize)
    .some((x) => terms.every((t) => x.includes(t)));

function getAutoStatus(m) {
  if (m.isFinished) return { status: 'FT', auto: false, showScore: true };
  if (m.isLive) return { status: 'LIVE', auto: false, showScore: true };
  if (m.status === 'HT') return { status: 'HT', auto: false, showScore: true };
  if (['PST', 'CANC', 'SUSP', 'ABD'].includes(m.status))
    return { status: m.status, auto: false, showScore: false };
  const ts = m.timestamp;
  if (ts) {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const now = Date.now();
    if (now >= ms + 110 * 60000)
      return { status: 'FT', auto: true, showScore: false };
    if (now >= ms) return { status: 'LIVE', auto: true, showScore: false };
  }
  return { status: m.status || 'NS', auto: false, showScore: false };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Fixtures() {
  injectStyles();

  /* ── State ── */
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

  // v5: tick counter forces re-render every 10s for live minute interpolation
  const [liveTick, setLiveTick] = useState(0);

  /* ── Refs ── */
  const prevScores = useRef(new Map());
  const prevStatuses = useRef(new Map());
  const liveAnchor = useRef(null);
  const soundRef = useRef(true);
  const timeouts = useRef(new Map());

  // v5: records when each live match's minute was last updated from backend
  const minuteUpdatedAt = useRef(new Map());

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const clearTO = (key) => {
    if (timeouts.current.has(key)) {
      clearTimeout(timeouts.current.get(key));
      timeouts.current.delete(key);
    }
  };

  const setTO = (key, fn, ms) => {
    clearTO(key);
    timeouts.current.set(
      key,
      setTimeout(() => {
        fn();
        timeouts.current.delete(key);
      }, ms)
    );
  };

  /* ═══════════════════════════════════════════════════════════
     v5: LIVE MINUTE INTERPOLATION
     ═══════════════════════════════════════════════════════════ */
  const getDisplayMinute = useCallback((m) => {
    void liveTick;

    if (!m.isLive) return m.minute || 0;
    if (m.minute == null || m.minute <= 0) return 0;

    const status = m.status || '';

    if (status === 'HT' || status === 'BT') return m.minute;

    const updatedAt = minuteUpdatedAt.current.get(String(m.id));
    if (!updatedAt) return m.minute;

    const additionalMinutes = Math.floor((Date.now() - updatedAt) / 60000);
    let display = m.minute + additionalMinutes;

    const cap = HALF_MAX[status];
    if (cap) {
      display = Math.min(display, cap);
    } else {
      display = Math.min(display, 90);
    }

    if (display < m.minute) display = m.minute;

    return display;
  }, [liveTick]);

  /* ═══════════════════════════════════════════════════════════
     v5: 10-SECOND TICK (only on Today tab)
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (date !== TODAY) return;
    const iv = setInterval(() => setLiveTick((t) => t + 1), 10000);
    return () => clearInterval(iv);
  }, [date]);

  /* ═══════════════════════════════════════════════════════════
     GOAL DETECTION
     ═══════════════════════════════════════════════════════════ */
  const detectGoals = useCallback((list) => {
    const newGoals = [];
    list.forEach((m) => {
      if (!m.isLive) return;
      const id = String(m.id);
      const prev = prevScores.current.get(id);
      const h = safeNum(m.homeScore);
      const a = safeNum(m.awayScore);
      if (prev) {
        if (h != null && prev.h != null && h > prev.h)
          newGoals.push({ id, side: 'home', m });
        if (a != null && prev.a != null && a > prev.a)
          newGoals.push({ id, side: 'away', m });
      }
      prevScores.current.set(id, { h, a });
    });
    list.forEach((m) => {
      if (!m.isLive)
        prevScores.current.set(String(m.id), {
          h: safeNum(m.homeScore),
          a: safeNum(m.awayScore),
        });
    });

    if (newGoals.length > 0) {
      newGoals.forEach((g) => {
        setFlashGoals((p) => new Set([...p, g.id]));
        setScorePops((p) => new Map([...p, [g.id, g.side]]));
        setTO(
          `pop-${g.id}`,
          () =>
            setScorePops((p) => {
              const n = new Map(p);
              n.delete(g.id);
              return n;
            }),
          600
        );
        setTO(
          `flash-${g.id}`,
          () =>
            setFlashGoals((p) => {
              const n = new Set(p);
              n.delete(g.id);
              return n;
            }),
          3000
        );
      });
      const first = newGoals[0];
      const team =
        first.side === 'home'
          ? first.m.homeTeam?.name
          : first.m.awayTeam?.name;
      setGoalNotif({
        text: `${team} scores! ${first.m.homeScore ?? '?'}-${first.m.awayScore ?? '?'}`,
        key: Date.now(),
      });
      setTO('goal-notif', () => setGoalNotif(null), 3200);
      if (soundRef.current) Sound.goal();
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════
     KICKOFF DETECTION
     ═══════════════════════════════════════════════════════════ */
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
      newKO.forEach((k) => {
        setTO(`ko-${k}`, () => {
          setKickOffs((p) => {
            const n = new Set(p);
            n.delete(k);
            return n;
          });
        }, 5000);
      });
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════
     STATUS CHANGE DETECTION
     ═══════════════════════════════════════════════════════════ */
  const detectStatusChanges = useCallback((old, cur) => {
    const oldMap = new Map(old.map((f) => [String(f.id), f.status || '']));
    cur.forEach((f) => {
      const id = String(f.id);
      const ns = f.status || '';
      const os = oldMap.get(id);
      if (os && os !== ns) {
        let type = null;
        if (LIVE_SET.has(os) && HT_SET.has(ns)) type = 'ht';
        else if ((LIVE_SET.has(os) || HT_SET.has(os)) && FT_SET.has(ns))
          type = 'ft';
        else if (SCHED_SET.has(os) && LIVE_SET.has(ns)) type = 'live';
        if (type) {
          setStatusAnims(
            (p) => new Map([...p, [id, { type, t: Date.now() }]])
          );
          setTO(`sa-${id}`, () => {
            setStatusAnims((p) => {
              const n = new Map(p);
              n.delete(id);
              return n;
            });
          }, 3500);
        }
      }
    });
  }, []);

  /* ═══════════════════════════════════════════════════════════
     LOAD
     ═══════════════════════════════════════════════════════════ */
  const load = useCallback(
    async (d) => {
      setLoading(true);
      setError(null);
      setExpanded(null);
      setKickOffs(new Set());
      setStatusAnims(new Map());
      minuteUpdatedAt.current.clear();
      try {
        const res = await fetchFixtures(d);
        const matches = res?.matches || [];
        if (matches.length > 0) {
          setFixtures(matches);
          detectGoals(matches);
          matches.forEach((m) => {
            prevStatuses.current.set(String(m.id), m.status || '');
            // v5: record timestamp for live matches so interpolation can begin
            if (m.isLive && m.minute != null && m.minute > 0) {
              minuteUpdatedAt.current.set(String(m.id), Date.now());
            }
          });
          setError(null);
        } else {
          setError(res?.error || 'NO_DATA');
        }
      } catch {
        setError('NETWORK');
      }
      setLoading(false);
    },
    [detectGoals]
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    await load(date);
    setIsRefreshing(false);
  }, [load, date]);

  useEffect(() => {
    prevScores.current.clear();
    prevStatuses.current.clear();
    load(date);
  }, [date, load]);

  /* ═══════════════════════════════════════════════════════════
     ★★★ REAL-TIME (FIXED v5) ★★★
     ═══════════════════════════════════════════════════════════
     FIX 1: Removed "if (!live.length) return" — that skipped
            the update when the LAST match ended (empty array).
     FIX 2: When a match was live but is no longer in the live
            feed, it's marked FT with its final score preserved.
     FIX 3: detectStatusChanges now fires because FIX 2 actually
            changes the status from "2H" to "FT" in the array.
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (date !== TODAY) return;

    const unsub = subscribeToLiveFixtures(({ matches: live }) => {
      // FIX 1: Do NOT skip empty arrays
      detectKickOffs(live);
      const liveMap = new Map(live.map((m) => [String(m.id), m]));

      setFixtures((prev) => {
        let changed = false;

        const updated = prev.map((f) => {
          const id = String(f.id);
          const l = liveMap.get(id);

          if (l) {
            // ── Match IS in live feed ──
            const newMinute = l.minute ?? f.minute;

            // Reset interpolation timestamp on new minute from backend
            if (newMinute !== f.minute && newMinute != null && newMinute > 0) {
              minuteUpdatedAt.current.set(id, Date.now());
            }
            // Start tracking when a match goes live for the first time
            if (!f.isLive && newMinute != null && newMinute > 0) {
              minuteUpdatedAt.current.set(id, Date.now());
            }

            changed = true;
            return {
              ...f,
              homeScore: l.homeScore ?? f.homeScore,
              awayScore: l.awayScore ?? f.awayScore,
              isLive: true,
              isFinished: false,
              status: l.status || f.status,
              minute: newMinute,
              score: l.score || f.score,
              referee: l.referee || f.referee,
            };

          } else if (f.isLive || HT_SET.has(f.status)) {
            // ── FIX 2: Match WAS live/HT but no longer in live feed ──
            // This means it ended (FT) — keep last known score
            changed = true;
            return {
              ...f,
              isLive: false,
              isFinished: true,
              status: 'FT',
              statusLong: 'Match Finished',
              minute: null,
            };

          } else {
            // Not live before, not live now — keep unchanged
            return f;
          }
        });

        // FIX 3: Only run detection if something actually changed
        if (changed) {
          detectStatusChanges(prev, updated);
          detectGoals(updated);
        }

        return updated;
      });
    });

    return () => unsub();
  }, [date, detectGoals, detectKickOffs, detectStatusChanges]);

  /* ═══════════════════════════════════════════════════════════
     SCROLL TRACKING
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const fn = () => {
      if (liveAnchor.current)
        setShowJump(
          liveAnchor.current.getBoundingClientRect().top < -100
        );
      else setShowJump(false);
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* ═══════════════════════════════════════════════════════════
     PAGE TITLE
     ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const live = fixtures.filter((m) => m.isLive);
    const ft = fixtures.filter((m) => m.isFinished);
    if (live.length > 0) {
      document.title = `${live[0].homeScore ?? '?'}-${live[0].awayScore ?? '?'} ${live[0].homeTeam?.name} vs ${live[0].awayTeam?.name} • LIVE • zokascore!`;
    } else if (ft.length > 0 && date === TODAY) {
      document.title = `FT: ${ft[0].homeTeam?.name} ${ft[0].homeScore ?? '?'}-${ft[0].awayScore ?? '?'} ${ft[0].awayTeam?.name} • zokascore!`;
    } else {
      document.title = `${dateLabel(date)}'s Matches • zokascore!`;
    }
    return () => {
      document.title = 'zokascore!';
    };
  }, [fixtures, date]);

  /* ═══════════════════════════════════════════════════════════
     COMPUTED
     ═══════════════════════════════════════════════════════════ */
  const filtered = useMemo(() => {
    let list = fixtures;
    if (searchQ.trim()) {
      const t = searchQ
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      list = list.filter((m) => matchQ(m, t));
    }
    if (favFilter) {
      const ids = new Set(favs.map((f) => String(f.id)));
      list = list.filter(
        (m) =>
          ids.has(String(m.homeTeam?.id)) ||
          ids.has(String(m.awayTeam?.id))
      );
    }
    return list;
  }, [fixtures, searchQ, favFilter, favs]);

  const grouped = useMemo(() => {
    const map = new Map();
    const sorted = [...filtered].sort((a, b) => {
      // Live matches first, then HT, then by time
      if (a.isLive && !b.isLive) return -1;
      if (!a.isLive && b.isLive) return 1;
      if (a.status === 'HT' && b.status !== 'HT') return -1;
      if (a.status !== 'HT' && b.status === 'HT') return 1;
      // FT matches sink to bottom
      if (a.isFinished && !b.isFinished) return 1;
      if (!a.isFinished && b.isFinished) return -1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });
    sorted.forEach((m) => {
      const lid = m.league?.id ? String(m.league.id) : '_';
      if (!map.has(lid)) {
        map.set(lid, {
          id: lid,
          name: m.league?.name || 'Other',
          logo: m.league?.emblem || m.league?.logo || null,
          matches: [],
        });
      }
      map.get(lid).matches.push(m);
    });
    return [...map.values()].sort((a, b) => {
      const af = a.matches[0];
      const bf = b.matches[0];
      if (af?.isLive && !bf?.isLive) return -1;
      if (!af?.isLive && bf?.isLive) return 1;
      if (af?.status === 'HT' && bf?.status !== 'HT') return -1;
      if (af?.status !== 'HT' && bf?.status === 'HT') return 1;
      return (af?.timestamp || 0) - (bf?.timestamp || 0);
    });
  }, [filtered]);

  const liveMatches = useMemo(
    () => fixtures.filter((m) => m.isLive),
    [fixtures]
  );
  const liveCount = liveMatches.length;
  const firstLiveId =
    liveMatches.length > 0 ? String(liveMatches[0].id) : null;

  /* ═══════════════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════════════ */
  const toggleFav = (e, tid, data) => {
    e.stopPropagation();
    const exists = favs.some((f) => String(f.id) === String(tid));
    if (exists) removeFav(tid);
    else addFav({ id: tid, ...data });
    setFavs(getFavs());
    setFavPopId(String(tid));
    setTO(`fp-${tid}`, () => setFavPopId(null), 400);
  };

  const isFav = (tid) => favs.some((f) => String(f.id) === String(tid));

  const jumpToLive = () =>
    liveAnchor.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

  /* ═══════════════════════════════════════════════════════════
     RENDER: Match Card
     ═══════════════════════════════════════════════════════════ */
  const renderCard = (m, idx) => {
    const auto = getAutoStatus(m);
    const isLive = m.isLive || auto.status === 'LIVE';
    const isHT = m.status === 'HT';
    const isFT = m.isFinished || auto.status === 'FT';
    const isKO = kickOffs.has(String(m.id));
    const isFlash = flashGoals.has(String(m.id));
    const isExp = expanded === String(m.id);
    const isStatusAnim = statusAnims.get(String(m.id));
    const popSide = scorePops.get(String(m.id));

    // v5: use interpolated minute
    const minute = getDisplayMinute(m);

    const progress = isLive ? Math.min(minute / 90, 1) : 0;
    const pColor = minute <= 45 ? '#ef4444' : '#f97316';
    const hFav = isFav(m.homeTeam?.id);
    const aFav = isFav(m.awayTeam?.id);
    const isFirstLive = isLive && String(m.id) === firstLiveId;

    let cls = 'fx-card fx-row';
    if (isLive) cls += ' is-live';
    else if (isHT) cls += ' is-ht';
    else if (isFT) cls += ' is-ft';
    if (isKO) cls += ' is-kickoff';
    if (isFlash) cls += ' is-flash';
    if (isStatusAnim?.type === 'ft') cls += ' is-ft-settle';
    if (isExp) cls += ' expanded';

    const leftColor = isLive
      ? 'linear-gradient(180deg, #ef4444, #f97316)'
      : isHT
      ? '#f97316'
      : isFT
      ? 'var(--accent)'
      : 'transparent';

    return (
      <div key={m.id} ref={isFirstLive ? liveAnchor : null}>
        <div
          id={`fx-card-${m.id}`}
          className={cls}
          style={{
            animationDelay: `${idx * 20}ms`,
            paddingLeft: isLive || isHT || isFT ? 17 : 16,
          }}
          onClick={() => setExpanded(isExp ? null : String(m.id))}
        >
          {(isLive || isHT || isFT) && (
            <div
              className="fx-left-bar"
              style={{ background: leftColor }}
            />
          )}

          <div className="fx-status-row">
            {isLive && (
              <span className="fx-badge fx-badge-live">
                <span className="fx-live-dot" /> LIVE
              </span>
            )}
            {isLive && auto.auto && (
              <span style={{ fontSize: '.5rem', opacity: 0.5, fontWeight: 600 }}>
                AUTO
              </span>
            )}
            {isHT && (
              <span className="fx-badge fx-badge-ht">
                <span className="fx-ht-dot" /> HT
              </span>
            )}
            {isFT && (
              <span className="fx-badge fx-badge-ft">
                FT
                {auto.auto && (
                  <span style={{ fontSize: '.5rem', opacity: 0.5, fontWeight: 600 }}>
                    {' '}(EST)
                  </span>
                )}
              </span>
            )}
            {isKO && <span className="fx-kickoff-badge">KICK OFF</span>}
            {isLive && minute > 0 && (
              <span className="fx-minute">{minute}&apos;</span>
            )}
            {isHT && (
              <span className="fx-minute" style={{ color: '#f97316' }}>
                45{minute > 45 ? `+${minute - 45}` : ''}&apos;
              </span>
            )}
            {!isLive && !isHT && !isFT && m.kickoff && (
              <span className="fx-badge-time">
                <Clock size={10} /> {m.kickoff}
              </span>
            )}
          </div>

          <div className="fx-teams">
            <div className="fx-team-col home">
              <div className="fx-team-info">
                {m.homeLogo && (
                  <img className="fx-team-logo" src={m.homeLogo} alt="" loading="lazy" />
                )}
                <span className="fx-team-name">
                  {m.homeTeam?.shortName || m.homeTeam?.name || 'TBD'}
                </span>
              </div>
              <button
                className={`fx-fav ${hFav ? 'active' : ''} ${favPopId === String(m.homeTeam?.id) ? 'pop' : ''}`}
                onClick={(e) => toggleFav(e, m.homeTeam?.id, { name: m.homeTeam?.name, logo: m.homeTeam?.logo })}
              >
                <Star size={11} fill={hFav ? 'var(--gold)' : 'none'} />
              </button>
            </div>

            <div className="fx-score-center">
              {(isLive || isHT || isFT) ? (
                <div className="fx-score-pair">
                  <span
                    className={`fx-score-num ${isLive ? 'live' : ''} ${isFT ? 'ft' : ''} ${popSide === 'home' ? 'pop' : ''}`}
                    key={`h-${m.id}-${m.homeScore}-${popSide}`}
                  >
                    {m.homeScore ?? 0}
                  </span>
                  <span className="fx-score-sep">-</span>
                  <span
                    className={`fx-score-num ${isLive ? 'live' : ''} ${isFT ? 'ft' : ''} ${popSide === 'away' ? 'pop' : ''}`}
                    key={`a-${m.id}-${m.awayScore}-${popSide}`}
                  >
                    {m.awayScore ?? 0}
                  </span>
                </div>
              ) : (
                <span className="fx-vs">VS</span>
              )}
            </div>

            <div className="fx-team-col away">
              <div className="fx-team-info">
                {m.awayLogo && (
                  <img className="fx-team-logo" src={m.awayLogo} alt="" loading="lazy" />
                )}
                <span className="fx-team-name">
                  {m.awayTeam?.shortName || m.awayTeam?.name || 'TBD'}
                </span>
              </div>
              <button
                className={`fx-fav ${aFav ? 'active' : ''} ${favPopId === String(m.awayTeam?.id) ? 'pop' : ''}`}
                onClick={(e) => toggleFav(e, m.awayTeam?.id, { name: m.awayTeam?.name, logo: m.awayTeam?.logo })}
              >
                <Star size={11} fill={aFav ? 'var(--gold)' : 'none'} />
              </button>
            </div>
          </div>

          {isLive && minute > 0 && (
            <div className="fx-progress">
              <div
                className="fx-progress-fill"
                style={{
                  width: `${progress * 100}%`,
                  background: `linear-gradient(90deg, ${pColor}, ${pColor}88)`,
                }}
              />
            </div>
          )}

          {isStatusAnim && (
            <div className="fx-overlay">
              <div
                className="fx-overlay-badge"
                style={{
                  background:
                    isStatusAnim.type === 'ht'
                      ? 'rgba(249,115,22,.9)'
                      : isStatusAnim.type === 'ft'
                      ? 'rgba(0,230,118,.9)'
                      : 'rgba(239,68,68,.9)',
                  boxShadow: `0 4px 24px ${
                    isStatusAnim.type === 'ht'
                      ? 'rgba(249,115,22,.3)'
                      : isStatusAnim.type === 'ft'
                      ? 'rgba(0,230,118,.3)'
                      : 'rgba(239,68,68,.3)'
                  }`,
                }}
              >
                {isStatusAnim.type === 'ht' && <><Pause size={16} /> HALF TIME</>}
                {isStatusAnim.type === 'ft' && <><Flag size={16} /> FULL TIME</>}
                {isStatusAnim.type === 'live' && <><Zap size={16} /> KICK OFF</>}
              </div>
            </div>
          )}
        </div>

        {isExp && (
          <div className="fx-expanded">
            <ScoreBreakdown match={m} />
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     SCORE BREAKDOWN
     ═══════════════════════════════════════════════════════════ */
  function ScoreBreakdown({ match }) {
    const s = match.score || {};
    const periods = [
      { l: 'Half Time', h: s.halfTime?.home, a: s.halfTime?.away },
      { l: 'Full Time', h: s.fullTime?.home, a: s.fullTime?.away },
      { l: 'Extra Time', h: s.extraTime?.home, a: s.extraTime?.away },
      { l: 'Penalties', h: s.penalties?.home, a: s.penalties?.away },
    ];
    const has = periods.some((p) => p.h != null || p.a != null);
    if (!has) {
      return (
        <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.78rem' }}>
          Score details appear once the match begins
        </div>
      );
    }
    return (
      <div style={{ padding: '10px 0 4px' }}>
        <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '0 18px 8px' }}>
          Score Details
        </div>
        {periods.map((p) =>
          p.h != null || p.a != null ? (
            <div key={p.l} className="fx-score-row">
              <span style={{ width: 40, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'right' }}>
                {p.h ?? '-'}
              </span>
              <span style={{ flex: 1, textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '.68rem' }}>
                {p.l}
              </span>
              <span style={{ width: 40, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', textAlign: 'left' }}>
                {p.a ?? '-'}
              </span>
            </div>
          ) : null
        )}
        {match.referee && (
          <div style={{ padding: '8px 18px 4px', fontSize: '.68rem', color: 'var(--text-muted)', borderTop: '1px solid rgba(255,255,255,.04)', marginTop: 4 }}>
            ⚽ {match.referee}
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     SKELETON
     ═══════════════════════════════════════════════════════════ */
  const Skeleton = () => (
    <div className="fx-container" style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="fx-sk" style={{ height: 52, flex: 1, borderRadius: 12 }} />
        ))}
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="fx-sk" style={{ height: 88, borderRadius: 12, marginBottom: 6 }} />
      ))}
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
     ERROR
     ═══════════════════════════════════════════════════════════ */
  const ErrorView = () => {
    const cfg = {
      NETWORK: {
        icon: <WifiOff size={22} />,
        bg: 'rgba(239,68,68,.08)',
        color: '#ef4444',
        t: 'Connection lost',
        d: 'Could not load matches. Check your internet and try again.',
      },
      NO_DATA: {
        icon: <CalendarDays size={22} />,
        bg: 'rgba(245,197,66,.08)',
        color: 'var(--gold)',
        t: 'No matches scheduled',
        d: `No fixtures found for ${dateLabel(date).toLowerCase()}. Try another day.`,
      },
    }[error] || {
      icon: <WifiOff size={22} />,
      bg: 'rgba(239,68,68,.08)',
      color: '#ef4444',
      t: 'Something went wrong',
      d: 'Failed to load fixtures. Please try again.',
    };

    return (
      <div className="fx-empty fx-enter">
        <div className="fx-empty-icon" style={{ background: cfg.bg, color: cfg.color }}>
          {cfg.icon}
        </div>
        <div style={{ fontWeight: 700, fontSize: '.92rem', color: 'var(--text-primary)' }}>
          {cfg.t}
        </div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', maxWidth: 260, lineHeight: 1.5 }}>
          {cfg.d}
        </div>
        <button
          className="fx-btn"
          style={{
            marginTop: 8,
            padding: '10px 24px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            fontSize: '.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onClick={handleRefresh}
        >
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  if (loading) return <Skeleton />;
  if (error) return (
    <div className="fx-page">
      <div className="fx-container">
        {error === 'NETWORK' ? null : (
          <>
            <div className="fx-header">
              <h1>Fixtures</h1>
              <div className="sub">{dateLabel(date)}</div>
            </div>
            <div className="fx-date-tabs">
              {DATES.map((d) => (
                <button
                  key={d}
                  className={`fx-date-tab ${date === d ? 'active' : ''}`}
                  onClick={() => setDate(d)}
                >
                  <span>{d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : 'Tomorrow'}</span>
                  <span className="day-label">
                    {new Date(d + 'T12:00:00').getDate()}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
        <ErrorView />
      </div>
    </div>
  );

  return (
    <div className="fx-page">
      <SEO
        title={`${dateLabel(date)}'s Matches`}
        description="Live football scores, fixtures and results"
      />

      <div className="fx-container">
        {/* Header */}
        <div className="fx-header">
          <h1>Fixtures</h1>
          <div className="sub">{dateLabel(date)}</div>
        </div>

        {/* Date Tabs */}
        <div className="fx-date-tabs">
          {DATES.map((d) => (
            <button
              key={d}
              className={`fx-date-tab ${date === d ? 'active' : ''}`}
              onClick={() => setDate(d)}
            >
              <span>{d === TODAY ? 'Today' : d === YESTERDAY ? 'Yesterday' : 'Tomorrow'}</span>
              <span className="day-label">
                {new Date(d + 'T12:00:00').getDate()}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="fx-actions">
          <button
            className={`fx-action-btn ${searchOpen ? 'active' : ''}`}
            onClick={() => setSearchOpen((p) => !p)}
          >
            <Search size={13} /> Search
          </button>
          <button
            className={`fx-action-btn ${favFilter ? 'active' : ''}`}
            onClick={() => setFavFilter((p) => !p)}
          >
            <Star size={13} /> Favs
          </button>
          <button
            className={`fx-action-btn ${soundOn ? 'active' : ''}`}
            onClick={() => setSoundOn((p) => !p)}
          >
            {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {soundOn ? 'Sound' : 'Muted'}
          </button>
          <button
            className="fx-action-btn"
            onClick={handleRefresh}
            style={{ opacity: isRefreshing ? 0.5 : 1 }}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className={`fx-search-wrap ${searchOpen ? 'open' : 'closed'}`}>
          <div className="fx-search-bar">
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Search teams or leagues..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              autoFocus={searchOpen}
            />
            {searchQ && (
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                onClick={() => setSearchQ('')}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Live Ticker */}
        {liveCount > 0 && (
          <div className="fx-ticker">
            {liveMatches.map((m) => (
              <div
                key={m.id}
                className="fx-ticker-item"
                onClick={() => {
                  const el = document.getElementById(`fx-card-${m.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
               <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
  {m.homeTeam?.name}
</span>
                <span className="fx-ticker-score">
                  {m.homeScore ?? 0}-{m.awayScore ?? 0}
                </span>
                <span style={{ fontSize: '.62rem, color: var(--text-muted)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.awayTeam?.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Fixtures */}
        {grouped.map((league) => (
          <div key={league.id} className="fx-league">
            <div className="fx-league-header">
              {league.logo && (
                <img src={league.logo} alt="" loading="lazy" />
              )}
              <span>{league.name}</span>
              <span className="count">{league.matches.length}</span>
            </div>
            {league.matches.map((m, i) => renderCard(m, i))}
          </div>
        ))}

        {/* Empty after filter */}
        {filtered.length === 0 && !error && (
          <div className="fx-empty fx-enter" style={{ marginTop: 20 }}>
            <div className="fx-empty-icon" style={{ background: 'rgba(245,197,66,.08)', color: 'var(--gold)' }}>
              <Search size={22} />
            </div>
            <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text-primary)' }}>
              No matches found
            </div>
            <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
              {searchQ ? 'Try a different search term' : 'No favorites in this list'}
            </div>
          </div>
        )}
      </div>

      {/* Goal Notification */}
      {goalNotif && (
        <div className="fx-goal-notif" key={goalNotif.key}>
          <span style={{ fontSize: '.82rem', fontWeight: 800, letterSpacing: '.03em' }}>
            ⚽ {goalNotif.text}
          </span>
        </div>
      )}

      {/* Jump to Live */}
      {showJump && liveCount > 0 && (
        <button className="fx-jump-btn" onClick={jumpToLive}>
          <span className="fx-live-dot" />
          {liveCount} {liveCount === 1 ? 'match' : 'matches'} live — Jump
        </button>
      )}
    </div>
  );
}