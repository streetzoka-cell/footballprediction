import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, RefreshCw, WifiOff, Database,
  Star,
  ChevronDown, ChevronRight,
  Lock, LogIn, CheckCircle2, Sparkles, Flame,
} from 'lucide-react';
import {
  fetchBasketballFixtures,
  subscribeToBasketballLiveFixtures,
  getDateRange,
  getTodayStr,
  getYesterdayStr,
  getTomorrowStr,
} from '../utils/api';

import { useAuth } from '../context/AuthContext';
import { db } from '../utils/firebase';
import { doc, setDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import SEO from "../components/SEO";


/* ═══════════════════════════════════════════════════════════════
   STYLE INJECTION
   ═══════════════════════════════════════════════════════════════ */
const injectStyles = () => {
  if (document.getElementById('bb-pro-v3')) return;
  const s = document.createElement('style');
  s.id = 'bb-pro-v3';
  s.textContent = `
    @keyframes bb_fadeInUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    @keyframes bb_slideDown{from{opacity:0;transform:translateY(-24px)}to{opacity:1;transform:translateY(0)}}
    @keyframes bb_slideInLeft{from{opacity:0;transform:translateX(-20px)}to{opacity:1;transform:translateX(0)}}
    @keyframes bb_scoreFlash{0%{transform:scale(1)}25%{transform:scale(1.35);filter:brightness(1.8)}100%{transform:scale(1);filter:brightness(1)}}
    @keyframes bb_liveGlow{0%,100%{box-shadow:0 0 6px rgba(239,68,68,.3),0 0 12px rgba(239,68,68,.1)}50%{box-shadow:0 0 12px rgba(239,68,68,.6),0 0 28px rgba(239,68,68,.2)}}
    @keyframes bb_pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.3;transform:scale(.85)}}
    @keyframes bb_float{0%,100%{transform:translateY(0) rotate(0)}33%{transform:translateY(-10px) rotate(2deg)}66%{transform:translateY(-4px) rotate(-1deg)}}
    @keyframes bb_borderGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
    @keyframes bb_shimmer{0%{background-position:-300% 0}100%{background-position:300% 0}}
    @keyframes bb_cardLiveBorder{0%,100%{border-color:rgba(239,68,68,.12)}50%{border-color:rgba(239,68,68,.4)}}
    @keyframes bb_badgePop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
    @keyframes bb_liveBarSweep{0%{transform:translateY(-100%)}100%{transform:translateY(600%)}}
    @keyframes bb_predictPop{0%{transform:scale(.9);opacity:0;box-shadow:0 0 0 0 rgba(29,66,138,.4)}50%{transform:scale(1.03);box-shadow:0 0 20px rgba(29,66,138,.12)}100%{transform:scale(1);opacity:1;box-shadow:none}}
    @keyframes bb_slideDownReveal{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes bb_glowRing{0%,100%{box-shadow:0 0 0 0 rgba(29,66,138,.3)}50%{box-shadow:0 0 0 6px rgba(29,66,138,0)}}
    @keyframes bb_countUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes refreshSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
    @keyframes bballBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
    @keyframes sportGlow{0%,100%{box-shadow:0 0 8px rgba(249,115,22,.15)}50%{box-shadow:0 0 16px rgba(249,115,22,.3)}}
    .bb-enter{animation:bb_fadeInUp .4s cubic-bezier(.22,1,.36,1) both}
    .bb-expand{animation:bb_slideDownReveal .3s cubic-bezier(.22,1,.36,1) both}
    .bb-predict-pop{animation:bb_predictPop .4s cubic-bezier(.22,1,.36,1) both}
    .bb-glow-ring{animation:bb_glowRing 2s ease-in-out infinite}
    .bb-count{animation:bb_countUp .35s cubic-bezier(.22,1,.36,1) both}
    .bb-shimmer{background:linear-gradient(90deg,rgba(255,255,255,.02) 25%,rgba(255,255,255,.07) 50%,rgba(255,255,255,.02) 75%);background-size:300% 100%;animation:bb_shimmer 1.8s ease-in-out infinite;border-radius:4px}
    .date-scroll-hide::-webkit-scrollbar{display:none}
    .date-scroll-hide{scrollbar-width:none}
    .zoka-btn{transition:all .18s cubic-bezier(.22,1,.36,1);cursor:pointer;outline:none}
    .zoka-btn:hover{transform:translateY(-1px)}
    .zoka-btn:active{transform:translateY(0) scale(.97)}
    .zoka-card{transition:all .22s cubic-bezier(.22,1,.36,1)}
    .zoka-card:hover{transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,0,0,.15)}
    .zoka-glass{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
    .bball-icon{animation:bballBounce 1.5s ease-in-out infinite}
    .bball-glow{animation:sportGlow 2s ease-in-out infinite}
    .sport-switch{display:flex;gap:6px;padding:4px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border)}
    .sport-pill{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:.78rem;font-weight:700;border:none;cursor:pointer;transition:all .2s cubic-bezier(.22,1,.36,1)}
    .sport-pill:hover{transform:translateY(-1px)}
    .sport-pill:active{transform:scale(.97)}
    .sport-pill.active{color:var(--bg-deep)}
    .sport-pill.inactive{color:var(--text-muted);background:transparent}
    .sport-pill.inactive:hover{color:var(--text-primary);background:rgba(255,255,255,.04)}
  `;
  document.head.appendChild(s);
};

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & UTILITIES
   ═══════════════════════════════════════════════════════════════ */
const LEAGUE_PRIORITY_BB = {
  12: 100, 13: 88, 132: 82, 115: 78, 766: 75, 891: 70, 116: 72, 114: 68, 119: 65,
};

function gamePriorityScore(g) {
  const base = LEAGUE_PRIORITY_BB[g.leagueKey] || 30;
  const liveBoost = g.isLive ? 50 : 0;
  const scheduledBoost = g.isScheduled ? 10 : 0;
  return base + liveBoost + scheduledBoost;
}

function getTopPredictGames(gamesList, count = 10) {
  if (!gamesList || !gamesList.length) return [];
  const eligible = gamesList.filter(g => g.isScheduled);
  const scored = eligible.map(g => ({ ...g, _priority: gamePriorityScore(g) }));
  scored.sort((a, b) => b._priority - a._priority);
  return scored.slice(0, count);
}

/* ═══════════════════════════════════════════════════════════════
   SKELETON COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
const SkeletonCard = ({ delay = 0 }) => (
  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 8, animation: `bb_fadeInUp .35s ease ${delay}ms both` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <div className="bb-shimmer" style={{ width: 30, height: 30, borderRadius: 8 }} />
      <div className="bb-shimmer" style={{ width: '55%', height: 14, flex: 1 }} />
      <div className="bb-shimmer" style={{ width: 28, height: 20 }} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', marginTop: 6 }}>
      <div className="bb-shimmer" style={{ width: 30, height: 30, borderRadius: 8 }} />
      <div className="bb-shimmer" style={{ width: '45%', height: 14, flex: 1 }} />
      <div className="bb-shimmer" style={{ width: 28, height: 20 }} />
    </div>
  </div>
);

const SkeletonGroup = () => (
  <div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 8px 8px' }}>
      <div className="bb-shimmer" style={{ width: 22, height: 22, borderRadius: 5 }} />
      <div className="bb-shimmer" style={{ width: 140, height: 14, flex: 1 }} />
    </div>
    {[0, 1, 2].map(i => <SkeletonCard key={i} delay={i * 80} />)}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   ERROR SCREEN
   ═══════════════════════════════════════════════════════════════ */
function ErrorScreen({ error, onRetry }) {
  const cfg = {
    NETWORK: { icon: <WifiOff size={24} />, bg: 'rgba(239,68,68,.1)', color: '#ef4444', t: 'Connection error', d: 'Could not reach Firestore. Check your internet connection.' },
    NO_DB: { icon: <Database size={24} />, bg: 'rgba(245,197,66,.1)', color: 'var(--gold)', t: 'No database', d: 'Firebase is not configured.' },
  };
  const c = cfg[error] || cfg.NETWORK;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '36px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.bg, color: c.color }}>{c.icon}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.t}</div>
      <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5, textAlign: 'center' }}>{c.d}</div>
      <button className="zoka-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px', borderRadius: 8, background: '#1D428A', color: '#fff', fontWeight: 600, fontSize: '.82rem', border: 'none' }} onClick={onRetry}>
        <RefreshCw size={14} /> Retry
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
const TeamLogo = ({ src, name }) => {
  if (!src) return (
    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)', flexShrink: 0, fontWeight: 700 }}>
      {(name || '?')[0]}
    </div>
  );
  return <img src={src} alt={name} style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: 'rgba(255,255,255,.03)', padding: 3 }} loading="lazy" />;
};

const StatusBadge = ({ game }) => {
  const s = game.status;
  let bg = 'rgba(255,255,255,.05)', color = 'var(--text-muted)', label = s;

  if (game.isLive) { bg = 'rgba(239,68,68,.15)'; color = '#ef4444'; label = game.minute || s; }
  else if (game.isFinished) { bg = 'rgba(34,197,94,.1)'; color = '#4ade80'; label = s === 'AOT' ? 'OT' : 'FT'; }
  else if (s === 'SUSP') { bg = 'rgba(245,158,11,.1)'; color = '#f59e0b'; label = 'SUSP'; }
  else if (s === 'POSTP') { bg = 'rgba(245,158,11,.1)'; color = '#f59e0b'; label = 'POSTP'; }
  else if (s === 'CANC') { bg = 'rgba(239,68,68,.1)'; color = '#ef4444'; label = 'CANC'; }

  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, letterSpacing: .3, background: bg, color, animation: 'bb_badgePop .35s ease' }}>{label}</span>;
};

const ScoreDisplay = ({ score, isLive }) => {
  const baseStyle = { fontSize: 18, fontWeight: 800, minWidth: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums', transition: 'color .3s' };
  if (!isLive) return <span style={{ ...baseStyle, color: 'var(--text-primary)' }}>{score ?? '-'}</span>;
  return (
    <span key={score} style={{ ...baseStyle, color: '#ef4444', textShadow: '0 0 12px rgba(239,68,68,.4)', display: 'inline-block', animation: 'bb_scoreFlash .5s cubic-bezier(.4,0,.2,1)' }}>
      {score ?? '-'}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════════
   GAME CARD
   ═══════════════════════════════════════════════════════════════ */
const GameCard = ({ game, index = 0 }) => {
  const hasQuarters = game.score?.q1?.home !== null && game.score?.q1?.home !== undefined;
  const showQuarters = hasQuarters && (game.isLive || game.isFinished);
  const homeWin = game.isFinished && (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayWin = game.isFinished && (game.awayScore ?? 0) < (game.homeScore ?? 0);

  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qKeys = ['q1', 'q2', 'q3', 'q4'];
  if (game.score?.ot?.home !== null && game.score?.ot?.home !== undefined) {
    quarters.push('OT');
    qKeys.push('ot');
  }
  const qCount = quarters.length;

  const teamNameStyle = (isWinner) => {
    if (isWinner === true) return { flex: 1, fontSize: 14, fontWeight: 700, color: '#4ade80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    if (isWinner === false) return { flex: 1, fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
    return { flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
  };

  return (
    <div className="zoka-card" style={{
      background: game.isLive ? 'linear-gradient(135deg, rgba(239,68,68,.06) 0%, rgba(239,68,68,.02) 100%)' : 'var(--bg-card)',
      border: game.isLive ? '1px solid rgba(239,68,68,.2)' : '1px solid var(--border)',
      borderRadius: 14, padding: '14px 16px', marginBottom: 8, cursor: 'default',
      position: 'relative', overflow: 'hidden',
      animation: `bb_fadeInUp .35s cubic-bezier(.4,0,.2,1) ${index * 50}ms both${game.isLive ? ', bb_cardLiveBorder 2.5s ease-in-out infinite' : ''}`,
    }}>
      {game.isLive && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: 'linear-gradient(180deg, #ef4444, #f87171, #ef4444)', borderRadius: '0 2px 2px 0', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '30%', background: 'linear-gradient(180deg, transparent, rgba(255,255,255,.4), transparent)', animation: 'bb_liveBarSweep 2s linear infinite' }} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', paddingLeft: game.isLive ? 10 : 0 }}>
        <TeamLogo src={game.homeLogo} name={game.homeTeam?.name} />
        <span style={teamNameStyle(game.isFinished ? homeWin : undefined)}>{game.homeTeam?.name || 'TBD'}</span>
        {game.isScheduled
          ? <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{game.kickoff}</span>
          : <ScoreDisplay score={game.homeScore} isLive={game.isLive} />
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', paddingLeft: game.isLive ? 10 : 0 }}>
        <TeamLogo src={game.awayLogo} name={game.awayTeam?.name} />
        <span style={teamNameStyle(game.isFinished ? awayWin : undefined)}>{game.awayTeam?.name || 'TBD'}</span>
        {game.isScheduled
          ? <StatusBadge game={game} />
          : <ScoreDisplay score={game.awayScore} isLive={game.isLive} />
        }
      </div>

      {!game.isScheduled && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, paddingRight: 2 }}>
          <StatusBadge game={game} />
        </div>
      )}

      {showQuarters && (
        <div style={{ display: 'grid', gap: 0, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', gridTemplateColumns: `repeat(${qCount + 1}, 1fr)`, animation: `bb_fadeInUp .3s ease ${index * 50 + 150}ms both` }}>
          {quarters.map(q => <span key={q} style={{ fontSize: 9, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 700, padding: '2px 0', letterSpacing: .3 }}>{q}</span>)}
          <span style={{ fontSize: 9, color: '#64748b', textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>TOT</span>
          {qKeys.map((key) => (
            <span key={`h_${key}`} style={{ fontSize: 11, color: '#64748b', textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '2px 0' }}>
              {game.score?.[key]?.home ?? '-'}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '2px 0', fontWeight: 700 }}>{game.homeScore ?? '-'}</span>
          {qKeys.map((key) => (
            <span key={`a_${key}`} style={{ fontSize: 11, color: '#64748b', textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '2px 0' }}>
              {game.score?.[key]?.away ?? '-'}
            </span>
          ))}
          <span style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '2px 0', fontWeight: 700 }}>{game.awayScore ?? '-'}</span>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   LEAGUE SECTION
   ═══════════════════════════════════════════════════════════════ */
const LeagueSection = ({ league, games, sectionIndex = 0 }) => (
  <div style={{ animation: `bb_slideInLeft .4s cubic-bezier(.4,0,.2,1) ${sectionIndex * 80}ms both` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 6, position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: league.color, borderRadius: '0 2px 2px 0', transformOrigin: 'top', animation: 'bb_borderGrow .5s cubic-bezier(.4,0,.2,1)' }} />
      {league.emblem && <img src={league.emblem} alt="" style={{ width: 22, height: 22, borderRadius: 5, objectFit: 'contain' }} loading="lazy" />}
      {!league.emblem && <div style={{ width: 22, height: 22, borderRadius: 5, background: league.color, flexShrink: 0 }} />}
      <span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', flex: 1 }}>{league.name}</span>
      {league.country && <span style={{ fontSize: 11, color: '#334155' }}>{league.country}</span>}
    </div>
    {games.map((g, i) => <GameCard key={g.id} game={g} index={i} />)}
  </div>
);

/* ═══════════════════════════════════════════════════════════════
   PREDICTION CARD
   ═══════════════════════════════════════════════════════════════ */
const PredictCard = ({ game, prediction, onPredict, onRemove, loggedIn, index }) => {
  const isLive = game.isLive;
  const isFinished = game.isFinished;
  const currentPick = prediction?.pick || null;
  const kickOff = game.kickoff || '';

  const pickLabels = { home: game.homeTeam?.name || 'Home', draw: 'Draw', away: game.awayTeam?.name || 'Away' };
  const pickColors = {
    home: { bg: currentPick === 'home' ? 'rgba(29,66,138,.18)' : 'rgba(255,255,255,.04)', border: currentPick === 'home' ? '#1D428A' : 'var(--border)', color: currentPick === 'home' ? '#60a5fa' : 'var(--text-secondary)' },
    draw: { bg: currentPick === 'draw' ? 'rgba(245,197,66,.18)' : 'rgba(255,255,255,.04)', border: currentPick === 'draw' ? 'var(--gold)' : 'var(--border)', color: currentPick === 'draw' ? 'var(--gold)' : 'var(--text-secondary)' },
    away: { bg: currentPick === 'away' ? 'rgba(239,68,68,.12)' : 'rgba(255,255,255,.04)', border: currentPick === 'away' ? '#ef4444' : 'var(--border)', color: currentPick === 'away' ? '#ef4444' : 'var(--text-secondary)' },
  };

  function handlePick(pick) {
    if (!loggedIn) { onPredict(null, true); return; }
    if (currentPick === pick) { onRemove(String(game.id)); } else { onPredict(String(game.id), false, pick); }
  }

  return (
    <div className="zoka-card bb-predict-pop" style={{ padding: '14px 16px', background: 'var(--bg-card)', border: `1px solid ${isLive ? 'rgba(239,68,68,.25)' : 'var(--border)'}`, borderRadius: 12, marginBottom: 8, animationDelay: `${index * 60}ms`, position: 'relative', overflow: 'hidden' }}>
      {isLive && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #ef4444, #f97316, #ef4444)', animation: 'bb_cardLiveBorder 2s ease-in-out infinite' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {game.league?.emblem && <img src={game.league.emblem} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />}
        <span style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--text-muted)', flex: 1 }}>{game.league?.name || ''}</span>
        <span style={{ fontSize: '.64rem', fontWeight: 700, color: isLive ? '#ef4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          {isLive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'bb_pulse 1.5s ease-in-out infinite' }} />}
          {isLive ? 'LIVE' : kickOff}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <TeamLogo src={game.homeLogo} name={game.homeTeam?.name} />
          <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.homeTeam?.name}</span>
        </div>
        {game.isScheduled ? (
          <div style={{ padding: '4px 12px', borderRadius: 8, background: 'rgba(255,255,255,.03)', fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>VS</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 14px', borderRadius: 8, background: isLive ? 'rgba(239,68,68,.08)' : 'rgba(255,255,255,.04)', fontVariantNumeric: 'tabular-nums', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: 2 }}>
            {game.homeScore ?? '-'} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>-</span> {game.awayScore ?? '-'}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{game.awayTeam?.name}</span>
          <TeamLogo src={game.awayLogo} name={game.awayTeam?.name} />
        </div>
      </div>
      {!isFinished && (
        <div style={{ display: 'flex', gap: 8 }}>
          {['home', 'draw', 'away'].map((pick) => (
            <button key={pick} className="zoka-btn" onClick={() => handlePick(pick)}
              style={{ flex: 1, padding: '10px 0', borderRadius: 9, background: pickColors[pick].bg, border: `1.5px solid ${pickColors[pick].border}`, color: pickColors[pick].color, fontWeight: 800, fontSize: pick === 'draw' ? '.78rem' : '.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickLabels[pick]}
              {currentPick === pick && <CheckCircle2 size={13} style={{ marginLeft: 3, flexShrink: 0 }} />}
              {!loggedIn && <Lock size={10} style={{ position: 'absolute', top: 4, right: 5, opacity: .4 }} />}
            </button>
          ))}
        </div>
      )}
      {isFinished && currentPick && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', fontSize: '.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          <span>Your pick:</span>
          <span style={{ color: pickColors[currentPick]?.color || '#60a5fa', fontWeight: 800 }}>{pickLabels[currentPick]}</span>
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   LOGIN PROMPT MODAL
   ═══════════════════════════════════════════════════════════════ */
function LoginPromptModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20, backdropFilter: 'blur(4px)' }}>
      <div onClick={e => e.stopPropagation()} className="bb-expand" style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '32px 28px', maxWidth: 380, width: '100%', border: '1px solid var(--border)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(29,66,138,.12)', color: '#60a5fa', margin: '0 auto 16px' }}>
          <Lock size={24} />
        </div>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>Login to Predict</div>
        <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>Sign in to start making basketball predictions and compete on the leaderboard.</div>
        <button className="zoka-btn" style={{ width: '100%', padding: '12px 0', borderRadius: 10, background: '#1D428A', color: '#fff', fontWeight: 700, fontSize: '.9rem', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }} onClick={() => { window.location.href = '/login'; }}>
          <LogIn size={16} /> Sign In
        </button>
        <button className="zoka-btn" style={{ width: '100%', padding: '10px 0', borderRadius: 10, background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: '.82rem', border: '1px solid var(--border)' }} onClick={onClose}>Maybe Later</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN BASKETBALL COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function Basketball() {
  injectStyles();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const dates = useMemo(() => getDateRange(9, -1), []);
  const todayStr = useMemo(() => getTodayStr(), []);
  const yesterdayStr = useMemo(() => getYesterdayStr(), []);
  const tomorrowStr = useMemo(() => getTomorrowStr(), []);

  // The 3 dates the backend actually populates
  const windowDates = useMemo(() => [yesterdayStr, todayStr, tomorrowStr], [yesterdayStr, todayStr, tomorrowStr]);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [gamesByDate, setGamesByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveGames, setLiveGames] = useState([]);

  // Predictions
  const [viewMode, setViewMode] = useState('fixtures');
  const [predictions, setPredictions] = useState({});
  const [showLoginModal, setShowLoginModal] = useState(false);
  const loggedIn = !!currentUser;
  const [predictDay, setPredictDay] = useState('today');
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [predictData, setPredictData] = useState({});

  const loadedDatesRef = useRef(new Set());
  const dateScrollRef = useRef(null);
  const initialLoadDone = useRef(false);

  const currentGames = gamesByDate[selectedDate] || [];

  /* ═══════════════════════════════════════════════════════════
     PREDICTIONS — real-time from Firestore
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!currentUser) { setPredictions({}); return; }
    const q = query(collection(db, 'user_bb_predictions'), where('userId', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const userPreds = {};
      snap.docs.forEach(d => {
        const data = d.data();
        userPreds[data.gameId] = { pick: data.pick, timestamp: data.timestamp };
      });
      setPredictions(userPreds);
    }, (err) => console.error("Pred fetch error:", err));
    return () => unsub();
  }, [currentUser]);

  const handlePredict = async (gameId, needsLogin, pick) => {
    if (needsLogin || !currentUser) { setShowLoginModal(true); return; }
    if (!gameId || !pick) return;
    const predRef = doc(db, 'user_bb_predictions', `${currentUser.uid}_${gameId}`);
    await setDoc(predRef, { userId: currentUser.uid, gameId: String(gameId), pick, timestamp: Date.now() });
  };

  const handleRemovePredict = async (gameId) => {
    if (!currentUser) return;
    const predRef = doc(db, 'user_bb_predictions', `${currentUser.uid}_${gameId}`);
    await deleteDoc(predRef);
  };

  /* ═══════════════════════════════════════════════════════════
     FETCH ONE DATE from Firestore
  ═══════════════════════════════════════════════════════════ */
  const fetchDate = useCallback(async (date) => {
    if (loadedDatesRef.current.has(date)) return;
    loadedDatesRef.current.add(date);
    try {
      const res = await fetchBasketballFixtures(date);
      const matches = res?.matches || [];
      setGamesByDate(prev => ({ ...prev, [date]: matches }));
      setPredictData(prev => ({ ...prev, [date]: matches }));
    } catch (err) {
      console.warn('[Basketball] Fetch error for', date, err.message);
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════
     INITIAL LOAD — fetch all 3 window dates in parallel
     yesterday + today + tomorrow, then mark loading done
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch all 3 days in parallel — they hit different collections
        const [yRes, tRes, tmRes] = await Promise.all([
          fetchBasketballFixtures(yesterdayStr),
          fetchBasketballFixtures(todayStr),
          fetchBasketballFixtures(tomorrowStr),
        ]);

        if (cancelled) return;

        const yMatches = yRes?.matches || [];
        const tMatches = tRes?.matches || [];
        const tmMatches = tmRes?.matches || [];

        // Mark all 3 as loaded
        loadedDatesRef.current.add(yesterdayStr);
        loadedDatesRef.current.add(todayStr);
        loadedDatesRef.current.add(tomorrowStr);

        setGamesByDate({
          [yesterdayStr]: yMatches,
          [todayStr]: tMatches,
          [tomorrowStr]: tmMatches,
        });
        setPredictData(prev => ({
          ...prev,
          [yesterdayStr]: yMatches,
          [todayStr]: tMatches,
          [tomorrowStr]: tmMatches,
        }));

        // If the selected date (today) had an error, set it
        if (tRes?.error) setError(tRes.error);
        else if (tMatches.length === 0 && yMatches.length === 0 && tmMatches.length === 0) {
          // All 3 empty — might be off-season or backend issue, don't show error
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('[Basketball] Initial load error:', err.message);
          setError('NETWORK');
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [yesterdayStr, todayStr, tomorrowStr]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════════════════════════════════════════════════
     LOAD ON DATE CHANGE — only for dates outside the 3-day window
     (which would return empty from api.jsx anyway, but keeps
     the code path clean for future expansion)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (initialLoadDone.current && !windowDates.includes(selectedDate)) {
      fetchDate(selectedDate);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════════════════════════════════════════════════
     REAL-TIME LIVE — onSnapshot on basketballLiveFixtures
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    const unsub = subscribeToBasketballLiveFixtures(({ matches }) => {
      setLiveGames(matches);
      if (matches.length === 0) return;
      const liveMap = new Map(matches.map(m => [String(m.id), m]));
      setGamesByDate(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(dateKey => {
          next[dateKey] = next[dateKey].map(g => liveMap.get(String(g.id)) || g);
        });
        return next;
      });
    });
    return () => unsub();
  }, []);

  /* ═══════════════════════════════════════════════════════════
     PRE-FETCH extra future dates for predictions view
     (beyond the 3-day window already loaded)
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    // Skip the 3 days already loaded; fetch days 4-8 for predict view
    const futureDates = dates
      .filter(d => d.date > tomorrowStr)
      .slice(0, 7);

    futureDates.forEach(async (d) => {
      if (predictData[d.date]) return;
      try {
        const res = await fetchBasketballFixtures(d.date);
        if (res?.matches) setPredictData(prev => ({ ...prev, [d.date]: res.matches }));
      } catch {}
    });
  }, [tomorrowStr]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════════════════════════════════════════════════
     MANUAL REFRESH — re-fetches selected date only
  ═══════════════════════════════════════════════════════════ */
  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    // Allow re-fetch by removing from loaded set
    loadedDatesRef.current.delete(selectedDate);

    fetchBasketballFixtures(selectedDate)
      .then(res => {
        const matches = res?.matches || [];
        setGamesByDate(prev => ({ ...prev, [selectedDate]: matches }));
        setPredictData(prev => ({ ...prev, [selectedDate]: matches }));
        if (res?.error) setError(res.error);
      })
      .catch(() => setError('NETWORK'))
      .finally(() => setRefreshing(false));
  }, [selectedDate, refreshing, fetchDate]);

  /* ═══════════════════════════════════════════════════════════
     MERGE LIVE DATA INTO CURRENT VIEW
  ═══════════════════════════════════════════════════════════ */
  const mergedGames = useMemo(() => {
    if (!liveGames.length) return currentGames;
    const liveMap = new Map(liveGames.map(g => [g.id, g]));
    return currentGames.map(g => liveMap.get(g.id) || g);
  }, [currentGames, liveGames]);

  /* ═══════════════════════════════════════════════════════════
     GROUP BY LEAGUE
  ═══════════════════════════════════════════════════════════ */
  const grouped = useMemo(() => {
    const map = new Map();
    mergedGames.forEach(g => {
      if (!map.has(g.leagueKey)) {
        map.set(g.leagueKey, { key: g.leagueKey, ...g.league, games: [] });
      }
      map.get(g.leagueKey).games.push(g);
    });
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const aLive = a.games.some(g => g.isLive);
      const bLive = b.games.some(g => g.isLive);
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;
      return a.name.localeCompare(b.name);
    });
    return arr;
  }, [mergedGames]);

  const liveCount = liveGames.length;
  const totalLiveInDate = mergedGames.filter(g => g.isLive).length;

  const liveLeagues = grouped.filter(l => l.games.some(g => g.isLive));
  const scheduledLeagues = grouped.filter(l => l.games.some(g => g.isScheduled));
  const finishedLeagues = grouped.filter(l => l.games.every(g => g.isFinished));

  /* ═══════════════════════════════════════════════════════════
     GAME COUNTS PER DATE — for date pill badges
  ═══════════════════════════════════════════════════════════ */
  const gameCounts = useMemo(() => {
    const counts = {};
    Object.entries(gamesByDate).forEach(([date, games]) => {
      counts[date] = games.length;
    });
    return counts;
  }, [gamesByDate]);

  /* ═══════════════════════════════════════════════════════════
     PREDICT GAMES
  ═══════════════════════════════════════════════════════════ */
  const todayPredictGames = useMemo(() => {
    const todayData = predictData[todayStr] || currentGames;
    return getTopPredictGames(todayData, 10);
  }, [predictData, todayStr, currentGames]);

  const tomorrowPredictGames = useMemo(() => {
    const tmData = predictData[tomorrowStr] || [];
    return getTopPredictGames(tmData, 10);
  }, [predictData, tomorrowStr]);

  const upcomingPredictGames = useMemo(() => {
    if (!upcomingOpen || !predictDay || predictDay === 'today' || predictDay === tomorrowStr) return [];
    const data = predictData[predictDay] || [];
    return getTopPredictGames(data, 10);
  }, [predictData, predictDay, upcomingOpen, tomorrowStr]);

  // Predict view dates: tomorrow first, then further out
  const predictViewDates = useMemo(() => {
    const furtherOut = dates.filter(d => d.date > tomorrowStr).slice(0, 7);
    return furtherOut;
  }, [dates, tomorrowStr]);

  /* ═══════════════════════════════════════════════════════════
     SCROLL TO TODAY
  ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (dateScrollRef.current) {
      const todayEl = dateScrollRef.current.querySelector('[data-date="' + todayStr + '"]');
      if (todayEl) todayEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [todayStr]);

  let sectionIdx = 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-deep)', animation: 'bb_fadeInUp .45s ease' }}>
      {showLoginModal && <LoginPromptModal onClose={() => setShowLoginModal(false)} />}

      <SEO
        title="Basketball Scores"
        description="Live NBA and college basketball scores, fixtures, and predictions. Real-time quarter-by-quarter updates."
        keywords="basketball scores, NBA scores, live basketball, basketball predictions, NBA fixtures"
        url="https://zokascore.com/basketball"
      />

      {/* ═══ HEADER ═══ */}      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10,14,23,.88)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)', animation: 'bb_slideDown .4s ease' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: '#1D428A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '.72rem', color: '#fff', fontFamily: 'var(--font-display)' }}>Z</div>
            <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>zokascore<span style={{ color: '#60a5fa' }}>.xyz</span></span>
            <span style={{ fontSize: 20 }}>🏀</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {liveCount > 0 && (
              <div style={{ background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', color: '#ef4444', fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, letterSpacing: .5, display: 'flex', alignItems: 'center', gap: 6, animation: 'bb_liveGlow 2s ease-in-out infinite' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', animation: 'bb_pulse 1.2s ease-in-out infinite' }} />
                LIVE {liveCount}
              </div>
            )}
            <button className="zoka-btn" onClick={handleRefresh} disabled={refreshing} style={{ width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: refreshing ? '#60a5fa' : 'var(--text-muted)' }}>
              <RefreshCw size={15} style={{ animation: refreshing ? 'refreshSpin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* ── Sport switcher ── */}
        <div style={{ maxWidth: 640, margin: '6px auto 0', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="sport-switch">
            <button className="sport-pill inactive" onClick={() => navigate('/fixtures')}>
              <span style={{ fontSize: '1rem' }}>⚽</span>
              Football
              <ChevronRight size={13} style={{ opacity: 0.5 }} />
            </button>
            <button className="sport-pill active" style={{ background: '#1D428A' }}>
              <span style={{ fontSize: '1rem' }}>🏀</span>
              Basketball
            </button>
          </div>
          <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Database size={10} /> Firestore
          </span>
        </div>

        {/* ── View mode tabs ── */}
        <div style={{ maxWidth: 640, margin: '6px auto 0', padding: '0 16px', display: 'flex', gap: 4 }}>
          <button className="zoka-btn" onClick={() => setViewMode('fixtures')} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '.78rem', background: viewMode === 'fixtures' ? '#1D428A' : 'transparent', color: viewMode === 'fixtures' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <CalendarDays size={14} /> Fixtures
          </button>
          <button className="zoka-btn" onClick={() => setViewMode('predict')} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '.78rem', background: viewMode === 'predict' ? 'linear-gradient(135deg, #1D428A, #3b82f6)' : 'transparent', color: viewMode === 'predict' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Sparkles size={14} /> Predict
            {Object.keys(predictions).length > 0 && (
              <span style={{ padding: '1px 6px', borderRadius: 6, background: viewMode === 'predict' ? 'rgba(255,255,255,.2)' : 'rgba(29,66,138,.15)', fontSize: '.64rem', fontWeight: 800, color: viewMode === 'predict' ? '#fff' : '#60a5fa' }}>{Object.keys(predictions).length}</span>
            )}
          </button>
        </div>

        {/* ── Date scroller (fixtures mode) ── */}
        {viewMode === 'fixtures' && (
          <div ref={dateScrollRef} className="date-scroll-hide" style={{ maxWidth: 640, margin: '6px auto 0', padding: '0 16px 10px', display: 'flex', gap: 4, overflowX: 'auto' }}>
            {dates.map((d, i) => {
              const isActive = d.date === selectedDate;
              const isToday = d.isToday;
              const inWindow = windowDates.includes(d.date);
              const count = gameCounts[d.date];
              return (
                <button key={d.date} data-date={d.date} className="zoka-btn" onClick={() => setSelectedDate(d.date)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 14px', borderRadius: 10, minWidth: 52, background: isActive ? '#1D428A' : isToday ? 'rgba(29,66,138,.12)' : 'transparent', border: `1.5px solid ${isActive ? '#1D428A' : isToday ? 'rgba(29,66,138,.25)' : 'transparent'}`, flexShrink: 0, animation: `bb_fadeInUp .3s ease ${i * 25}ms both`, position: 'relative' }}>
                  <span style={{ fontSize: '.58rem', fontWeight: 700, color: isActive ? 'rgba(255,255,255,.7)' : 'var(--text-muted)', textTransform: 'uppercase' }}>{d.day}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: isActive ? '#fff' : isToday ? '#60a5fa' : 'var(--text-primary)' }}>{d.num}</span>
                  <span style={{ fontSize: '.52rem', fontWeight: 600, color: isActive ? 'rgba(255,255,255,.5)' : 'var(--text-muted)' }}>{d.month}</span>
                  {inWindow && count > 0 && (
                    <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, background: isActive ? 'rgba(255,255,255,.25)' : 'rgba(29,66,138,.7)', color: isActive ? '#fff' : '#fff', fontSize: '.5rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '12px 16px 80px' }}>

        {/* ══════ FIXTURES VIEW ══════ */}
        {viewMode === 'fixtures' && (
          <>
            {error && !loading && (
              <ErrorScreen error={error} onRetry={() => { setError(null); loadedDatesRef.current.delete(selectedDate); handleRefresh(); }} />
            )}

            {loading && !error ? (
              <div><SkeletonGroup /><div style={{ marginTop: 16 }}><SkeletonGroup /></div></div>
            ) : !error && mergedGames.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ fontSize: 48, marginBottom: 16, animation: 'bb_float 4s ease-in-out infinite', display: 'inline-block' }}>🏀</div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>No games scheduled for this date</div>
                <div style={{ fontSize: '.72rem', color: '#334155', marginTop: 6 }}>Backend populates yesterday, today, and tomorrow</div>
                {!windowDates.includes(selectedDate) && (
                  <button className="zoka-btn" onClick={() => setSelectedDate(todayStr)} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'rgba(29,66,138,.12)', border: '1px solid rgba(29,66,138,.25)', color: '#60a5fa', fontWeight: 600, fontSize: '.82rem' }}>
                    Go to Today
                  </button>
                )}
              </div>
            ) : !error && (
              <div key={selectedDate}>
                {liveLeagues.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 8, animation: `bb_fadeInUp .3s ease ${sectionIdx * 60}ms both` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,.25)' }} />
                      LIVE ({totalLiveInDate})
                    </div>
                    {liveLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`live-${l.key}`} league={l} games={l.games.filter(g => g.isLive)} sectionIndex={idx} />; })}
                  </>
                )}
                {scheduledLeagues.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 8, animation: `bb_fadeInUp .3s ease ${sectionIdx * 60}ms both` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 8px rgba(59,130,246,.25)' }} />
                      SCHEDULED
                    </div>
                    {scheduledLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`sched-${l.key}`} league={l} games={l.games.filter(g => g.isScheduled)} sectionIndex={idx} />; })}
                  </>
                )}
                {finishedLeagues.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)', margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 8, animation: `bb_fadeInUp .3s ease ${sectionIdx * 60}ms both` }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,.25)' }} />
                      FINISHED
                    </div>
                    {finishedLeagues.map(l => { const idx = sectionIdx++; return <LeagueSection key={`fin-${l.key}`} league={l} games={l.games.filter(g => g.isFinished)} sectionIndex={idx} />; })}
                  </>
                )}
              </div>
            )}

            {!loading && !error && mergedGames.length > 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0', fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {mergedGames.length} game{mergedGames.length !== 1 ? 's' : ''} · Real-time from Firestore
              </div>
            )}
          </>
        )}

        {/* ══════ PREDICT VIEW ══════ */}
        {viewMode === 'predict' && (
          <div className="bb-enter">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(29,66,138,.2), rgba(59,130,246,.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                <Flame size={18} />
              </div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Predict & Win</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Pick basketball game outcomes</div>
              </div>
              {!loggedIn && (
                <button className="zoka-btn" onClick={() => setShowLoginModal(true)} style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 8, background: '#1D428A', color: '#fff', fontWeight: 700, fontSize: '.72rem', border: 'none', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <LogIn size={12} /> Login
                </button>
              )}
            </div>

            {Object.keys(predictions).length > 0 && (
              <div className="bb-enter" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(29,66,138,.06)', border: '1px solid rgba(29,66,138,.12)', marginBottom: 14 }}>
                <CheckCircle2 size={14} style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: '.74rem', fontWeight: 600, color: '#60a5fa' }}>{Object.keys(predictions).length} prediction{Object.keys(predictions).length !== 1 ? 's' : ''} made</span>
              </div>
            )}

            {/* Today's games */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
                <Sparkles size={14} style={{ color: '#60a5fa' }} />
                <span style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>Today's Games</span>
                <span style={{ fontSize: '.64rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(29,66,138,.1)', color: '#60a5fa' }}>TOP 10</span>
              </div>
              {todayPredictGames.length === 0 ? (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  No upcoming basketball games today for prediction
                </div>
              ) : (
                todayPredictGames.map((g, i) => (
                  <PredictCard key={String(g.id)} game={g} prediction={predictions[String(g.id)]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} index={i} />
                ))
              )}
            </div>

            {/* Tomorrow's games — always shown since we pre-fetched */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
                <CalendarDays size={14} style={{ color: '#f97316' }} />
                <span style={{ fontSize: '.84rem', fontWeight: 800, color: 'var(--text-primary)' }}>Tomorrow</span>
                <span style={{ fontSize: '.64rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(249,115,22,.1)', color: '#f97316' }}>TOP 10</span>
              </div>
              {tomorrowPredictGames.length === 0 ? (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
                  No upcoming basketball games tomorrow for prediction
                </div>
              ) : (
                tomorrowPredictGames.map((g, i) => (
                  <PredictCard key={String(g.id)} game={g} prediction={predictions[String(g.id)]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} index={i} />
                ))
              )}
            </div>

            {/* Further upcoming days toggle */}
            {predictViewDates.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <button className="zoka-btn" onClick={() => setUpcomingOpen(!upcomingOpen)} style={{ width: '100%', padding: '12px 16px', borderRadius: 10, background: 'var(--bg-card)', border: `1px solid ${upcomingOpen ? 'rgba(29,66,138,.15)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 700, fontSize: '.82rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CalendarDays size={14} style={{ color: 'var(--text-muted)' }} />
                    Further Ahead
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontWeight: 500 }}>{predictViewDates.length} days</span>
                    <div style={{ transition: 'transform .2s', transform: upcomingOpen ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--text-muted)' }}>
                      <ChevronDown size={15} />
                    </div>
                  </div>
                </button>
              </div>
            )}

            {upcomingOpen && predictViewDates.length > 0 && (
              <div className="bb-expand" style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }} className="date-scroll-hide">
                  {predictViewDates.map(d => (
                    <button key={d.date} className="zoka-btn" onClick={() => setPredictDay(d.date)}
                      style={{ padding: '6px 14px', borderRadius: 8, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap', border: 'none',
                        background: predictDay === d.date ? '#1D428A' : 'rgba(255,255,255,.04)',
                        color: predictDay === d.date ? '#fff' : 'var(--text-muted)' }}>
                      {d.day} {d.num} {d.month}
                    </button>
                  ))}
                </div>

                {upcomingPredictGames.length === 0 ? (
                  <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    No upcoming games for this date
                  </div>
                ) : (
                  upcomingPredictGames.map((g, i) => (
                    <PredictCard key={String(g.id)} game={g} prediction={predictions[String(g.id)]} onPredict={handlePredict} onRemove={handleRemovePredict} loggedIn={loggedIn} index={i} />
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}